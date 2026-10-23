// Rotas públicas: campanhas, checkout, pedidos, roleta (leitura) e webhook do Mercado Pago.
const express = require("express");
const { query, one, transaction, newId } = require("../db");
const lib = require("../lib");
const pix = require("../pix");
const { buyerSession, requireBuyer } = require("../auth");

const router = express.Router();

async function loadRaffleExtras(raffle, { admin = false } = {}) {
  // Consultas independentes rodam ao mesmo tempo.
  const [tiers, flash, titles, counts] = await Promise.all([
    query("SELECT min_qty, price FROM price_tiers WHERE raffle_id=$1 ORDER BY min_qty", [raffle.id]),
    one("SELECT label, text, ends_at FROM flash_promos WHERE raffle_id=$1", [raffle.id]),
    query(
      `SELECT id, number, label, status, winner_name FROM prize_titles
       WHERE raffle_id=$1 ${admin ? "" : "AND status <> 'pending'"} ORDER BY created_at`,
      [raffle.id]
    ),
    lib.raffleCounts([raffle]),
  ]);
  return {
    ...lib.withPhoto(raffle),
    tiers,
    flash,
    prizeTitles: titles.map((t) => ({ ...t, winnerName: admin ? t.winnerName : t.winnerName && lib.publicName(t.winnerName) })),
    soldCount: counts[raffle.id].soldCount,
    availableCount: counts[raffle.id].availableCount,
  };
}

// Lista de campanhas (home)
router.get("/raffles", async (req, res) => {
  const raffles = await query(`SELECT ${lib.RAFFLE_COLS} FROM raffles ORDER BY created_at DESC`);
  const counts = await lib.raffleCounts(raffles);
  res.json(raffles.map((r) => ({
    ...lib.withPhoto(r),
    winnerName: r.winnerName ? lib.publicName(r.winnerName) : null,
    soldCount: counts[r.id].soldCount,
    availableCount: counts[r.id].availableCount,
  })));
});

// Detalhe de uma campanha
router.get("/raffles/:id", async (req, res) => {
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [req.params.id]);
  if (!raffle) return res.status(404).json({ error: "Campanha não encontrada." });
  const full = await loadRaffleExtras(raffle);
  full.winnerName = full.winnerName ? lib.publicName(full.winnerName) : null;
  res.json(full);
});

// Foto da campanha (separada da lista, e o navegador guarda em cache — a foto de uma campanha não muda)
// Fotos já lidas ficam guardadas na memória do servidor (buscar no banco leva segundos).
const photoCache = new Map();
router.get("/raffles/:id/photo", async (req, res) => {
  let photo = photoCache.get(req.params.id);
  if (!photo) {
    const r = await one("SELECT photo_url FROM raffles WHERE id=$1", [req.params.id]);
    const m = r && r.photoUrl && /^data:(image\/[\w+.-]+);base64,(.*)$/s.exec(r.photoUrl);
    if (!m) return res.status(404).json({ error: "Foto não encontrada." });
    photo = { type: m[1], data: Buffer.from(m[2], "base64") };
    photoCache.set(req.params.id, photo);
  }
  res.setHeader("Content-Type", photo.type);
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.send(photo.data);
});

router.get("/social-links", async (req, res) => {
  const s = await one("SELECT instagram, whatsapp FROM settings WHERE id='main'");
  res.json(s || { instagram: "", whatsapp: "" });
});

// Ganhadores (sorteios principais + títulos premiados já ganhos)
router.get("/winners", async (req, res) => {
  const main = await query(
    "SELECT id, title, winner_number, winner_name, draw_date, federal_concurso FROM raffles WHERE status='finished' AND winner_number IS NOT NULL ORDER BY draw_date DESC"
  );
  const instant = await query(
    `SELECT p.number, p.label, p.winner_name, r.title AS raffle_title
     FROM prize_titles p JOIN raffles r ON r.id = p.raffle_id WHERE p.status='won' ORDER BY p.created_at DESC`
  );
  res.json({
    main: main.map((m) => ({ ...m, winnerName: lib.publicName(m.winnerName) })),
    instant: instant.map((i) => ({ ...i, winnerName: lib.publicName(i.winnerName) })),
  });
});

