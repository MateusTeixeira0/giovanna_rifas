// Rotas do painel administrativo (todas exigem login de administrador).
const express = require("express");
const { query, one, transaction, newId } = require("../db");
const lib = require("../lib");
const pix = require("../pix");
const auth = require("../auth");
const { loadRaffleExtras } = require("./public");

const router = express.Router();
router.use(auth.requireAdmin);

// ---------- Visão geral ----------
router.get("/overview", async (req, res) => {
  const [raffles, paid] = await Promise.all([
    query(`SELECT ${lib.RAFFLE_COLS} FROM raffles ORDER BY created_at DESC`),
    query(`SELECT raffle_id, COALESCE(sum(array_length(numbers,1)),0) AS qty, COALESCE(sum(total_price),0) AS money
           FROM tickets WHERE status='paid' GROUP BY raffle_id`),
  ]);
  const rows = raffles.map((r) => {
    const p = paid.find((x) => x.raffleId === r.id);
    return { ...lib.withPhoto(r), soldCount: p ? Number(p.qty) : 0, revenue: p ? Number(p.money) : 0 };
  });
  res.json({
    raffles: rows,
    totals: {
      active: raffles.filter((r) => r.status === "active").length,
      finished: raffles.filter((r) => r.status === "finished").length,
      sold: rows.reduce((s, r) => s + r.soldCount, 0),
      revenue: lib.round2(rows.reduce((s, r) => s + r.revenue, 0)),
    },
  });
});

