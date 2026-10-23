// Login: senhas criptografadas (bcrypt) + cookie de sessão seguro (JWT).
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

let SECRET = (process.env.JWT_SECRET || "").trim();
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("[AVISO] JWT_SECRET está vazio no .env. Usei uma chave temporária: todo mundo será deslogado quando o servidor reiniciar.");
}
const IS_PROD = process.env.NODE_ENV === "production";

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

function setCookie(res, name, payload, days) {
  const token = jwt.sign(payload, SECRET, { expiresIn: `${days}d` });
  res.cookie(name, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: days * 24 * 60 * 60 * 1000,
  });
}
function readCookie(req, name) {
  const token = req.cookies && req.cookies[name];
  if (!token) return null;
  try { return jwt.verify(token, SECRET); } catch (_) { return null; }
}

const setAdminCookie = (res, payload) => setCookie(res, "admin_session", payload, 7);
const setBuyerCookie = (res, payload) => setCookie(res, "buyer_session", payload, 30);
const adminSession = (req) => readCookie(req, "admin_session");
const buyerSession = (req) => readCookie(req, "buyer_session");

function requireAdmin(req, res, next) {
  const s = adminSession(req);
  if (!s) return res.status(401).json({ error: "Não autorizado." });
  req.admin = s;
  next();
}
function requireBuyer(req, res, next) {
  const s = buyerSession(req);
  if (!s) return res.status(401).json({ error: "Entre na sua conta." });
  req.buyer = s;
  next();
}

// Limite simples de tentativas (protege contra quem tenta adivinhar senhas).
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + ":" + req.path;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto e tente de novo." });
    list.push(now);
    hits.set(key, list);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

module.exports = {
  hashPassword, verifyPassword, setAdminCookie, setBuyerCookie, adminSession, buyerSession,
  requireAdmin, requireBuyer, rateLimit,
};
