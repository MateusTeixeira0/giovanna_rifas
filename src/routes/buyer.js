// Conta do comprador: cadastro, login (e-mail ou telefone), "meus títulos", roleta e resgate de prêmios.
const express = require("express");
const { query, one, transaction, newId } = require("../db");
const lib = require("../lib");
const auth = require("../auth");

const router = express.Router();
const digits = (s) => String(s || "").replace(/\D/g, "");
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Cadastro
router.post("/auth/signup", auth.rateLimit(10, 60_000), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const phoneConfirm = String(req.body.phoneConfirm || "").trim();
  const password = String(req.body.password || "");
  if (!name || !isEmail(email) || digits(phone).length < 10) return res.status(400).json({ error: "Preencha nome, e-mail e telefone corretamente." });
  if (digits(phone) !== digits(phoneConfirm)) return res.status(400).json({ error: "Os telefones digitados não são iguais." });
  if (password.length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });

  if (await one("SELECT 1 AS x FROM admin_users WHERE email=$1", [email])) {
    return res.status(409).json({ error: "Esse e-mail não pode ser usado para uma conta de comprador." });
  }
  if (await one("SELECT 1 AS x FROM buyers WHERE email=$1", [email])) {
    return res.status(409).json({ error: "Já existe uma conta com esse e-mail. Faça login." });
  }
  if (await one("SELECT 1 AS x FROM buyers WHERE phone_digits=$1", [digits(phone)])) {
    return res.status(409).json({ error: "Já existe uma conta com esse telefone. Faça login." });
  }
  const id = newId();
  await query(
    "INSERT INTO buyers (id, name, email, phone, phone_digits, password_hash) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, name, email, phone, digits(phone), await auth.hashPassword(password)]
  );
  auth.setBuyerCookie(res, { buyerId: id, name, email });
  res.json({ ok: true, name });
});

// Login único: comprador (e-mail ou telefone) ou administrador (e-mail)
router.post("/auth/login", auth.rateLimit(10, 60_000), async (req, res) => {
  const identifier = String(req.body.identifier || "").trim();
  const password = String(req.body.password || "");
  if (!identifier || !password) return res.status(400).json({ error: "Preencha e-mail (ou telefone) e senha." });

  if (isEmail(identifier)) {
    const admin = await one("SELECT * FROM admin_users WHERE email=$1", [identifier.toLowerCase()]);
    if (admin) {
      if (!(await auth.verifyPassword(password, admin.passwordHash))) return res.status(401).json({ error: "E-mail ou senha incorretos." });
      auth.setAdminCookie(res, { adminId: admin.id, email: admin.email });
      return res.json({ ok: true, admin: true, name: admin.name });
    }
  }
  const buyer = isEmail(identifier)
    ? await one("SELECT * FROM buyers WHERE email=$1", [identifier.toLowerCase()])
    : await one("SELECT * FROM buyers WHERE phone_digits=$1", [digits(identifier)]);
  if (!buyer) return res.status(401).json({ error: "Conta não encontrada. Crie uma conta primeiro." });
  if (!(await auth.verifyPassword(password, buyer.passwordHash))) return res.status(401).json({ error: "Senha incorreta." });
  auth.setBuyerCookie(res, { buyerId: buyer.id, name: buyer.name, email: buyer.email });
  res.json({ ok: true, name: buyer.name });
});

router.post("/auth/logout", (req, res) => {
  res.clearCookie("buyer_session", { path: "/" });
  res.clearCookie("admin_session", { path: "/" });
  res.json({ ok: true });
});

// Quem está logado? (usado pelo menu do site)
router.get("/auth/session", (req, res) => {
  const a = auth.adminSession(req);
  if (a) return res.json({ type: "admin", email: a.email });
  const b = auth.buyerSession(req);
  if (b) return res.json({ type: "buyer", name: b.name, email: b.email });
  res.json(null);
});