// ---------- Campanhas ----------
router.post("/raffles", async (req, res) => {
  const b = req.body;
  const title = String(b.title || "").trim();
  const price = Number(b.basePrice);
  const total = parseInt(b.totalNumbers, 10);
  if (!title) return res.status(400).json({ error: "Dê um título para a campanha." });
  if (!(price > 0) || !(total >= 10)) return res.status(400).json({ error: "Informe preço e quantidade de títulos válidos (mínimo 10 títulos)." });
  if (total > 1000000) return res.status(400).json({ error: "O máximo é 1.000.000 de títulos por campanha." });
  const photo = b.photoUrl ? String(b.photoUrl) : null;
  if (photo && (!photo.startsWith("data:image/") || photo.length > 4_000_000)) return res.status(400).json({ error: "Imagem inválida ou muito grande." });
  const drawDate = b.drawDate ? new Date(b.drawDate) : new Date(Date.now() + 7 * 864e5);
  if (isNaN(drawDate)) return res.status(400).json({ error: "Data do sorteio inválida." });

  const id = newId();
  await transaction(async (c) => {
    await query(
      `INSERT INTO raffles (id, title, description, prize_type, photo_url, base_price, total_numbers, draw_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, title, String(b.description || "").trim() || "Sem descrição.", String(b.prizeType || "gift"), photo, price, total, drawDate], c
    );
    for (const t of Array.isArray(b.tiers) ? b.tiers : []) {
      const minQty = parseInt(t.minQty, 10);
      const tp = Number(t.price);
      if (minQty > 1 && tp > 0) await query("INSERT INTO price_tiers (id, raffle_id, min_qty, price) VALUES ($1,$2,$3,$4)", [newId(), id, minQty, tp], c);
    }
    if (b.flash && b.flash.label && Number(b.flash.minutes) > 0) {
      await query(
        "INSERT INTO flash_promos (raffle_id, label, text, ends_at) VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)",
        [id, String(b.flash.label), String(b.flash.text || ""), String(Math.floor(Number(b.flash.minutes)))], c
      );
    }
  });
  res.status(201).json({ id });
});

router.get("/raffles/:id", async (req, res) => {
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [req.params.id]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  const [full, paid, participants] = await Promise.all([
    loadRaffleExtras(raffle, { admin: true }),
    one("SELECT COALESCE(sum(total_price),0) AS money FROM tickets WHERE raffle_id=$1 AND status='paid'", [raffle.id]),
    query(
      `SELECT b.name, b.email, b.phone, sum(array_length(t.numbers,1)) AS qty
       FROM tickets t JOIN buyers b ON b.id = t.buyer_id WHERE t.raffle_id=$1 AND t.status='paid'
       GROUP BY b.id ORDER BY qty DESC`,
      [raffle.id]
    ),
  ]);
  full.revenue = Number(paid.money);
  full.participants = participants;
  res.json(full);
});

router.delete("/raffles/:id", async (req, res) => {
  await query("DELETE FROM raffles WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ---------- Títulos premiados ----------
router.post("/prize-titles", async (req, res) => {
  const raffleId = String(req.body.raffleId || "");
  const label = String(req.body.label || "").trim();
  const releaseNow = !!req.body.releaseNow;
  if (!label) return res.status(400).json({ error: "Preencha o prêmio." });
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [raffleId]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  let number = null;
  if (req.body.number != null) {
    // O número já foi gerado e mostrado na tela; só aceitamos se ainda estiver livre.
    const n = parseInt(req.body.number, 10);
    const sold = await lib.soldNumbers(raffleId);
    const exists = await one("SELECT 1 AS x FROM prize_titles WHERE raffle_id=$1 AND number=$2", [raffleId, n]);
    if (n >= 1 && n <= raffle.totalNumbers && !sold.includes(n) && !exists) number = n;
  }
  if (number == null) number = await lib.pickRandomPrizeNumber(raffleId, raffle.totalNumbers);
  if (number == null) return res.status(409).json({ error: "Não há números livres nessa campanha." });
  const id = newId();
  await query("INSERT INTO prize_titles (id, raffle_id, number, label, status) VALUES ($1,$2,$3,$4,$5)", [id, raffleId, number, label, releaseNow ? "available" : "pending"]);
  res.status(201).json({ id, number });
});

// Gera um número aleatório livre (a tela mostra antes de salvar)
router.get("/prize-number", async (req, res) => {
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [String(req.query.raffleId || "")]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  res.json({ number: await lib.pickRandomPrizeNumber(raffle.id, raffle.totalNumbers) });
});

router.patch("/prize-titles/:id", async (req, res) => {
  const p = await one("SELECT * FROM prize_titles WHERE id=$1", [req.params.id]);
  if (!p) return res.status(404).json({ error: "Título não encontrado." });
  const action = req.body.action;
  if (action === "release") {
    await query("UPDATE prize_titles SET status='available' WHERE id=$1 AND status='pending'", [p.id]);
    // Se (por algum motivo) esse número já tiver sido comprado, já declara o ganhador.
    const t = await one(
      `SELECT b.name FROM tickets t JOIN buyers b ON b.id=t.buyer_id
       WHERE t.raffle_id=$1 AND t.status='paid' AND $2 = ANY(t.numbers) LIMIT 1`,
      [p.raffleId, p.number]
    );
    if (t) await query("UPDATE prize_titles SET status='won', winner_name=$2 WHERE id=$1", [p.id, t.name]);
    return res.json({ ok: true });
  }
  if (action === "markWon") {
    const t = await one(
      `SELECT b.name FROM tickets t JOIN buyers b ON b.id=t.buyer_id
       WHERE t.raffle_id=$1 AND t.status='paid' AND $2 = ANY(t.numbers) LIMIT 1`,
      [p.raffleId, p.number]
    );
    if (!t) return res.status(409).json({ error: "Ainda ninguém comprou este título." });
    await query("UPDATE prize_titles SET status='won', winner_name=$2 WHERE id=$1", [p.id, t.name]);
    return res.json({ ok: true, winnerName: t.name });
  }
  res.status(400).json({ error: "Ação inválida." });
});

// Quem comprou determinado número (para o botão "Marcar como ganho" já mostrar o nome)
router.get("/number-owner", async (req, res) => {
  const t = await one(
    `SELECT b.name, b.email FROM tickets t JOIN buyers b ON b.id=t.buyer_id
     WHERE t.raffle_id=$1 AND t.status='paid' AND $2 = ANY(t.numbers) LIMIT 1`,
    [String(req.query.raffleId || ""), parseInt(req.query.number, 10)]
  );
  res.json(t || null);
});

router.delete("/prize-titles/:id", async (req, res) => {
  await query("DELETE FROM prize_titles WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ---------- Sorteio pela Loteria Federal ----------
router.get("/draw", async (req, res) => {
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [String(req.query.raffleId || "")]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  const sold = await lib.soldNumbers(raffle.id);
  const buyers = await one("SELECT count(DISTINCT buyer_id) AS n FROM tickets WHERE raffle_id=$1 AND status='paid'", [raffle.id]);
  res.json({ raffle: lib.withPhoto(raffle), soldCount: sold.length, buyersCount: Number(buyers.n) });
});

async function ownerOf(raffleId, number) {
  return one(
    `SELECT t.id AS ticket_id, b.name, b.email FROM tickets t JOIN buyers b ON b.id=t.buyer_id
     WHERE t.raffle_id=$1 AND t.status='paid' AND $2 = ANY(t.numbers) LIMIT 1`,
    [raffleId, number]
  );
}

router.post("/draw/preview", async (req, res) => {
  const number = String(req.body.number || "");
  if (!/^\d{6}$/.test(number)) return res.status(400).json({ error: "Digite os 6 dígitos do número sorteado." });
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [String(req.body.raffleId || "")]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  const result = lib.deriveFederal(raffle.totalNumbers, number, await lib.soldNumbers(raffle.id));
  const owner = result.final !== null ? await ownerOf(raffle.id, result.final) : null;
  res.json({ ...result, owner: owner ? { name: owner.name, email: owner.email } : null });
});

router.post("/draw", async (req, res) => {
  const { raffleId } = req.body;
  const concurso = String(req.body.concurso || "").trim();
  const date = String(req.body.date || "");
  const number = String(req.body.number || "");
  if (!concurso || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{6}$/.test(number)) {
    return res.status(400).json({ error: "Preencha o concurso, a data e o número sorteado (6 dígitos)." });
  }
  const out = await transaction(async (c) => {
    const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1 FOR UPDATE`, [raffleId], c);
    if (!raffle) return { status: 404, error: "Campanha não encontrada." };
    if (raffle.status === "finished") return { status: 409, error: "Essa campanha já foi sorteada." };
    const result = lib.deriveFederal(raffle.totalNumbers, number, await lib.soldNumbers(raffle.id, c));
    if (result.final === null) return { status: 409, error: "Nenhum título vendido tem comprador registrado ainda." };
    const owner = await one(
      `SELECT t.id AS ticket_id, b.name FROM tickets t JOIN buyers b ON b.id=t.buyer_id
       WHERE t.raffle_id=$1 AND t.status='paid' AND $2 = ANY(t.numbers) LIMIT 1`,
      [raffle.id, result.final], c
    );
    await query(
      `UPDATE raffles SET status='finished', winner_number=$2, winner_name=$3, winner_ticket_id=$4,
         federal_concurso=$5, federal_date=$6, federal_number=$7, federal_adjusted=$8, federal_fallback=$9 WHERE id=$1`,
      [raffle.id, result.final, owner ? owner.name : "Participante", owner ? owner.ticketId : null, concurso, date, number, result.adjusted, result.fallback], c
    );
    return { ok: true, result, winnerName: owner ? owner.name : "Participante" };
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// ---------- Participantes ----------
router.get("/participants", async (req, res) => {
  const rows = await query(
    `SELECT t.id, t.raffle_id, b.name AS buyer_name, b.email AS buyer_email, b.phone AS buyer_phone,
            r.title AS raffle_title, array_length(t.numbers,1) AS quantity, t.total_price, t.status, t.created_at
     FROM tickets t JOIN buyers b ON b.id=t.buyer_id JOIN raffles r ON r.id=t.raffle_id
     WHERE t.status IN ('paid','conflict') ORDER BY t.created_at DESC`
  );
  const unique = await one("SELECT count(DISTINCT buyer_id) AS n FROM tickets WHERE status='paid'");
  res.json({ rows, uniqueBuyers: Number(unique.n) });
});

// ---------- Pagamentos / configurações ----------
router.get("/settings", async (req, res) => {
  const s = await one("SELECT * FROM settings WHERE id='main'");
  res.json({
    pix: { keyType: s.pixKeyType, key: s.pixKey, receiverName: s.pixReceiverName, bank: s.pixBank },
    social: { instagram: s.instagram, whatsapp: s.whatsapp },
    mode: await pix.currentMode(),
  });
});

router.patch("/settings", async (req, res) => {
  const { pix: p, social } = req.body;
  if (p) {
    if (!["email", "cpf", "cnpj", "telefone", "aleatoria"].includes(p.keyType)) return res.status(400).json({ error: "Tipo de chave inválido." });
    await query("UPDATE settings SET pix_key_type=$1, pix_key=$2, pix_receiver_name=$3, pix_bank=$4 WHERE id='main'", [
      p.keyType, String(p.key || "").trim(), String(p.receiverName || "").trim(), String(p.bank || "").trim(),
    ]);
  }
  if (social) {
    await query("UPDATE settings SET instagram=$1, whatsapp=$2 WHERE id='main'", [String(social.instagram || "").trim(), String(social.whatsapp || "").trim()]);
  }
  res.json({ ok: true });
});

// Pedidos aguardando pagamento (e os que deram conflito) — o admin pode confirmar na mão no modo "manual".
router.get("/pending-payments", async (req, res) => {
  const rows = await query(
    `SELECT t.id, t.status, t.total_price, t.created_at, t.expires_at, array_length(t.numbers,1) AS quantity,
            b.name AS buyer_name, b.email AS buyer_email, b.phone AS buyer_phone, r.title AS raffle_title
     FROM tickets t JOIN buyers b ON b.id=t.buyer_id JOIN raffles r ON r.id=t.raffle_id
     WHERE t.status IN ('pending','conflict') AND (t.status='conflict' OR t.created_at > now() - interval '3 days')
     ORDER BY t.created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.post("/tickets/:id/confirm", async (req, res) => {
  const r = await lib.markPaid(req.params.id);
  if (!r.ok && r.reason === "conflict") {
    return res.status(409).json({ error: "Esses números já foram vendidos para outra pessoa (o Pix expirou antes de pagar). Reembolse o comprador." });
  }
  if (!r.ok) return res.status(404).json({ error: "Pedido não encontrado." });
  res.json({ ok: true });
});

// ---------- Roleta ----------
router.get("/roulette", async (req, res) => {
  const s = await one("SELECT roulette_enabled, roulette_min_value, roulette_spins_per_multiple FROM settings WHERE id='main'");
  const prizes = await query("SELECT id, label, type, value FROM roulette_prizes ORDER BY position");
  const log = await query(
    `SELECT l.id, l.prize_label, l.prize_type, l.prize_value, l.status, l.created_at, b.name, b.email, b.phone
     FROM spin_logs l JOIN buyers b ON b.id=l.buyer_id ORDER BY l.created_at DESC LIMIT 50`
  );
  res.json({ config: { enabled: s.rouletteEnabled, minValue: s.rouletteMinValue, spinsPerMultiple: s.rouletteSpinsPerMultiple }, prizes, log });
});

router.patch("/roulette", async (req, res) => {
  const minValue = Number(req.body.minValue);
  const spins = parseInt(req.body.spinsPerMultiple, 10);
  if (!(minValue >= 0) || !(spins >= 1)) return res.status(400).json({ error: "Valores inválidos." });
  await query("UPDATE settings SET roulette_enabled=$1, roulette_min_value=$2, roulette_spins_per_multiple=$3 WHERE id='main'", [!!req.body.enabled, minValue, spins]);
  res.json({ ok: true });
});

router.post("/roulette/prizes", async (req, res) => {
  const v = lib.validatePrize(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  await query("INSERT INTO roulette_prizes (id, label, type, value) VALUES ($1,$2,$3,$4)", [newId(), v.data.label, v.data.type, v.data.value]);
  res.status(201).json({ ok: true });
});
router.patch("/roulette/prizes/:id", async (req, res) => {
  const v = lib.validatePrize(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  await query("UPDATE roulette_prizes SET label=$2, type=$3, value=$4 WHERE id=$1", [req.params.id, v.data.label, v.data.type, v.data.value]);
  res.json({ ok: true });
});
router.delete("/roulette/prizes/:id", async (req, res) => {
  await query("DELETE FROM roulette_prizes WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
router.patch("/roulette/redeem", async (req, res) => {
  await query("UPDATE spin_logs SET status='redeemed' WHERE id=$1 AND status IN ('pending','active')", [String(req.body.spinLogId || "")]);
  res.json({ ok: true });
});

module.exports = { router };
