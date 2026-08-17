/* Colar transcrição — heurísticas simples (sem IA no navegador) para sugerir tarefas ou
   transformar o texto colado numa anotação de 1:1 formatada. Sempre passa por uma prévia
   editável antes de criar/salvar qualquer coisa, já que a detecção é aproximada. */

function escapeHtmlTr(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayISOTr() { return new Date().toISOString().slice(0, 10); }

// ---------- Heuristic: extract candidate tasks from free text ----------
const TR_BULLET_RE = /^\s*(?:[-*•▪●]|\[\s?\]|\[x\]|✓|✔)\s+(.+)$/i;
const TR_ACTION_PREFIX_RE = /^\s*(?:to-?do|a\s*fazer|a[cç][aã]o(?:\s*item)?|next\s*step)s?\s*[:\-]\s*(.+)$/i;
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
    const line = raw.trim();
    if (!line) continue;
    const bulletMatch = line.match(TR_BULLET_RE);
    const actionMatch = !bulletMatch && line.match(TR_ACTION_PREFIX_RE);
    const content = bulletMatch ? bulletMatch[1] : (actionMatch ? actionMatch[1] : null);
    if (!content) continue;
    results.push({ title: content.trim(), due: extractDueDate(content) });
  }
  return results;
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
  document.getElementById("transcriptTaskCategory").value = "";
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

function taskPreviewRowHTML(item, i) {
  return `
  <div class="transcript-task-item" data-i="${i}">
    <input type="checkbox" checked />
    <input type="text" value="${escapeHtmlTr(item.title)}" />
    <input type="date" value="${item.due || ""}" />
  </div>`;
}

function renderTaskPreview() {
  const list = document.getElementById("transcriptTaskList");
  list.innerHTML = trWorkingTasks.map(taskPreviewRowHTML).join("") ||
    '<div class="transcript-empty">Nenhum item parecido com tarefa foi encontrado. Volte e revise o texto, ou use marcadores ("-") nas linhas de ação.</div>';
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
  const category = document.getElementById("transcriptTaskCategory").value.trim();
  const rows = document.querySelectorAll("#transcriptTaskList .transcript-task-item");
  let count = 0;
  rows.forEach((row) => {
    const checked = row.querySelector('input[type="checkbox"]').checked;
    if (!checked) return;
    const title = row.querySelector('input[type="text"]').value.trim();
    if (!title) return;
    const due = row.querySelector('input[type="date"]').value || null;
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
