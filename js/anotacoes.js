/* Anotações — bloco de notas com formatação de texto (negrito, itálico, sublinhado,
   cor, listas). Cada anotação é salva com o HTML formatado no localStorage. */

const LS_NOTES = "ptasks_notes_v1";
const NOTE_COLORS = [
  { id: "default", hex: "#ffffff", label: "Padrão" },
  { id: "yellow", hex: "#fff3c4", label: "Amarelo" },
  { id: "pink", hex: "#fdd9e6", label: "Rosa" },
  { id: "blue", hex: "#d7e6ff", label: "Azul" },
  { id: "green", hex: "#d8f3df", label: "Verde" },
  { id: "purple", hex: "#e6ddff", label: "Roxo" },
];
const TEXT_COLORS = ["#1c1f2b", "#e6533c", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#db2777"];

function loadNotes() {
  try {
    const raw = localStorage.getItem(LS_NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveNotes(list) { localStorage.setItem(LS_NOTES, JSON.stringify(list)); }
function uidNote() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function escapeHtmlNote(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || "").trim();
}
function timeAgoNote(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `há ${day}d`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

function noteCardHTML(note) {
  const preview = stripHtml(note.contentHTML).slice(0, 160);
  const color = NOTE_COLORS.find((c) => c.id === note.color) || NOTE_COLORS[0];
  return `
  <div class="note-row" data-id="${note.id}">
    <span class="note-row-color" style="background:${color.hex}"></span>
    <span class="note-row-title">${escapeHtmlNote(note.title || "Sem título")}</span>
    <span class="note-row-preview">${escapeHtmlNote(preview) || "<em>Vazia</em>"}</span>
    <span class="note-row-meta">${timeAgoNote(note.updatedAt)}</span>
  </div>`;
}

function renderAnotacoesView() {
  const grid = document.getElementById("notesGrid");
  if (!grid) return;
  const search = (document.getElementById("notesSearchInput")?.value || "").trim().toLowerCase();
  let notes = loadNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  if (search) {
    notes = notes.filter((n) => (n.title + " " + stripHtml(n.contentHTML)).toLowerCase().includes(search));
  }

  grid.innerHTML = notes.map(noteCardHTML).join("") ||
    '<div class="theme-empty">Nenhuma anotação ainda. Clique em "+ Nova anotação" para começar.</div>';

  grid.querySelectorAll(".note-row").forEach((row) => {
    row.addEventListener("click", () => openNoteModal(row.dataset.id));
  });
}

// ---------- Modal / Editor ----------
let currentNoteId = null;
let currentNoteColor = "default";

function buildColorSwatches() {
  const textColorsEl = document.getElementById("noteColorSwatches");
  if (textColorsEl && !textColorsEl.dataset.built) {
    textColorsEl.innerHTML = TEXT_COLORS.map((hex) => `<button type="button" class="note-color-dot" data-color="${hex}" style="background:${hex}" title="Cor do texto"></button>`).join("");
    textColorsEl.dataset.built = "1";
  }
  const cardColorsEl = document.getElementById("noteCardColorSwatches");
  if (cardColorsEl && !cardColorsEl.dataset.built) {
    cardColorsEl.innerHTML = NOTE_COLORS.map((c) => `<button type="button" class="note-cardcolor-dot" data-color="${c.id}" style="background:${c.hex}" title="${c.label}"></button>`).join("");
    cardColorsEl.dataset.built = "1";
  }
}

function markCardColorActive(colorId) {
  document.querySelectorAll(".note-cardcolor-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.color === colorId);
  });
}

function openNoteModal(id) {
  currentNoteId = id || null;
  const modal = document.getElementById("noteModal");
  const editor = document.getElementById("noteEditor");
  const titleInput = document.getElementById("noteTitle");
  buildColorSwatches();

  if (id) {
    const note = loadNotes().find((n) => n.id === id);
    if (!note) return;
    titleInput.value = note.title || "";
    editor.innerHTML = note.contentHTML || "";
    currentNoteColor = note.color || "default";
    document.getElementById("btnDeleteNote").classList.remove("hidden");
    document.getElementById("noteModalMeta").textContent = `Editado ${timeAgoNote(note.updatedAt)}`;
  } else {
    titleInput.value = "";
    editor.innerHTML = "";
    currentNoteColor = "default";
    document.getElementById("btnDeleteNote").classList.add("hidden");
    document.getElementById("noteModalMeta").textContent = "Nova anotação";
  }
  markCardColorActive(currentNoteColor);
  modal.classList.remove("hidden");
  setTimeout(() => titleInput.focus(), 50);
}

function persistCurrentNote() {
  const titleInput = document.getElementById("noteTitle");
  const editor = document.getElementById("noteEditor");
  const title = titleInput.value.trim();
  const contentHTML = editor.innerHTML.trim();
  const isEmptyContent = stripHtml(contentHTML) === "";
  if (!title && isEmptyContent) return; // don't save fully empty notes

  const list = loadNotes();
  const now = Date.now();
  let note = currentNoteId ? list.find((n) => n.id === currentNoteId) : null;
  if (!note) {
    note = { id: uidNote(), createdAt: now };
    list.unshift(note);
    currentNoteId = note.id;
  }
  note.title = title;
  note.contentHTML = contentHTML;
  note.color = currentNoteColor;
  note.updatedAt = now;
  saveNotes(list);
}

function closeNoteModal() {
  persistCurrentNote();
  document.getElementById("noteModal").classList.add("hidden");
  currentNoteId = null;
  renderAnotacoesView();
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("notesGrid");
  if (!grid) return;

  document.getElementById("btnNewNote").addEventListener("click", () => openNoteModal(null));
  document.getElementById("btnCloseNoteModal").addEventListener("click", closeNoteModal);
  document.getElementById("btnCloseNote").addEventListener("click", closeNoteModal);
  document.getElementById("noteModal").addEventListener("click", (e) => {
    if (e.target.id === "noteModal") closeNoteModal();
  });

  document.getElementById("btnDeleteNote").addEventListener("click", () => {
    if (!currentNoteId) return;
    if (!confirm("Excluir esta anotação?")) return;
    const list = loadNotes().filter((n) => n.id !== currentNoteId);
    saveNotes(list);
    currentNoteId = null;
    document.getElementById("noteModal").classList.add("hidden");
    renderAnotacoesView();
    if (window.showToast) window.showToast("Anotação excluída 🗑️");
  });

  document.getElementById("notesSearchInput").addEventListener("input", renderAnotacoesView);

  // Formatting toolbar
  document.querySelectorAll(".note-tb-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection alive
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      const value = btn.dataset.value || null;
      document.execCommand(cmd, false, value);
      document.getElementById("noteEditor").focus();
    });
  });

  // Text color swatches (delegated, built lazily)
  document.getElementById("noteColorSwatches").addEventListener("mousedown", (e) => e.preventDefault());
  document.getElementById("noteColorSwatches").addEventListener("click", (e) => {
    const dot = e.target.closest(".note-color-dot");
    if (!dot) return;
    document.execCommand("foreColor", false, dot.dataset.color);
    document.getElementById("noteEditor").focus();
  });

  // Card color swatches
  document.getElementById("noteCardColorSwatches").addEventListener("click", (e) => {
    const dot = e.target.closest(".note-cardcolor-dot");
    if (!dot) return;
    currentNoteColor = dot.dataset.color;
    markCardColorActive(currentNoteColor);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("noteModal").classList.contains("hidden")) {
      closeNoteModal();
    }
  });
});
