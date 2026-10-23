// Regras de negócio reutilizadas pelo servidor: números, sorteio da Federal, prêmios da roleta, Pix.
const { query, one, transaction, newId } = require("./db");

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Números da campanha ----------
async function soldNumbers(raffleId, client) {
  const rows = await query("SELECT numbers FROM tickets WHERE raffle_id=$1 AND status='paid'", [raffleId], client);
  return rows.flatMap((r) => r.numbers);
}
async function reservedNumbers(raffleId, client) {
  const rows = await query(
    "SELECT numbers FROM tickets WHERE raffle_id=$1 AND status='pending' AND expires_at > now()",
    [raffleId], client
  );
  return rows.flatMap((r) => r.numbers);
}
async function heldBackNumbers(raffleId, client) {
  const rows = await query("SELECT number FROM prize_titles WHERE raffle_id=$1 AND status='pending'", [raffleId], client);
  return rows.map((r) => r.number);
}

// Colunas da campanha SEM a foto (a foto é grande e vai por um endereço próprio, com cache no navegador).
const RAFFLE_COLS = `id, title, description, prize_type, base_price, total_numbers, status, draw_date, created_at,
  winner_number, winner_name, winner_ticket_id, federal_concurso, federal_date, federal_number,
  federal_adjusted, federal_fallback, (photo_url IS NOT NULL) AS has_photo`;

/** Troca o "tem foto" pelo endereço da foto, que é o que as páginas usam. */
function withPhoto(r) {
  const { hasPhoto, ...rest } = r;
  return { ...rest, photoUrl: hasPhoto ? `/api/raffles/${r.id}/photo` : null };
}

/**
 * Contagens de várias campanhas numa consulta só (o banco faz a conta, sem trazer os números pra cá).
 * Devolve { [raffleId]: { soldCount, availableCount } }.
 */
async function raffleCounts(raffles) {
  if (!raffles.length) return {};
  const rows = await query(
    `SELECT r.id,
       (SELECT COALESCE(sum(array_length(t.numbers,1)),0) FROM tickets t WHERE t.raffle_id=r.id AND t.status='paid') AS sold_count,
       (SELECT count(*) FROM (
          SELECT unnest(t.numbers) FROM tickets t
           WHERE t.raffle_id=r.id AND (t.status='paid' OR (t.status='pending' AND t.expires_at > now()))
          UNION
          SELECT p.number FROM prize_titles p WHERE p.raffle_id=r.id AND p.status='pending'
       ) x) AS taken_count
     FROM raffles r WHERE r.id = ANY($1::text[])`,
    [raffles.map((r) => r.id)]
  );
  const out = {};
  for (const r of raffles) {
    const c = rows.find((x) => x.id === r.id) || { soldCount: 0, takenCount: 0 };
    out[r.id] = { soldCount: Number(c.soldCount), availableCount: Math.max(0, r.totalNumbers - Number(c.takenCount)) };
  }
  return out;
}

/** Quantos títulos ainda podem ser comprados (não vendidos, não reservados, não retidos). */
async function availableCount(raffle) {
  return (await raffleCounts([raffle]))[raffle.id].availableCount;
}