// Meus títulos
router.get("/me", auth.requireBuyer, async (req, res) => {
  // Tudo de uma vez (o banco fica longe; consultas em fila somam segundos).
  const buyerId = req.buyer.buyerId;
  const [buyer, tickets, wonPrizes, bal, logs] = await Promise.all([
    one("SELECT * FROM buyers WHERE id=$1", [buyerId]),
    query(
      `SELECT t.raffle_id, t.numbers, r.title, r.status, r.winner_number
       FROM tickets t JOIN raffles r ON r.id = t.raffle_id
       WHERE t.buyer_id=$1 AND t.status='paid' ORDER BY t.created_at DESC`,
      [buyerId]
    ),
    query(
      `SELECT DISTINCT p.raffle_id, p.number, p.label FROM prize_titles p
       JOIN tickets t ON t.raffle_id = p.raffle_id AND p.number = ANY(t.numbers)
       WHERE t.buyer_id=$1 AND t.status='paid' AND p.status='won'`,
      [buyerId]
    ),
    one("SELECT earned, used FROM spin_balances WHERE buyer_id=$1", [buyerId]),
    query("SELECT id, prize_label, prize_type, prize_value, status, created_at FROM spin_logs WHERE buyer_id=$1 ORDER BY created_at DESC", [buyerId]),
  ]);
  if (!buyer) { res.clearCookie("buyer_session", { path: "/" }); return res.status(401).json({ error: "Entre na sua conta." }); }
  const grouped = new Map();
  for (const t of tickets) {
    if (!grouped.has(t.raffleId)) {
      grouped.set(t.raffleId, { raffleId: t.raffleId, raffleTitle: t.title, status: t.status, winnerNumber: t.winnerNumber, numbers: [] });
    }
    grouped.get(t.raffleId).numbers.push(...t.numbers);
  }
  const result = [];
  for (const g of grouped.values()) {
    g.numbers.sort((a, b) => a - b);
    const prizes = wonPrizes.filter((p) => p.raffleId === g.raffleId).map((p) => ({ number: p.number, label: p.label }));
    result.push({
      raffleId: g.raffleId,
      raffleTitle: g.raffleTitle,
      numbers: g.numbers,
      wonMain: g.status === "finished" && g.winnerNumber != null && g.numbers.includes(g.winnerNumber),
      winnerNumber: g.winnerNumber,
      wonPrizes: prizes,
    });
  }

  const active = logs.find((l) => l.status === "active");
  res.json({
    name: buyer.name, email: buyer.email, phone: buyer.phone,
    tickets: result,
    spins: { available: bal ? Math.max(0, bal.earned - bal.used) : 0 },
    activeReward: active ? { id: active.id, label: active.prizeLabel, type: active.prizeType, value: active.prizeValue } : null,
    prizes: logs,
  });
});

// Girar a roleta (o resultado é sorteado aqui no servidor — ninguém consegue manipular pelo navegador)
router.post("/roulette/spin", auth.requireBuyer, async (req, res) => {
  const result = await transaction(async (c) => {
    const bal = await one("SELECT * FROM spin_balances WHERE buyer_id=$1 FOR UPDATE", [req.buyer.buyerId], c);
    if (!bal || bal.earned - bal.used <= 0) return { status: 409, error: "Você não tem giros disponíveis." };
    const s = await one("SELECT roulette_enabled FROM settings WHERE id='main'", [], c);
    if (!s.rouletteEnabled) return { status: 409, error: "A roleta não está ativa no momento." };
    const prizes = await query("SELECT * FROM roulette_prizes ORDER BY position", [], c);
    if (prizes.length < 2) return { status: 409, error: "A roleta ainda não tem prêmios suficientes." };
    const idx = Math.floor(Math.random() * prizes.length);
    const prize = prizes[idx];
    const logId = newId();
    await query("UPDATE spin_balances SET used = used + 1 WHERE buyer_id=$1", [req.buyer.buyerId], c);
    await query(
      "INSERT INTO spin_logs (id, buyer_id, prize_label, prize_type, prize_value, status) VALUES ($1,$2,$3,$4,$5,$6)",
      [logId, req.buyer.buyerId, prize.label, prize.type, prize.value, prize.type === "none" ? "none" : "pending"], c
    );
    return { prizeIndex: idx, totalPrizes: prizes.length, prizeLabel: prize.label, prizeType: prize.type, prizeValue: prize.value, spinLogId: logId };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

// O próprio comprador resgata o prêmio (desconto ou títulos grátis) — o checkout aplica sozinho na próxima compra.
router.post("/roulette/redeem", auth.requireBuyer, async (req, res) => {
  const spinLogId = String(req.body.spinLogId || "");
  const out = await transaction(async (c) => {
    const log = await one("SELECT * FROM spin_logs WHERE id=$1 FOR UPDATE", [spinLogId], c);
    if (!log || log.buyerId !== req.buyer.buyerId) return { status: 404, error: "Prêmio não encontrado." };
    if (!lib.REWARD_TYPES.includes(log.prizeType)) return { status: 400, error: "Esse prêmio é entregue pela organização — use o botão do WhatsApp." };
    if (log.status === "active") return { ok: true, alreadyActive: true };
    if (log.status !== "pending") return { status: 409, error: "Esse prêmio já foi usado." };
    const other = await one("SELECT 1 AS x FROM spin_logs WHERE buyer_id=$1 AND status='active'", [req.buyer.buyerId], c);
    if (other) return { status: 409, error: "Você já tem um benefício ativo. Use ele na próxima compra antes de resgatar outro." };
    await query("UPDATE spin_logs SET status='active' WHERE id=$1", [log.id], c);
    return { ok: true };
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

module.exports = { router };
