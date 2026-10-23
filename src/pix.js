// Pagamento Pix. Três modos (o servidor escolhe sozinho):
//  1) "mercadopago": se MERCADOPAGO_ACCESS_TOKEN estiver no .env -> cobrança automática, confirmação por webhook.
//  2) "manual": sem Mercado Pago, mas com chave Pix cadastrada no admin -> QR Pix real; o admin confirma o pagamento.
//  3) "test": nada configurado -> modo teste, com botão "simular pagamento".
const QRCode = require("qrcode");
const { one } = require("./db");

function mpToken() {
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!t || t.includes("xxxx")) return "";
  return t;
}

async function currentMode() {
  if (mpToken()) return "mercadopago";
  const s = await one("SELECT pix_key FROM settings WHERE id='main'");
  if (s && s.pixKey && s.pixKey.trim()) return "manual";
  return "test";
}

// ---------- Pix estático (BR Code / EMV) ----------
function tlv(id, value) {
  return id + String(value.length).padStart(2, "0") + value;
}
function sanitize(str, max) {
  const clean = String(str || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().trim();
  return clean.slice(0, max) || "NA";
}
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function normalizeKey(type, key) {
  key = String(key || "").trim();
  if (type === "cpf" || type === "cnpj") return key.replace(/\D/g, "");
  if (type === "telefone") {
    const d = key.replace(/\D/g, "");
    return key.startsWith("+") ? "+" + d : "+55" + d.replace(/^55/, "");
  }
  if (type === "email") return key.toLowerCase();
  return key;
}
function buildPixPayload({ key, name, city, amount, txid }) {
  const account = tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key));
  const amountField = amount > 0 ? tlv("54", amount.toFixed(2)) : "";
  const txidField = tlv("62", tlv("05", sanitize(txid || "***", 25).replace(/ /g, "")));
  const payload =
    tlv("00", "01") + account + tlv("52", "0000") + tlv("53", "986") + amountField +
    tlv("58", "BR") + tlv("59", sanitize(name, 25)) + tlv("60", sanitize(city || "SAO PAULO", 15)) + txidField + "6304";
  return payload + crc16(payload);
}

async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: "M" });
}

// ---------- Criação da cobrança ----------
async function createCharge({ mode, amount, description, payerEmail, ticketId }) {
  if (mode === "mercadopago") {
    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken()}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": ticketId,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        description,
        payment_method_id: "pix",
        payer: { email: payerEmail },
        external_reference: ticketId,
        notification_url: `${(process.env.SITE_URL || "").replace(/\/$/, "")}/api/webhooks/mercadopago`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Mercado Pago recusou a cobrança:", JSON.stringify(data));
      throw new Error("Não foi possível gerar o Pix agora. Tente de novo em instantes.");
    }
    const td = data.point_of_interaction && data.point_of_interaction.transaction_data;
    return {
      pixTxId: String(data.id),
      copiaECola: (td && td.qr_code) || "",
      qr: td && td.qr_code_base64 ? "data:image/png;base64," + td.qr_code_base64 : "",
    };
  }

  if (mode === "manual") {
    const s = await one("SELECT * FROM settings WHERE id='main'");
    const code = buildPixPayload({
      key: normalizeKey(s.pixKeyType, s.pixKey),
      name: s.pixReceiverName || "GIOVANNA MATOS",
      city: "SAO PAULO",
      amount,
      txid: ticketId.replace(/-/g, "").slice(0, 25),
    });
    return { pixTxId: null, copiaECola: code, qr: await qrDataUrl(code) };
  }

  // modo teste: código fictício (não paga de verdade)
  const fake = `TESTE-PIX-${ticketId.slice(0, 8)}-${amount.toFixed(2)}`;
  return { pixTxId: null, copiaECola: fake, qr: await qrDataUrl(fake) };
}

async function fetchMpStatus(paymentId) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${mpToken()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { currentMode, createCharge, fetchMpStatus, mpToken };
