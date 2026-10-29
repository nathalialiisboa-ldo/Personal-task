/* Cronograma de 1:1s — acompanhamento de cadência de reuniões por liderança, dentro de Áreas de Atendimento. */

const LS_CRONO_LIDERANCAS = "ptasks_cronograma_liderancas_v1";
const LS_CRONO_ENCONTROS = "ptasks_cronograma_encontros_v1";

const STATUS_CLASS_CRONO = {
  Pendente: "st-pendente",
  Agendado: "st-agendado",
  Realizado: "st-realizado",
  Reagendar: "st-reagendar",
  Cancelado: "st-cancelado",
};

let cronogramaEncontrosFilters = { area: "", status: "", prioridade: "", sort: "dataSugerida", dir: 1 };
let cronogramaLiderancasFilters = { area: "", prioridade: "", situacao: "", sort: "nome", dir: 1 };
let editingLiderancaId = null;
let editingEncontroId = null;

function loadLiderancas() {
  try { return JSON.parse(localStorage.getItem(LS_CRONO_LIDERANCAS) || "[]"); } catch { return []; }
}
function saveLiderancas(list) { localStorage.setItem(LS_CRONO_LIDERANCAS, JSON.stringify(list)); }
function loadEncontros() {
  try { return JSON.parse(localStorage.getItem(LS_CRONO_ENCONTROS) || "[]"); } catch { return []; }
}
function saveEncontros(list) { localStorage.setItem(LS_CRONO_ENCONTROS, JSON.stringify(list)); }

function uidCrono() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtmlCrono(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizeCrono(s) { return String(s || "").trim().toLowerCase(); }
function todayISOCrono() { return new Date().toISOString().slice(0, 10); }
function formatDateCrono(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
function findLiderancaByNome(nome) {
  const key = normalizeCrono(nome);
  return loadLiderancas().find((l) => normalizeCrono(l.nome) === key);
}

/* ---------- Dashboard ---------- */

function renderCronogramaStats() {
  const el = document.getElementById("cronogramaStats");
  if (!el) return;
  const liderancas = loadLiderancas();
  const encontros = loadEncontros();
  const realizados = encontros.filter((e) => e.status === "Realizado").length;
  const pendentes = encontros.filter((e) => e.status === "Pendente").length;
  const agendados = encontros.filter((e) => e.status === "Agendado").length;
  const reagendar = encontros.filter((e) => e.status === "Reagendar").length;
  const nomesComRealizado = new Set(encontros.filter((e) => e.status === "Realizado").map((e) => normalizeCrono(e.lideranca)));
  const cobertura = liderancas.length
    ? Math.round((100 * liderancas.filter((l) => nomesComRealizado.has(normalizeCrono(l.nome))).length) / liderancas.length)
    : 0;
  const conclusao = encontros.length ? Math.round((100 * realizados) / encontros.length) : 0;

  const stats = [
    ["Lideranças", liderancas.length, "accent-purple"],
    ["Previstos", encontros.length, "accent-blue"],
    ["Realizados", realizados, "accent-green"],
    ["Pendentes", pendentes, "accent-orange"],
    ["Agendados", agendados, "accent-blue"],
    ["A reagendar", reagendar, "accent-orange"],
    ["Cobertura", cobertura + "%", "accent-purple"],
    ["Conclusão", conclusao + "%", "accent-green"],
  ];
  el.innerHTML = stats.map(([label, val, accent]) => `
    <div class="mini-stat ${accent}"><span>${val}</span><small>${label}</small></div>
  `).join("");
}

function populateCronogramaAreaFilter() {
  const areasSet = new Set([
    ...loadLiderancas().map((l) => l.area).filter(Boolean),
    ...loadEncontros().map((e) => e.area).filter(Boolean),
  ]);
  const areasList = Array.from(areasSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const options = '<option value="">Todas as áreas</option>' +
    areasList.map((a) => `<option value="${escapeHtmlCrono(a)}">${escapeHtmlCrono(a)}</option>`).join("");

  [
    ["cronogramaFilterArea", cronogramaEncontrosFilters],
    ["cronogramaFilterAreaLideranca", cronogramaLiderancasFilters],
  ].forEach(([id, filters]) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = options;
    if (areasList.includes(filters.area)) sel.value = filters.area;
    else filters.area = "";
  });
}

function sortByField(list, field, dir, getters) {
  const get = getters[field] || ((x) => x[field]);
  return [...list].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "pt-BR") * dir;
  });
}

