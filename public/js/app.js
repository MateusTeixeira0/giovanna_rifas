/* Giovanna Matos — funções compartilhadas por todas as páginas (JavaScript puro). */
(function () {
  "use strict";

  /* ---------- Ícones ---------- */
  const ICONS = {
    cash: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 19h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    moto: '<svg viewBox="0 0 24 24" fill="none"><circle cx="5.5" cy="18" r="2.6" stroke="currentColor" stroke-width="1.6"/><circle cx="18.5" cy="18" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 18l3-7h4l3 4h3M8.5 11l2-3h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 16l1.5-5.5A2 2 0 0 1 6.4 9h11.2a2 2 0 0 1 1.9 1.5L21 16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="2" y="16" width="20" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="9" width="18" height="12" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 13h18M12 9v12" stroke="currentColor" stroke-width="1.6"/></svg>',
  };
  const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" width="12" height="12"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const TROPHY_ICON = '<svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" stroke="currentColor" stroke-width="1.6"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" stroke="currentColor" stroke-width="1.6"/><path d="M12 13v4M9 20h6M10 17h4v3h-4z" stroke="currentColor" stroke-width="1.6"/></svg>';
  const CART_ICON = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><circle cx="9" cy="20" r="1.3" fill="currentColor"/><circle cx="17" cy="20" r="1.3" fill="currentColor"/><path d="M2 3h2l2.2 11.4A2 2 0 0 0 8.2 16h8.6a2 2 0 0 0 2-1.6L20.5 7H5.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const MUTE_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M17 8l5 8M22 8l-5 8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const IG_ICON = '<svg viewBox="0 0 24 24" fill="none"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="4.3" stroke="#fff" stroke-width="1.8"/><circle cx="17.6" cy="6.4" r="1.15" fill="#fff"/></svg>';
  const WA_ICON = '<svg viewBox="0 0 24 24" fill="none"><path d="M6.3 17.6L4 20l2.5-.7A8.5 8.5 0 1 0 4.5 12 8.4 8.4 0 0 0 6.3 17.6z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 9.6c0-.5.4-1 .9-1h.6c.3 0 .5.2.6.5l.5 1.4c.1.3 0 .6-.2.8l-.5.5c.4.9 1.1 1.6 2 2l.5-.5c.2-.2.5-.3.8-.2l1.4.5c.3.1.5.3.5.6v.6c0 .5-.5.9-1 .9-2.9 0-5.1-2.2-5.1-5.1z" fill="#fff"/></svg>';
  const MARK = '<svg class="mark" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.5 0 2.7 1.2 2.7 2.7 0 .6-.2 1.2-.5 1.6.4-.3 1-.5 1.6-.5C17.3 5.8 18.5 7 18.5 8.5S17.3 11.2 15.8 11.2c-.6 0-1.2-.2-1.6-.5.3.4.5 1 .5 1.6 0 1.5-1.2 2.7-2.7 2.7s-2.7-1.2-2.7-2.7c0-.6.2-1.2.5-1.6-.4.3-1 .5-1.6.5C6.7 11.2 5.5 10 5.5 8.5S6.7 5.8 8.2 5.8c.6 0 1.2.2 1.6.5-.3-.4-.5-1-.5-1.6C9.3 3.2 10.5 2 12 2z"/><path d="M11 13h2l1 9h-4l1-9z"/></svg>';

  /* ---------- Utilidades ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const money = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",");
  const pad6 = (n) => String(n).padStart(6, "0");
  const dateBR = (d) => new Date(d).toLocaleDateString("pt-BR");
  const dateTimeBR = (d) => new Date(d).toLocaleString("pt-BR");
  const qs = (name) => new URLSearchParams(location.search).get(name);
  const iconFor = (type) => ICONS[type] || ICONS.gift;
  const firstWord = (t) => String(t || "").split(" ")[0];

  /** Foto da campanha (ou ícone, se não tiver foto). */
  function mediaTag(r) {
    if (r.photoUrl) return `<img src="${esc(r.photoUrl)}" alt="${esc(r.title)}">`;
    return iconFor(r.prizeType);
  }

  async function api(path, options) {
    const opts = Object.assign({ credentials: "same-origin" }, options || {});
    if (opts.body && typeof opts.body !== "string") {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    }
    let res;
    try { res = await fetch("/api" + path, opts); }
    catch (e) { throw new Error("Sem conexão com o servidor."); }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || "Algo deu errado. Tente de novo.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ---------- Aviso rápido (toast), janela de confirmação e comemoração ---------- */
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function modal(opts) {
    const overlay = document.getElementById("modalOverlay");
    const box = document.getElementById("modalBox");
    const inputWrap = document.getElementById("modalInputWrap");
    const input = document.getElementById("modalInput");
    const confirmBtn = document.getElementById("modalConfirmBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");
    document.getElementById("modalMessage").textContent = opts.message || "";
    inputWrap.style.display = opts.withInput ? "block" : "none";
    input.value = opts.inputValue || "";
    confirmBtn.textContent = opts.confirmLabel || "Confirmar";
    function close() {
      overlay.classList.remove("open"); box.classList.remove("open");
      confirmBtn.onclick = null; cancelBtn.onclick = null; overlay.onclick = null;
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    confirmBtn.onclick = () => {
      if (opts.withInput) { const v = input.value.trim(); if (!v) return; close(); opts.onConfirm(v); }
      else { close(); opts.onConfirm(); }
    };
    cancelBtn.onclick = close; overlay.onclick = close;
    document.addEventListener("keydown", onKey);
    overlay.classList.add("open"); box.classList.add("open");
    if (opts.withInput) setTimeout(() => input.focus(), 50);
  }

  function confetti() {
    const colors = ["#E8B84B", "#34D399", "#5FD8C4", "#F0553D", "#FFD447", "#ffffff"];
    const c = document.createElement("div");
    c.className = "confetti-container";
    document.body.appendChild(c);
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("div");
      p.className = "confetti-piece";
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = 6 + Math.random() * 6 + "px";
      p.style.height = 10 + Math.random() * 8 + "px";
      p.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
      p.style.animationDelay = Math.random() * 0.5 + "s";
      c.appendChild(p);
    }
    setTimeout(() => c.remove(), 4200);
  }

  function winCelebration(lines) {
    confetti();
    const overlay = document.getElementById("winOverlay");
    document.getElementById("winList").innerHTML = lines.map((w) => `<div class="win-item">${w}</div>`).join("");
    overlay.classList.add("open");
    const close = () => overlay.classList.remove("open");
    document.getElementById("winCloseBtn").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  /* ---------- Benefício da roleta (prévia no navegador; o valor de verdade é calculado no servidor) ---------- */
  function applyReward(total, reward) {
    const r2 = (n) => Math.round(n * 100) / 100;
    if (!reward) return { discount: 0, bonus: 0, final: r2(total) };
    if (reward.type === "tickets") return { discount: 0, bonus: Math.max(0, Math.floor(reward.value)), final: r2(total) };
    let d = reward.type === "percent" ? (total * reward.value) / 100 : reward.value;
    if (total <= 1) d = 0; else d = Math.min(d, total - 1);
    d = r2(Math.max(0, d));
    return { discount: d, bonus: 0, final: r2(total - d) };
  }
  function rewardDescription(type, value) {
    const v = Number(value);
    if (type === "percent") return `${v}% de desconto na próxima compra`;
    if (type === "amount") return `${money(v)} de desconto na próxima compra`;
    if (type === "tickets") return `${v} título${v === 1 ? "" : "s"} grátis na próxima compra`;
    return "";
  }
  const REWARD_TYPES = ["percent", "amount", "tickets"];

  /* ---------- Roleta (desenho) ---------- */
  function wheelSVG(prizes) {
    const n = prizes.length, per = 360 / n, colors = ["#17332A", "#1E4438"];
    let svg = '<svg viewBox="0 0 300 300" style="width:100%;height:100%;display:block;">';
    for (let i = 0; i < n; i++) {
      const s = i * per - 90, e = s + per, large = per > 180 ? 1 : 0;
      const x1 = 150 + 148 * Math.cos((s * Math.PI) / 180), y1 = 150 + 148 * Math.sin((s * Math.PI) / 180);
      const x2 = 150 + 148 * Math.cos((e * Math.PI) / 180), y2 = 150 + 148 * Math.sin((e * Math.PI) / 180);
      svg += `<path d="M150,150 L${x1.toFixed(2)},${y1.toFixed(2)} A148,148 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${colors[i % 2]}" stroke="#081310" stroke-width="2"/>`;
      const mid = s + per / 2;
      const lx = 150 + 98 * Math.cos((mid * Math.PI) / 180), ly = 150 + 98 * Math.sin((mid * Math.PI) / 180);
      const label = prizes[i].label.length > 16 ? prizes[i].label.slice(0, 15) + "…" : prizes[i].label;
      svg += `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" fill="#E8B84B" font-size="12" font-family="Inter, sans-serif" font-weight="700" text-anchor="middle" transform="rotate(${(mid + 90).toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})">${esc(label)}</text>`;
    }
    return svg + "</svg>";
  }

  /* ---------- Cabeçalho, menu lateral e rodapé (iguais em todas as páginas) ---------- */
  const NAV = [
    ["home", "/", "🎟️ Campanhas"],
    ["winners", "/ganhadores", "🏆 Ganhadores"],
    ["roulette", "/roleta", "🎡 Roleta"],
    ["account", "/conta", "🎫 Meus títulos"],
    ["signup", "/conta?m=cadastro", "📝 Cadastre-se"],
    ["terms", "/termos", "📄 Termos de uso"],
  ];

  function sharedOverlays() {
    return `
      <div class="toast" id="toast"></div>
      <div class="modal-overlay" id="modalOverlay"></div>
      <div class="modal-box" id="modalBox">
        <p id="modalMessage" style="font-size:14.5px;line-height:1.6;color:var(--text);margin:0 0 4px;"></p>
        <div class="field" id="modalInputWrap" style="display:none;"><input id="modalInput"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modalCancelBtn">Cancelar</button>
          <button class="btn btn-primary" id="modalConfirmBtn">Confirmar</button>
        </div>
      </div>
      <div class="win-overlay" id="winOverlay">
        <div class="win-card">
          <div class="win-trophy">🏆</div>
          <h2>Parabéns!</h2>
          <div class="win-list" id="winList"></div>
          <button class="btn btn-primary btn-block" id="winCloseBtn" style="margin-top:8px;">Uhuul! 🎉</button>
        </div>
      </div>`;
  }

  let sessionPromise = null;
  function getSession() {
    if (!sessionPromise) sessionPromise = api("/auth/session").catch(() => null);
    return sessionPromise;
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/";
  }

  /** Monta o cabeçalho + menu lateral do site. Devolve a sessão (comprador, admin ou null). */
  async function initPublic() {
    const page = document.body.dataset.nav || "";
    const session = await getSession();

    const header = document.createElement("div");
    header.innerHTML = `
      <header class="top"><div class="topbar">
        <a href="/" class="brand">${MARK} GIOVANNA <span class="sub">MATOS</span></a>
        <div style="display:flex;align-items:center;gap:8px;">
          ${session && session.type === "admin" ? '<a href="/admin/" class="btn btn-primary btn-sm">🛠️ Painel admin</a>' : ""}
          <button class="icon-btn hamb" id="hambBtn" aria-label="Abrir menu"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        </div>
      </div></header>
      <div class="drawer-overlay" id="drawerOverlay"></div>
      <aside class="drawer" id="drawer">
        <div class="drawer-head">
          <span class="brand" style="font-size:16px;">${MARK} GIOVANNA <span class="sub">MATOS</span></span>
          <button class="icon-btn" id="drawerCloseBtn" aria-label="Fechar menu">✕</button>
        </div>
        <div class="drawer-account" id="drawerAccount"></div>
        <nav class="drawer-nav">${NAV.map(([key, href, label]) => `<a href="${href}" class="${key === page ? "active" : ""}">${label}</a>`).join("")}</nav>
      </aside>`;
    const mainEl = document.querySelector("main");
    while (header.firstChild) document.body.insertBefore(header.firstChild, mainEl);

    const foot = document.createElement("div");
    foot.innerHTML = `<footer><div class="wrap"><span>© ${new Date().getFullYear()} Giovanna Matos</span><span><a href="/termos">Termos de uso</a></span></div></footer>` + sharedOverlays();
    while (foot.firstChild) document.body.appendChild(foot.firstChild);

    const acc = document.getElementById("drawerAccount");
    if (session && session.type === "buyer") {
      acc.innerHTML = `<div class="logged"><div><div class="logged-name">👤 ${esc(session.name)}</div><div class="logged-email">${esc(session.email)}</div></div><button class="btn btn-ghost btn-sm" id="drawerLogout">Sair da conta</button></div>`;
      document.getElementById("drawerLogout").onclick = logout;
    } else if (session && session.type === "admin") {
      acc.innerHTML = `<div class="logged"><div><div class="logged-name">🛠️ Administrador</div><div class="logged-email">${esc(session.email)}</div></div><a href="/admin/" class="btn btn-primary btn-sm">🛠️ Voltar ao painel admin</a><button class="btn btn-ghost btn-sm" id="drawerLogout">Sair</button></div>`;
      document.getElementById("drawerLogout").onclick = logout;
    } else {
      acc.innerHTML = '<a href="/conta" class="btn btn-primary btn-sm">Entrar</a>';
    }

    const drawer = document.getElementById("drawer"), overlay = document.getElementById("drawerOverlay");
    const open = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
    const close = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };
    document.getElementById("hambBtn").onclick = open;
    document.getElementById("drawerCloseBtn").onclick = close;
    overlay.onclick = close;

    if (document.body.dataset.social) loadSocial();
    if (page === "home" && location.pathname === "/") splash();
    return session;
  }

  /** Animação de abertura: aparece uma vez por visita ao abrir a tela inicial. */
  function splash() {
    try { if (sessionStorage.getItem("gm_splash")) return; sessionStorage.setItem("gm_splash", "1"); } catch (_) {}
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = document.createElement("div");
    el.className = "splash";
    el.innerHTML = `<div class="s-mark">${MARK.replace(' class="mark"', "")}</div>
      <div class="s-name"><span class="a">GIOVANNA</span><span class="b">MATOS</span></div>
      <div class="s-line"></div><div class="s-tag">Escolha sua sorte</div>`;
    document.body.appendChild(el);
    const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 700); };
    setTimeout(close, 2400);
    el.onclick = close;
  }

  async function loadSocial() {
    try {
      const s = await api("/social-links");
      const ig = (s.instagram || "").trim();
      const wa = (s.whatsapp || "").replace(/\D/g, "");
      if (!ig && !wa) return;
      const div = document.createElement("div");
      div.className = "social-fab";
      div.innerHTML =
        (ig ? `<a href="${esc(/^https?:/.test(ig) ? ig : "https://" + ig)}" target="_blank" rel="noopener" class="fab fab-ig" title="Instagram">${IG_ICON}</a>` : "") +
        (wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="fab fab-wa" title="WhatsApp">${WA_ICON}</a>` : "");
      document.body.appendChild(div);
    } catch (_) {}
  }

  /* ---------- Painel admin ---------- */
  const ADMIN_NAV = [
    ["dashboard", "/admin/", "Visão geral"],
    ["nova", "/admin/nova", "Criar campanha"],
    ["sorteios", "/admin/sorteios", "Sorteios e Prêmios"],
    ["roleta", "/admin/roleta", "Roleta"],
    ["participantes", "/admin/participantes", "Participantes"],
    ["pagamentos", "/admin/pagamentos", "Pagamentos"],
  ];

  /** Monta o painel admin. Devolve o elemento onde a página escreve o conteúdo. */
  async function initAdmin() {
    const page = document.body.dataset.admin || "dashboard";
    const session = await getSession();
    if (!session || session.type !== "admin") { location.href = "/conta"; return null; }

    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="wrap admin-wrap" style="padding-top:14px;">
        <div class="section-title admin-top">
          <span>Painel administrativo</span>
          <div class="row-actions">
            <a href="/" class="btn btn-ghost btn-sm">🌐 Ver site</a>
            <button class="btn btn-ghost btn-sm" id="adminLogoutBtn">Sair do admin</button>
          </div>
        </div>
        <div class="section-sub">Gerencie campanhas, acompanhe vendas e realize sorteios.</div>
        <div class="admin-shell">
          <div class="admin-side">${ADMIN_NAV.map(([k, href, label]) => `<a href="${href}" class="${k === page ? "active" : ""}">${label}</a>`).join("")}</div>
          <div id="adminBody"></div>
        </div>
      </div>`;
    const top = document.createElement("div");
    top.innerHTML = `<header class="top"><div class="topbar"><a href="/admin/" class="brand">${MARK} GIOVANNA <span class="sub">MATOS</span></a><span class="pill-account">🛠️ Admin</span></div></header>`;
    document.body.insertBefore(top.firstChild, root);
    const ov = document.createElement("div");
    ov.innerHTML = sharedOverlays();
    while (ov.firstChild) document.body.appendChild(ov.firstChild);
    document.getElementById("adminLogoutBtn").onclick = logout;
    return document.getElementById("adminBody");
  }

  function emptyState(title, msg, href, cta) {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(msg)}</p>${href ? `<a href="${href}" class="btn btn-primary" style="margin-top:16px;">${esc(cta)}</a>` : ""}</div>`;
  }

  window.App = {
    ICONS, CAL_ICON, TROPHY_ICON, CART_ICON, MUTE_ICON, IG_ICON, WA_ICON,
    esc, money, pad6, dateBR, dateTimeBR, qs, iconFor, firstWord, mediaTag, api, toast, modal, confetti,
    winCelebration, applyReward, rewardDescription, REWARD_TYPES, wheelSVG, initPublic, initAdmin,
    getSession, logout, emptyState,
  };
})();
