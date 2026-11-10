/* Notas H2 — você cadastra e atualiza tarefas livremente (como na aba de tarefas),
   vinculando cada uma a um entregável e ao nível de nota que ela ajuda a comprovar.
   A nota prévia de cada entregável é calculada automaticamente e de forma cumulativa:
   um nível só conta quando TODAS as suas tarefas estiverem concluídas. */

const LS_ENTREGA_TASKS = "ptasks_entrega_tasks_v1";

const DELIVERABLES = [
  {
    id: "hub-ia",
    accent: "purple",
    name: "HUB de IA (migração Mindsight + Clima/Engajamento Gupy)",
    nota1: "AVD de janeiro rodou na Mindsight e/ou clima seguiu na Gupy. 0% migrado.",
    levels: {
      2: "Diagnóstico e roadmap publicados, mas Mindsight e/ou Gupy ainda em uso ativo na virada de janeiro.",
      3: "AVD de janeiro 100% na plataforma interna (zero uso da Mindsight no ciclo). Módulo de clima rodando no Hub (zero uso da Gupy no ciclo).",
      4: "Nota 3 + zero incidentes/retrabalho reportado no ciclo de AVD/clima.",
      5: "Nota 4 + contratos/licenças da Mindsight e da Gupy (módulo clima) cancelados ou não renovados, com redução de custo documentada.",
    },
  },
  {
    id: "trilha",
    accent: "blue",
    name: "Trilha de Desenvolvimento",
    nota1: "Nenhum modelo publicado ligado à Unico Skill.",
    levels: {
      2: "Modelo por área publicado, mas 0 áreas com plano registrado na Unico Skill.",
      3: "Modelo publicado e 100% das áreas-chave com plano registrado na Unico Skill. Mecanismo de acompanhamento por líderes criado e testado em pelo menos 1 ciclo.",
      4: "Nota 3 + 80% dos líderes preencheram o registro no prazo sem cobrança manual.",
      5: "Nota 4 + dados do acompanhamento geraram pelo menos 1 decisão documentada de G&G no ciclo.",
    },
  },
  {
    id: "sustentacao",
    accent: "teal",
    name: "Sustentação dos Programas de Reconhecimento e Mapa de Talentos",
    nota1: "Algum ciclo de reconhecimento não executado, ou Pool de Talentos sem atualização no período.",
    levels: {
      2: "Ciclos executados com atraso frente ao calendário (mais de 5 dias), ou Pool atualizado parcialmente.",
      3: "100% dos ciclos executados na data planejada. Pool de Talentos e Glossário de Competências atualizados a cada ciclo.",
      4: "Nota 3 + pelo menos 1 melhoria de processo implementada e documentada.",
      5: "Nota 4 + melhoria resultou em redução mensurável de tempo/esforço, documentada com números.",
    },
  },
];

function loadEntregaTasks() {
  try {
    const raw = localStorage.getItem(LS_ENTREGA_TASKS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveEntregaTasks(list) { localStorage.setItem(LS_ENTREGA_TASKS, JSON.stringify(list)); }
function uidEntrega() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function escapeHtmlNotas(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function computeNota(tasksForDeliverable) {
  let nota = 1;
  for (let lvl = 2; lvl <= 5; lvl++) {
    const levelTasks = tasksForDeliverable.filter((t) => t.nota === lvl);
    if (levelTasks.length === 0) break;
    if (levelTasks.every((t) => t.status === "concluida")) nota = lvl;
    else break;
  }
  return nota;
}

function computeProgressToNext(tasksForDeliverable, nota) {
  const next = nota + 1;
  if (next > 5) return null;
  const levelTasks = tasksForDeliverable.filter((t) => t.nota === next);
  if (levelTasks.length === 0) return { pct: 0, done: 0, total: 0 };
  const done = levelTasks.filter((t) => t.status === "concluida").length;
  return { pct: Math.round((done / levelTasks.length) * 100), done, total: levelTasks.length };
}

function levelTaskRowHTML(task) {
  const isDone = task.status === "concluida";
  return `
  <div class="entrega-task-row ${isDone ? "is-complete" : ""}" data-id="${task.id}">
    <button type="button" class="theme-row-status ${isDone ? "is-complete" : ""}" title="Marcar como concluída">${isDone ? "✓" : ""}</button>
    <span class="entrega-task-name">${escapeHtmlNotas(task.name)}</span>
    <span class="entrega-task-meta">
      <span class="nota-tag">Nota ${task.nota}</span>
      ${task.due ? `<span class="chip">📅 ${task.due}</span>` : ""}
    </span>
  </div>`;
}

function deliverableCardHTML(dlv, allTasks) {
  const tasksForDlv = allTasks
    .filter((t) => t.deliverableId === dlv.id)
    .slice()
    .sort((a, b) => a.nota - b.nota || b.createdAt - a.createdAt);
  const nota = computeNota(tasksForDlv);
  const progress = computeProgressToNext(tasksForDlv, nota);

  const criteriaHTML = [2, 3, 4, 5].map((lvl) => `
    <li><b>Nota ${lvl}${nota >= lvl ? " ✓" : ""}:</b> ${escapeHtmlNotas(dlv.levels[lvl])}</li>
  `).join("");

  return `
  <div class="nota-card accent-${dlv.accent}">
    <div class="nota-card-header">
      <h3>${escapeHtmlNotas(dlv.name)}</h3>
      <div class="nota-badge">${nota}<small>/5</small></div>
    </div>
    <p class="nota-level1-text">Nível 1 (padrão): ${escapeHtmlNotas(dlv.nota1)}</p>
    ${progress ? (progress.total > 0 ? `
      <div class="nota-progress-label">Rumo à nota ${nota + 1}: ${progress.done}/${progress.total} tarefas</div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${progress.pct}%"></div></div>
    ` : `<div class="nota-progress-label">Rumo à nota ${nota + 1}: cadastre uma tarefa marcada como "Nota ${nota + 1}"</div>`) : `<div class="nota-progress-label">Nota máxima atingida 🎉</div>`}

    <details class="nota-criteria-ref">
      <summary>Ver critérios de cada nota</summary>
      <ul>${criteriaHTML}</ul>
    </details>

    <div class="entrega-task-list">
      ${tasksForDlv.map(levelTaskRowHTML).join("") || '<div class="entrega-empty">Nenhuma tarefa cadastrada ainda.</div>'}
    </div>
    <button type="button" class="btn btn-ghost entrega-add-task" data-deliverable="${dlv.id}">+ Adicionar tarefa</button>
  </div>`;
}

function renderNotasView() {
  const grid = document.getElementById("notasGrid");
  if (!grid) return;
  const allTasks = loadEntregaTasks();
  grid.innerHTML = DELIVERABLES.map((dlv) => deliverableCardHTML(dlv, allTasks)).join("");

  grid.querySelectorAll(".entrega-add-task").forEach((btn) => {
    btn.addEventListener("click", () => openEntregaTaskModal(null, btn.dataset.deliverable));
  });
  grid.querySelectorAll(".entrega-task-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".theme-row-status")) return;
      openEntregaTaskModal(row.dataset.id);
    });
  });
  grid.querySelectorAll(".entrega-task-row .theme-row-status").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.closest(".entrega-task-row").dataset.id;
      const list = loadEntregaTasks();
      const task = list.find((t) => t.id === id);
      if (!task) return;
      task.status = task.status === "concluida" ? "pendente" : "concluida";
      task.updatedAt = Date.now();
      saveEntregaTasks(list);
      renderNotasView();
    });
  });
}

