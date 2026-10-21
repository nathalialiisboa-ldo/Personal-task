/* Prioridades do dia — lista simples de check, fixa (não reinicia sozinha). */

const LS_PRIORITIES = "ptasks_priorities_v1";

function loadPriorities() {
  try {
    const raw = localStorage.getItem(LS_PRIORITIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function savePriorities(list) { localStorage.setItem(LS_PRIORITIES, JSON.stringify(list)); }
function uidPriority() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtmlPriority(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function priorityRowHTML(item) {
  return `
  <div class="priority-row ${item.done ? "done" : ""}" data-id="${item.id}">
    <button type="button" class="priority-row-check ${item.done ? "done" : ""}" title="Marcar como feita">${item.done ? "✓" : ""}</button>
    <input type="text" class="priority-row-text" value="${escapeHtmlPriority(item.text)}" />
    <button type="button" class="priority-row-delete" title="Remover">✕</button>
  </div>`;
}

function renderPrioritiesView() {
  const list = document.getElementById("priorityList");
  if (!list) return;
  const items = loadPriorities();
  list.innerHTML = items.map(priorityRowHTML).join("") ||
    '<div class="theme-empty">Nenhuma prioridade adicionada ainda.</div>';

  list.querySelectorAll(".priority-row-check").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".priority-row").dataset.id;
      const items = loadPriorities();
      const item = items.find((i) => i.id === id);
      if (!item) return;
      item.done = !item.done;
      savePriorities(items);
      renderPrioritiesView();
    });
  });
  list.querySelectorAll(".priority-row-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".priority-row").dataset.id;
      savePriorities(loadPriorities().filter((i) => i.id !== id));
      renderPrioritiesView();
    });
  });
  list.querySelectorAll(".priority-row-text").forEach((field) => {
    const commit = () => {
      const id = field.closest(".priority-row").dataset.id;
      const text = field.value.trim();
      const items = loadPriorities();
      const item = items.find((i) => i.id === id);
      if (!item) return;
      if (!text) { field.value = item.text; return; }
      if (text === item.text) return;
      item.text = text;
      savePriorities(items);
    };
    field.addEventListener("blur", commit);
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); field.blur(); }
      if (e.key === "Escape") {
        const id = field.closest(".priority-row").dataset.id;
        const item = loadPriorities().find((i) => i.id === id);
        if (item) field.value = item.text;
        field.blur();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("priorityInput");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const items = loadPriorities();
    items.push({ id: uidPriority(), text, done: false, createdAt: Date.now() });
    savePriorities(items);
    input.value = "";
    renderPrioritiesView();
  });
  renderPrioritiesView();
});
