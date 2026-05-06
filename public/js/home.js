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
  const dayWeatherEl = document.getElementById('day-sum-weather');
  const dayActiveEl = document.getElementById('day-active');
  const dayIdleEl = document.getElementById('day-idle');
  const dayContextEl = document.getElementById('day-trip-context');
  const daySegmentsSection = document.getElementById('day-segments-section');
  const daySegmentsEl = document.getElementById('day-segments');

  let activeTrip = null;

  function updateDayDate() {
    const today = new Date();
    dayDateEl.textContent = util.formatLongDate(today);
  }
  updateDayDate();
  setInterval(updateDayDate, 60 * 60 * 1000);

  // Placeholder weather. Real weather API later.
  dayWeatherEl.textContent = '28° clear';

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
  //  - Backspace at start of non-empty row → merges into previous row.
  //  - Toggle checkbox → marks completed; stays visible today (greyed),
  //    auto-archives tomorrow on first fetch.
  //  - Arrow → opens fullscreen editor modal for that one todo.
  //  - Saves debounced ~500ms after typing stops.

  const list = document.getElementById('todo-list');
  const addZone = document.getElementById('add-todo-zone');

  // editor modal
  const todoEditor      = document.getElementById('todo-editor');
  const todoEditorText  = document.getElementById('todo-editor-text');
  const todoEditorClose = document.getElementById('todo-editor-close');
  const todoEditorSave  = document.getElementById('todo-editor-save');
  const todoEditorDel   = document.getElementById('todo-editor-delete');
  let editingTodoId = null;

  // local cache mirrors server. id → todo object.
  const todos = new Map();

  function rowFor(id) { return list.querySelector(`[data-id="${id}"]`); }

  function makeRow(todo) {
    const row = document.createElement('div');
    row.className = 'todo' + (todo.completed_at ? ' is-done' : '');
    row.setAttribute('data-id', todo.id);
    row.innerHTML = `
      <span class="todo__dot" role="checkbox" aria-checked="${!!todo.completed_at}" tabindex="-1"></span>
      <span class="todo__text" contenteditable="true" spellcheck="true"></span>
      <button class="todo__open" aria-label="Open editor" tabindex="-1">→</button>
    `;
    row.querySelector('.todo__text').textContent = todo.content || '';
    attachRowBehavior(row);
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

  function attachRowBehavior(row) {
    const id = parseInt(row.dataset.id, 10);
    const dot = row.querySelector('.todo__dot');
    const text = row.querySelector('.todo__text');
    const open = row.querySelector('.todo__open');

    // Toggle complete
    dot.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wasDone = row.classList.contains('is-done');
      row.classList.toggle('is-done');
      dot.setAttribute('aria-checked', !wasDone);
      try {
        const data = await api.patch('/api/todos/' + id, { completed: !wasDone });
        todos.set(id, data.todo);
      } catch (err) {
        // revert on failure
        row.classList.toggle('is-done');
        dot.setAttribute('aria-checked', wasDone);
        toast(err.message || 'Toggle failed');
      }
    });

    // Open fullscreen editor
    open.addEventListener('click', (e) => {
      e.stopPropagation();
      openTodoEditor(id);
    });

    // Typing — debounced save
    text.addEventListener('input', () => {
      schedulePatch(id, { content: text.textContent });
    });

    // Keys
    text.addEventListener('keydown', async (e) => {
      // Enter → new todo below
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // flush pending content first
        clearTimeout(patchTimers.get(id));
        try { await api.patch('/api/todos/' + id, { content: text.textContent }); } catch {}
        addNewTodoAfter(row, true);
      }
      // Backspace at empty → archive, focus prev
      else if (e.key === 'Backspace' && text.textContent === '') {
        e.preventDefault();
        const prev = row.previousElementSibling;
        // archive on the server (soft)
        try { await api.patch('/api/todos/' + id, { archived: true }); } catch {}
        row.remove();
        todos.delete(id);
        if (prev && prev.classList.contains('todo')) {
          const t = prev.querySelector('.todo__text');
          t.focus();
          // place cursor at end
          const range = document.createRange();
          range.selectNodeContents(t);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        }
      }
      // Down arrow at end → next row
      else if (e.key === 'ArrowDown') {
        const next = row.nextElementSibling;
        if (next && next.classList && next.classList.contains('todo')) {
          e.preventDefault();
          next.querySelector('.todo__text').focus();
        }
      }
      // Up arrow at start → previous row
      else if (e.key === 'ArrowUp') {
        const prev = row.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains('todo')) {
          e.preventDefault();
          prev.querySelector('.todo__text').focus();
        }
      }
    });
  }

  async function addNewTodoAfter(afterRow, focusIt = true) {
    try {
      const data = await api.post('/api/todos', { content: '' });
      todos.set(data.todo.id, data.todo);
      const row = makeRow(data.todo);
      if (afterRow && afterRow.nextSibling) {
        list.insertBefore(row, afterRow.nextSibling);
      } else {
        list.appendChild(row);
      }
      if (focusIt) row.querySelector('.todo__text').focus();
    } catch (err) {
      toast(err.message || 'Could not add');
    }
  }

  // Click empty zone below list → add a new todo
  addZone.addEventListener('click', () => {
    const last = list.lastElementChild;
    addNewTodoAfter(last, true);
  });

  // ===== Editor modal =====
  function openTodoEditor(id) {
    const todo = todos.get(id);
    if (!todo) return;
    editingTodoId = id;
    todoEditorText.value = todo.content || '';
    todoEditor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      todoEditorText.focus();
      todoEditorText.setSelectionRange(todoEditorText.value.length, todoEditorText.value.length);
    }, 50);
  }
  async function closeTodoEditor(save = true) {
    if (save && editingTodoId) {
      const newContent = todoEditorText.value;
      const todo = todos.get(editingTodoId);
      if (todo && todo.content !== newContent) {
        try {
          const data = await api.patch('/api/todos/' + editingTodoId, { content: newContent });
          todos.set(editingTodoId, data.todo);
          // reflect back into row
          const row = rowFor(editingTodoId);
          if (row) row.querySelector('.todo__text').textContent = newContent;
        } catch (err) {
          toast(err.message || 'Save failed');
        }
      }
    }
    todoEditor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingTodoId = null;
  }
  if (todoEditorClose) todoEditorClose.addEventListener('click', () => closeTodoEditor(true));
  if (todoEditorSave)  todoEditorSave.addEventListener('click', () => closeTodoEditor(true));
  if (todoEditorDel) {
    todoEditorDel.addEventListener('click', async () => {
      if (!editingTodoId) return;
      const id = editingTodoId;
      try {
        await api.patch('/api/todos/' + id, { archived: true });
      } catch (err) {
        toast(err.message || 'Delete failed');
      }
      const row = rowFor(id);
      if (row) row.remove();
      todos.delete(id);
      todoEditor.classList.remove('is-open');
      document.body.style.overflow = '';
      editingTodoId = null;
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && todoEditor && todoEditor.classList.contains('is-open')) {
      closeTodoEditor(true);
    }
  });

  async function loadTodos() {
    try {
      const data = await api.get('/api/todos');
      list.innerHTML = '';
      todos.clear();
      (data.todos || []).forEach(t => {
        todos.set(t.id, t);
        list.appendChild(makeRow(t));
      });
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
