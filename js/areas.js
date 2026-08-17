/* Áreas de Atendimento — módulo HRBP: cada área tem sub-abas de Estrutura, 1:1s e Orçamento.
   1:1s por área reaproveita toda a lógica de js/oneonones.js, apenas filtrando por areaId. */

const LS_AREAS = "ptasks_areas_v1";
const LS_AREA_DOCS = "ptasks_area_docs_v1"; // [{id, areaId, type: "estrutura"|"orcamento", html, updatedAt}]
const LS_AREA_ORG = "ptasks_area_org_v1"; // { [areaId]: [{id, nome, cargo, chefia}] } — só o essencial, nada de dados sensíveis
const LS_AREA_ORG_LABEL = "ptasks_area_org_label_v1"; // { [areaId]: "valor bruto da coluna de área escolhido da última vez" }

function loadAreas() {
  try {
    const raw = localStorage.getItem(LS_AREAS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveAreas(list) { localStorage.setItem(LS_AREAS, JSON.stringify(list)); }
function loadAreaDocs() {
  try {
    const raw = localStorage.getItem(LS_AREA_DOCS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveAreaDocs(list) { localStorage.setItem(LS_AREA_DOCS, JSON.stringify(list)); }
function uidArea() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtmlArea(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let currentAreaId = null;
let currentAreaSubtab = "estrutura";

function renderAreasNav() {
  const nav = document.getElementById("areasNav");
  if (!nav) return;
  const areas = loadAreas().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  nav.innerHTML = areas.map((a) =>
    `<button type="button" class="nav-item ${a.id === currentAreaId ? "active" : ""}" data-id="${a.id}">🧭 ${escapeHtmlArea(a.name)}</button>`
  ).join("");
  nav.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => selectArea(btn.dataset.id));
  });
}

function selectArea(areaId) {
  const area = loadAreas().find((a) => a.id === areaId);
  if (!area) return;
  currentAreaId = areaId;
  document.getElementById("areasEmptyState").classList.add("hidden");
  document.getElementById("areaDetail").classList.remove("hidden");
  document.getElementById("areaTitle").textContent = area.name;
  renderAreasNav();
  setAreaSubtab(currentAreaSubtab);
}

function getAreaDoc(areaId, type) {
  return loadAreaDocs().find((d) => d.areaId === areaId && d.type === type);
}
function saveAreaDocContent(areaId, type, html) {
  const list = loadAreaDocs();
  let doc = list.find((d) => d.areaId === areaId && d.type === type);
  if (!doc) {
    doc = { id: uidArea(), areaId, type, html: "", createdAt: Date.now() };
    list.push(doc);
  }
  doc.html = html;
  doc.updatedAt = Date.now();
  saveAreaDocs(list);
}
function loadEditorContent(editorId, areaId, type) {
  const doc = getAreaDoc(areaId, type);
  document.getElementById(editorId).innerHTML = doc ? doc.html : "";
}

function setAreaSubtab(subtab) {
  currentAreaSubtab = subtab;
  document.querySelectorAll(".area-subtab").forEach((btn) => btn.classList.toggle("active", btn.dataset.subtab === subtab));
  document.querySelectorAll(".area-subview").forEach((el) => el.classList.toggle("active", el.dataset.subview === subtab));
  if (!currentAreaId) return;
  if (subtab === "estrutura") {
    loadEditorContent("areaEstruturaEditor", currentAreaId, "estrutura");
    renderOrgChart(currentAreaId);
    document.getElementById("areaOrgMapPicker").classList.add("hidden");
  }
  if (subtab === "orcamento") loadEditorContent("areaOrcamentoEditor", currentAreaId, "orcamento");
  if (subtab === "oneonones" && typeof mountOneOnOnes === "function") {
    mountOneOnOnes(document.getElementById("areaOOMount"), currentAreaId);
  }
}

// ---------- Organograma (importado de uma "base de ativos" em .csv) ----------
// Guarda só o essencial (nome, cargo, liderança direta) — nunca CPF, salário, endereço etc.
function loadAreaOrgStore() {
  try { return JSON.parse(localStorage.getItem(LS_AREA_ORG) || "{}"); } catch { return {}; }
}
function saveAreaOrgStore(store) { localStorage.setItem(LS_AREA_ORG, JSON.stringify(store)); }
function loadAreaOrgLabelStore() {
  try { return JSON.parse(localStorage.getItem(LS_AREA_ORG_LABEL) || "{}"); } catch { return {}; }
}
function saveAreaOrgLabelStore(store) { localStorage.setItem(LS_AREA_ORG_LABEL, JSON.stringify(store)); }

function normalizeLabel(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function parseCSVArea(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function findColumnIndex(headers, patterns, fallbackIndex) {
  for (const re of patterns) {
    const idx = headers.findIndex((h) => re.test(h.trim()));
    if (idx !== -1) return idx;
  }
  return fallbackIndex;
}

// Correspondência fixa entre o nome da área no app e o valor usado na coluna de área da
// planilha de ativos — evita ter que confirmar manualmente toda vez para essas áreas conhecidas.
const AREA_ORG_LABEL_MAP = {
  "gente & gestão": "Gente e Gestão",
  "financeiro": "Financeiro",
  "estratégia": "Estratégia",
  "mkt & growth": "BCM e Growth",
  "comercial": "Comercial",
  "costumer experience": "Experiência do Cliente",
};
const AREA_ORG_LABEL_MAP_NORM = Object.fromEntries(
  Object.entries(AREA_ORG_LABEL_MAP).map(([k, v]) => [normalizeLabel(k), v])
);

function parseCSVFile(text) {
  const rows = parseCSVArea(text);
  if (rows.length < 2) return null;
  const headers = rows[0];
  const dataRows = rows.slice(1);

  const areaColIdx = findColumnIndex(headers, [/centro de resultado/i, /^área$/i, /^area$/i], 6);
  const leadColIdx = findColumnIndex(headers, [/chefia imediata/i, /lideran[çc]a direta/i], 10);
  const nomeColIdx = findColumnIndex(headers, [/^nome$/i], 1);
  const cargoColIdx = findColumnIndex(headers, [/^fun[çc][ãa]o$/i, /^cargo$/i], -1);
  const matriculaColIdx = findColumnIndex(headers, [/^matr[íi]cula$/i], 0);

  const records = dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => ({
      matricula: (r[matriculaColIdx] || "").trim(),
      nome: (r[nomeColIdx] || "").trim(),
      cargo: cargoColIdx >= 0 ? (r[cargoColIdx] || "").trim() : "",
      area: (r[areaColIdx] || "").trim(),
      chefia: (r[leadColIdx] || "").trim(),
    }))
    .filter((r) => r.nome);

  const distinctLabels = Array.from(new Set(records.map((r) => r.area).filter(Boolean)));
  return { records, distinctLabels };
}

// Resolve qual valor bruto da coluna de área corresponde a uma área do app, nesta ordem:
// de-para fixo -> escolha lembrada de uma importação anterior -> correspondência única por nome.
function resolveLabelForArea(area, distinctLabels) {
  const fixed = AREA_ORG_LABEL_MAP_NORM[normalizeLabel(area.name)];
  if (fixed && distinctLabels.includes(fixed)) return fixed;

  const remembered = loadAreaOrgLabelStore()[area.id];
  if (remembered && distinctLabels.includes(remembered)) return remembered;

  const normalizedAreaName = normalizeLabel(area.name);
  const matches = distinctLabels.filter((l) => {
    const nl = normalizeLabel(l);
    return nl === normalizedAreaName || nl.includes(normalizedAreaName) || normalizedAreaName.includes(nl);
  });
  return matches.length === 1 ? matches[0] : null;
}

function applyPeopleForArea(areaId, records, label) {
  const people = records
    .filter((r) => r.area === label)
    .map((r) => ({ id: r.matricula || uidArea(), nome: r.nome, cargo: r.cargo, chefia: r.chefia }));
  const store = loadAreaOrgStore();
  store[areaId] = people;
  saveAreaOrgStore(store);
  const labelStore = loadAreaOrgLabelStore();
  labelStore[areaId] = label;
  saveAreaOrgLabelStore(labelStore);
  return people.length;
}

let pendingOrgImport = null; // { records, distinctLabels }

function handleOrgImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCSVFile(String(reader.result));
    if (!parsed) { if (window.showToast) window.showToast("Arquivo vazio ou inválido."); return; }
    pendingOrgImport = parsed;

    if (!currentAreaId) return;
    const area = loadAreas().find((a) => a.id === currentAreaId);
    if (!area) return;

    const label = resolveLabelForArea(area, parsed.distinctLabels);
    if (label) {
      applyOrgImportForLabel(label);
    } else {
      showOrgMapPicker(area.name, parsed.distinctLabels);
    }
  };
  reader.readAsText(file, "UTF-8");
}

function handleGlobalOrgImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCSVFile(String(reader.result));
    if (!parsed) { if (window.showToast) window.showToast("Arquivo vazio ou inválido."); return; }

    const areas = loadAreas();
    let updatedAreas = 0, totalPeople = 0;
    const notFound = [];
    areas.forEach((area) => {
      const label = resolveLabelForArea(area, parsed.distinctLabels);
      if (!label) { notFound.push(area.name); return; }
      totalPeople += applyPeopleForArea(area.id, parsed.records, label);
      updatedAreas++;
    });

    if (currentAreaId && currentAreaSubtab === "estrutura") renderOrgChart(currentAreaId);

    const summary = `Organogramas atualizados: ${updatedAreas} área(s), ${totalPeople} pessoa(s) 🗂️` +
      (notFound.length ? ` — não encontrei: ${notFound.join(", ")}` : "");
    if (window.showToast) window.showToast(summary);
  };
  reader.readAsText(file, "UTF-8");
}

function showOrgMapPicker(areaName, distinctLabels) {
  document.getElementById("orgMapAreaName").textContent = areaName;
  const sel = document.getElementById("orgMapSelect");
  sel.innerHTML = distinctLabels.map((l) => `<option value="${escapeHtmlArea(l)}">${escapeHtmlArea(l)}</option>`).join("");
  document.getElementById("areaOrgMapPicker").classList.remove("hidden");
}

function applyOrgImportForLabel(label) {
  if (!pendingOrgImport || !currentAreaId) return;
  const count = applyPeopleForArea(currentAreaId, pendingOrgImport.records, label);
  document.getElementById("areaOrgMapPicker").classList.add("hidden");
  pendingOrgImport = null;
  renderOrgChart(currentAreaId);
  if (window.showToast) window.showToast(`${count} pessoa(s) importada(s) para o organograma 🗂️`);
}

function orgNodeHTML(person) {
  const initial = (person.nome || "?").trim().charAt(0).toUpperCase();
  return `
  <div class="org-node">
    <span class="org-node-avatar">${escapeHtmlArea(initial)}</span>
    <span class="org-node-text">
      <span class="org-node-name">${escapeHtmlArea(person.nome)}</span>
      ${person.cargo ? `<span class="org-node-role">${escapeHtmlArea(person.cargo)}</span>` : ""}
    </span>
  </div>`;
}

function buildOrgTreeHTML(people) {
  if (!people.length) return '<div class="org-chart-empty">Nenhum organograma importado ainda para esta área.</div>';

  const byNormName = new Map(people.map((p) => [normalizeLabel(p.nome), p]));
  const childrenByParent = new Map();
  const roots = [];
  people.forEach((p) => {
    const parentKey = normalizeLabel(p.chefia);
    const parent = parentKey && byNormName.get(parentKey);
    if (parent && parent !== p) {
      const key = normalizeLabel(parent.nome);
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key).push(p);
    } else {
      roots.push(p);
    }
  });

  function renderNode(person, visited) {
    const key = normalizeLabel(person.nome);
    if (visited.has(key)) return `<li>${orgNodeHTML(person)}</li>`;
    visited.add(key);
    const kids = childrenByParent.get(key) || [];
    const childrenHTML = kids.length ? `<ul>${kids.map((k) => renderNode(k, visited)).join("")}</ul>` : "";
    return `<li>${orgNodeHTML(person)}${childrenHTML}</li>`;
  }

  const visited = new Set();
  return `<ul class="org-tree">${roots.map((r) => renderNode(r, visited)).join("")}</ul>`;
}