// Roleta: configuração pública
router.get("/roulette", async (req, res) => {
  const s = await one("SELECT roulette_enabled, roulette_min_value, roulette_spins_per_multiple FROM settings WHERE id='main'");
  const prizes = await query("SELECT id, label FROM roulette_prizes ORDER BY position");
  res.json({ enabled: s.rouletteEnabled, minValue: s.rouletteMinValue, spinsPerMultiple: s.rouletteSpinsPerMultiple, prizes });
});

// ---------- Checkout ----------
router.post("/checkout", requireBuyer, async (req, res) => {
  const raffleId = String(req.body.raffleId || "");
  const quantity = parseInt(req.body.quantity, 10);
  if (!raffleId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    return res.status(400).json({ error: "Escolha uma quantidade válida." });
  }
  const raffle = await one(`SELECT ${lib.RAFFLE_COLS} FROM raffles WHERE id=$1`, [raffleId]);
  if (!raffle || raffle.status !== "active") return res.status(404).json({ error: "Campanha indisponível." });
  const buyer = await one("SELECT * FROM buyers WHERE id=$1", [req.buyer.buyerId]);
  if (!buyer) return res.status(401).json({ error: "Entre na sua conta." });

  const tiers = await query("SELECT min_qty, price FROM price_tiers WHERE raffle_id=$1", [raffleId]);
  const unitPrice = lib.priceFor(raffle, tiers, quantity);
  const baseTotal = lib.round2(unitPrice * quantity);
  const mode = await pix.currentMode();

  let created;
  try {
    created = await transaction(async (c) => {
      // Trava a campanha enquanto escolhemos os números (evita duas pessoas pegarem o mesmo número).
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [raffleId]);

      // Benefício da roleta ativo (um por vez) — só se não estiver preso a outro Pix pendente.
      let reward = null;
      let rewardLogId = null;
      const log = await one("SELECT * FROM spin_logs WHERE buyer_id=$1 AND status='active' ORDER BY created_at LIMIT 1", [buyer.id], c);
      if (log && lib.REWARD_TYPES.includes(log.prizeType)) {
        const inUse = await one(
          "SELECT 1 AS x FROM tickets WHERE applied_spin_log_id=$1 AND status='pending' AND expires_at > now() LIMIT 1",
          [log.id], c
        );
        if (!inUse) { reward = { type: log.prizeType, value: log.prizeValue }; rewardLogId = log.id; }
      }
      const { discount, bonus, final } = lib.applyReward(baseTotal, reward);

      let numbers;
      let bonusApplied = bonus;
      try {
        numbers = await lib.pickRandomAvailable(raffleId, raffle.totalNumbers, quantity + bonus, c);
      } catch (e) {
        if (bonus === 0) throw e;
        numbers = await lib.pickRandomAvailable(raffleId, raffle.totalNumbers, quantity, c);
        bonusApplied = 0; // não sobraram números pro bônus; o benefício continua guardado
      }
      const rewardUsed = discount > 0 || bonusApplied > 0;
      const id = newId();
      await query(
        `INSERT INTO tickets (id, raffle_id, buyer_id, numbers, unit_price, total_price, status, pix_mode,
           discount_amount, bonus_tickets, applied_spin_log_id, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10, now() + interval '10 minutes')`,
        [id, raffleId, buyer.id, numbers, unitPrice, final, mode, discount, bonusApplied, rewardUsed ? rewardLogId : null], c
      );
      return { id, numbers, final, discount, bonusApplied };
    });
  } catch (err) {
    const known = String(err.message || "").startsWith("Não há números");
    if (!known) console.error("Erro no checkout:", err);
    return res.status(known ? 409 : 500).json({ error: known ? err.message : "Não foi possível reservar seus títulos. Tente de novo." });
  }

  try {
    const charge = await pix.createCharge({
      mode,
      amount: created.final,
      description: `${created.numbers.length} título(s) - ${raffle.title}`.slice(0, 200),
      payerEmail: buyer.email,
      ticketId: created.id,
    });
    await query("UPDATE tickets SET pix_tx_id=$2, pix_copia_cola=$3, pix_qr=$4 WHERE id=$1", [
      created.id, charge.pixTxId, charge.copiaECola, charge.qr,
    ]);
  } catch (err) {
    await query("UPDATE tickets SET status='expired' WHERE id=$1", [created.id]);
    return res.status(502).json({ error: err.message });
  }
  res.json({ ticketId: created.id });
});

