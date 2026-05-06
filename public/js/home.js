/* =========================================================
   home.js — homepage behavior, wired to API
   ========================================================= */

(async function () {
  // Auth gate
  if (!api.isSignedIn()) {
    location.href = '/login.html';
    return;
  }

  // ============ DAY SUMMARY ============
  const dayDateEl = document.getElementById('day-sum-date');
  const dayDoyEl = document.getElementById('day-sum-doy');
  const dayActiveEl = document.getElementById('day-active');
  const dayIdleEl = document.getElementById('day-idle');
  const dayContextEl = document.getElementById('day-trip-context');
  const daySegmentsSection = document.getElementById('day-segments-section');
  const daySegmentsEl = document.getElementById('day-segments');

  let activeTrip = null;

  function updateDayDate() {
    const today = new Date();
    dayDateEl.textContent = util.formatLongDate(today);
    // Day of year (1-365 or 1-366)
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    const day = Math.floor(diff / 86400000);
    const total = ((today.getFullYear() % 4 === 0 && today.getFullYear() % 100 !== 0) || today.getFullYear() % 400 === 0) ? 366 : 365;
    if (dayDoyEl) {
      dayDoyEl.textContent = `Day ${String(day).padStart(3, '0')} / ${total}`;
    }
  }
  updateDayDate();
  setInterval(updateDayDate, 60 * 60 * 1000);

  async function loadActiveTrip() {
    try {
      const data = await api.get('/api/trips/active');
      activeTrip = data.trip;
      if (activeTrip) {
        renderActiveDay();
      } else {
        renderIdleDay();
      }
    } catch (err) {
      console.error('loadActiveTrip', err);
      renderIdleDay();
    }
  }

  async function renderActiveDay() {
    dayActiveEl.style.display = '';
    dayIdleEl.style.display = 'none';

    // Show trip context line
    const tripName = activeTrip.name;
    dayContextEl.textContent = tripName;

    // Load segments
    try {
      const data = await api.get('/api/trips/' + activeTrip.id);
      const today = new Date().toISOString().split('T')[0];

      // Find segments overlapping today
      const todaySegs = (data.segments || []).filter(s => {
        if (!s.date_start || !s.date_end) return false;
        return today >= s.date_start && today <= s.date_end;
      });

      if (todaySegs.length) {
        daySegmentsSection.style.display = '';
        daySegmentsEl.innerHTML = todaySegs.map(s => {
          const label = s.city_name || s.region_label || '—';
          return `<div class="segment">
            <div class="segment__route">${util.escapeHtml(label)}</div>
            <div class="segment__dates">${s.date_start} <span class="dash">—</span> ${s.date_end}</div>
          </div>`;
        }).join('');
      } else {
        daySegmentsSection.style.display = 'none';
      }
    } catch (err) {
      console.error('load segments', err);
      daySegmentsSection.style.display = 'none';
    }

    // Load today's note
    loadTodayNote();
  }

  // ============ IDLE STATE — prompt + SVG ============
  // Eno + Schmidt — Oblique Strategies. Loaded from oblique.js as window.OBLIQUE_STRATEGIES.
  const idlePrompts = (window.OBLIQUE_STRATEGIES && window.OBLIQUE_STRATEGIES.length)
    ? window.OBLIQUE_STRATEGIES
    : ['Trust in the you of now'];

  function renderIdleDay() {
    dayActiveEl.style.display = 'none';
    dayIdleEl.style.display = 'flex';
    // Random per page-load. (Switch to date-deterministic later if we want
    // "one per day" — for now random keeps it fresh on each visit.)
    const idx = Math.floor(Math.random() * idlePrompts.length);
    document.getElementById('idle-quote').textContent = idlePrompts[idx];
    document.getElementById('idle-num').textContent = String(idx + 1).padStart(3, '0');
  }

  loadActiveTrip();

  // ============ NOTE OVERLAY ============
  const noteOpen     = document.getElementById('note-open');
  const noteOverlay  = document.getElementById('note-overlay');
  const noteClose    = document.getElementById('note-close');
  const noteSave     = document.getElementById('note-save');
  const noteText     = document.getElementById('note-text');
  const noteDate     = document.getElementById('note-date');
  const notePreview  = document.getElementById('note-preview');
  let currentNoteId = null;

  async function loadTodayNote() {
    if (!noteOpen) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await api.get('/api/notes?date=' + today);
      const note = (data.notes || [])[0];
      if (note) {
        currentNoteId = note.id;
        noteText.value = note.content || '';
        const firstLine = (note.content || '').split('\n')[0].trim();
        notePreview.textContent = firstLine || 'write today';
        notePreview.classList.toggle('is-empty', !firstLine);
      } else {
        currentNoteId = null;
        noteText.value = '';
        notePreview.textContent = 'write today';
        notePreview.classList.add('is-empty');
      }
    } catch (err) {
      console.error('loadTodayNote', err);
    }
  }

  if (noteOpen) {
    noteOpen.addEventListener('click', () => {
      noteOverlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      noteDate.textContent = util.formatShortDate(new Date());
      setTimeout(() => {
        noteText.focus();
        noteText.setSelectionRange(noteText.value.length, noteText.value.length);
      }, 50);
    });
  }

  async function closeNote(save) {
    if (save !== false) {
      const content = noteText.value;
      const today = new Date().toISOString().split('T')[0];
      try {
        if (currentNoteId) {
          if (content.trim() === '') {
            await api.delete('/api/notes/' + currentNoteId);
            currentNoteId = null;
          } else {
            await api.patch('/api/notes/' + currentNoteId, { content });
          }
        } else if (content.trim() !== '') {
          const body = { content, date: today };
          if (activeTrip) body.trip_id = activeTrip.id;
          const data = await api.post('/api/notes', body);
          currentNoteId = data.note.id;
        }
      } catch (err) {
        console.error('save note', err);
        toast('Note save failed');
      }
    }
    const firstLine = noteText.value.split('\n')[0].trim();
    notePreview.textContent = firstLine || 'write today';
    notePreview.classList.toggle('is-empty', !firstLine);
    noteOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (noteClose) noteClose.addEventListener('click', () => closeNote(true));
  if (noteSave)  noteSave.addEventListener('click', () => closeNote(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && noteOverlay.classList.contains('is-open')) closeNote(true);
  });

  // ============ CAPTURE ============
  const input    = document.getElementById('capture-input');
  const send     = document.getElementById('capture-send');
  const tagsBox  = document.getElementById('capture-tags');

  function extractTags(text) {
    const matches = (text.match(/#[a-z0-9_-]+/gi) || []);
    return [...new Set(matches.map(t => t.toLowerCase().slice(1)))];
  }

  function renderLiveTags(text) {
    tagsBox.innerHTML = '';
    extractTags(text).forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag is-on';
      span.textContent = '#' + t;
      tagsBox.appendChild(span);
    });
  }

  input.addEventListener('input', () => {
    send.classList.toggle('is-on', !!input.value.trim());
    renderLiveTags(input.value);
  });

  async function saveCapture() {
    const text = input.value.trim();
    if (!text) return;
    try {
      send.classList.remove('is-on');
      input.value = '';
      tagsBox.innerHTML = '';
      await api.post('/api/saves', { text });
      await loadStream();
    } catch (err) {
      console.error('save', err);
      toast(err.message || 'Save failed');
      input.value = text;
    }
  }
  send.addEventListener('click', saveCapture);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveCapture(); }
  });

  // ============ STREAM ============
  const streamEl = document.getElementById('stream');
  const streamEmpty = document.getElementById('stream-empty');

  async function loadStream() {
    try {
      const data = await api.get('/api/saves?limit=30');
      renderStream(data.saves || []);
    } catch (err) {
      console.error('loadStream', err);
    }
  }

  function renderStream(saves) {
    if (!saves.length) {
      streamEl.innerHTML = '<div class="stream__empty">No saves yet. Type something above.</div>';
      return;
    }
    streamEl.innerHTML = saves.map(s => {
      const tagsLine = (s.tags && s.tags.length)
        ? s.tags.map(t => '#' + util.escapeHtml(t)).join(' · ')
        : '';
      return `<a class="stream__item" href="#" data-id="${s.id}">
        <div class="stream__body">
          <span class="stream__name">${util.escapeHtml(s.text)}</span>
          ${tagsLine ? `<span class="stream__meta">${tagsLine}</span>` : ''}
        </div>
        <span class="stream__when">${util.timeAgo(s.created_at)}</span>
      </a>`;
    }).join('');

    // Click stream item → no detail view yet, so do nothing for now
    streamEl.querySelectorAll('.stream__item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        // future: open save detail / promote to place
      });
    });
  }
  loadStream();
  // refresh stream every 5 minutes to update relative times
  setInterval(loadStream, 5 * 60 * 1000);

  // ============ TODOS (notes-app style, API-persisted) ============
  // Behaviour:
  //  - Each line is a contenteditable row with a checkbox.
  //  - Enter at end → creates a new empty todo, focus jumps there.
  //  - Backspace on empty row → archives that todo, focus to prior row.
  //  - Toggle checkbox → marks completed; stays today (greyed, sorts to bottom).
  //  - "↗" at top opens a fullscreen editor with all todos, same behavior, more room.
  //  - Saves debounced ~500ms.

  const list = document.getElementById('todo-list');
  const addZone = document.getElementById('add-todo-zone');
  const expandBtn = document.getElementById('todos-expand');

  // fullscreen editor
  const fs           = document.getElementById('todo-editor');
  const fsList       = document.getElementById('todo-fs-list');
  const fsAddZone    = document.getElementById('todo-fs-addzone');
  const fsClose      = document.getElementById('todo-editor-close');
  const fsDate       = document.getElementById('todo-fs-date');

  // local cache mirrors server. id → todo object.
  const todos = new Map();

  function rowFor(id) { return list.querySelector(`[data-id="${id}"]`); }
  function fsRowFor(id) { return fsList.querySelector(`[data-id="${id}"]`); }

  // Sort: open items first (by sort_order), completed at bottom (by completed_at desc).
  function sortedTodos() {
    const arr = Array.from(todos.values());
    arr.sort((a, b) => {
      const aDone = !!a.completed_at;
      const bDone = !!b.completed_at;
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (!aDone) return (a.sort_order || 0) - (b.sort_order || 0);
      // both done — most recently completed at top of done section
      return new Date(b.completed_at) - new Date(a.completed_at);
    });
    return arr;
  }

  // ----- Inline (home column) row -----
  function makeRow(todo) {
    const row = document.createElement('div');
    row.className = 'todo' + (todo.completed_at ? ' is-done' : '');
    row.setAttribute('data-id', todo.id);
    row.innerHTML = `
      <span class="todo__dot" role="checkbox" aria-checked="${!!todo.completed_at}" tabindex="-1"></span>
      <span class="todo__text" contenteditable="true" spellcheck="true"></span>
    `;
    row.querySelector('.todo__text').textContent = todo.content || '';
    attachRowBehavior(row, { fs: false });
    return row;
  }

  // ----- Fullscreen row (bigger, same behavior) -----
  function makeFsRow(todo) {
    const row = document.createElement('div');
    row.className = 'todo-fs__row' + (todo.completed_at ? ' is-done' : '');
    row.setAttribute('data-id', todo.id);
    row.innerHTML = `
      <span class="todo-fs__dot" role="checkbox" aria-checked="${!!todo.completed_at}" tabindex="-1"></span>
      <span class="todo-fs__text" contenteditable="true" spellcheck="true"></span>
    `;
    row.querySelector('.todo-fs__text').textContent = todo.content || '';
    attachRowBehavior(row, { fs: true });
    return row;
  }

  function renderAll() {
    list.innerHTML = '';
    fsList.innerHTML = '';
    const arr = sortedTodos();
    if (arr.length === 0) {
      // empty state — ghost row in both views
      list.appendChild(makeGhostRow(false));
      fsList.appendChild(makeGhostRow(true));
      return;
    }
    arr.forEach(t => {
      list.appendChild(makeRow(t));
      fsList.appendChild(makeFsRow(t));
    });
  }

  function makeGhostRow(isFs) {
    const row = document.createElement('div');
    row.className = (isFs ? 'todo-fs__row' : 'todo') + ' is-ghost';
    row.innerHTML = `
      <span class="${isFs ? 'todo-fs__dot' : 'todo__dot'}"></span>
      <span class="${isFs ? 'todo-fs__text' : 'todo__text'} is-ghost-text">type something…</span>
    `;
    row.addEventListener('click', async () => {
      const result = await addNewTodoAfter(null, false);
      if (result) {
        const r = isFs ? fsRowFor(result.todoId) : rowFor(result.todoId);
        if (r) r.querySelector(isFs ? '.todo-fs__text' : '.todo__text').focus();
      }
    });
    return row;
  }

  // Debounced patch — one timer per id
  const patchTimers = new Map();
  function schedulePatch(id, body, delay = 500) {
    clearTimeout(patchTimers.get(id));
    patchTimers.set(id, setTimeout(async () => {
      try {
        const data = await api.patch('/api/todos/' + id, body);
        todos.set(id, data.todo);
      } catch (err) {
        console.error('patch todo', err);
        toast(err.message || 'Save failed');
      }
    }, delay));
  }

  function attachRowBehavior(row, opts) {
    const isFs = !!opts.fs;
    const id = parseInt(row.dataset.id, 10);
    const dotSelector = isFs ? '.todo-fs__dot' : '.todo__dot';
    const textSelector = isFs ? '.todo-fs__text' : '.todo__text';
    const dot = row.querySelector(dotSelector);
    const text = row.querySelector(textSelector);

    // Toggle complete
    dot.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wasDone = row.classList.contains('is-done');
      try {
        const data = await api.patch('/api/todos/' + id, { completed: !wasDone });
        todos.set(id, data.todo);
        // Re-render to apply auto-sort (completed → bottom)
        renderAll();
      } catch (err) {
        toast(err.message || 'Toggle failed');
      }
    });

    // Typing — debounced save, mirror to twin row
    text.addEventListener('input', () => {
      const newText = text.textContent;
      // mirror to the other rendering of same todo
      const twin = isFs ? rowFor(id) : fsRowFor(id);
      if (twin) {
        const twinText = twin.querySelector(isFs ? '.todo__text' : '.todo-fs__text');
        if (twinText && twinText.textContent !== newText) twinText.textContent = newText;
      }
      schedulePatch(id, { content: newText });
    });

    // Keys
    text.addEventListener('keydown', async (e) => {
      // Enter → new todo below
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        clearTimeout(patchTimers.get(id));
        try { await api.patch('/api/todos/' + id, { content: text.textContent }); } catch {}
        // stash where we are
        const after = row;
        const newRow = await addNewTodoAfter(after, false);
        if (newRow) {
          // focus equivalent (fs or inline) row
          const focusRow = isFs ? fsRowFor(newRow.todoId) : rowFor(newRow.todoId);
          if (focusRow) {
            const t = focusRow.querySelector(textSelector);
            if (t) t.focus();
          }
        }
      }
      // Backspace at empty → archive, focus prev
      else if (e.key === 'Backspace' && text.textContent === '') {
        e.preventDefault();
        const prev = row.previousElementSibling;
        try { await api.patch('/api/todos/' + id, { archived: true }); } catch {}
        todos.delete(id);
        renderAll();
        // focus the previous row in same view
        if (prev && prev.dataset && prev.dataset.id) {
          const prevId = parseInt(prev.dataset.id, 10);
          const target = isFs ? fsRowFor(prevId) : rowFor(prevId);
          if (target) {
            const t = target.querySelector(textSelector);
            t.focus();
            // cursor at end
            const range = document.createRange();
            range.selectNodeContents(t);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges(); sel.addRange(range);
          }
        }
      }
      // Down arrow → next row
      else if (e.key === 'ArrowDown') {
        const next = row.nextElementSibling;
        if (next && next.dataset && next.dataset.id) {
          e.preventDefault();
          next.querySelector(textSelector).focus();
        }
      }
      // Up arrow → previous row
      else if (e.key === 'ArrowUp') {
        const prev = row.previousElementSibling;
        if (prev && prev.dataset && prev.dataset.id) {
          e.preventDefault();
          prev.querySelector(textSelector).focus();
        }
      }
    });
  }

  async function addNewTodoAfter(afterRow, focusIt = true) {
    try {
      const data = await api.post('/api/todos', { content: '' });
      todos.set(data.todo.id, data.todo);
      renderAll();
      const newId = data.todo.id;
      if (focusIt) {
        const r = rowFor(newId);
        if (r) r.querySelector('.todo__text').focus();
      }
      return { todoId: newId };
    } catch (err) {
      toast(err.message || 'Could not add');
    }
  }

  // Click empty zone below list → add a new todo
  addZone.addEventListener('click', () => addNewTodoAfter(null, true));
  fsAddZone.addEventListener('click', async () => {
    const result = await addNewTodoAfter(null, false);
    if (result) {
      const r = fsRowFor(result.todoId);
      if (r) r.querySelector('.todo-fs__text').focus();
    }
  });

  // ----- Expand to fullscreen -----
  function openFs() {
    fs.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    fsDate.textContent = new Date().toLocaleString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    // focus first open todo, or first row, or addzone
    setTimeout(() => {
      const firstOpen = fsList.querySelector('.todo-fs__row:not(.is-done) .todo-fs__text');
      if (firstOpen) firstOpen.focus();
    }, 50);
  }
  function closeFs() {
    fs.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  if (expandBtn) expandBtn.addEventListener('click', openFs);
  if (fsClose) fsClose.addEventListener('click', closeFs);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fs && fs.classList.contains('is-open')) closeFs();
  });

  async function loadTodos() {
    try {
      const data = await api.get('/api/todos');
      todos.clear();
      (data.todos || []).forEach(t => todos.set(t.id, t));
      renderAll();
    } catch (err) {
      console.error('load todos', err);
    }
  }
  loadTodos();

  // ============ MISC ============
  // sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }
})();