// ---------- Modal ----------
let currentEntregaTaskId = null;

function openEntregaTaskModal(id, presetDeliverable, presetNota) {
  currentEntregaTaskId = id || null;
  const modal = document.getElementById("entregaTaskModal");
  const form = document.getElementById("entregaTaskForm");
  form.reset();
  document.getElementById("entregaTaskId").value = "";
  document.getElementById("btnDeleteEntregaTask").classList.toggle("hidden", !id);

  const deliverableSelect = document.getElementById("entregaTaskDeliverable");
  deliverableSelect.innerHTML = DELIVERABLES.map((d) => `<option value="${d.id}">${escapeHtmlNotas(d.name)}</option>`).join("");

  if (id) {
    const list = loadEntregaTasks();
    const task = list.find((t) => t.id === id);
    if (!task) return;
    document.getElementById("entregaTaskId").value = task.id;
    document.getElementById("entregaTaskName").value = task.name;
    deliverableSelect.value = task.deliverableId;
    document.getElementById("entregaTaskNota").value = task.nota;
    document.getElementById("entregaTaskStatus").value = task.status;
    document.getElementById("entregaTaskDue").value = task.due || "";
    document.getElementById("entregaTaskDescription").value = task.description || "";
    document.getElementById("entregaModalTitle").textContent = "Editar tarefa do entregável";
  } else {
    deliverableSelect.value = presetDeliverable || DELIVERABLES[0].id;
    document.getElementById("entregaTaskNota").value = presetNota || 2;
    document.getElementById("entregaTaskStatus").value = "pendente";
    document.getElementById("entregaModalTitle").textContent = "Nova tarefa do entregável";
  }
  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("entregaTaskName").focus(), 50);
}

function closeEntregaTaskModal() {
  document.getElementById("entregaTaskModal").classList.add("hidden");
  currentEntregaTaskId = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("entregaTaskForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("entregaTaskId").value;
    const list = loadEntregaTasks();
    const now = Date.now();
    let task = id ? list.find((t) => t.id === id) : null;
    const isNew = !task;
    if (!task) { task = { id: uidEntrega(), createdAt: now }; list.unshift(task); }

    task.deliverableId = document.getElementById("entregaTaskDeliverable").value;
    task.nota = Number(document.getElementById("entregaTaskNota").value);
    task.name = document.getElementById("entregaTaskName").value.trim();
    task.status = document.getElementById("entregaTaskStatus").value;
    task.due = document.getElementById("entregaTaskDue").value || null;
    task.description = document.getElementById("entregaTaskDescription").value.trim();
    task.updatedAt = now;

    saveEntregaTasks(list);
    closeEntregaTaskModal();
    renderNotasView();
    if (window.showToast) window.showToast(isNew ? "Tarefa criada ✨" : "Tarefa atualizada ✅");
  });

  document.getElementById("btnDeleteEntregaTask").addEventListener("click", () => {
    if (!currentEntregaTaskId) return;
    if (!confirm("Excluir esta tarefa?")) return;
    const list = loadEntregaTasks().filter((t) => t.id !== currentEntregaTaskId);
    saveEntregaTasks(list);
    closeEntregaTaskModal();
    renderNotasView();
    if (window.showToast) window.showToast("Tarefa excluída 🗑️");
  });

  document.getElementById("btnCloseEntregaModal").addEventListener("click", closeEntregaTaskModal);
  document.getElementById("btnCancelEntregaTask").addEventListener("click", closeEntregaTaskModal);
  document.getElementById("entregaTaskModal").addEventListener("click", (e) => {
    if (e.target.id === "entregaTaskModal") closeEntregaTaskModal();
  });
  document.getElementById("btnNewEntregaTask").addEventListener("click", () => openEntregaTaskModal(null));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEntregaTaskModal();
  });
});