// Status de um pedido (a tela de pagamento consulta isso a cada poucos segundos)
router.get("/tickets/:id", requireBuyer, async (req, res) => {
  const t = await one(
    `SELECT t.*, r.title AS raffle_title FROM tickets t JOIN raffles r ON r.id = t.raffle_id
     WHERE t.id=$1 AND t.buyer_id=$2`,
    [req.params.id, req.buyer.buyerId]
  );
  if (!t) return res.status(404).json({ error: "Pedido não encontrado." });
  const mode = t.pixMode;
  res.json({
    id: t.id, status: t.status, numbersCount: t.numbers.length, totalPrice: t.totalPrice,
    discountAmount: t.discountAmount, bonusTickets: t.bonusTickets,
    pixCopiaECola: t.pixCopiaCola, pixQr: t.pixQr, expiresAt: t.expiresAt,
    raffleTitle: t.raffleTitle, raffleId: t.raffleId, mode,
    expired: t.status === "pending" && new Date(t.expiresAt) < new Date(),
  });
});

// Modo teste: simula o pagamento (só funciona quando NÃO há Mercado Pago nem chave Pix configurados).
router.post("/tickets/:id/simulate-payment", requireBuyer, async (req, res) => {
  const t = await one("SELECT * FROM tickets WHERE id=$1 AND buyer_id=$2", [req.params.id, req.buyer.buyerId]);
  if (!t) return res.status(404).json({ error: "Pedido não encontrado." });
  if ((await pix.currentMode()) !== "test" || t.pixMode !== "test") {
    return res.status(403).json({ error: "A simulação só existe no modo de teste." });
  }
  if (t.status === "pending" && new Date(t.expiresAt) < new Date()) return res.status(409).json({ error: "O Pix expirou. Refaça a compra." });
  const r = await lib.markPaid(t.id);
  if (!r.ok) return res.status(409).json({ error: "Não foi possível confirmar este pedido." });
  res.json({ ok: true });
});

// ---------- Webhook do Mercado Pago ----------
// O Mercado Pago chama esta URL sozinho quando um Pix é pago. Nós NÃO confiamos no que vem na chamada:
// consultamos o pagamento direto na API do Mercado Pago e só confirmamos se estiver "approved".
router.post("/webhooks/mercadopago", async (req, res) => {
  try {
    const paymentId = (req.body && req.body.data && req.body.data.id) || req.query["data.id"] || req.query.id;
    if (!paymentId || !pix.mpToken()) return res.json({ ok: true });
    const payment = await pix.fetchMpStatus(paymentId);
    if (!payment || payment.status !== "approved") return res.json({ ok: true });
    const ticket = await one("SELECT * FROM tickets WHERE pix_tx_id=$1", [String(paymentId)]);
    if (!ticket) return res.json({ ok: true });
    // Confere se o valor pago bate com o pedido.
    if (Math.abs(Number(payment.transaction_amount) - ticket.totalPrice) > 0.01) {
      console.error("Webhook: valor pago diferente do pedido", ticket.id);
      return res.json({ ok: true });
    }
    await lib.markPaid(ticket.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).json({ error: "erro" });
  }
});

module.exports = { router, loadRaffleExtras };
