/* Minhas Tarefas — app.js
   Local-only interactive daily task manager: CRUD, details, attachments/evidence, usage metrics.
   Persistence: localStorage for tasks/activity, IndexedDB for attachment blobs. */

(() => {
  "use strict";

  const LS_TASKS = "ptasks_tasks_v1";
  const LS_ACTIVITY = "ptasks_activity_v1";
  const LS_THEME = "ptasks_theme_v1";

  const STATUS_LABEL = { todo: "A fazer", doing: "Em andamento", done: "Concluída" };
  const PRIORITY_LABEL = { high: "Alta", medium: "Média", low: "Baixa" };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  // ---------- State ----------
  let tasks = loadJSON(LS_TASKS, []);
  let activity = loadJSON(LS_ACTIVITY, []);
  let pendingAttachments = []; // {id, name, type, size, dataURL, file} staged for the open modal, not yet persisted until save
  let removedAttachmentIds = [];
  let currentTaskId = null;
  let boardMode = "board"; // board | list

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveTasks() { localStorage.setItem(LS_TASKS, JSON.stringify(tasks)); }
  function saveActivity() { localStorage.setItem(LS_ACTIVITY, JSON.stringify(activity)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function logActivity(type, taskId, meta) {
    activity.unshift({ id: uid(), ts: Date.now(), type, taskId, meta: meta || null });
    activity = activity.slice(0, 500);
    saveActivity();
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const searchInput = $("#searchInput");
  const sortSelect = $("#sortSelect");
  const categoryFilter = $("#categoryFilter");
  const emptyState = $("#emptyState");
  const boardColumns = $("#boardColumns");
  const toast = $("#toast");

  // ---------- Navigation ----------
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      $$(".view").forEach((v) => v.classList.remove("active"));
      $(`#view-${view}`).classList.add("active");
      if (view === "dashboard") renderDashboard();
    });
  });

  // ---------- Theme ----------
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  applyTheme(localStorage.getItem(LS_THEME));
  $("#btnTheme").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(LS_THEME, next);
    applyTheme(next);
    renderDashboard(true);
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2400);
  }

  // ---------- View toggle (board/list) ----------
  $("#btnViewBoard").addEventListener("click", () => setBoardMode("board"));
  $("#btnViewList").addEventListener("click", () => setBoardMode("list"));
  function setBoardMode(mode) {
    boardMode = mode;
    $("#btnViewBoard").classList.toggle("active", mode === "board");
    $("#btnViewList").classList.toggle("active", mode === "list");
    boardColumns.classList.toggle("list-mode", mode === "list");
  }

  // ---------- Filters wiring ----------
  $$(".check-filter input").forEach((cb) => cb.addEventListener("change", renderBoard));
  searchInput.addEventListener("input", renderBoard);
  sortSelect.addEventListener("change", renderBoard);
  categoryFilter.addEventListener("change", renderBoard);

  function getActiveFilters() {
    const statusBoxes = $$('.check-filter input[value="todo"], .check-filter input[value="doing"], .check-filter input[value="done"]');
    const priorityBoxes = $$('.check-filter input[value="high"], .check-filter input[value="medium"], .check-filter input[value="low"]');
    return {
      statuses: statusBoxes.filter((b) => b.checked).map((b) => b.value),
      priorities: priorityBoxes.filter((b) => b.checked).map((b) => b.value),
      search: searchInput.value.trim().toLowerCase(),
      category: categoryFilter.value,
      sort: sortSelect.value,
    };
  }

  function updateCategoryOptions() {
    const cats = Array.from(new Set(tasks.map((t) => t.category).filter(Boolean))).sort();
    const currentVal = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">Todas</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (cats.includes(currentVal)) categoryFilter.value = currentVal;
    $("#categoryList").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Board rendering ----------
  function dueChipInfo(task) {
    if (!task.due) return null;
    const due = new Date(task.due + "T23:59:59");
    const now = new Date();
    const diffDays = Math.ceil((due - now) / 86400000);
    let cls = "";
    if (task.status !== "done" && diffDays < 0) cls = "due-overdue";
    else if (task.status !== "done" && diffDays <= 1) cls = "due-soon";
    return { text: formatDateShort(task.due), cls };
  }
  function formatDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  function filteredSortedTasks() {
    const f = getActiveFilters();
    let list = tasks.filter((t) => {
      if (!f.statuses.includes(t.status)) return false;
      if (!f.priorities.includes(t.priority)) return false;
      if (f.category && t.category !== f.category) return false;
      if (f.search) {
        const hay = (t.title + " " + (t.description || "") + " " + (t.category || "")).toLowerCase();
        if (!hay.includes(f.search)) return false;
      }
      return true;
    });
    switch (f.sort) {
      case "createdAsc": list.sort((a, b) => a.createdAt - b.createdAt); break;
      case "dueAsc": list.sort((a, b) => (a.due || "9999") > (b.due || "9999") ? 1 : -1); break;
      case "priority": list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]); break;
      case "alpha": list.sort((a, b) => a.title.localeCompare(b.title)); break;
      default: list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }

  function taskCardHTML(t) {
    const due = dueChipInfo(t);
    const subtasks = t.subtasks || [];
    const doneCount = subtasks.filter((s) => s.done).length;
    const attCount = (t.attachmentCount || 0);
    return `
    <div class="task-card" data-id="${t.id}" draggable="true">
      <div class="task-card-top">
        <h4>${escapeHtml(t.title)}</h4>
        <span class="priority-dot priority-${t.priority}" title="Prioridade ${PRIORITY_LABEL[t.priority]}"></span>
      </div>
      ${t.description ? `<div class="task-card-desc">${escapeHtml(t.description)}</div>` : ""}
      ${subtasks.length ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.round((doneCount / subtasks.length) * 100)}%"></div></div>` : ""}
      <div class="task-card-meta">
        ${t.category ? `<span class="chip">${escapeHtml(t.category)}</span>` : ""}
        ${due ? `<span class="chip ${due.cls}">📅 ${due.text}</span>` : ""}
        ${subtasks.length ? `<span>${doneCount}/${subtasks.length} ✅</span>` : ""}
        ${attCount ? `<span class="chip-att">📎 ${attCount}</span>` : ""}
      </div>
    </div>`;
  }

  function renderBoard() {
    const list = filteredSortedTasks();
    const cols = { todo: [], doing: [], done: [] };
    list.forEach((t) => cols[t.status] && cols[t.status].push(t));

    $("#col-todo").innerHTML = cols.todo.map(taskCardHTML).join("");
    $("#col-doing").innerHTML = cols.doing.map(taskCardHTML).join("");
    $("#col-done").innerHTML = cols.done.map(taskCardHTML).join("");
    $("#countTodo").textContent = cols.todo.length;
    $("#countDoing").textContent = cols.doing.length;
    $("#countDone").textContent = cols.done.length;

    $$(".task-card").forEach((card) => {
      card.addEventListener("click", () => openTaskModal(card.dataset.id));
      card.addEventListener("dragstart", () => card.classList.add("dragging"));
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
    });

    emptyState.classList.toggle("hidden", tasks.length !== 0);
    boardColumns.classList.toggle("hidden", tasks.length === 0);

    updateCategoryOptions();
    updateTopStats();
  }

  // Drag & drop between columns
  $$(".column-body").forEach((col) => {
    col.addEventListener("dragover", (e) => e.preventDefault());
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      const dragging = $(".task-card.dragging");
      if (!dragging) return;
      const id = dragging.dataset.id;
      const newStatus = col.closest(".column").dataset.status;
      changeTaskStatus(id, newStatus);
    });
  });

  function changeTaskStatus(id, newStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === newStatus) return;
    const prev = t.status;
    t.status = newStatus;
    t.updatedAt = Date.now();
    if (newStatus === "done" && prev !== "done") t.completedAt = Date.now();
    if (newStatus !== "done") t.completedAt = null;
    saveTasks();
    logActivity("status_change", id, { from: prev, to: newStatus, title: t.title });
    renderBoard();
  }

  function updateTopStats() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    $("#statTotal").textContent = total;
    $("#statDone").textContent = done;
    $("#statRate").textContent = rate + "%";
    $("#statStreak").textContent = computeStreak();
  }

  function computeStreak() {
    const doneDates = new Set(
      tasks.filter((t) => t.completedAt).map((t) => new Date(t.completedAt).toISOString().slice(0, 10))
    );
    let streak = 0;
    let d = new Date();
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (doneDates.has(iso)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  // ---------- Modal ----------
  const modal = $("#taskModal");
  const form = $("#taskForm");

  function openTaskModal(id) {
    currentTaskId = id || null;
    pendingAttachments = [];
    removedAttachmentIds = [];
    form.reset();
    $("#taskStatus").value = "todo";
    $("#taskPriority").value = "medium";
    $("#attachmentList").innerHTML = "";
    $("#subtaskList").innerHTML = "";
    $("#commentList").innerHTML = "";
    $("#btnDeleteTask").classList.toggle("hidden", !id);

    if (id) {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      $("#taskId").value = t.id;
      $("#taskTitle").value = t.title;
      $("#taskStatus").value = t.status;
      $("#taskPriority").value = t.priority;
      $("#taskCategory").value = t.category || "";
      $("#taskDue").value = t.due || "";
      $("#taskDescription").value = t.description || "";
      $("#modalMeta").textContent = `Criada em ${new Date(t.createdAt).toLocaleDateString("pt-BR")}`;
      renderSubtasks(t.subtasks || []);
      renderComments(t.comments || []);
      loadAttachmentsForTask(t.id);
    } else {
      $("#taskId").value = "";
      $("#modalMeta").textContent = "Nova tarefa";
      renderSubtasks([]);
      renderComments([]);
    }
    modal.classList.remove("hidden");
    setTimeout(() => $("#taskTitle").focus(), 50);
  }

  function closeTaskModal() {
    modal.classList.add("hidden");
    currentTaskId = null;
    pendingAttachments = [];
    removedAttachmentIds = [];
  }

  $("#btnNewTask").addEventListener("click", () => openTaskModal(null));
  $("#btnEmptyAdd").addEventListener("click", () => openTaskModal(null));
  $("#btnCloseModal").addEventListener("click", closeTaskModal);
  $("#btnCancel").addEventListener("click", closeTaskModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeTaskModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeTaskModal(); $("#lightbox").classList.add("hidden"); } });

  // ---------- Subtasks ----------
  let workingSubtasks = [];
  function renderSubtasks(list) {
    workingSubtasks = list.map((s) => ({ ...s }));
    drawSubtasks();
  }
  function drawSubtasks() {
    $("#subtaskList").innerHTML = workingSubtasks.map((s, i) => `
      <div class="subtask-item ${s.done ? "done" : ""}" data-i="${i}">
        <input type="checkbox" ${s.done ? "checked" : ""} />
        <span>${escapeHtml(s.text)}</span>
        <button type="button" title="Remover">✕</button>
      </div>`).join("");
    $$("#subtaskList .subtask-item").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelector("input").addEventListener("change", (e) => { workingSubtasks[i].done = e.target.checked; drawSubtasks(); });
      row.querySelector("button").addEventListener("click", () => { workingSubtasks.splice(i, 1); drawSubtasks(); });
    });
  }
  $("#subtaskInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val) { workingSubtasks.push({ text: val, done: false }); e.target.value = ""; drawSubtasks(); }
    }
  });

  // ---------- Comments ----------
  let workingComments = [];
  function renderComments(list) {
    workingComments = list.map((c) => ({ ...c }));
    drawComments();
  }
  function drawComments() {
    $("#commentList").innerHTML = workingComments
      .slice().sort((a, b) => b.ts - a.ts)
      .map((c) => `<div class="comment-item">${escapeHtml(c.text)}<time>${new Date(c.ts).toLocaleString("pt-BR")}</time></div>`)
      .join("") || `<div class="comment-item" style="opacity:.6">Sem notas ainda.</div>`;
  }
  $("#btnAddComment").addEventListener("click", addCommentFromInput);
  $("#commentInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCommentFromInput(); } });
  function addCommentFromInput() {
    const input = $("#commentInput");
    const val = input.value.trim();
    if (!val) return;
    workingComments.push({ id: uid(), text: val, ts: Date.now() });
    input.value = "";
    drawComments();
  }

  // ---------- Attachments ----------
  const dropZone = $("#dropZone");
  const fileInput = $("#fileInput");
  ["dragenter", "dragover"].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); }));
  dropZone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
  document.addEventListener("paste", (e) => {
    if (modal.classList.contains("hidden")) return;
    const items = Array.from(e.clipboardData?.items || []).filter((it) => it.kind === "file");
    if (items.length) handleFiles(items.map((it) => it.getAsFile()));
  });

  const MAX_FILE_MB = 8;
  function handleFiles(fileList) {
    Array.from(fileList).forEach((file) => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        showToast(`"${file.name}" excede ${MAX_FILE_MB}MB e foi ignorado.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const att = { id: uid(), name: file.name, type: file.type, size: file.size, dataURL: reader.result };
        pendingAttachments.push(att);
        drawAttachments();
      };
      reader.readAsDataURL(file);
    });
  }

  let existingAttachments = [];
  async function loadAttachmentsForTask(taskId) {
    existingAttachments = await AttachmentDB.getAllByTask(taskId);
    drawAttachments();
  }

  function drawAttachments() {
    const combined = [
      ...existingAttachments.filter((a) => !removedAttachmentIds.includes(a.id)).map((a) => ({ ...a, dataURL: a.dataURL, existing: true })),
      ...pendingAttachments.map((a) => ({ ...a, existing: false })),
    ];
    $("#attachmentList").innerHTML = combined.map((a) => {
      const isImage = (a.type || "").startsWith("image/");
      const inner = isImage
        ? `<img class="attachment-thumb" src="${a.dataURL}" alt="${escapeHtml(a.name)}" />`
        : `<div class="attachment-file">📄<small>${escapeHtml(a.name)}</small></div>`;
      return `<div class="attachment-item" data-id="${a.id}" data-existing="${a.existing}">${inner}<button type="button" class="attachment-remove" title="Remover">✕</button></div>`;
    }).join("") || `<div style="font-size:.8rem;color:var(--text-muted)">Nenhum arquivo anexado.</div>`;

    $$("#attachmentList .attachment-thumb").forEach((img) => {
      img.addEventListener("click", () => {
        $("#lightboxImg").src = img.src;
        $("#lightbox").classList.remove("hidden");
      });
    });
    $$("#attachmentList .attachment-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".attachment-item");
        const id = item.dataset.id;
        const isExisting = item.dataset.existing === "true";
        if (isExisting) removedAttachmentIds.push(id);
        else pendingAttachments = pendingAttachments.filter((a) => a.id !== id);
        drawAttachments();
      });
    });
  }

  $("#btnCloseLightbox").addEventListener("click", () => $("#lightbox").classList.add("hidden"));
  $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("#lightbox").classList.add("hidden"); });

  // ---------- Save / Delete ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#taskId").value || uid();
    const isNew = !$("#taskId").value;
    const now = Date.now();

    let existing = tasks.find((t) => t.id === id);
    const status = $("#taskStatus").value;

    const task = existing || { id, createdAt: now, completedAt: null };
    task.title = $("#taskTitle").value.trim();
    task.status = status;
    task.priority = $("#taskPriority").value;
    task.category = $("#taskCategory").value.trim();
    task.due = $("#taskDue").value || null;
    task.description = $("#taskDescription").value.trim();
    task.subtasks = workingSubtasks;
    task.comments = workingComments;
    task.updatedAt = now;
    if (status === "done" && !task.completedAt) task.completedAt = now;
    if (status !== "done") task.completedAt = null;

    // persist attachments
    for (const rid of removedAttachmentIds) await AttachmentDB.remove(rid);
    for (const a of pendingAttachments) {
      await AttachmentDB.put({ id: a.id, taskId: id, name: a.name, type: a.type, size: a.size, dataURL: a.dataURL, addedAt: now });
    }
    const remaining = await AttachmentDB.getAllByTask(id);
    task.attachmentCount = remaining.length;

    if (isNew) {
      tasks.unshift(task);
      logActivity("created", id, { title: task.title });
    } else {
      logActivity("updated", id, { title: task.title });
    }
    saveTasks();
    closeTaskModal();
    renderBoard();
    showToast(isNew ? "Tarefa criada ✨" : "Tarefa atualizada ✅");
  });

  $("#btnDeleteTask").addEventListener("click", async () => {
    if (!currentTaskId) return;
    if (!confirm("Excluir esta tarefa e seus anexos? Essa ação não pode ser desfeita.")) return;
    const t = tasks.find((x) => x.id === currentTaskId);
    await AttachmentDB.removeByTask(currentTaskId);
    tasks = tasks.filter((x) => x.id !== currentTaskId);
    saveTasks();
    logActivity("deleted", currentTaskId, { title: t?.title });
    closeTaskModal();
    renderBoard();
    showToast("Tarefa excluída 🗑️");
  });

  // ---------- Export / Import ----------
  $("#btnExport").addEventListener("click", async () => {
    const allAttachments = await AttachmentDB.getAll();
    const payload = { tasks, activity, attachments: allAttachments, exportedAt: Date.now(), version: 1 };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `minhas-tarefas-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Dados exportados ⬇️");
  });

  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.tasks)) throw new Error("Formato inválido");
      if (!confirm("Importar substituirá os dados atuais. Continuar?")) return;
      tasks = data.tasks;
      activity = data.activity || [];
      saveTasks(); saveActivity();
      if (Array.isArray(data.attachments)) {
        for (const att of data.attachments) await AttachmentDB.put(att);
      }
      renderBoard();
      showToast("Dados importados ✅");
    } catch (err) {
      showToast("Falha ao importar: arquivo inválido");
    } finally {
      e.target.value = "";
    }
  });

  // ---------- Seed / Clear ----------
  $("#btnSeed").addEventListener("click", () => {
    if (tasks.length && !confirm("Adicionar tarefas de exemplo à sua lista atual?")) return;
    const now = Date.now();
    const day = 86400000;
    const samples = [
      { title: "Revisar relatório semanal", status: "todo", priority: "high", category: "Trabalho", due: todayISO(), description: "Conferir números antes de enviar." },
      { title: "Ir à academia", status: "doing", priority: "medium", category: "Saúde", due: null, description: "Treino de pernas." },
      { title: "Pagar contas", status: "todo", priority: "high", category: "Casa", due: todayISO(), description: "Água, luz e internet." },
      { title: "Ler 20 páginas", status: "done", priority: "low", category: "Pessoal", due: null, description: "Livro atual: hábitos." },
      { title: "Organizar fotos da viagem", status: "done", priority: "low", category: "Pessoal", due: null, description: "" },
    ];
    samples.forEach((s, i) => {
      const id = uid();
      const createdAt = now - (samples.length - i) * day;
      const completedAt = s.status === "done" ? createdAt + 3600000 : null;
      tasks.unshift({
        id, title: s.title, status: s.status, priority: s.priority, category: s.category,
        due: s.due, description: s.description, subtasks: [], comments: [],
        createdAt, updatedAt: createdAt, completedAt, attachmentCount: 0,
      });
      logActivity("created", id, { title: s.title });
    });
    saveTasks();
    renderBoard();
    showToast("Exemplos adicionados ✨");
  });

  $("#btnClearAll").addEventListener("click", async () => {
    if (!confirm("Isso apagará TODAS as tarefas, anexos e o histórico. Continuar?")) return;
    tasks = []; activity = [];
    saveTasks(); saveActivity();
    const all = await AttachmentDB.getAll();
    for (const a of all) await AttachmentDB.remove(a.id);
    renderBoard();
    renderDashboard();
    showToast("Todos os dados foram apagados");
  });

  // ---------- Dashboard ----------
  let charts = {};
  function destroyCharts() { Object.values(charts).forEach((c) => c && c.destroy()); charts = {}; }

  function chartColors() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return {
      text: dark ? "#8d90ac" : "#6b7086",
      grid: dark ? "#2b2d40" : "#e6e8f0",
      palette: ["#6c5ce7", "#22b07d", "#e8a531", "#e6533c", "#3b9ee5", "#c74fc9", "#4bc0c0"],
    };
  }

  async function renderDashboard(themeOnly) {
    const range = Number($("#metricsRange").value || 30);
    const rangeStart = Date.now() - range * 86400000;

    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const attCount = await AttachmentDB.countAll();

    $("#mTotal").textContent = total;
    $("#mDone").textContent = done;
    $("#mRate").textContent = rate + "%";
    $("#mStreak").textContent = computeStreak();
    $("#mAttachments").textContent = attCount;

    const completedWithTime = tasks.filter((t) => t.completedAt && t.createdAt);
    if (completedWithTime.length) {
      const avgMs = completedWithTime.reduce((sum, t) => sum + (t.completedAt - t.createdAt), 0) / completedWithTime.length;
      const hours = avgMs / 3600000;
      $("#mAvgTime").textContent = hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
    } else {
      $("#mAvgTime").textContent = "–";
    }

    const c = chartColors();
    Chart.defaults.color = c.text;
    Chart.defaults.borderColor = c.grid;
    destroyCharts();

    // Daily activity (created vs completed) over range
    const days = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      days.push(d.toISOString().slice(0, 10));
    }
    const createdByDay = Object.fromEntries(days.map((d) => [d, 0]));
    const doneByDay = Object.fromEntries(days.map((d) => [d, 0]));
    tasks.forEach((t) => {
      const cd = new Date(t.createdAt).toISOString().slice(0, 10);
      if (cd in createdByDay) createdByDay[cd]++;
      if (t.completedAt) {
        const dd = new Date(t.completedAt).toISOString().slice(0, 10);
        if (dd in doneByDay) doneByDay[dd]++;
      }
    });

    charts.activity = new Chart($("#chartActivity"), {
      type: "line",
      data: {
        labels: days.map((d) => d.slice(5)),
        datasets: [
          { label: "Criadas", data: days.map((d) => createdByDay[d]), borderColor: c.palette[0], backgroundColor: c.palette[0] + "33", tension: 0.35, fill: true },
          { label: "Concluídas", data: days.map((d) => doneByDay[d]), borderColor: c.palette[1], backgroundColor: c.palette[1] + "33", tension: 0.35, fill: true },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    // Status distribution
    const statusCounts = { todo: 0, doing: 0, done: 0 };
    tasks.forEach((t) => statusCounts[t.status]++);
    charts.status = new Chart($("#chartStatus"), {
      type: "doughnut",
      data: {
        labels: ["A fazer", "Em andamento", "Concluída"],
        datasets: [{ data: [statusCounts.todo, statusCounts.doing, statusCounts.done], backgroundColor: [c.palette[3], c.palette[2], c.palette[1]] }],
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    // Priority breakdown
    const prCounts = { high: 0, medium: 0, low: 0 };
    tasks.forEach((t) => prCounts[t.priority]++);
    charts.priority = new Chart($("#chartPriority"), {
      type: "bar",
      data: {
        labels: ["Alta", "Média", "Baixa"],
        datasets: [{ label: "Tarefas", data: [prCounts.high, prCounts.medium, prCounts.low], backgroundColor: [c.palette[3], c.palette[2], c.palette[1]] }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    // By category
    const catCounts = {};
    tasks.forEach((t) => { const k = t.category || "Sem categoria"; catCounts[k] = (catCounts[k] || 0) + 1; });
    const catLabels = Object.keys(catCounts);
    charts.category = new Chart($("#chartCategory"), {
      type: "pie",
      data: { labels: catLabels, datasets: [{ data: catLabels.map((k) => catCounts[k]), backgroundColor: catLabels.map((_, i) => c.palette[i % c.palette.length]) }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    if (!themeOnly) renderActivityLog();
  }

  const ACTION_LABEL = {
    created: "criou", updated: "atualizou", deleted: "excluiu", status_change: "mudou status de",
  };
  function renderActivityLog() {
    const recent = activity.slice(0, 60);
    $("#activityLog").innerHTML = recent.map((a) => {
      const title = a.meta?.title || "(tarefa)";
      let text;
      if (a.type === "status_change") {
        text = `mudou <b>${escapeHtml(title)}</b> de ${STATUS_LABEL[a.meta.from]} para ${STATUS_LABEL[a.meta.to]}`;
      } else {
        text = `${ACTION_LABEL[a.type] || a.type} <b>${escapeHtml(title)}</b>`;
      }
      return `<li><span>${text}</span><span>${new Date(a.ts).toLocaleString("pt-BR")}</span></li>`;
    }).join("") || "<li>Nenhuma atividade ainda.</li>";
  }

  $("#metricsRange").addEventListener("change", () => renderDashboard());

  // ---------- Init ----------
  setBoardMode("board");
  renderBoard();
})();
