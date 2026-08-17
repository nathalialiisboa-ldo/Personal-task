/* Colar transcrição — heurísticas simples (sem IA no navegador) para sugerir tarefas ou
   transformar o texto colado numa anotação de 1:1 formatada. Sempre passa por uma prévia
   editável antes de criar/salvar qualquer coisa, já que a detecção é aproximada. */

function escapeHtmlTr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayISOTr() { return new Date().toISOString().slice(0, 10); }

// ---------- Heuristic: extract candidate tasks from free text ----------
// Every non-empty line becomes a candidate (no bullet or date required) — the preview
// step is where the user curates, so it's better to over-surface than to silently drop lines.
const TR_BULLET_STRIP_RE = /^\s*(?:[-*•▪●○‣–—]|\[\s?\]|\[x\]|✓|✔|\d+[.)])\s*/i;
const TR_LABEL_ONLY_RE = /^.{1,40}:$/; // short line ending in ":" (e.g. "Próximos passos:") — treated as a label, not a task
const TR_MAX_LINE_LEN = 220; // very long lines are probably prose, not a single task title
const TR_DATE_RE = /\b([0-3]?\d)[\/\.]([01]?\d)(?:[\/\.](\d{2,4}))?\b/;

function extractDueDate(text) {
  const m = text.match(TR_DATE_RE);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3] || String(new Date().getFullYear());
  if (year.length === 2) year = "20" + year;
  const iso = `${year}-${month}-${day}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function parseTasksFromText(text) {
  const lines = text.split(/\r?\n/);
  const results = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    if (TR_LABEL_ONLY_RE.test(line)) continue;
    if (line.length > TR_MAX_LINE_LEN) continue;
    line = line.replace(TR_BULLET_STRIP_RE, "").trim();
    if (!line) continue;
    results.push({ title: line, due: extractDueDate(line) });
  }
  return results;
}

// ---------- Themes available for a task space (existing categories + custom empty themes) ----------
function getThemesForSpace(space) {
  let tasks = [];
  try { tasks = JSON.parse(localStorage.getItem("ptasks_tasks_v1") || "[]"); } catch { tasks = []; }
  let customThemes = {};
  try { customThemes = JSON.parse(localStorage.getItem("ptasks_customthemes_v1") || "{}"); } catch { customThemes = {}; }
  const set = new Set([
    ...tasks.filter((t) => (t.space || "todos") === space).map((t) => t.category).filter(Boolean),
    ...(customThemes[space] || []),
  ]);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------- Heuristic: plain text -> simple formatted HTML ----------
function textToSimpleHtml(text) {
  const blocks = text.split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    const allBullets = lines.every((l) => TR_BULLET_RE.test(l));
    if (allBullets) {
      return "<ul>" + lines.map((l) => `<li>${escapeHtmlTr(l.match(TR_BULLET_RE)[1])}</li>`).join("") + "</ul>";
    }
    return "<p>" + lines.map(escapeHtmlTr).join("<br>") + "</p>";
  }).join("");
}

// ---------- Modal state / wiring ----------
let trWorkingTasks = [];

function resetTranscriptModal() {
  document.getElementById("transcriptInput").value = "";
  document.getElementById("transcriptOODate").value = todayISOTr();
  document.getElementById("transcriptStep1").classList.remove("hidden");
  document.getElementById("transcriptTasksPreview").classList.add("hidden");
  document.getElementById("transcriptOOPreview").classList.add("hidden");
  document.querySelector('input[name="transcriptDestino"][value="tasks"]').checked = true;
  toggleTranscriptDestinoOptions();
  populateTranscriptScopeOptions();
}

function toggleTranscriptDestinoOptions() {
  const destino = document.querySelector('input[name="transcriptDestino"]:checked')?.value || "tasks";
  document.getElementById("transcriptTasksOptions").classList.toggle("hidden", destino !== "tasks");
  document.getElementById("transcriptOOOptions").classList.toggle("hidden", destino !== "oneonone");
}

function populateTranscriptScopeOptions() {
  const scopeSel = document.getElementById("transcriptOOScope");
  const areas = typeof loadAreas === "function" ? loadAreas() : [];
  scopeSel.innerHTML = '<option value="">Pessoal (minha aba 1:1s)</option>' +
    areas.map((a) => `<option value="${a.id}">${escapeHtmlTr(a.name)}</option>`).join("");
  populateTranscriptPersonOptions();
}

function populateTranscriptPersonOptions() {
  const scopeVal = document.getElementById("transcriptOOScope").value || null;
  const personSel = document.getElementById("transcriptOOPerson");
  const people = (typeof loadPeople === "function" ? loadPeople() : []).filter((p) => (p.areaId || null) === (scopeVal || null));
  personSel.innerHTML = people.map((p) => `<option value="${p.id}">${escapeHtmlTr(p.name)}</option>`).join("") +
    '<option value="__new__">+ Nova pessoa</option>';
  toggleTranscriptNewPersonField();
}

function toggleTranscriptNewPersonField() {
  const isNew = document.getElementById("transcriptOOPerson").value === "__new__";
  document.getElementById("transcriptOONewPersonField").classList.toggle("hidden", !isNew);
}

function taskPreviewRowHTML(item, i, themes) {
  const themeOptions = themes.map((t) => `<option value="${escapeHtmlTr(t)}">${escapeHtmlTr(t)}</option>`).join("");
  return `
  <div class="transcript-task-item" data-i="${i}">
    <div class="transcript-task-row1">
      <input type="checkbox" checked />
      <input type="text" value="${escapeHtmlTr(item.title)}" />
    </div>
    <div class="transcript-task-row2">
      <select class="transcript-task-theme">
        <option value="">Sem tema</option>
        ${themeOptions}
        <option value="__new__">+ Novo tema</option>
      </select>
      <input type="text" class="transcript-task-theme-new hidden" placeholder="Nome do novo tema" />
      <input type="date" class="transcript-task-date" value="${item.due || ""}" />
    </div>
  </div>`;
}

function renderTaskPreview() {
  const space = document.getElementById("transcriptTaskSpace").value;
  const themes = getThemesForSpace(space);
  const list = document.getElementById("transcriptTaskList");
  list.innerHTML = trWorkingTasks.map((item, i) => taskPreviewRowHTML(item, i, themes)).join("") ||
    '<div class="transcript-empty">Nenhuma linha com texto foi encontrada. Volte e cole o conteúdo da transcrição.</div>';

  list.querySelectorAll(".transcript-task-theme").forEach((sel) => {
    sel.addEventListener("change", () => {
      const newInput = sel.closest(".transcript-task-item").querySelector(".transcript-task-theme-new");
      newInput.classList.toggle("hidden", sel.value !== "__new__");
    });
  });
}

function analyzeTranscript() {
  const text = document.getElementById("transcriptInput").value;
  if (!text.trim()) { if (window.showToast) window.showToast("Cole algum texto primeiro."); return; }
  const destino = document.querySelector('input[name="transcriptDestino"]:checked')?.value || "tasks";

  document.getElementById("transcriptStep1").classList.add("hidden");
  if (destino === "tasks") {
    trWorkingTasks = parseTasksFromText(text);
    renderTaskPreview();
    document.getElementById("transcriptTasksPreview").classList.remove("hidden");
  } else {
    document.getElementById("transcriptOOEditor").innerHTML = textToSimpleHtml(text);
    document.getElementById("transcriptOOPreview").classList.remove("hidden");
  }
}

function confirmTasksFromPreview() {
  const space = document.getElementById("transcriptTaskSpace").value;
  const rows = document.querySelectorAll("#transcriptTaskList .transcript-task-item");
  let count = 0;
  rows.forEach((row) => {
    const checked = row.querySelector('input[type="checkbox"]').checked;
    if (!checked) return;
    const title = row.querySelector(".transcript-task-row1 input[type='text']").value.trim();
    if (!title) return;
    const due = row.querySelector(".transcript-task-date").value || null;
    const themeSel = row.querySelector(".transcript-task-theme");
    let category = themeSel.value;
    if (category === "__new__") {
      category = row.querySelector(".transcript-task-theme-new").value.trim();
    }
    window.PTasksAPI.addTask({ title, space, category, due });
    count++;
  });
  if (count > 0) {
    window.PTasksAPI.commitTasks();
    if (window.showToast) window.showToast(`${count} tarefa(s) criada(s) ✅`);
  } else if (window.showToast) {
    window.showToast("Nenhuma tarefa selecionada.");
  }
  closeTranscriptModal();
}

function confirmOneOnOneFromPreview() {
  const scopeVal = document.getElementById("transcriptOOScope").value || null;
  const personSel = document.getElementById("transcriptOOPerson");
  const date = document.getElementById("transcriptOODate").value || todayISOTr();
  const html = document.getElementById("transcriptOOEditor").innerHTML.trim();
  if (!html) { if (window.showToast) window.showToast("O texto ficou vazio."); return; }

  let personId = personSel.value;
  if (personId === "__new__") {
    const name = document.getElementById("transcriptOONewPersonName").value.trim();
    if (!name) { if (window.showToast) window.showToast("Digite o nome da pessoa."); return; }
    const people = loadPeople();
    const now = Date.now();
    const person = { id: uidOO(), name, areaId: scopeVal || null, createdAt: now, updatedAt: now };
    people.push(person);
    savePeople(people);
    personId = person.id;
  } else if (!personId) {
    if (window.showToast) window.showToast("Escolha uma pessoa.");
    return;
  }

  const entries = loadOOEntries();
  const now = Date.now();
  entries.push({ id: uidOO(), personId, date, title: "", html, createdAt: now, updatedAt: now });
  saveOOEntries(entries);
  if (typeof renderOneOnOnesView === "function") renderOneOnOnesView();
  if (window.showToast) window.showToast("Anotação de 1:1 salva ✅");
  closeTranscriptModal();
}

function openTranscriptModal() {
  resetTranscriptModal();
  document.getElementById("transcriptModal").classList.remove("hidden");
}
function closeTranscriptModal() {
  document.getElementById("transcriptModal").classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnOpenTranscript");
  if (!btn) return;

  btn.addEventListener("click", openTranscriptModal);
  document.getElementById("btnCloseTranscript").addEventListener("click", closeTranscriptModal);
  document.getElementById("transcriptModal").addEventListener("click", (e) => {
    if (e.target.id === "transcriptModal") closeTranscriptModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("transcriptModal").classList.contains("hidden")) closeTranscriptModal();
  });

  document.querySelectorAll('input[name="transcriptDestino"]').forEach((r) => {
    r.addEventListener("change", toggleTranscriptDestinoOptions);
  });
  document.getElementById("transcriptOOScope").addEventListener("change", populateTranscriptPersonOptions);
  document.getElementById("transcriptOOPerson").addEventListener("change", toggleTranscriptNewPersonField);

  document.getElementById("btnTranscriptAnalyze").addEventListener("click", analyzeTranscript);
  document.getElementById("btnTranscriptBackTasks").addEventListener("click", () => {
    document.getElementById("transcriptTasksPreview").classList.add("hidden");
    document.getElementById("transcriptStep1").classList.remove("hidden");
  });
  document.getElementById("btnTranscriptBackOO").addEventListener("click", () => {
    document.getElementById("transcriptOOPreview").classList.add("hidden");
    document.getElementById("transcriptStep1").classList.remove("hidden");
  });
  document.getElementById("btnTranscriptConfirmTasks").addEventListener("click", confirmTasksFromPreview);
  document.getElementById("btnTranscriptConfirmOO").addEventListener("click", confirmOneOnOneFromPreview);

  document.querySelectorAll("#transcriptOOToolbar .note-tb-btn").forEach((tb) => {
    tb.addEventListener("mousedown", (e) => e.preventDefault());
    tb.addEventListener("click", () => {
      document.execCommand(tb.dataset.cmd, false, tb.dataset.value || null);
      document.getElementById("transcriptOOEditor").focus();
    });
  });
});