/** Sorteia `qty` números livres. Números de títulos premiados retidos NUNCA são vendidos. */
async function pickRandomAvailable(raffleId, totalNumbers, qty, client) {
  // Uma consulta de cada vez (a conexão da transação não aceita consultas ao mesmo tempo).
  const sold = await soldNumbers(raffleId, client);
  const reserved = await reservedNumbers(raffleId, client);
  const held = await heldBackNumbers(raffleId, client);
  const taken = new Set([...sold, ...reserved, ...held]);
  const pool = [];
  for (let n = 1; n <= totalNumbers; n++) if (!taken.has(n)) pool.push(n);
  if (pool.length < qty) throw new Error("Não há números suficientes disponíveis para essa quantidade.");
  const chosen = [];
  for (let i = 0; i < qty; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

/** Gera (aleatoriamente) um número livre para um título premiado. */
async function pickRandomPrizeNumber(raffleId, totalNumbers) {
  const sold = await soldNumbers(raffleId);
  const existing = await query("SELECT number FROM prize_titles WHERE raffle_id=$1", [raffleId]);
  const taken = new Set([...sold, ...existing.map((p) => p.number)]);
  const pool = [];
  for (let n = 1; n <= totalNumbers; n++) if (!taken.has(n)) pool.push(n);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function priceFor(raffle, tiers, qty) {
  let price = raffle.basePrice;
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  for (const t of sorted) if (qty >= t.minQty) price = t.price;
  return price;
}

// ---------- Loteria Federal ----------
/**
 * 1) Se o número sorteado for maior que o total da campanha, ele é ajustado ao intervalo 1..total.
 * 2) Se o número apurado não foi vendido, ganha o próximo número vendido (volta ao início se chegar ao fim).
 */
function deriveFederal(totalNumbers, numStr, sold) {
  const raw = parseInt(numStr, 10);
  let n = raw;
  let adjusted = false;
  if (n < 1 || n > totalNumbers) {
    n = ((((raw - 1) % totalNumbers) + totalNumbers) % totalNumbers) + 1;
    adjusted = true;
  }
  const set = new Set(sold);
  if (!set.size) return { raw, n, adjusted, final: null, fallback: false };
  let final = n;
  let steps = 0;
  while (!set.has(final) && steps <= totalNumbers) {
    final = (final % totalNumbers) + 1;
    steps++;
  }
  return { raw, n, adjusted, final, fallback: final !== n };
}

// ---------- Prêmios da roleta ----------
const REWARD_TYPES = ["percent", "amount", "tickets"];

/** Aplica o benefício da roleta numa compra. O valor cobrado nunca fica abaixo de R$ 1,00. */
function applyReward(total, reward) {
  if (!reward) return { discount: 0, bonus: 0, final: round2(total) };
  if (reward.type === "tickets") {
    return { discount: 0, bonus: Math.max(0, Math.floor(reward.value)), final: round2(total) };
  }
  let discount = reward.type === "percent" ? (total * reward.value) / 100 : reward.value;
  if (total <= 1) discount = 0;
  else discount = Math.min(discount, total - 1);
  discount = round2(Math.max(0, discount));
  return { discount, bonus: 0, final: round2(total - discount) };
}

function validatePrize(body) {
  const label = String(body.label || "").trim();
  const type = String(body.type || "");
  const value = Number(body.value || 0);
  if (!label) return { error: "Escreva o nome do prêmio." };
  if (!["none", "percent", "amount", "tickets", "manual"].includes(type)) return { error: "Tipo de prêmio inválido." };
  if (type === "percent" && (value < 1 || value > 100)) return { error: "O desconto em % deve ficar entre 1 e 100." };
  if (type === "amount" && !(value > 0)) return { error: "Informe o valor do desconto em R$." };
  if (type === "tickets" && (!Number.isInteger(value) || value < 1)) return { error: "Informe quantos títulos grátis (número inteiro)." };
  return { data: { label, type, value: ["none", "manual"].includes(type) ? value : value } };
}

// ---------- Confirmação de pagamento ----------
/**
 * Marca um pedido como pago e faz tudo que vem junto:
 *  - usa o benefício da roleta (se o pedido usou um)
 *  - declara ganhador automático de título premiado liberado
 *  - dá giros na roleta
 * É chamada pelo webhook do Mercado Pago, pela confirmação manual do admin e pelo modo teste.
 */
async function markPaid(ticketId) {
  return transaction(async (c) => {
    const t = await one("SELECT * FROM tickets WHERE id=$1 FOR UPDATE", [ticketId], c);
    if (!t) return { ok: false, reason: "not_found" };
    if (t.status === "paid") return { ok: true, already: true };

    // Se o Pix expirou e outra pessoa já comprou esses números, não dá pra entregar: fica "conflict" pro admin reembolsar.
    const clash = await one(
      "SELECT 1 AS x FROM tickets WHERE raffle_id=$1 AND status='paid' AND id<>$2 AND numbers && $3::int[] LIMIT 1",
      [t.raffleId, t.id, t.numbers], c
    );
    if (clash) {
      await query("UPDATE tickets SET status='conflict', paid_at=now() WHERE id=$1", [t.id], c);
      return { ok: false, reason: "conflict" };
    }

    await query("UPDATE tickets SET status='paid', paid_at=now() WHERE id=$1", [t.id], c);

    if (t.appliedSpinLogId) {
      await query("UPDATE spin_logs SET status='used', used_ticket_id=$2 WHERE id=$1", [t.appliedSpinLogId, t.id], c);
    }

    const buyer = await one("SELECT name FROM buyers WHERE id=$1", [t.buyerId], c);
    // Título premiado LIBERADO cujo número foi comprado => ganha na hora.
    await query(
      "UPDATE prize_titles SET status='won', winner_name=$3 WHERE raffle_id=$1 AND status='available' AND number = ANY($2::int[])",
      [t.raffleId, t.numbers, buyer.name], c
    );

    // Giros: a cada múltiplo do valor mínimo, ganha os giros configurados.
    const s = await one("SELECT * FROM settings WHERE id='main'", [], c);
    if (s.rouletteEnabled && s.rouletteMinValue > 0) {
      const multiples = Math.floor(t.totalPrice / s.rouletteMinValue);
      if (multiples > 0) {
        const spins = multiples * s.rouletteSpinsPerMultiple;
        await query(
          `INSERT INTO spin_balances (buyer_id, earned, used) VALUES ($1,$2,0)
           ON CONFLICT (buyer_id) DO UPDATE SET earned = spin_balances.earned + $2`,
          [t.buyerId, spins], c
        );
      }
    }
    return { ok: true };
  });
}

/** Nome para exibir publicamente: "Maria S." (protege a privacidade do comprador). */
function publicName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Participante";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

module.exports = {
  round2, soldNumbers, reservedNumbers, heldBackNumbers, availableCount, raffleCounts, RAFFLE_COLS, withPhoto, pickRandomAvailable,
  pickRandomPrizeNumber, priceFor, deriveFederal, applyReward, REWARD_TYPES, validatePrize,
  markPaid, publicName, newId,
};
