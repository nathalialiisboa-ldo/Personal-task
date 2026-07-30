/* 1:1s — histórico de conversas 1:1 por pessoa, organizado por data, com o mesmo
   editor de texto formatado das Anotações. Importação via arquivo .json (ver README). */

const LS_ONEONONES = "ptasks_oneonones_v1";
const LS_ONEONONE_ENTRIES = "ptasks_oneonone_entries_v1";
const OO_TEXT_COLORS = ["#1c1f2b", "#e6533c", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#db2777"];

function loadPeople() {
  try {
    const raw = localStorage.getItem(LS_ONEONONES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function savePeople(list) { localStorage.setItem(LS_ONEONONES, JSON.stringify(list)); }
function loadOOEntries() {
  try {
    const raw = localStorage.getItem(LS_ONEONONE_ENTRIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveOOEntries(list) { localStorage.setItem(LS_ONEONONE_ENTRIES, JSON.stringify(list)); }
function uidOO() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function escapeHtmlOO(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function stripHtmlOO(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").trim();
}
function timeAgoOO(ts) {
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
function formatDateLongOO(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// ---------- List view ----------
let currentPersonId = null;

function personRowHTML(person, entries) {
  const personEntries = entries.filter((e) => e.personId === person.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const last = personEntries[0];
  const initial = (person.name || "?").trim().charAt(0).toUpperCase();
  const preview = last ? `Última em ${formatDateLongOO(last.date)}${last.title ? " — " + escapeHtmlOO(last.title) : ""}` : "Nenhuma anotação ainda";
  return `
  <div class="oneonone-row" data-id="${person.id}">
    <span class="oneonone-avatar">${escapeHtmlOO(initial)}</span>
    <span class="oneonone-row-name">${escapeHtmlOO(person.name)}</span>
    <span class="oneonone-row-preview">${preview}</span>
    <span class="oneonone-row-meta">${personEntries.length} anotaç${personEntries.length === 1 ? "ão" : "ões"}</span>
  </div>`;
}

function renderOneOnOnesView() {
  const grid = document.getElementById("oneononesGrid");
  if (!grid) return;
  document.getElementById("oneononeDetailPane").classList.add("hidden");
  document.getElementById("oneononesListPane").classList.remove("hidden");
  currentPersonId = null;

  const search = (document.getElementById("oneononesSearchInput")?.value || "").trim().toLowerCase();
  const entries = loadOOEntries();
  let people = loadPeople().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  if (search) people = people.filter((p) => p.name.toLowerCase().includes(search));

  grid.innerHTML = people.map((p) => personRowHTML(p, entries)).join("") ||
    '<div class="theme-empty">Nenhuma pessoa cadastrada ainda. Clique em "+ Nova pessoa" para começar.</div>';

  grid.querySelectorAll(".oneonone-row").forEach((row) => {
    row.addEventListener("click", () => openPersonDetail(row.dataset.id));
  });
}

function openPersonDetail(personId) {
  const person = loadPeople().find((p) => p.id === personId);
  if (!person) return;
  currentPersonId = personId;
  document.getElementById("oneononesListPane").classList.add("hidden");
  document.getElementById("oneononeDetailPane").classList.remove("hidden");
  document.getElementById("oneononeDetailName").textContent = person.name;
  renderEntriesForPerson(personId);
}

function entryCardHTML(entry) {
  return `
  <div class="oneonone-entry" data-id="${entry.id}">
    <div class="oneonone-entry-header">
      <span class="oneonone-entry-date">📅 ${formatDateLongOO(entry.date)}</span>
      ${entry.title ? `<span class="oneonone-entry-title">${escapeHtmlOO(entry.title)}</span>` : ""}
      <span class="oneonone-entry-actions">
        <button type="button" class="oneonone-entry-edit" title="Editar">✏️</button>
        <button type="button" class="oneonone-entry-delete" title="Excluir">🗑️</button>
      </span>
    </div>
    <div class="oneonone-entry-body">${entry.html || ""}</div>
  </div>`;
}

function renderEntriesForPerson(personId) {
  const container = document.getElementById("oneononeEntries");
  const entries = loadOOEntries()
    .filter((e) => e.personId === personId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);

  container.innerHTML = entries.map(entryCardHTML).join("") ||
    '<div class="theme-empty">Nenhuma anotação ainda. Clique em "+ Nova anotação" para começar.</div>';

  container.querySelectorAll(".oneonone-entry-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEntryModal(btn.closest(".oneonone-entry").dataset.id));
  });
  container.querySelectorAll(".oneonone-entry-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".oneonone-entry").dataset.id;
      if (!confirm("Excluir esta anotação de 1:1?")) return;
      saveOOEntries(loadOOEntries().filter((e) => e.id !== id));
      renderEntriesForPerson(currentPersonId);
      if (window.showToast) window.showToast("Anotação excluída 🗑️");
    });
  });
}

// ---------- Person modal (create / rename) ----------
let editingPersonId = null;

function openPersonModal(personId) {
  editingPersonId = personId || null;
  const modal = document.getElementById("oneononePersonModal");
  const nameInput = document.getElementById("oneononePersonName");
  document.getElementById("oneononePersonModalTitle").textContent = personId ? "Renomear pessoa" : "Nova pessoa";
  nameInput.value = personId ? (loadPeople().find((p) => p.id === personId)?.name || "") : "";
  modal.classList.remove("hidden");
  setTimeout(() => nameInput.focus(), 50);
}
function closePersonModal() {
  document.getElementById("oneononePersonModal").classList.add("hidden");
  editingPersonId = null;
}
function savePersonFromModal() {
  const name = document.getElementById("oneononePersonName").value.trim();
  if (!name) return;
  const list = loadPeople();
  const now = Date.now();
  if (editingPersonId) {
    const person = list.find((p) => p.id === editingPersonId);
    if (person) {
      person.name = name;
      person.updatedAt = now;
      document.getElementById("oneononeDetailName").textContent = name;
    }
  } else {
    list.push({ id: uidOO(), name, createdAt: now, updatedAt: now });
  }
  savePeople(list);
  closePersonModal();
  renderOneOnOnesView();
}

// ---------- Entry modal ----------
let currentEntryId = null;

function buildOOColorSwatches() {
  const el = document.getElementById("oneononeColorSwatches");
  if (el && !el.dataset.built) {
    el.innerHTML = OO_TEXT_COLORS.map((hex) => `<button type="button" class="note-color-dot" data-color="${hex}" style="background:${hex}" title="Cor do texto"></button>`).join("");
    el.dataset.built = "1";
  }
}
function todayISOOO() { return new Date().toISOString().slice(0, 10); }

function openEntryModal(entryId) {
  currentEntryId = entryId || null;
  buildOOColorSwatches();
  const editor = document.getElementById("oneononeEntryEditor");
  const titleInput = document.getElementById("oneononeEntryTitle");
  const dateInput = document.getElementById("oneononeEntryDate");

  if (entryId) {
    const entry = loadOOEntries().find((e) => e.id === entryId);
    if (!entry) return;
    titleInput.value = entry.title || "";
    dateInput.value = entry.date || todayISOOO();
    editor.innerHTML = entry.html || "";
    document.getElementById("btnDeleteOneOnOneEntry").classList.remove("hidden");
    document.getElementById("oneononeEntryMeta").textContent = `Editado ${timeAgoOO(entry.updatedAt)}`;
  } else {
    titleInput.value = "";
    dateInput.value = todayISOOO();
    editor.innerHTML = "";
    document.getElementById("btnDeleteOneOnOneEntry").classList.add("hidden");
    document.getElementById("oneononeEntryMeta").textContent = "Nova anotação";
  }
  document.getElementById("oneononeEntryModal").classList.remove("hidden");
  setTimeout(() => dateInput.focus(), 50);
}
function closeEntryModal() {
  document.getElementById("oneononeEntryModal").classList.add("hidden");
  currentEntryId = null;
}
function saveEntryFromModal() {
  if (!currentPersonId) return;
  const date = document.getElementById("oneononeEntryDate").value || todayISOOO();
  const title = document.getElementById("oneononeEntryTitle").value.trim();
  const html = document.getElementById("oneononeEntryEditor").innerHTML.trim();
  const list = loadOOEntries();
  const now = Date.now();
  let entry = currentEntryId ? list.find((e) => e.id === currentEntryId) : null;
  if (!entry) {
    entry = { id: uidOO(), personId: currentPersonId, createdAt: now };
    list.push(entry);
  }
  entry.date = date;
  entry.title = title;
  entry.html = html;
  entry.updatedAt = now;
  saveOOEntries(list);
  closeEntryModal();
  renderEntriesForPerson(currentPersonId);
}

// ---------- Import from .json ----------
function importOneOnOnesFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const peopleIn = Array.isArray(data.people) ? data.people : [];
      const people = loadPeople();
      const entries = loadOOEntries();
      let peopleAdded = 0, entriesAdded = 0;
      const now = Date.now();

      peopleIn.forEach((pIn) => {
        const name = (pIn.name || "").trim();
        if (!name) return;
        let person = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!person) {
          person = { id: uidOO(), name, createdAt: now, updatedAt: now };
          people.push(person);
          peopleAdded++;
        }
        (Array.isArray(pIn.entries) ? pIn.entries : []).forEach((eIn) => {
          if (!eIn.date) return;
          entries.push({
            id: uidOO(),
            personId: person.id,
            date: eIn.date,
            title: eIn.title || "",
            html: eIn.html || "",
            createdAt: now,
            updatedAt: now,
          });
          entriesAdded++;
        });
      });

      savePeople(people);
      saveOOEntries(entries);
      renderOneOnOnesView();
      if (window.showToast) window.showToast(`Importado: ${peopleAdded} pessoa(s) nova(s), ${entriesAdded} anotação(ões) 📥`);
    } catch {
      if (window.showToast) window.showToast("Falha ao importar: arquivo inválido");
    }
  };
  reader.readAsText(file);
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("oneononesGrid");
  if (!grid) return;

  document.getElementById("btnNewOneOnOne").addEventListener("click", () => openPersonModal(null));
  document.getElementById("btnCloseOneOnOnePerson").addEventListener("click", closePersonModal);
  document.getElementById("btnCancelOneOnOnePerson").addEventListener("click", closePersonModal);
  document.getElementById("btnSaveOneOnOnePerson").addEventListener("click", savePersonFromModal);
  document.getElementById("oneononePersonName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); savePersonFromModal(); }
  });
  document.getElementById("oneononePersonModal").addEventListener("click", (e) => {
    if (e.target.id === "oneononePersonModal") closePersonModal();
  });

  document.getElementById("oneononesSearchInput").addEventListener("input", renderOneOnOnesView);

  document.getElementById("btnBackOneOnOnes").addEventListener("click", renderOneOnOnesView);
  document.getElementById("btnRenameOneOnOne").addEventListener("click", () => openPersonModal(currentPersonId));
  document.getElementById("btnDeleteOneOnOne").addEventListener("click", () => {
    if (!currentPersonId) return;
    if (!confirm("Excluir esta pessoa e todo o histórico de 1:1s dela? Essa ação não pode ser desfeita.")) return;
    savePeople(loadPeople().filter((p) => p.id !== currentPersonId));
    saveOOEntries(loadOOEntries().filter((e) => e.personId !== currentPersonId));
    if (window.showToast) window.showToast("Pessoa excluída 🗑️");
    renderOneOnOnesView();
  });

  document.getElementById("btnNewOneOnOneEntry").addEventListener("click", () => openEntryModal(null));
  document.getElementById("btnCloseOneOnOneEntry").addEventListener("click", closeEntryModal);
  document.getElementById("btnCancelOneOnOneEntry").addEventListener("click", closeEntryModal);
  document.getElementById("btnSaveOneOnOneEntry").addEventListener("click", saveEntryFromModal);
  document.getElementById("oneononeEntryModal").addEventListener("click", (e) => {
    if (e.target.id === "oneononeEntryModal") closeEntryModal();
  });
  document.getElementById("btnDeleteOneOnOneEntry").addEventListener("click", () => {
    if (!currentEntryId) return;
    if (!confirm("Excluir esta anotação?")) return;
    saveOOEntries(loadOOEntries().filter((e) => e.id !== currentEntryId));
    closeEntryModal();
    renderEntriesForPerson(currentPersonId);
    if (window.showToast) window.showToast("Anotação excluída 🗑️");
  });

  // Formatting toolbar (scoped to the entry editor)
  document.querySelectorAll("#oneononeEntryModal .note-tb-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
      document.getElementById("oneononeEntryEditor").focus();
    });
  });
  document.getElementById("oneononeColorSwatches").addEventListener("mousedown", (e) => e.preventDefault());
  document.getElementById("oneononeColorSwatches").addEventListener("click", (e) => {
    const dot = e.target.closest(".note-color-dot");
    if (!dot) return;
    document.execCommand("foreColor", false, dot.dataset.color);
    document.getElementById("oneononeEntryEditor").focus();
  });

  document.getElementById("oneononeImportFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importOneOnOnesFile(file);
    e.target.value = "";
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("oneononeEntryModal").classList.contains("hidden")) closeEntryModal();
    else if (!document.getElementById("oneononePersonModal").classList.contains("hidden")) closePersonModal();
  });
});
