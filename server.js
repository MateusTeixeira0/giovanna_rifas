// Servidor do site Giovanna Matos — JavaScript puro (Node.js + Express).
require("dotenv").config();
require("express-async-errors");
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const db = require("./src/db");
const auth = require("./src/auth");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" })); // 6mb: cabe a foto da campanha
app.use(cookieParser());

// Cabeçalhos básicos de segurança
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

// API
app.use("/api", require("./src/routes/public").router);
app.use("/api", require("./src/routes/buyer").router);
app.use("/api/admin", require("./src/routes/admin").router);
app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada." }));

// Páginas do painel admin: só abrem para quem fez login como administrador.
app.use("/admin", (req, res, next) => {
  if (!auth.adminSession(req)) return res.redirect("/conta");
  next();
});

// Site (HTML/CSS/JS na pasta "public")
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: 0 }));

// Erros inesperados
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api")) return res.status(500).json({ error: "Erro interno. Tente novamente." });
  res.status(500).send("Erro interno.");
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => app.listen(PORT, () => console.log(`\nSite no ar: http://localhost:${PORT}\nAdmin:      http://localhost:${PORT}/conta  (entre com o e-mail e a senha do administrador)\n`)))
  .catch((err) => {
    console.error("\n[ERRO] Não consegui conectar no banco de dados:", err.message);
    console.error("Confira se o DATABASE_URL no arquivo .env está correto.\n");
    process.exit(1);
  });
