/* ============================================================
   Nova — Premium To-Do App
   Pure vanilla JS. LocalStorage persistence, drag & drop,
   filters, search, modal, toasts, theme toggle.
   ============================================================ */

(() => {
  'use strict';

  // ---------- State / Storage ("backend") ----------
  const STORAGE_KEY = 'nova.tasks.v2';
  const LEGACY_KEYS = ['lumen.tasks.v1', 'nova.tasks.v1'];
  const THEME_KEY = 'nova.theme';
  const SCHEMA_VERSION = 2;

  const PRIORITIES = ['low', 'medium', 'high'];
  const CATEGORIES = ['personal', 'study', 'work', 'other'];

  /** Minimal repository pattern — single source of truth for task persistence. */
  const Store = {
    read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks.map(sanitize).filter(Boolean);
        }
        for (const k of LEGACY_KEYS) {
          const legacy = localStorage.getItem(k);
          if (legacy) {
            const arr = JSON.parse(legacy);
            if (Array.isArray(arr)) {
              const migrated = arr.map(sanitize).filter(Boolean);
              this.write(migrated);
              localStorage.removeItem(k);
              return migrated;
            }
          }
        }
      } catch (err) { console.warn('[Nova] storage read failed:', err); }
      const seeded = seed();
      this.write(seeded);
      return seeded;
    },
    write(list) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, tasks: list, updatedAt: Date.now() }));
      } catch (err) {
        console.error('[Nova] storage write failed:', err);
      }
    },
  };

  /** Validate + normalize a task record. Returns null if unrecoverable. */
  function sanitize(t) {
    if (!t || typeof t !== 'object') return null;
    const title = String(t.title || '').trim().slice(0, 200);
    if (!title) return null;
    return {
      id: typeof t.id === 'string' && t.id ? t.id : uid(),
      title,
      desc: String(t.desc || '').slice(0, 2000),
      date: typeof t.date === 'string' ? t.date : '',
      time: typeof t.time === 'string' ? t.time : '',
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
      category: CATEGORIES.includes(t.category) ? t.category : 'work',
      done: Boolean(t.done),
      createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
      updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : Date.now(),
    };
  }

  /** @type {ReturnType<typeof sanitize>[]} */
  let tasks = Store.read();
  let activeFilter = 'all';
  let searchQuery = '';
  let editingId = null;
  let pendingDeleteId = null;
  let dragId = null;

  // ---------- Elements ----------
  const $ = (s) => document.querySelector(s);
  const taskList = $('#taskList');
  const emptyState = $('#emptyState');
  const searchInput = $('#searchInput');
  const newTaskBtn = $('#newTaskBtn');
  const modal = $('#modal');
  const taskForm = $('#taskForm');
  const closeModal = $('#closeModal');
  const cancelModal = $('#cancelModal');
  const confirmEl = $('#confirm');
  const cancelDel = $('#cancelDel');
  const confirmDel = $('#confirmDel');
  const themeToggle = $('#themeToggle');
  const menuBtn = $('#menuBtn');
  const sidebar = $('#sidebar');

  // ---------- Init ----------
  initTheme();
  attachEvents();
  render();

  // Cross-tab sync — if user edits in another tab, reflect here
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { tasks = Store.read(); render(); }
  });

  // ---------- Persistence ----------
  function save() { Store.write(tasks); }
  function seed() {
    const now = Date.now();
    const inDays = (d) => { const x = new Date(); x.setDate(x.getDate()+d); return x.toISOString().slice(0,10); };
    return [
      { id: uid(), title: 'Design onboarding flow', desc: 'Three-step intro for new users with progress indicator.', date: inDays(1), time: '10:00', priority: 'high', category: 'work', done: false, createdAt: now-1000, updatedAt: now-1000 },
      { id: uid(), title: 'Read chapter 4 — Atomic Habits', desc: '', date: inDays(2), time: '20:00', priority: 'medium', category: 'study', done: false, createdAt: now-800, updatedAt: now-800 },
      { id: uid(), title: 'Weekly meal prep', desc: 'Plan groceries and prep lunches for the week.', date: inDays(0), time: '18:30', priority: 'low', category: 'personal', done: true, createdAt: now-600, updatedAt: now-600 },
    ];
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem(THEME_KEY, cur);
    toast(`${cur === 'dark' ? '🌙' : '☀️'} ${cur[0].toUpperCase()+cur.slice(1)} mode`, 'info');
  }

  // ---------- Events ----------
  function attachEvents() {
    newTaskBtn.addEventListener('click', () => openModal());
    closeModal.addEventListener('click', closeTaskModal);
    cancelModal.addEventListener('click', closeTaskModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeTaskModal(); });
    taskForm.addEventListener('submit', onSubmit);

    cancelDel.addEventListener('click', () => { confirmEl.hidden = true; pendingDeleteId = null; });
    confirmDel.addEventListener('click', onConfirmDelete);
    confirmEl.addEventListener('click', (e) => { if (e.target === confirmEl) { confirmEl.hidden = true; pendingDeleteId = null; } });

    searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase().trim(); renderList(); });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        $('#sectionTitle').textContent = btn.textContent.trim().replace(/\s+\d+$/, '');
        renderList();
        if (window.innerWidth <= 820) sidebar.classList.remove('open');
      });
    });

    themeToggle.addEventListener('click', toggleTheme);
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeTaskModal(); confirmEl.hidden = true; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInput.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openModal(); }
    });

    // Ripples
    document.addEventListener('click', (e) => {
      const t = e.target.closest('.ripple');
      if (!t) return;
      const rect = t.getBoundingClientRect();
      const r = document.createElement('span');
      r.className = 'rip';
      const size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + 'px';
      r.style.left = (e.clientX - rect.left - size/2) + 'px';
      r.style.top  = (e.clientY - rect.top  - size/2) + 'px';
      t.appendChild(r);
      setTimeout(() => r.remove(), 650);
    });
  }

  // ---------- Modal ----------
  function openModal(id = null) {
    editingId = id;
    $('#modalTitle').textContent = id ? 'Edit Task' : 'New Task';
    $('#saveBtn').textContent = id ? 'Update Task' : 'Save Task';
    if (id) {
      const t = tasks.find(x => x.id === id);
      $('#fTitle').value = t.title;
      $('#fDesc').value = t.desc || '';
      $('#fDate').value = t.date || '';
      $('#fTime').value = t.time || '';
      $('#fPriority').value = t.priority;
      $('#fCategory').value = t.category;
    } else {
      taskForm.reset();
      $('#fPriority').value = 'medium';
      $('#fCategory').value = 'work';
    }
    modal.hidden = false;
    setTimeout(() => $('#fTitle').focus(), 50);
  }
  function closeTaskModal() { modal.hidden = true; editingId = null; }

  function onSubmit(e) {
    e.preventDefault();
    const data = {
      title: $('#fTitle').value.trim(),
      desc: $('#fDesc').value.trim(),
      date: $('#fDate').value,
      time: $('#fTime').value,
      priority: $('#fPriority').value,
      category: $('#fCategory').value,
    };
    if (!data.title) { toast('Please enter a title', 'warn'); return; }

    if (editingId) {
      const i = tasks.findIndex(t => t.id === editingId);
      if (i < 0) { toast('Task no longer exists', 'error'); closeTaskModal(); return; }
      tasks[i] = sanitize({ ...tasks[i], ...data, updatedAt: Date.now() });
      toast('Task updated', 'success');
    } else {
      const created = sanitize({ id: uid(), done: false, createdAt: Date.now(), updatedAt: Date.now(), ...data });
      if (!created) { toast('Invalid task data', 'error'); return; }
      tasks.unshift(created);
      toast('Task added', 'success');
    }
    save(); closeTaskModal(); render();
  }

  // ---------- Actions ----------
  function toggleDone(id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    t.done = !t.done;
    save(); render();
    toast(t.done ? 'Marked as completed 🎉' : 'Moved back to pending', t.done ? 'success' : 'info');
  }
  function askDelete(id) { pendingDeleteId = id; confirmEl.hidden = false; }
  function onConfirmDelete() {
    if (!pendingDeleteId) return;
    tasks = tasks.filter(t => t.id !== pendingDeleteId);
    pendingDeleteId = null;
    confirmEl.hidden = true;
    save(); render();
    toast('Task deleted', 'error');
  }

  // ---------- Filtering ----------
  function getFiltered() {
    return tasks.filter(t => {
      if (searchQuery) {
        const hay = `${t.title} ${t.desc} ${t.category}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      switch (activeFilter) {
        case 'all': return true;
        case 'pending': return !t.done;
        case 'completed': return t.done;
        case 'high': case 'medium': case 'low': return t.priority === activeFilter;
        case 'cat-personal': return t.category === 'personal';
        case 'cat-study':    return t.category === 'study';
        case 'cat-work':     return t.category === 'work';
        case 'cat-other':    return t.category === 'other';
        default: return true;
      }
    });
  }

  // ---------- Render ----------
  function render() { renderStats(); renderList(); renderCounts(); }

  function renderStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    const pending = total - done;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#statTotal').textContent = total;
    $('#statPending').textContent = pending;
    $('#statCompleted').textContent = done;
    $('#statPct').textContent = pct;
    $('#progressFill').style.width = pct + '%';
    $('#progressFill2').style.width = pct + '%';
    $('#progressPct').textContent = pct + '%';
  }

  function renderCounts() {
    $('[data-count="all"]').textContent = tasks.length;
    $('[data-count="pending"]').textContent = tasks.filter(t => !t.done).length;
    $('[data-count="completed"]').textContent = tasks.filter(t => t.done).length;
  }

  function renderList() {
    const items = getFiltered();
    taskList.innerHTML = '';
    if (!items.length) {
      emptyState.hidden = false;
      $('#sectionSub').textContent = '0 tasks';
      return;
    }
    emptyState.hidden = true;
    $('#sectionSub').textContent = `${items.length} task${items.length !== 1 ? 's' : ''} • drag to reorder`;

    const frag = document.createDocumentFragment();
    items.forEach(t => frag.appendChild(buildCard(t)));
    taskList.appendChild(frag);
  }

  function buildCard(t) {
    const li = document.createElement('li');
    li.className = 'task-card' + (t.done ? ' done' : '');
    li.draggable = true;
    li.dataset.id = t.id;

    const dueBadge = renderDue(t);
    li.innerHTML = `
      <button class="check" aria-label="Toggle complete">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="t-main">
        <h4 class="t-title"></h4>
        ${t.desc ? `<p class="t-desc"></p>` : ''}
        <div class="t-meta">
          <span class="badge ${t.priority}">${cap(t.priority)} Priority</span>
          <span class="badge cat">${categoryIcon(t.category)} ${cap(t.category)}</span>
          ${dueBadge}
        </div>
      </div>
      <div class="t-actions">
        <button class="edit" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="2"/></svg></button>
        <button class="del" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`;

    // Safe text injection
    li.querySelector('.t-title').textContent = t.title;
    if (t.desc) li.querySelector('.t-desc').textContent = t.desc;

    li.querySelector('.check').addEventListener('click', () => toggleDone(t.id));
    li.querySelector('.edit').addEventListener('click', () => openModal(t.id));
    li.querySelector('.del').addEventListener('click', () => askDelete(t.id));

    // Drag & drop
    li.addEventListener('dragstart', () => { dragId = t.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); document.querySelectorAll('.task-card.drag-over').forEach(el => el.classList.remove('drag-over')); });
    li.addEventListener('dragover', (e) => { e.preventDefault(); if (dragId && dragId !== t.id) li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault(); li.classList.remove('drag-over');
      if (!dragId || dragId === t.id) return;
      const from = tasks.findIndex(x => x.id === dragId);
      const to   = tasks.findIndex(x => x.id === t.id);
      if (from < 0 || to < 0) return;
      const [moved] = tasks.splice(from, 1);
      tasks.splice(to, 0, moved);
      save(); render();
    });

    return li;
  }

  // ---------- Helpers ----------
  function renderDue(t) {
    if (!t.date) return '';
    const dt = new Date(`${t.date}T${t.time || '23:59'}`);
    const overdue = !t.done && dt.getTime() < Date.now();
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(t.date); target.setHours(0,0,0,0);
    const diff = Math.round((target - today) / 86400000);
    let label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Tomorrow';
    else if (diff === -1) label = 'Yesterday';
    else label = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (t.time) label += ` · ${formatTime(t.time)}`;
    return `<span class="badge due ${overdue ? 'overdue' : ''}">🗓 ${label}${overdue ? ' · Overdue' : ''}</span>`;
  }
  function formatTime(hm) {
    const [h, m] = hm.split(':').map(Number);
    const am = h < 12; const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m).padStart(2,'0')} ${am ? 'AM' : 'PM'}`;
  }
  function categoryIcon(c) { return ({ personal:'🌿', study:'📚', work:'💼', other:'✨' })[c] || '✨'; }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  // ---------- Toasts ----------
  function toast(msg, kind = 'info') {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<span class="tdot"></span><span></span>`;
    el.querySelector('span:last-child').textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
  }
})();
