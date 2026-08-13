/* Minhas Tarefas — app.js
   Local-only interactive daily task manager: CRUD, details, attachments/evidence, usage metrics.
   Persistence: localStorage for tasks/activity, IndexedDB for attachment blobs. */

(() => {
  "use strict";

  const LS_TASKS = "ptasks_tasks_v1";
  const LS_ACTIVITY = "ptasks_activity_v1";
  const LS_THEME = "ptasks_theme_v1";
  const LS_VIEWMODE = "ptasks_viewmode_v1";

  const STATUS_LABEL = { todo: "A fazer", doing: "Em andamento", done: "Concluída", canceled: "Cancelada" };
  const PRIORITY_LABEL = { urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa" };
  const PRIORITY_RANK = { urgent: -1, high: 0, medium: 1, low: 2 };
  const SPACE_LABEL = { todos: "To do's", "1on1": "1:1 Yás", entregaveis: "Entregáveis", extra: "Atividades Extra", anotacoes: "Anotações" };

  // ---------- State ----------
  let tasks = loadJSON(LS_TASKS, []);
  (function migrateFinalizedStatus() {
    let changed = false;
    tasks.forEach((t) => { if (t.status === "finalized") { t.status = "done"; changed = true; } });
    if (changed) localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  })();
  let activity = loadJSON(LS_ACTIVITY, []);
  let pendingAttachments = []; // {id, name, type, size, dataURL, file} staged for the open modal, not yet persisted until save
  let removedAttachmentIds = [];
  let currentTaskId = null;
  let boardMode = localStorage.getItem(LS_VIEWMODE) || "theme"; // theme | board
  let currentSpace = "todos";

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
      if (view === "board" && btn.dataset.space) {
        currentSpace = btn.dataset.space;
        $("#spaceTitle").textContent = SPACE_LABEL[currentSpace] || currentSpace;
        renderBoard();
      }
      if (view === "dashboard") renderDashboard();
      if (view === "notas" && typeof renderNotasView === "function") renderNotasView();
      if (view === "anotacoes" && typeof renderAnotacoesView === "function") renderAnotacoesView();
      if (view === "oneonones" && typeof renderOneOnOnesView === "function") renderOneOnOnesView();
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

  // ---------- Data dropdown (Exportar / Importar) ----------
  const dataDropdownMenu = $("#dataDropdownMenu");
  $("#btnDataMenu").addEventListener("click", (e) => {
    e.stopPropagation();
    dataDropdownMenu.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!dataDropdownMenu.classList.contains("hidden") && !e.target.closest(".sidebar-dropdown")) {
      dataDropdownMenu.classList.add("hidden");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dataDropdownMenu.classList.add("hidden");
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2400);
  }
  window.showToast = showToast;

  // ---------- View toggle (theme list / board) ----------
  const themeListEl = $("#themeList");
  $("#btnViewBoard").addEventListener("click", () => setBoardMode("board"));
  $("#btnViewTheme").addEventListener("click", () => setBoardMode("theme"));
  function setBoardMode(mode) {
    boardMode = mode;
    localStorage.setItem(LS_VIEWMODE, mode);
    $("#btnViewBoard").classList.toggle("active", mode === "board");
    $("#btnViewTheme").classList.toggle("active", mode === "theme");
    boardColumns.classList.toggle("hidden", mode !== "board");
    themeListEl.classList.toggle("hidden", mode !== "theme");
    renderBoard();
  }

  // ---------- Filters wiring ----------
  $$(".check-filter input").forEach((cb) => cb.addEventListener("change", renderBoard));
  searchInput.addEventListener("input", renderBoard);
  sortSelect.addEventListener("change", renderBoard);
  categoryFilter.addEventListener("change", renderBoard);

  // ---------- Collapsible sidebar sections ----------
  const LS_COLLAPSED_SECTIONS = "ptasks_collapsed_sections_v1";
  const collapsedSections = new Set(loadJSON(LS_COLLAPSED_SECTIONS, []));
  $$(".sidebar-section[data-section]").forEach((section) => {
    section.classList.toggle("collapsed", collapsedSections.has(section.dataset.section));
    section.querySelector(".sidebar-section-toggle").addEventListener("click", () => {
      const key = section.dataset.section;
      const isCollapsed = section.classList.toggle("collapsed");
      if (isCollapsed) collapsedSections.add(key); else collapsedSections.delete(key);
      localStorage.setItem(LS_COLLAPSED_SECTIONS, JSON.stringify([...collapsedSections]));
    });
  });

  function getActiveFilters() {
    const statusBoxes = $$('.check-filter input[value="todo"], .check-filter input[value="doing"], .check-filter input[value="done"], .check-filter input[value="canceled"]');
    const priorityBoxes = $$('.check-filter input[value="urgent"], .check-filter input[value="high"], .check-filter input[value="medium"], .check-filter input[value="low"]');
    return {
      statuses: statusBoxes.filter((b) => b.checked).map((b) => b.value),
      priorities: priorityBoxes.filter((b) => b.checked).map((b) => b.value),
      search: searchInput.value.trim().toLowerCase(),
      category: categoryFilter.value,
      sort: sortSelect.value,
    };
  }

  function updateCategoryOptions() {
    const cats = Array.from(new Set([
      ...tasks.map((t) => t.category).filter(Boolean),
      ...loadCustomThemes()[currentSpace] || [],
    ])).sort();
    const currentVal = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">Todas</option>' + cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (cats.includes(currentVal)) categoryFilter.value = currentVal;
    $("#categoryList").innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  }

  // ---------- Custom (empty) themes ----------
  const LS_CUSTOM_THEMES = "ptasks_customthemes_v1";
  function loadCustomThemes() { return loadJSON(LS_CUSTOM_THEMES, {}); }
  function saveCustomThemes(obj) { localStorage.setItem(LS_CUSTOM_THEMES, JSON.stringify(obj)); }
  function addCustomTheme(space, name) {
    const all = loadCustomThemes();
    all[space] = all[space] || [];
    const exists = all[space].some((n) => n.toLowerCase() === name.toLowerCase()) ||
      tasks.some((t) => (t.space || "todos") === space && (t.category || "").toLowerCase() === name.toLowerCase());
    if (!exists) all[space].push(name);
    saveCustomThemes(all);
  }
  function removeCustomTheme(space, name) {
    const all = loadCustomThemes();
    if (all[space]) all[space] = all[space].filter((n) => n !== name);
    saveCustomThemes(all);
  }
  function renameThemeEverywhere(oldName, newName) {
    let changed = false;
    tasks.forEach((t) => {
      if ((t.category || "Sem tema") === oldName) { t.category = newName; changed = true; }
    });
    if (changed) saveTasks();
    const all = loadCustomThemes();
    Object.keys(all).forEach((space) => {
      all[space] = all[space].map((n) => (n === oldName ? newName : n));
    });
    saveCustomThemes(all);
    if (closedThemeGroups.has(oldName)) { closedThemeGroups.delete(oldName); closedThemeGroups.add(newName); }
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
    const isOpenStatus = task.status !== "done" && task.status !== "canceled";
    let cls = "";
    if (isOpenStatus && diffDays < 0) cls = "due-overdue";
    else if (isOpenStatus && diffDays <= 1) cls = "due-soon";
    return { text: formatDateShort(task.due), cls };
  }
  function formatDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  // ---------- Due-date reminders ----------
  const LS_REMINDER_SHOWN = "ptasks_reminder_shown_date_v1";
  function checkDueReminders() {
    const today = todayISO();
    const open = tasks.filter((t) => t.due && t.status !== "done" && t.status !== "canceled");
    const overdue = open.filter((t) => t.due < today).sort((a, b) => a.due < b.due ? -1 : 1);
    const dueToday = open.filter((t) => t.due === today);
    if (!overdue.length && !dueToday.length) return;
    if (localStorage.getItem(LS_REMINDER_SHOWN) === today) return;
    localStorage.setItem(LS_REMINDER_SHOWN, today);
    renderReminderList(overdue, dueToday);
    $("#reminderModal").classList.remove("hidden");
  }
  function reminderRowHTML(t, isOverdue) {
    return `
    <button type="button" class="reminder-item" data-id="${t.id}" data-space="${t.space || "todos"}">
      <span class="reminder-item-title">${escapeHtml(t.title)}</span>
      <span class="reminder-item-space">${escapeHtml(SPACE_LABEL[t.space || "todos"] || "")}</span>
      <span class="chip ${isOverdue ? "due-overdue" : "due-soon"}">${isOverdue ? "Atrasada · " : ""}${formatDateShort(t.due)}</span>
    </button>`;
  }
  function renderReminderList(overdue, dueToday) {
    const parts = [];
    if (overdue.length) parts.push(overdue.map((t) => reminderRowHTML(t, true)).join(""));
    if (dueToday.length) parts.push(dueToday.map((t) => reminderRowHTML(t, false)).join(""));
    $("#reminderList").innerHTML = parts.join("") || `<div class="reminder-empty">Nada pendente por hoje 🎉</div>`;
    $$("#reminderList .reminder-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("#reminderModal").classList.add("hidden");
        currentSpace = btn.dataset.space;
        $$(".nav-item").forEach((b) => b.classList.remove("active"));
        const navBtn = $(`.nav-item[data-space="${currentSpace}"]`);
        if (navBtn) navBtn.classList.add("active");
        $$(".view").forEach((v) => v.classList.remove("active"));
        $("#view-board").classList.add("active");
        $("#spaceTitle").textContent = SPACE_LABEL[currentSpace] || currentSpace;
        renderBoard();
        openTaskModal(btn.dataset.id);
      });
    });
  }
  $("#btnCloseReminder").addEventListener("click", () => $("#reminderModal").classList.add("hidden"));
  $("#btnCloseReminderFooter").addEventListener("click", () => $("#reminderModal").classList.add("hidden"));
  $("#reminderModal").addEventListener("click", (e) => { if (e.target.id === "reminderModal") $("#reminderModal").classList.add("hidden"); });

  function filteredSortedTasks() {
    const f = getActiveFilters();
    let list = tasks.filter((t) => {
      if ((t.space || "todos") !== currentSpace) return false;
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
    <div class="task-card ${t.priority === "urgent" ? "is-urgent" : ""}" data-id="${t.id}" draggable="true">
      <div class="task-card-top">
        <h4>${escapeHtml(t.title)}</h4>
        <span class="priority-dot priority-${t.priority}" title="Prioridade ${PRIORITY_LABEL[t.priority]}"></span>
      </div>
      ${t.description ? `<div class="task-card-desc">${escapeHtml(t.description)}</div>` : ""}
      ${subtasks.length ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.round((doneCount / subtasks.length) * 100)}%"></div></div>` : ""}
      <div class="task-card-meta">
        ${t.category ? `<span class="chip">${escapeHtml(t.category)}</span>` : ""}
        ${t.recurrence?.enabled ? `<span class="chip" title="Tarefa recorrente">🔁</span>` : ""}
        ${due ? `<span class="chip ${due.cls}">📅 ${due.text}</span>` : ""}
        ${subtasks.length ? `<span>${doneCount}/${subtasks.length} ✅</span>` : ""}
        ${attCount ? `<span class="chip-att">📎 ${attCount}</span>` : ""}
      </div>
    </div>`;
  }

  function renderBoard() {
    const list = filteredSortedTasks();
    const cols = { todo: [], doing: [], done: [], canceled: [] };
    list.forEach((t) => cols[t.status] && cols[t.status].push(t));

    $("#col-todo").innerHTML = cols.todo.map(taskCardHTML).join("");
    $("#col-doing").innerHTML = cols.doing.map(taskCardHTML).join("");
    $("#col-done").innerHTML = cols.done.map(taskCardHTML).join("");
    $("#col-canceled").innerHTML = cols.canceled.map(taskCardHTML).join("");
    $("#countTodo").textContent = cols.todo.length;
    $("#countDoing").textContent = cols.doing.length;
    $("#countDone").textContent = cols.done.length;
    $("#countCanceled").textContent = cols.canceled.length;

    $$(".task-card").forEach((card) => {
      card.addEventListener("click", () => openTaskModal(card.dataset.id));
      card.addEventListener("dragstart", () => card.classList.add("dragging"));
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
    });

    renderThemeList(list);

    const spaceTasks = tasks.filter((t) => (t.space || "todos") === currentSpace);
    const hasCustomThemes = (loadCustomThemes()[currentSpace] || []).length > 0;
    const isSpaceEmpty = spaceTasks.length === 0 && !hasCustomThemes;
    emptyState.classList.toggle("hidden", !isSpaceEmpty);
    boardColumns.classList.toggle("hidden", isSpaceEmpty || boardMode !== "board");
    themeListEl.classList.toggle("hidden", isSpaceEmpty || boardMode !== "theme");

    updateCategoryOptions();
    updateTopStats();
  }

  const closedThemeGroups = new Set();
  function themeRowHTML(t) {
    const due = dueChipInfo(t);
    const isComplete = t.status === "done";
    return `
    <div class="theme-row ${isComplete ? "is-complete" : ""}" data-id="${t.id}" draggable="true">
      <span class="theme-row-handle" title="Arraste para mover de tema">⠿</span>
      <button type="button" class="theme-row-status ${isComplete ? "is-complete" : ""}" title="Marcar como concluída">${isComplete ? "✓" : ""}</button>
      <span class="theme-row-title">${escapeHtml(t.title)}</span>
      <span class="theme-row-meta">
        ${t.priority === "urgent" ? '<span class="priority-dot priority-urgent" title="Urgente"></span>' : ""}
        <span class="status-pill status-pill-${t.status}">${STATUS_LABEL[t.status]}</span>
        ${t.recurrence?.enabled ? `<span class="chip" title="Tarefa recorrente (${t.recurrence.period === "end" ? "final" : "início"} do mês)">🔁</span>` : ""}
        ${due ? `<span class="chip ${due.cls}">📅 ${due.text}</span>` : ""}
        ${t.attachmentCount ? `<span class="chip-att">📎 ${t.attachmentCount}</span>` : ""}
      </span>
    </div>`;
  }

  function moveTaskToTheme(id, newTheme) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const oldTheme = t.category || "Sem tema";
    if (oldTheme === newTheme) return;
    t.category = newTheme === "Sem tema" ? "" : newTheme;
    t.updatedAt = Date.now();
    saveTasks();
    logActivity("updated", id, { title: t.title });
    closedThemeGroups.delete(newTheme);
    showToast(`Tarefa movida para "${newTheme}"`);
    renderBoard();
  }

  function renderThemeList(list) {
    const groups = {};
    const order = [];
    list.forEach((t) => {
      const key = t.category || "Sem tema";
      if (!(key in groups)) { groups[key] = []; order.push(key); }
      groups[key].push(t);
    });

    const emptyThemeNames = (loadCustomThemes()[currentSpace] || []).filter((name) => !(name in groups));
    emptyThemeNames.forEach((name) => { groups[name] = []; order.push(name); });

    if (order.length === 0) {
      themeListEl.innerHTML = `<div class="theme-empty">Nenhum tema por aqui. Clique em "+ Novo tema" para criar um.</div>`;
      return;
    }

    themeListEl.innerHTML = order.map((theme) => {
      const items = groups[theme];
      const doneCount = items.filter((t) => t.status === "done").length;
      const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
      const isOpen = !closedThemeGroups.has(theme);
      const isEmpty = items.length === 0;
      return `
      <details class="theme-group" data-theme="${escapeHtml(theme)}" ${isOpen ? "open" : ""}>
        <summary class="theme-group-header">
          <span class="chevron">▶</span>
          <input type="text" class="theme-group-title" value="${escapeHtml(theme)}" readonly />
          <button type="button" class="theme-group-edit" title="Renomear tema">✏️</button>
          <span class="theme-group-count">${doneCount}/${items.length} concluídas</span>
          <span class="theme-group-progress progress-bar"><span class="progress-bar-fill" style="display:block;width:${pct}%"></span></span>
          <button type="button" class="theme-group-add" title="Adicionar tarefa neste tema">+</button>
          ${isEmpty ? `<button type="button" class="theme-group-delete" title="Remover tema vazio">🗑️</button>` : ""}
        </summary>
        <div class="theme-rows">${items.length ? items.map(themeRowHTML).join("") : '<div class="theme-empty">Nenhuma tarefa neste tema ainda.</div>'}</div>
      </details>`;
    }).join("");

    $$(".theme-group").forEach((el) => {
      el.addEventListener("toggle", () => {
        const key = el.dataset.theme;
        if (el.open) closedThemeGroups.delete(key); else closedThemeGroups.add(key);
      });
      el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drop-target"); });
      el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drop-target");
        const dragging = $(".theme-row.dragging");
        if (!dragging) return;
        moveTaskToTheme(dragging.dataset.id, el.dataset.theme);
      });
    });
    $$(".theme-row").forEach((row) => {
      row.addEventListener("dragstart", () => row.classList.add("dragging"));
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
    });
    $$(".theme-row-title, .theme-row-meta").forEach((el) => {
      el.addEventListener("click", () => openTaskModal(el.closest(".theme-row").dataset.id));
    });
    $$(".theme-row-status").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.closest(".theme-row").dataset.id;
        const t = tasks.find((x) => x.id === id);
        if (!t) return;
        const nowComplete = t.status === "done";
        changeTaskStatus(id, nowComplete ? "todo" : "done");
      });
    });
    // Inline theme rename
    $$(".theme-group-title").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("mousedown", (e) => e.stopPropagation());
      const original = input.value;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
        if (e.key === "Escape") { input.value = original; input.readOnly = true; input.blur(); }
      });
      input.addEventListener("blur", () => {
        if (input.readOnly) return;
        input.readOnly = true;
        const newName = input.value.trim();
        if (!newName || newName === original) { input.value = original; renderBoard(); return; }
        renameThemeEverywhere(original, newName);
        showToast(`Tema renomeado para "${newName}"`);
        renderBoard();
      });
    });
    $$(".theme-group-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const details = btn.closest(".theme-group");
        if (!details.open) details.open = true;
        const input = details.querySelector(".theme-group-title");
        input.readOnly = false;
        input.focus();
        input.select();
      });
    });
    $$(".theme-group-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const theme = btn.closest(".theme-group").dataset.theme;
        removeCustomTheme(currentSpace, theme);
        closedThemeGroups.delete(theme);
        renderBoard();
      });
    });
    $$(".theme-group-add").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const theme = btn.closest(".theme-group").dataset.theme;
        openTaskModal(null, theme === "Sem tema" ? "" : theme);
      });
    });
  }

  $("#btnNewTheme").addEventListener("click", () => {
    const name = prompt("Nome do novo tema:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    addCustomTheme(currentSpace, trimmed);
    closedThemeGroups.delete(trimmed);
    renderBoard();
    showToast(`Tema "${trimmed}" criado`);
  });

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
    const isCompleteStatus = newStatus === "done";
    const wasCompleteStatus = prev === "done";
    if (isCompleteStatus && !wasCompleteStatus) t.completedAt = Date.now();
    if (!isCompleteStatus) t.completedAt = null;
    saveTasks();
    logActivity("status_change", id, { from: prev, to: newStatus, title: t.title });
    if (isCompleteStatus && !wasCompleteStatus && t.recurrence?.enabled) spawnRecurringTask(t);
    renderBoard();
  }

  // ---------- Recurring tasks ----------
  function toLocalISO(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function computeNextPeriodDate(period, refDateStr) {
    const ref = refDateStr ? new Date(refDateStr + "T00:00:00") : new Date();
    const y = ref.getFullYear();
    const m = ref.getMonth() + 1; // next month (0-based index for the month after ref's)
    if (period === "end") return toLocalISO(new Date(y, m + 1, 0)); // last day of next month
    return toLocalISO(new Date(y, m, 1)); // 1st day of next month
  }
  function spawnRecurringTask(sourceTask) {
    const period = sourceTask.recurrence?.period === "end" ? "end" : "start";
    const nextDue = computeNextPeriodDate(period, sourceTask.due);
    const now = Date.now();
    const newTask = {
      id: uid(),
      title: sourceTask.title,
      space: sourceTask.space,
      status: "todo",
      priority: sourceTask.priority,
      category: sourceTask.category,
      due: nextDue,
      dueTime: sourceTask.dueTime || null,
      description: sourceTask.description || "",
      subtasks: (sourceTask.subtasks || []).map((s) => ({ text: s.text, done: false })),
      comments: [],
      recurrence: { enabled: true, period },
      attachmentCount: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    tasks.unshift(newTask);
    saveTasks();
    logActivity("created", newTask.id, { title: newTask.title, recurring: true });
    showToast(`Tarefa recorrente: nova ocorrência criada para ${formatDateShort(nextDue)} 🔁`);
  }

  function updateTopStats() {
    const spaceTasks = tasks.filter((t) => (t.space || "todos") === currentSpace);
    const total = spaceTasks.length;
    const done = spaceTasks.filter((t) => t.status === "done").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    $("#statTotal").textContent = total;
    $("#statDone").textContent = done;
    $("#statRate").textContent = rate + "%";
    $("#statStreak").textContent = computeStreak();
  }

  function computeStreak(scopeTasks) {
    const source = scopeTasks || tasks;
    const doneDates = new Set(
      source.filter((t) => t.completedAt).map((t) => new Date(t.completedAt).toISOString().slice(0, 10))
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

  function openTaskModal(id, presetCategory) {
    currentTaskId = id || null;
    pendingAttachments = [];
    removedAttachmentIds = [];
    form.reset();
    $("#taskStatus").value = "todo";
    $("#taskPriority").value = "medium";
    $("#taskSpace").value = currentSpace;
    $("#attachmentList").innerHTML = "";
    $("#subtaskList").innerHTML = "";
    $("#commentList").innerHTML = "";
    $("#btnDeleteTask").classList.toggle("hidden", !id);
    $("#taskRecurring").checked = false;
    $("#taskRecurrencePeriod").value = "start";
    $("#recurrenceOptions").classList.add("hidden");

    if (id) {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      $("#taskId").value = t.id;
      $("#taskTitle").value = t.title;
      $("#taskSpace").value = t.space || "todos";
      $("#taskStatus").value = t.status;
      $("#taskPriority").value = t.priority;
      $("#taskCategory").value = t.category || "";
      $("#taskDue").value = t.due || "";
      $("#taskDueTime").value = t.dueTime || "";
      $("#taskDescription").value = t.description || "";
      $("#modalMeta").textContent = `Criada em ${new Date(t.createdAt).toLocaleDateString("pt-BR")}`;
      if (t.recurrence?.enabled) {
        $("#taskRecurring").checked = true;
        $("#taskRecurrencePeriod").value = t.recurrence.period || "start";
        $("#recurrenceOptions").classList.remove("hidden");
      }
      renderSubtasks(t.subtasks || []);
      renderComments(t.comments || []);
      loadAttachmentsForTask(t.id);
    } else {
      $("#taskId").value = "";
      if (presetCategory) $("#taskCategory").value = presetCategory;
      $("#modalMeta").textContent = "Nova tarefa";
      renderSubtasks([]);
      renderComments([]);
    }
    modal.classList.remove("hidden");
    setTimeout(() => $("#taskTitle").focus(), 50);
  }

  $("#taskRecurring").addEventListener("change", (e) => {
    $("#recurrenceOptions").classList.toggle("hidden", !e.target.checked);
  });

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

  // ---------- Google Tarefas integration ----------
  const LS_GOOGLE_CLIENT_ID = "ptasks_google_client_id_v1";
  function getEventWindow() {
    const dateVal = $("#taskDue").value;
    if (!dateVal) { showToast("Defina uma data para usar a agenda."); return null; }
    const timeVal = $("#taskDueTime").value || "09:00";
    const start = new Date(`${dateVal}T${timeVal}:00`);
    const end = new Date(start.getTime() + 60 * 60000);
    return { start, end };
  }
  function toIcsStamp(d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }

  function openGTasksConfigModal() {
    $("#gtasksClientId").value = localStorage.getItem(LS_GOOGLE_CLIENT_ID) || "";
    $("#gtasksConfigModal").classList.remove("hidden");
  }
  function closeGTasksConfigModal() { $("#gtasksConfigModal").classList.add("hidden"); }
  $("#btnGTasksConfig").addEventListener("click", openGTasksConfigModal);
  $("#btnCloseGTasksConfig").addEventListener("click", closeGTasksConfigModal);
  $("#btnCancelGTasksConfig").addEventListener("click", closeGTasksConfigModal);
  $("#gtasksConfigModal").addEventListener("click", (e) => { if (e.target.id === "gtasksConfigModal") closeGTasksConfigModal(); });
  $("#btnSaveGTasksConfig").addEventListener("click", () => {
    const val = $("#gtasksClientId").value.trim();
    if (val) localStorage.setItem(LS_GOOGLE_CLIENT_ID, val); else localStorage.removeItem(LS_GOOGLE_CLIENT_ID);
    gTasksTokenClient = null;
    closeGTasksConfigModal();
    showToast("Configuração salva ✅");
  });

  let gTasksTokenClient = null;
  function getGTasksTokenClient(clientId) {
    if (!gTasksTokenClient || gTasksTokenClient.__clientId !== clientId) {
      gTasksTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/tasks",
        callback: () => {},
      });
      gTasksTokenClient.__clientId = clientId;
    }
    return gTasksTokenClient;
  }

  $("#btnGTasks").addEventListener("click", () => {
    const clientId = localStorage.getItem(LS_GOOGLE_CLIENT_ID);
    if (!clientId) {
      showToast("Configure a conexão com o Google Tarefas primeiro (⚙️).");
      openGTasksConfigModal();
      return;
    }
    if (typeof google === "undefined" || !google.accounts) {
      showToast("Não foi possível carregar o login do Google. Verifique sua internet e tente de novo.");
      return;
    }
    const title = $("#taskTitle").value.trim() || "Tarefa";
    const notes = $("#taskDescription").value.trim();
    const dueVal = $("#taskDue").value;
    const due = dueVal ? `${dueVal}T00:00:00.000Z` : undefined;

    const client = getGTasksTokenClient(clientId);
    client.callback = async (resp) => {
      if (resp.error) {
        showToast("Não foi possível autorizar o acesso ao Google.");
        return;
      }
      try {
        const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
          method: "POST",
          headers: { Authorization: `Bearer ${resp.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title, notes: notes || undefined, due }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        showToast("Tarefa adicionada ao Google Tarefas ✅");
      } catch {
        showToast("Falha ao criar a tarefa no Google Tarefas.");
      }
    };
    client.requestAccessToken({ prompt: "" });
  });

  $("#btnIcs").addEventListener("click", () => {
    const win = getEventWindow();
    if (!win) return;
    const title = $("#taskTitle").value.trim() || "Tarefa";
    const details = ($("#taskDescription").value.trim() || "").replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Minhas Tarefas//PT-BR", "BEGIN:VEVENT",
      `UID:${uid()}@minhas-tarefas`,
      `DTSTAMP:${toIcsStamp(new Date())}`,
      `DTSTART:${toIcsStamp(win.start)}`,
      `DTEND:${toIcsStamp(win.end)}`,
      `SUMMARY:${title}`,
      details ? `DESCRIPTION:${details}` : "",
      "END:VEVENT", "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^\w\-]+/g, "_")}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- Save / Delete ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#taskId").value || uid();
    const isNew = !$("#taskId").value;
    const now = Date.now();

    let existing = tasks.find((t) => t.id === id);
    const wasCompleteStatus = existing ? existing.status === "done" : false;
    const status = $("#taskStatus").value;

    const task = existing || { id, createdAt: now, completedAt: null };
    task.title = $("#taskTitle").value.trim();
    task.space = $("#taskSpace").value;
    task.status = status;
    task.priority = $("#taskPriority").value;
    task.category = $("#taskCategory").value.trim();
    task.due = $("#taskDue").value || null;
    task.dueTime = $("#taskDueTime").value || null;
    task.description = $("#taskDescription").value.trim();
    task.subtasks = workingSubtasks;
    task.comments = workingComments;
    task.recurrence = $("#taskRecurring").checked
      ? { enabled: true, period: $("#taskRecurrencePeriod").value }
      : null;
    task.updatedAt = now;
    const isCompleteStatus = status === "done";
    if (isCompleteStatus && !task.completedAt) task.completedAt = now;
    if (!isCompleteStatus) task.completedAt = null;

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
    if (isCompleteStatus && !wasCompleteStatus && task.recurrence?.enabled) spawnRecurringTask(task);
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
    dataDropdownMenu.classList.add("hidden");
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
      dataDropdownMenu.classList.add("hidden");
    }
  });

  // ---------- Seed / Clear ----------
  $("#btnSeed").addEventListener("click", () => {
    if (tasks.length && !confirm("Adicionar tarefas de exemplo à sua lista atual?")) return;
    const now = Date.now();
    const day = 86400000;
    const samples = [
      { title: "Revisar relatório semanal", status: "todo", priority: "urgent", category: "Trabalho", space: "todos", due: todayISO(), description: "Conferir números antes de enviar." },
      { title: "Ir à academia", status: "doing", priority: "medium", category: "Saúde", space: "extra", due: null, description: "Treino de pernas." },
      { title: "Pagar contas", status: "todo", priority: "high", category: "Casa", space: "todos", due: todayISO(), description: "Água, luz e internet." },
      { title: "Ler 20 páginas", status: "done", priority: "low", category: "Pessoal", space: "extra", due: null, description: "Livro atual: hábitos." },
      { title: "Alinhamento com a Yás", status: "todo", priority: "high", category: "Gestão", space: "1on1", due: todayISO(), description: "Pauta: prioridades da semana e feedback." },
      { title: "Entregar protótipo do dashboard", status: "doing", priority: "urgent", category: "Produto", space: "entregaveis", due: todayISO(), description: "Enviar link e evidências de teste." },
      { title: "Ideias para o próximo sprint", status: "todo", priority: "low", category: "Pessoal", space: "anotacoes", due: null, description: "Brainstorm livre, revisar depois." },
      { title: "Campanha antiga arquivada", status: "canceled", priority: "low", category: "Trabalho", space: "entregaveis", due: null, description: "Projeto descontinuado." },
      { title: "Relatório trimestral", status: "done", priority: "medium", category: "Trabalho", space: "entregaveis", due: null, description: "Aprovado e enviado." },
    ];
    samples.forEach((s, i) => {
      const id = uid();
      const createdAt = now - (samples.length - i) * day;
      const isCompleteStatus = s.status === "done";
      const completedAt = isCompleteStatus ? createdAt + 3600000 : null;
      tasks.unshift({
        id, title: s.title, status: s.status, priority: s.priority, category: s.category, space: s.space,
        due: s.due, dueTime: null, description: s.description, subtasks: [], comments: [],
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
    const spaceFilter = $("#metricsSpace").value;
    const scoped = spaceFilter ? tasks.filter((t) => (t.space || "todos") === spaceFilter) : tasks;

    const total = scoped.length;
    const done = scoped.filter((t) => t.status === "done").length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const attCount = await AttachmentDB.countAll();

    $("#mTotal").textContent = total;
    $("#mDone").textContent = done;
    $("#mRate").textContent = rate + "%";
    $("#mStreak").textContent = computeStreak(scoped);
    $("#mAttachments").textContent = attCount;

    const completedWithTime = scoped.filter((t) => t.completedAt && t.createdAt);
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
    scoped.forEach((t) => {
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
    const statusCounts = { todo: 0, doing: 0, done: 0, canceled: 0 };
    scoped.forEach((t) => statusCounts[t.status]++);
    charts.status = new Chart($("#chartStatus"), {
      type: "doughnut",
      data: {
        labels: ["A fazer", "Em andamento", "Concluída", "Cancelada"],
        datasets: [{ data: [statusCounts.todo, statusCounts.doing, statusCounts.done, statusCounts.canceled], backgroundColor: [c.palette[3], c.palette[2], c.palette[1], c.palette[4]] }],
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    // Priority breakdown
    const prCounts = { urgent: 0, high: 0, medium: 0, low: 0 };
    scoped.forEach((t) => prCounts[t.priority]++);
    charts.priority = new Chart($("#chartPriority"), {
      type: "bar",
      data: {
        labels: ["Urgente", "Alta", "Média", "Baixa"],
        datasets: [{ label: "Tarefas", data: [prCounts.urgent, prCounts.high, prCounts.medium, prCounts.low], backgroundColor: ["#ff2d55", c.palette[3], c.palette[2], c.palette[1]] }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    // By category
    const catCounts = {};
    scoped.forEach((t) => { const k = t.category || "Sem categoria"; catCounts[k] = (catCounts[k] || 0) + 1; });
    const catLabels = Object.keys(catCounts);
    charts.category = new Chart($("#chartCategory"), {
      type: "pie",
      data: { labels: catLabels, datasets: [{ data: catLabels.map((k) => catCounts[k]), backgroundColor: catLabels.map((_, i) => c.palette[i % c.palette.length]) }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } },
    });

    // By space/tab
    const spaceCounts = {};
    scoped.forEach((t) => { const k = SPACE_LABEL[t.space || "todos"] || "Outro"; spaceCounts[k] = (spaceCounts[k] || 0) + 1; });
    const spaceLabels = Object.keys(spaceCounts);
    charts.space = new Chart($("#chartSpace"), {
      type: "pie",
      data: { labels: spaceLabels, datasets: [{ data: spaceLabels.map((k) => spaceCounts[k]), backgroundColor: spaceLabels.map((_, i) => c.palette[i % c.palette.length]) }] },
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
  $("#metricsSpace").addEventListener("change", () => renderDashboard());

  // ---------- Init ----------
  const topnavDate = $("#topnavDate");
  if (topnavDate) {
    topnavDate.textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }
  $("#spaceTitle").textContent = SPACE_LABEL[currentSpace] || currentSpace;
  setBoardMode(boardMode);
  checkDueReminders();
})();
