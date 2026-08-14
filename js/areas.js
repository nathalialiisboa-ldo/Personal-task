/* Áreas de Atendimento — módulo HRBP: cada área tem sub-abas de Estrutura, 1:1s e Orçamento.
   1:1s por área reaproveita toda a lógica de js/oneonones.js, apenas filtrando por areaId. */

const LS_AREAS = "ptasks_areas_v1";
const LS_AREA_DOCS = "ptasks_area_docs_v1"; // [{id, areaId, type: "estrutura"|"orcamento", html, updatedAt}]

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
  if (subtab === "estrutura") loadEditorContent("areaEstruturaEditor", currentAreaId, "estrutura");
  if (subtab === "orcamento") loadEditorContent("areaOrcamentoEditor", currentAreaId, "orcamento");
  if (subtab === "oneonones" && typeof mountOneOnOnes === "function") {
    mountOneOnOnes(document.getElementById("areaOOMount"), currentAreaId);
  }
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