function renderOrgChart(areaId) {
  const container = document.getElementById("areaOrgChart");
  if (!container) return;
  const people = loadAreaOrgStore()[areaId] || [];
  container.innerHTML = buildOrgTreeHTML(people);
}

// ---------- Area create/rename modal ----------
let editingAreaId = null;
function openAreaModal(areaId) {
  editingAreaId = areaId || null;
  document.getElementById("areaModalTitle").textContent = areaId ? "Renomear área" : "Nova área";
  document.getElementById("areaNameInput").value = areaId ? (loadAreas().find((a) => a.id === areaId)?.name || "") : "";
  document.getElementById("areaModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("areaNameInput").focus(), 50);
}
function closeAreaModal() {
  document.getElementById("areaModal").classList.add("hidden");
  editingAreaId = null;
}
function saveAreaFromModal() {
  const name = document.getElementById("areaNameInput").value.trim();
  if (!name) return;
  const list = loadAreas();
  const now = Date.now();
  if (editingAreaId) {
    const area = list.find((a) => a.id === editingAreaId);
    if (area) {
      area.name = name;
      area.updatedAt = now;
      document.getElementById("areaTitle").textContent = name;
    }
  } else {
    const area = { id: uidArea(), name, createdAt: now, updatedAt: now };
    list.push(area);
    currentAreaId = area.id;
  }
  saveAreas(list);
  closeAreaModal();
  renderAreasNav();
  if (currentAreaId) selectArea(currentAreaId);
}

document.addEventListener("DOMContentLoaded", () => {
  const areasApp = document.getElementById("areasApp");
  if (!areasApp) return;

  const areas = loadAreas();
  renderAreasNav();
  if (areas.length) selectArea(areas[0].id);

  document.getElementById("btnNewArea").addEventListener("click", () => openAreaModal(null));
  document.getElementById("btnRenameArea").addEventListener("click", () => { if (currentAreaId) openAreaModal(currentAreaId); });
  document.getElementById("btnCloseAreaModal").addEventListener("click", closeAreaModal);
  document.getElementById("btnCancelAreaModal").addEventListener("click", closeAreaModal);
  document.getElementById("btnSaveAreaModal").addEventListener("click", saveAreaFromModal);
  document.getElementById("areaNameInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveAreaFromModal(); }
  });
  document.getElementById("areaModal").addEventListener("click", (e) => {
    if (e.target.id === "areaModal") closeAreaModal();
  });

  document.getElementById("btnDeleteArea").addEventListener("click", () => {
    if (!currentAreaId) return;
    if (!confirm('Excluir esta área e tudo dentro dela (Estrutura, 1:1s e Orçamento)? Essa ação não pode ser desfeita.')) return;
    const areaId = currentAreaId;
    saveAreas(loadAreas().filter((a) => a.id !== areaId));
    saveAreaDocs(loadAreaDocs().filter((d) => d.areaId !== areaId));
    const orgStore = loadAreaOrgStore();
    delete orgStore[areaId];
    saveAreaOrgStore(orgStore);
    const orgLabelStore = loadAreaOrgLabelStore();
    delete orgLabelStore[areaId];
    saveAreaOrgLabelStore(orgLabelStore);
    if (typeof loadPeople === "function") {
      const removedIds = loadPeople().filter((p) => p.areaId === areaId).map((p) => p.id);
      savePeople(loadPeople().filter((p) => p.areaId !== areaId));
      saveOOEntries(loadOOEntries().filter((e) => !removedIds.includes(e.personId)));
    }
    currentAreaId = null;
    document.getElementById("areaDetail").classList.add("hidden");
    document.getElementById("areasEmptyState").classList.remove("hidden");
    renderAreasNav();
    if (window.showToast) window.showToast("Área excluída 🗑️");
  });

  document.querySelectorAll(".area-subtab").forEach((btn) => {
    btn.addEventListener("click", () => setAreaSubtab(btn.dataset.subtab));
  });

  document.getElementById("areaOrgImportFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleOrgImportFile(file);
    e.target.value = "";
  });
  document.getElementById("btnOrgMapConfirm").addEventListener("click", () => {
    const label = document.getElementById("orgMapSelect").value;
    if (label) applyOrgImportForLabel(label);
  });
  document.getElementById("areaOrgGlobalImportFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleGlobalOrgImportFile(file);
    e.target.value = "";
  });

  // Estrutura / Orçamento: formatting toolbars + autosave on blur
  [["Estrutura", "estrutura"], ["Orcamento", "orcamento"]].forEach(([idPart, type]) => {
    const editorId = `area${idPart}Editor`;
    document.querySelectorAll(`#area${idPart}Toolbar .note-tb-btn`).forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
        document.getElementById(editorId).focus();
      });
    });
    document.getElementById(editorId).addEventListener("blur", () => {
      if (!currentAreaId) return;
      saveAreaDocContent(currentAreaId, type, document.getElementById(editorId).innerHTML.trim());
    });
  });

  // ---------- Module switch (Minhas Tarefas <> Áreas de Atendimento) ----------
  document.querySelectorAll(".module-switch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".module-switch-btn").forEach((b) => b.classList.toggle("active", b === btn));
      const isAreas = btn.dataset.module === "areas";
      document.getElementById("tasksApp").classList.toggle("hidden", isAreas);
      document.getElementById("areasApp").classList.toggle("hidden", !isAreas);
    });
  });
});
