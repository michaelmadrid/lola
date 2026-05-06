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

  // ============ TODOS (in-memory only for V1) ============
  const list = document.getElementById('todo-list');
  const addZone = document.getElementById('add-todo-zone');

  function attachTodoBehavior(row) {
    const dot = row.querySelector('.todo__dot');
    const text = row.querySelector('.todo__text');
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.toggle('is-done');
    });
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addNewTodo(true); }
      if (e.key === 'Backspace' && text.textContent === '') {
        e.preventDefault();
        const prev = row.previousElementSibling;
        row.remove();
        if (prev && prev.classList.contains('todo')) {
          const prevText = prev.querySelector('.todo__text');
          prevText.focus();
          const range = document.createRange();
          range.selectNodeContents(prevText);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        }
      }
    });
  }
  function addNewTodo(focusIt = true) {
    const row = document.createElement('div');
    row.className = 'todo';
    row.innerHTML = `<span class="todo__dot"></span><span class="todo__text" contenteditable="true"></span>`;
    list.appendChild(row);
    attachTodoBehavior(row);
    if (focusIt) row.querySelector('.todo__text').focus();
  }
  addZone.addEventListener('click', () => addNewTodo(true));

  // ============ MISC ============
  // sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }
})();
