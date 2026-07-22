/* Notas H2 — lê os arquivos markdown em /entregaveis, calcula a nota prévia
   (1 a 5, cumulativa) de cada entregável e renderiza um painel com checkboxes.
   Fonte da verdade: os arquivos .md do repositório. Edições feitas na tela ficam
   guardadas no navegador (rascunho) até serem exportadas/commitadas. */

const DELIVERABLE_FILES = [
  { file: "entregaveis/hub-ia.md", accent: "purple" },
  { file: "entregaveis/trilha-desenvolvimento.md", accent: "blue" },
  { file: "entregaveis/sustentacao-programas.md", accent: "teal" },
];

const LS_ENTREGAVEIS_DRAFT = "ptasks_entregaveis_draft_v1";

function loadEntregaveisDraft() {
  try {
    const raw = localStorage.getItem(LS_ENTREGAVEIS_DRAFT);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveEntregaveisDraft(draft) {
  localStorage.setItem(LS_ENTREGAVEIS_DRAFT, JSON.stringify(draft));
}

function parseDeliverableMarkdown(text, file) {
  const lines = text.split(/\r?\n/);
  let title = "";
  let level1Text = "";
  const levels = {}; // { 2: {text, tasks:[]}, 3: {...}, 4: {...}, 5: {...} }
  let currentLevel = null;

  lines.forEach((raw, lineIndex) => {
    const line = raw.trim();
    if (line.startsWith("# ")) { title = line.slice(2).trim(); return; }
    const levelMatch = line.match(/^## Nota (\d)/);
    if (levelMatch) {
      currentLevel = Number(levelMatch[1]);
      if (currentLevel >= 2) levels[currentLevel] = { text: "", tasks: [] };
      return;
    }
    if (currentLevel === null || line === "") return;

    const cbMatch = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (cbMatch && currentLevel >= 2) {
      const done = cbMatch[1].toLowerCase() === "x";
      const parts = cbMatch[2].split(" — ").map((p) => p.trim());
      const name = parts[0];
      let due = null;
      const descParts = [];
      parts.slice(1).forEach((p) => {
        const dueMatch = p.match(/^prazo:\s*(\d{4}-\d{2}-\d{2})$/i);
        if (dueMatch) due = dueMatch[1];
        else descParts.push(p);
      });
      levels[currentLevel].tasks.push({
        name, done, due, description: descParts.join(" — "), lineIndex,
      });
      return;
    }

    if (currentLevel === 1) level1Text += (level1Text ? " " : "") + line;
    else if (currentLevel >= 2 && levels[currentLevel]) {
      levels[currentLevel].text += (levels[currentLevel].text ? " " : "") + line;
    }
  });

  return { file, title, level1Text, levels, lines };
}

function computeNota(levels) {
  let nota = 1;
  for (let lvl = 2; lvl <= 5; lvl++) {
    const level = levels[lvl];
    if (!level || level.tasks.length === 0) break;
    if (level.tasks.every((t) => t.done)) nota = lvl;
    else break;
  }
  return nota;
}

function computeProgressToNext(levels, nota) {
  const next = nota + 1;
  if (next > 5) return null;
  const level = levels[next];
  if (!level || level.tasks.length === 0) return { pct: 0, done: 0, total: 0 };
  const done = level.tasks.filter((t) => t.done).length;
  return { pct: Math.round((done / level.tasks.length) * 100), done, total: level.tasks.length };
}

function toggleTaskLine(lines, lineIndex) {
  const line = lines[lineIndex];
  if (/\[ \]/.test(line)) lines[lineIndex] = line.replace("[ ]", "[x]");
  else if (/\[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/\[[xX]\]/, "[ ]");
  return lines;
}

function escapeHtmlNotas(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const deliverableState = {}; // file -> { title, level1Text, levels, lines, originalText, accent }

async function loadDeliverable(entry) {
  const draft = loadEntregaveisDraft();
  let text;
  if (draft[entry.file]) {
    text = draft[entry.file];
  } else {
    const res = await fetch(entry.file, { cache: "no-store" });
    text = await res.text();
  }
  const parsed = parseDeliverableMarkdown(text, entry.file);
  deliverableState[entry.file] = { ...parsed, accent: entry.accent };
}

async function syncDeliverableFromRepo(file) {
  const draft = loadEntregaveisDraft();
  delete draft[file];
  saveEntregaveisDraft(draft);
  const entry = DELIVERABLE_FILES.find((d) => d.file === file);
  await loadDeliverable(entry);
  renderNotasView();
  if (window.showToast) window.showToast("Sincronizado com o repositório");
}

function downloadDeliverableFile(file) {
  const state = deliverableState[file];
  if (!state) return;
  const text = state.lines.join("\n");
  const blob = new Blob([text], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.split("/").pop();
  a.click();
  URL.revokeObjectURL(a.href);
}

function notaCardHTML(state) {
  const nota = computeNota(state.levels);
  const progress = computeProgressToNext(state.levels, nota);
  const draft = loadEntregaveisDraft();
  const isDirty = !!draft[state.file];

  const levelsHTML = [2, 3, 4, 5].map((lvl) => {
    const level = state.levels[lvl];
    if (!level) return "";
    const achieved = nota >= lvl;
    const doneCount = level.tasks.filter((t) => t.done).length;
    return `
    <details class="nota-level ${achieved ? "achieved" : ""}" ${lvl === nota + 1 ? "open" : ""}>
      <summary class="nota-level-header">
        <span class="chevron">▶</span>
        <span class="nota-level-badge">Nota ${lvl}</span>
        <span class="nota-level-text">${escapeHtmlNotas(level.text)}</span>
        <span class="nota-level-count">${doneCount}/${level.tasks.length}</span>
      </summary>
      <div class="nota-level-tasks">
        ${level.tasks.map((t) => `
          <label class="nota-task ${t.done ? "done" : ""}">
            <input type="checkbox" data-file="${escapeHtmlNotas(state.file)}" data-line="${t.lineIndex}" ${t.done ? "checked" : ""} />
            <span class="nota-task-text">
              <span class="nota-task-name">${escapeHtmlNotas(t.name)}</span>
              ${t.due ? `<span class="chip">📅 ${t.due}</span>` : ""}
              ${t.description ? `<span class="nota-task-desc">${escapeHtmlNotas(t.description)}</span>` : ""}
            </span>
          </label>`).join("")}
      </div>
    </details>`;
  }).join("");

  return `
  <div class="nota-card accent-${state.accent}">
    <div class="nota-card-header">
      <h3>${escapeHtmlNotas(state.title)}</h3>
      <div class="nota-badge">${nota}<small>/5</small></div>
    </div>
    <p class="nota-level1-text">Nível 1 (padrão): ${escapeHtmlNotas(state.level1Text)}</p>
    ${progress ? `
      <div class="nota-progress-label">Rumo à nota ${nota + 1}: ${progress.done}/${progress.total} tarefas</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${progress.pct}%"></div></div>
    ` : `<div class="nota-progress-label">Nota máxima atingida 🎉</div>`}
    <div class="nota-levels">${levelsHTML}</div>
    <div class="nota-card-footer">
      ${isDirty ? '<span class="nota-dirty-flag">● alterações não sincronizadas</span>' : ""}
      <button type="button" class="btn btn-ghost nota-btn-sync" data-file="${escapeHtmlNotas(state.file)}">🔄 Sincronizar</button>
      <button type="button" class="btn btn-ghost nota-btn-download" data-file="${escapeHtmlNotas(state.file)}">⬇️ Baixar ${state.file.split("/").pop()}</button>
    </div>
  </div>`;
}

async function renderNotasView() {
  const grid = document.getElementById("notasGrid");
  if (!grid) return;
  grid.innerHTML = '<div class="theme-empty">Carregando entregáveis...</div>';

  try {
    await Promise.all(DELIVERABLE_FILES.map((entry) => {
      if (!deliverableState[entry.file]) return loadDeliverable(entry);
      return Promise.resolve();
    }));
  } catch (e) {
    grid.innerHTML = '<div class="theme-empty">Não foi possível carregar os arquivos de entregáveis. Se você abriu o arquivo direto do computador (file://), rode um servidor local ou acesse pelo link publicado.</div>';
    return;
  }

  grid.innerHTML = DELIVERABLE_FILES.map((entry) => notaCardHTML(deliverableState[entry.file])).join("");

  grid.querySelectorAll('input[type="checkbox"][data-file]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const file = cb.dataset.file;
      const lineIndex = Number(cb.dataset.line);
      const state = deliverableState[file];
      toggleTaskLine(state.lines, lineIndex);
      const draft = loadEntregaveisDraft();
      draft[file] = state.lines.join("\n");
      saveEntregaveisDraft(draft);
      const reparsed = parseDeliverableMarkdown(draft[file], file);
      deliverableState[file] = { ...reparsed, accent: entry_accent(file) };
      renderNotasView();
    });
  });
  grid.querySelectorAll(".nota-btn-download").forEach((btn) => {
    btn.addEventListener("click", () => downloadDeliverableFile(btn.dataset.file));
  });
  grid.querySelectorAll(".nota-btn-sync").forEach((btn) => {
    btn.addEventListener("click", () => syncDeliverableFromRepo(btn.dataset.file));
  });
}

function entry_accent(file) {
  const found = DELIVERABLE_FILES.find((d) => d.file === file);
  return found ? found.accent : "purple";
}
