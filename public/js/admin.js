/* Giovanna Matos — pedaços reutilizados pelas páginas do painel admin. */
(function () {
  "use strict";
  const { esc, api, pad6 } = App;

  /** Lista de títulos premiados de uma campanha (com botões Liberar / Marcar como ganho / Remover). */
  function prizeListHTML(raffleId, titles) {
    if (!titles.length) return '<p class="note" style="margin-bottom:14px;">Nenhum título premiado cadastrado ainda.</p>';
    return titles.map((p) => `
      <div class="prize-item ${p.status === "won" ? "is-won" : ""} ${p.status === "pending" ? "is-pending" : ""}">
        <span class="numpill">${pad6(p.number)}</span>
        <span class="label">${esc(p.label)}${p.status === "won" ? " — ganho por " + esc(p.winnerName || "") : ""}${p.status === "pending" ? " — retido" : ""}</span>
        ${p.status === "pending" ? `<button class="btn btn-primary btn-sm" data-release="${esc(p.id)}">🔓 Liberar agora</button>` : ""}
        ${p.status === "available" ? `<button class="btn btn-ghost btn-sm" data-mark="${esc(p.id)}" data-num="${p.number}" data-raffle="${esc(raffleId)}">Marcar como ganho</button>` : ""}
        <button class="btn btn-ghost btn-sm" data-del="${esc(p.id)}" title="Remover">✕</button>
      </div>`).join("");
  }

  /** Liga os botões da lista acima. `reload` é chamada depois de cada ação. */
  function bindPrizeActions(root, reload) {
    root.querySelectorAll("[data-release]").forEach((b) => (b.onclick = async () => {
      try { await api("/admin/prize-titles/" + b.dataset.release, { method: "PATCH", body: { action: "release" } }); App.toast("Título premiado liberado — já aparece pros compradores."); reload(); }
      catch (e) { App.toast(e.message); }
    }));
    root.querySelectorAll("[data-mark]").forEach((b) => (b.onclick = async () => {
      try {
        const owner = await api(`/admin/number-owner?raffleId=${encodeURIComponent(b.dataset.raffle)}&number=${b.dataset.num}`);
        if (!owner) { App.toast("Ainda ninguém comprou este título — aguarde a venda pra poder marcar como ganho."); return; }
        App.modal({
          message: `Marcar o título ${pad6(b.dataset.num)} como ganho por "${owner.name}" (${owner.email})?`,
          confirmLabel: "Confirmar",
          onConfirm: async () => {
            try { await api("/admin/prize-titles/" + b.dataset.mark, { method: "PATCH", body: { action: "markWon" } }); App.toast("Prêmio marcado como ganho."); reload(); }
            catch (e) { App.toast(e.message); }
          },
        });
      } catch (e) { App.toast(e.message); }
    }));
    root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      App.modal({
        message: "Remover este título premiado?", confirmLabel: "Remover",
        onConfirm: async () => { try { await api("/admin/prize-titles/" + b.dataset.del, { method: "DELETE" }); reload(); } catch (e) { App.toast(e.message); } },
      });
    }));
  }

  /** Mini formulário "Adicionar título premiado". `getRaffleId` devolve a campanha escolhida. */
  function bindAddPrize(root, getRaffleId, reload) {
    const numEl = root.querySelector("#prizeNumDisplay");
    let pending = null;
    async function regenerate() {
      const rid = getRaffleId();
      if (!rid) { numEl.value = ""; return; }
      try {
        const r = await api("/admin/prize-number?raffleId=" + encodeURIComponent(rid));
        pending = r.number;
        numEl.value = pending ? pad6(pending) : "nenhum número livre";
      } catch (e) { numEl.value = "erro"; }
    }
    root.querySelector("#rerollBtn").onclick = regenerate;
    root.querySelector("#addPrizeBtn").onclick = async () => {
      const label = root.querySelector("#prizeLabel").value.trim();
      if (!getRaffleId() || !pending || !label) { App.toast("Escolha a campanha, confira o número e preencha o prêmio."); return; }
      const releaseNow = root.querySelector("#prizeReleaseNow").checked;
      try {
        await api("/admin/prize-titles", { method: "POST", body: { raffleId: getRaffleId(), number: pending, label, releaseNow } });
        App.toast(releaseNow ? "Título premiado adicionado e liberado." : "Título premiado adicionado, retido até você liberar.");
        reload();
      } catch (e) { App.toast(e.message); }
    };
    regenerate();
    return regenerate;
  }

  const ADD_PRIZE_FIELDS = `
    <div class="field"><label>Prêmio</label><input id="prizeLabel" placeholder="Ex: R$500 no Pix"></div>
    <label class="inline-check"><input type="checkbox" id="prizeReleaseNow"> Liberar imediatamente (senão fica retido, invisível pros compradores e impossível de comprar, até você liberar manualmente)</label>
    <button class="btn btn-primary" id="addPrizeBtn" style="margin-top:14px;" type="button">Adicionar</button>
    <p class="note" style="margin-top:10px;">O número do título é sorteado automaticamente entre os números da campanha, pra não dar pra escolher um número "premiado" na mão.</p>`;

  const NUMBER_FIELD = `
    <div class="field"><label>Número gerado</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="prizeNumDisplay" disabled style="font-family:'Manrope',sans-serif;font-weight:800;">
        <button class="btn btn-ghost btn-sm" id="rerollBtn" type="button" title="Gerar outro número">🎲</button>
      </div>
    </div>`;

  function federalInfoHTML(r) {
    if (!r.federalConcurso) return "";
    const d = r.federalDate ? r.federalDate.split("-").reverse().join("/") : "";
    return `<div class="federal-info"><b>🎰 Loteria Federal</b> — concurso ${esc(r.federalConcurso)}${d ? " · " + d : ""}
      <div class="federal-nums"><span>Número sorteado <b>${esc(r.federalNumber)}</b></span></div>
      <small>${r.federalAdjusted ? "Ajustado ao intervalo da campanha" : ""}${r.federalAdjusted && r.federalFallback ? " · " : ""}${r.federalFallback ? "Número apurado não foi vendido, ganhou o próximo vendido" : ""}</small></div>`;
  }

  function confirmDeleteRaffle(raffle, afterDelete) {
    App.modal({
      message: `Excluir a campanha "${raffle.title}"? Isso também remove os títulos vendidos e prêmios dela. Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      onConfirm: async () => {
        try { await api("/admin/raffles/" + raffle.id, { method: "DELETE" }); App.toast("Campanha excluída."); afterDelete(); }
        catch (e) { App.toast(e.message); }
      },
    });
  }

  window.AdminUI = { prizeListHTML, bindPrizeActions, bindAddPrize, ADD_PRIZE_FIELDS, NUMBER_FIELD, federalInfoHTML, confirmDeleteRaffle };
})();