/* ---------- Tabela de encontros ---------- */

function encontroRowHTML(e) {
  const statusClass = STATUS_CLASS_CRONO[e.status] || "st-pendente";
  return `
  <tr data-id="${e.id}">
    <td><input type="date" class="crono-data-sugerida" value="${e.dataSugerida || ""}" /></td>
    <td>${escapeHtmlCrono(e.lideranca)}</td>
    <td>${escapeHtmlCrono(e.area)}</td>
    <td>${escapeHtmlCrono(e.prioridade)}</td>
    <td>${e.duracaoMin ? e.duracaoMin + " min" : "—"}</td>
    <td>
      <select class="status-pill-cronograma ${statusClass} crono-status">
        ${Object.keys(STATUS_CLASS_CRONO).map((s) => `<option value="${s}" ${s === e.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </td>
    <td><input type="date" class="crono-proxima-prevista" value="${e.proximaPrevista || ""}" /></td>
    <td><button type="button" class="cronograma-row-delete" title="Remover">✕</button></td>
  </tr>`;
}

function updateEncontroField(id, field, value) {
  const list = loadEncontros();
  const item = list.find((x) => x.id === id);
  if (!item) return;
  item[field] = value;
  item.updatedAt = Date.now();
  saveEncontros(list);
}

function renderCronogramaTable() {
  const tbody = document.getElementById("cronogramaTableBody");
  const empty = document.getElementById("cronogramaTableEmpty");
  if (!tbody) return;
  const f = cronogramaEncontrosFilters;
  let encontros = loadEncontros();
  if (f.area) encontros = encontros.filter((e) => e.area === f.area);
  if (f.status) encontros = encontros.filter((e) => e.status === f.status);
  if (f.prioridade) encontros = encontros.filter((e) => e.prioridade === f.prioridade);
  encontros = sortByField(encontros, f.sort, f.dir, {});

  tbody.innerHTML = encontros.map(encontroRowHTML).join("");
  empty.classList.toggle("hidden", encontros.length > 0);

  tbody.querySelectorAll("tr").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector(".crono-data-sugerida").addEventListener("change", (ev) => {
      updateEncontroField(id, "dataSugerida", ev.target.value || null);
    });
    tr.querySelector(".crono-status").addEventListener("change", (ev) => {
      const novoStatus = ev.target.value;
      const list = loadEncontros();
      const item = list.find((x) => x.id === id);
      if (!item) return;
      item.status = novoStatus;
      if (novoStatus === "Realizado" && !item.dataRealizada) {
        item.dataRealizada = todayISOCrono();
        const lid = findLiderancaByNome(item.lideranca);
        if (!item.proximaPrevista && lid && lid.cadenciaDias) {
          item.proximaPrevista = addDaysISO(item.dataRealizada, lid.cadenciaDias);
        }
      }
      item.updatedAt = Date.now();
      saveEncontros(list);
      renderCronogramaTable();
      renderCronogramaLeadersTable();
      renderCronogramaStats();
    });
    tr.querySelector(".crono-proxima-prevista").addEventListener("change", (ev) => {
      updateEncontroField(id, "proximaPrevista", ev.target.value || null);
    });
    tr.querySelector(".cronograma-row-delete").addEventListener("click", () => {
      if (!confirm("Remover este encontro do cronograma?")) return;
      saveEncontros(loadEncontros().filter((x) => x.id !== id));
      renderCronogramaTable();
      renderCronogramaLeadersTable();
      renderCronogramaStats();
    });
  });
}

/* ---------- Tabela de lideranças ---------- */

function computeLiderancaStats(l) {
  const encontrosDaLideranca = loadEncontros().filter((e) => normalizeCrono(e.lideranca) === normalizeCrono(l.nome));
  const previstas = encontrosDaLideranca.length;
  const realizadas = encontrosDaLideranca.filter((e) => e.status === "Realizado");
  const ultimaRealizada = realizadas.map((e) => e.dataRealizada).filter(Boolean).sort().pop() || null;
  const proximaPrevista = ultimaRealizada && l.cadenciaDias ? addDaysISO(ultimaRealizada, l.cadenciaDias) : null;
  let situacao = "Sem 1:1 realizado";
  if (ultimaRealizada) situacao = proximaPrevista && proximaPrevista < todayISOCrono() ? "Cadência vencida" : "Em dia";
  return { previstas, realizadasCount: realizadas.length, ultimaRealizada, proximaPrevista, situacao };
}

function liderancaRowHTML(l) {
  const { previstas, realizadasCount, ultimaRealizada, proximaPrevista, situacao } = computeLiderancaStats(l);
  return `
  <tr data-id="${l.id}">
    <td>${escapeHtmlCrono(l.nome)}</td>
    <td>${escapeHtmlCrono(l.area)}</td>
    <td>${escapeHtmlCrono(l.nivel)}</td>
    <td>${escapeHtmlCrono(l.prioridade)}</td>
    <td><input type="number" class="cadencia-inline crono-cadencia" min="1" value="${l.cadenciaDias || ""}" /></td>
    <td><input type="number" class="duracao-inline crono-duracao" min="5" step="5" value="${l.duracaoMin || ""}" /></td>
    <td>${previstas}</td>
    <td>${realizadasCount}</td>
    <td>${formatDateCrono(ultimaRealizada)}</td>
    <td>${formatDateCrono(proximaPrevista)}</td>
    <td>${escapeHtmlCrono(situacao)}</td>
    <td><button type="button" class="cronograma-row-delete" title="Remover liderança">✕</button></td>
  </tr>`;
}

function updateLiderancaField(id, field, value) {
  const list = loadLiderancas();
  const item = list.find((x) => x.id === id);
  if (!item) return;
  item[field] = value;
  item.updatedAt = Date.now();
  saveLiderancas(list);
}

function renderCronogramaLeadersTable() {
  const tbody = document.getElementById("cronogramaLeadersBody");
  const empty = document.getElementById("cronogramaLeadersEmpty");
  if (!tbody) return;
  const f = cronogramaLiderancasFilters;
  let liderancas = loadLiderancas();
  if (f.area) liderancas = liderancas.filter((l) => l.area === f.area);
  if (f.prioridade) liderancas = liderancas.filter((l) => l.prioridade === f.prioridade);
  if (f.situacao) liderancas = liderancas.filter((l) => computeLiderancaStats(l).situacao === f.situacao);
  liderancas = sortByField(liderancas, f.sort, f.dir, {
    situacao: (l) => computeLiderancaStats(l).situacao,
    proximaPrevista: (l) => computeLiderancaStats(l).proximaPrevista,
  });

  tbody.innerHTML = liderancas.map(liderancaRowHTML).join("");
  empty.classList.toggle("hidden", liderancas.length > 0);

  tbody.querySelectorAll("tr").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector(".crono-cadencia").addEventListener("change", (ev) => {
      updateLiderancaField(id, "cadenciaDias", Number(ev.target.value) || null);
      renderCronogramaTable();
      renderCronogramaLeadersTable();
    });
    tr.querySelector(".crono-duracao").addEventListener("change", (ev) => {
      updateLiderancaField(id, "duracaoMin", Number(ev.target.value) || null);
    });
    tr.querySelector(".cronograma-row-delete").addEventListener("click", () => {
      if (!confirm("Remover esta liderança da lista? Os encontros já registrados continuam no cronograma.")) return;
      saveLiderancas(loadLiderancas().filter((x) => x.id !== id));
      renderCronogramaLeadersTable();
      renderCronogramaStats();
      populateEncontroLiderancaOptions();
    });
  });
}

function renderCronogramaView() {
  populateCronogramaAreaFilter();
  renderCronogramaStats();
  renderCronogramaTable();
  renderCronogramaLeadersTable();
}

/* ---------- Modal: Liderança ---------- */

function openLiderancaModal(id) {
  editingLiderancaId = id || null;
  const l = id ? loadLiderancas().find((x) => x.id === id) : null;
  document.getElementById("liderancaModalTitle").textContent = id ? "Editar liderança" : "Nova liderança";
  document.getElementById("liderancaNomeInput").value = l ? l.nome : "";
  document.getElementById("liderancaAreaInput").value = l ? l.area || "" : "";
  document.getElementById("liderancaNivelInput").value = l ? l.nivel || "" : "";
  document.getElementById("liderancaPrioridadeInput").value = l ? l.prioridade || "P2" : "P2";
  document.getElementById("liderancaCadenciaInput").value = l ? l.cadenciaDias || 30 : 30;
  document.getElementById("liderancaDuracaoInput").value = l ? l.duracaoMin || 30 : 30;
  document.getElementById("liderancaModal").classList.remove("hidden");
  document.getElementById("liderancaNomeInput").focus();
}
function closeLiderancaModal() {
  document.getElementById("liderancaModal").classList.add("hidden");
  editingLiderancaId = null;
}
function saveLiderancaFromModal() {
  const nome = document.getElementById("liderancaNomeInput").value.trim();
  if (!nome) return;
  const list = loadLiderancas();
  const now = Date.now();
  let item = editingLiderancaId ? list.find((x) => x.id === editingLiderancaId) : null;
  if (!item) {
    item = { id: uidCrono(), createdAt: now };
    list.push(item);
  }
  item.nome = nome;
  item.area = document.getElementById("liderancaAreaInput").value.trim();
  item.nivel = document.getElementById("liderancaNivelInput").value.trim();
  item.prioridade = document.getElementById("liderancaPrioridadeInput").value;
  item.cadenciaDias = Number(document.getElementById("liderancaCadenciaInput").value) || 30;
  item.duracaoMin = Number(document.getElementById("liderancaDuracaoInput").value) || 30;
  item.updatedAt = now;
  saveLiderancas(list);
  closeLiderancaModal();
  renderCronogramaView();
  populateEncontroLiderancaOptions();
}

/* ---------- Modal: Encontro ---------- */

function populateEncontroLiderancaOptions() {
  const sel = document.getElementById("encontroLiderancaInput");
  if (!sel) return;
  const liderancas = loadLiderancas().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  sel.innerHTML = liderancas.length
    ? liderancas.map((l) => `<option value="${escapeHtmlCrono(l.nome)}">${escapeHtmlCrono(l.nome)}</option>`).join("")
    : '<option value="">Cadastre uma liderança primeiro</option>';
}
function openEncontroModal(id) {
  editingEncontroId = id || null;
  populateEncontroLiderancaOptions();
  const e = id ? loadEncontros().find((x) => x.id === id) : null;
  document.getElementById("encontroModalTitle").textContent = id ? "Editar encontro" : "Novo encontro";
  document.getElementById("encontroLiderancaInput").value = e ? e.lideranca : loadLiderancas()[0]?.nome || "";
  document.getElementById("encontroDataSugeridaInput").value = e ? e.dataSugerida || "" : todayISOCrono();
  document.getElementById("encontroStatusInput").value = e ? e.status : "Pendente";
  document.getElementById("encontroProximaPrevistaInput").value = e ? e.proximaPrevista || "" : "";
  document.getElementById("encontroModal").classList.remove("hidden");
}
function closeEncontroModal() {
  document.getElementById("encontroModal").classList.add("hidden");
  editingEncontroId = null;
}
function saveEncontroFromModal() {
  const liderancaNome = document.getElementById("encontroLiderancaInput").value;
  if (!liderancaNome) return;
  const lid = findLiderancaByNome(liderancaNome);
  const list = loadEncontros();
  const now = Date.now();
  let item = editingEncontroId ? list.find((x) => x.id === editingEncontroId) : null;
  if (!item) {
    item = { id: uidCrono(), createdAt: now };
    list.push(item);
  }
  item.lideranca = liderancaNome;
  item.area = lid ? lid.area : "";
  item.prioridade = lid ? lid.prioridade : "";
  item.duracaoMin = lid ? lid.duracaoMin : null;
  item.dataSugerida = document.getElementById("encontroDataSugeridaInput").value || null;
  item.status = document.getElementById("encontroStatusInput").value;
  item.proximaPrevista = document.getElementById("encontroProximaPrevistaInput").value || null;
  if (item.status === "Realizado" && !item.dataRealizada) item.dataRealizada = todayISOCrono();
  item.updatedAt = now;
  saveEncontros(list);
  closeEncontroModal();
  renderCronogramaView();
}

/* ---------- Importação de cronograma (JSON) ---------- */

function handleCronogramaImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(String(reader.result)); } catch {
      if (window.showToast) window.showToast("Arquivo inválido.");
      return;
    }
    const liderancas = loadLiderancas();
    const encontros = loadEncontros();
    const now = Date.now();
    let liderancasAdded = 0, liderancasUpdated = 0, encontrosAdded = 0, encontrosSkipped = 0;

    (data.liderancas || []).forEach((l) => {
      if (!l.nome) return;
      const item = liderancas.find((x) => normalizeCrono(x.nome) === normalizeCrono(l.nome));
      if (item) {
        if (l.area != null) item.area = l.area;
        if (l.nivel != null) item.nivel = l.nivel;
        if (l.prioridade != null) item.prioridade = l.prioridade;
        if (l.cadenciaDias != null) item.cadenciaDias = l.cadenciaDias;
        if (l.duracaoMin != null) item.duracaoMin = l.duracaoMin;
        item.updatedAt = now;
        liderancasUpdated++;
      } else {
        liderancas.push({
          id: uidCrono(), nome: l.nome, area: l.area || "", nivel: l.nivel || "",
          prioridade: l.prioridade || "", cadenciaDias: l.cadenciaDias || 30,
          duracaoMin: l.duracaoMin || 30, createdAt: now, updatedAt: now,
        });
        liderancasAdded++;
      }
    });

    const dupKey = (x) => normalizeCrono(x.lideranca) + "|" + (x.dataSugerida || "");
    (data.encontros || []).forEach((e) => {
      if (!e.lideranca) return;
      const key = dupKey(e);
      if (encontros.some((x) => dupKey(x) === key)) { encontrosSkipped++; return; }
      encontros.push({
        id: uidCrono(), semana: e.semana || null, dataSugerida: e.dataSugerida || null,
        lideranca: e.lideranca, area: e.area || "", prioridade: e.prioridade || "",
        duracaoMin: e.duracaoMin || null, status: e.status || "Pendente",
        dataRealizada: e.dataRealizada || null, proximaPrevista: e.proximaPrevista || null,
        createdAt: now, updatedAt: now,
      });
      encontrosAdded++;
    });

    saveLiderancas(liderancas);
    saveEncontros(encontros);
    renderCronogramaView();
    populateEncontroLiderancaOptions();
    if (window.showToast) {
      window.showToast(
        `Importado: ${liderancasAdded} liderança(s) nova(s), ${liderancasUpdated} atualizada(s), ${encontrosAdded} encontro(s) novo(s)` +
        (encontrosSkipped ? `, ${encontrosSkipped} já existiam` : "") + " 📆"
      );
    }
  };
  reader.readAsText(file, "UTF-8");
}

/* ---------- Navegação / visibilidade ---------- */

function showCronogramaView() {
  document.getElementById("areasEmptyState").classList.add("hidden");
  document.getElementById("areaDetail").classList.add("hidden");
  document.getElementById("cronogramaView").classList.remove("hidden");
  document.getElementById("navCronograma").classList.add("active");
  document.querySelectorAll("#areasNav .nav-item").forEach((btn) => btn.classList.remove("active"));
  renderCronogramaView();
}

document.addEventListener("DOMContentLoaded", () => {
  const areasApp = document.getElementById("areasApp");
  if (!areasApp) return;

  document.getElementById("navCronograma").addEventListener("click", showCronogramaView);

  document.getElementById("cronogramaFilterArea").addEventListener("change", (e) => {
    cronogramaEncontrosFilters.area = e.target.value;
    renderCronogramaTable();
  });
  document.getElementById("cronogramaFilterStatus").addEventListener("change", (e) => {
    cronogramaEncontrosFilters.status = e.target.value;
    renderCronogramaTable();
  });
  document.getElementById("cronogramaFilterPrioridade").addEventListener("change", (e) => {
    cronogramaEncontrosFilters.prioridade = e.target.value;
    renderCronogramaTable();
  });
  document.getElementById("cronogramaSortEncontros").addEventListener("change", (e) => {
    cronogramaEncontrosFilters.sort = e.target.value;
    renderCronogramaTable();
  });
  document.getElementById("cronogramaSortEncontrosDir").addEventListener("click", (e) => {
    cronogramaEncontrosFilters.dir *= -1;
    e.target.textContent = cronogramaEncontrosFilters.dir === 1 ? "⬆️" : "⬇️";
    renderCronogramaTable();
  });

  document.getElementById("cronogramaFilterAreaLideranca").addEventListener("change", (e) => {
    cronogramaLiderancasFilters.area = e.target.value;
    renderCronogramaLeadersTable();
  });
  document.getElementById("cronogramaFilterPrioridadeLideranca").addEventListener("change", (e) => {
    cronogramaLiderancasFilters.prioridade = e.target.value;
    renderCronogramaLeadersTable();
  });
  document.getElementById("cronogramaFilterSituacao").addEventListener("change", (e) => {
    cronogramaLiderancasFilters.situacao = e.target.value;
    renderCronogramaLeadersTable();
  });
  document.getElementById("cronogramaSortLiderancas").addEventListener("change", (e) => {
    cronogramaLiderancasFilters.sort = e.target.value;
    renderCronogramaLeadersTable();
  });
  document.getElementById("cronogramaSortLiderancasDir").addEventListener("click", (e) => {
    cronogramaLiderancasFilters.dir *= -1;
    e.target.textContent = cronogramaLiderancasFilters.dir === 1 ? "⬆️" : "⬇️";
    renderCronogramaLeadersTable();
  });

  document.getElementById("btnNewLideranca").addEventListener("click", () => openLiderancaModal(null));
  document.getElementById("btnCloseLiderancaModal").addEventListener("click", closeLiderancaModal);
  document.getElementById("btnCancelLiderancaModal").addEventListener("click", closeLiderancaModal);
  document.getElementById("btnSaveLiderancaModal").addEventListener("click", saveLiderancaFromModal);
  document.getElementById("liderancaModal").addEventListener("click", (e) => {
    if (e.target.id === "liderancaModal") closeLiderancaModal();
  });
  document.getElementById("liderancaNomeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveLiderancaFromModal(); }
  });

  document.getElementById("btnNewEncontro").addEventListener("click", () => openEncontroModal(null));
  document.getElementById("btnCloseEncontroModal").addEventListener("click", closeEncontroModal);
  document.getElementById("btnCancelEncontroModal").addEventListener("click", closeEncontroModal);
  document.getElementById("btnSaveEncontroModal").addEventListener("click", saveEncontroFromModal);
  document.getElementById("encontroModal").addEventListener("click", (e) => {
    if (e.target.id === "encontroModal") closeEncontroModal();
  });

  document.getElementById("cronogramaImportFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleCronogramaImportFile(file);
    e.target.value = "";
  });
});
