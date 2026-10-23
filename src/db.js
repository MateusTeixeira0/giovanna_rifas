// Conexão com o banco de dados (PostgreSQL) e criação automática das tabelas.
// Você não precisa rodar nenhum comando de banco: ao ligar o servidor, as tabelas são criadas sozinhas.
const { Pool, types } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// O banco devolve números decimais como texto; aqui convertemos para número de verdade.
types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC
types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT (contagens)

if (!process.env.DATABASE_URL) {
  console.error("\n[ERRO] A variável DATABASE_URL não está no arquivo .env.");
  console.error("Abra o arquivo .env e cole a conexão do seu banco (Neon).\n");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  // O banco fica longe (cada conexão nova leva ~1s): mantém as conexões abertas em vez de fechar após 10s parado.
  idleTimeoutMillis: 5 * 60_000,
  keepAlive: true,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
});

// Converte nomes_com_underline para nomesEmCamelCase (ex.: total_numbers -> totalNumbers)
function camelKey(k) {
  return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelRow(row) {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) out[camelKey(k)] = row[k];
  return out;
}

/** Executa uma consulta SQL e devolve as linhas (com nomes em camelCase). */
async function query(sql, params = [], client = pool) {
  const res = await client.query(sql, params);
  return res.rows.map(camelRow);
}
async function one(sql, params = [], client = pool) {
  const rows = await query(sql, params, client);
  return rows[0] || null;
}

/** Executa várias operações juntas: ou tudo dá certo, ou nada é gravado. */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

const newId = () => crypto.randomUUID();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  pix_key_type TEXT NOT NULL DEFAULT 'email',
  pix_key TEXT NOT NULL DEFAULT '',
  pix_receiver_name TEXT NOT NULL DEFAULT '',
  pix_bank TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  roulette_enabled BOOLEAN NOT NULL DEFAULT true,
  roulette_min_value NUMERIC(10,2) NOT NULL DEFAULT 30,
  roulette_spins_per_multiple INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS raffles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prize_type TEXT NOT NULL DEFAULT 'gift',
  photo_url TEXT,
  base_price NUMERIC(10,2) NOT NULL,
  total_numbers INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  draw_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  winner_number INTEGER,
  winner_name TEXT,
  winner_ticket_id TEXT,
  federal_concurso TEXT,
  federal_date TEXT,
  federal_number TEXT,
  federal_adjusted BOOLEAN NOT NULL DEFAULT false,
  federal_fallback BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS price_tiers (
  id TEXT PRIMARY KEY,
  raffle_id TEXT NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  min_qty INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS flash_promos (
  raffle_id TEXT PRIMARY KEY REFERENCES raffles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  ends_at TIMESTAMPTZ NOT NULL
);

-- status: pending = retido (invisível, ninguém compra) | available = liberado | won = ganho
CREATE TABLE IF NOT EXISTS prize_titles (
  id TEXT PRIMARY KEY,
  raffle_id TEXT NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  winner_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (raffle_id, number)
);

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  phone_digits TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: pending = aguardando Pix | paid = pago | expired = expirou | conflict = pago depois de expirar com números já vendidos
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  raffle_id TEXT NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  numbers INTEGER[] NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  pix_tx_id TEXT UNIQUE,
  pix_copia_cola TEXT,
  pix_qr TEXT,
  pix_mode TEXT NOT NULL DEFAULT 'test',
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  bonus_tickets INTEGER NOT NULL DEFAULT 0,
  applied_spin_log_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_raffle_idx ON tickets (raffle_id, status);
CREATE INDEX IF NOT EXISTS tickets_buyer_idx ON tickets (buyer_id);

-- type: none | percent | amount | tickets | manual
CREATE TABLE IF NOT EXISTS roulette_prizes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual',
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  position SERIAL
);

CREATE TABLE IF NOT EXISTS spin_balances (
  buyer_id TEXT PRIMARY KEY REFERENCES buyers(id) ON DELETE CASCADE,
  earned INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);

-- status: pending = ganhou, falta resgatar | active = resgatado (vale na próxima compra)
--         used = já aplicado | redeemed = entregue pelo admin | none = sem prêmio
CREATE TABLE IF NOT EXISTS spin_logs (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  prize_label TEXT NOT NULL,
  prize_type TEXT NOT NULL DEFAULT 'manual',
  prize_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  used_ticket_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spin_logs_buyer_idx ON spin_logs (buyer_id, status);
`;

async function init() {
  await pool.query(SCHEMA);

  await pool.query("INSERT INTO settings (id) VALUES ('main') ON CONFLICT DO NOTHING");

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@giovannamatos.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM admin_users");
  if (rows[0].n === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query("INSERT INTO admin_users (id, email, password_hash, name) VALUES ($1,$2,$3,$4)", [
      newId(), adminEmail, hash, "Giovanna Matos",
    ]);
    console.log(`Administrador criado: ${adminEmail} / ${adminPassword}  (troque a senha depois!)`);
  }

  const prizes = await pool.query("SELECT count(*)::int AS n FROM roulette_prizes");
  if (prizes.rows[0].n === 0) {
    const defaults = [
      ["5% de desconto", "percent", 5],
      ["+1 título grátis", "tickets", 1],
      ["R$10 no Pix", "manual", 10],
      ["Quase lá!", "none", 0],
      ["+3 títulos grátis", "tickets", 3],
      ["Boa sorte na próxima", "none", 0],
    ];
    for (const [label, type, value] of defaults) {
      await pool.query("INSERT INTO roulette_prizes (id, label, type, value) VALUES ($1,$2,$3,$4)", [newId(), label, type, value]);
    }
  }

  // Já deixa algumas conexões abertas, pra primeira visita não esperar conectar.
  await Promise.all([1, 2, 3, 4].map(() => pool.query("SELECT 1")));
}

module.exports = { pool, query, one, transaction, newId, init };
