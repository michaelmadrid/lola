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

  // Trip strip (active state)
  const tripStripEl     = document.getElementById('trip-strip');
  const tripStripName   = document.getElementById('trip-strip-name');
  const tripStripArc    = document.getElementById('trip-strip-arc');
  const tripStripDates  = document.getElementById('trip-strip-dates');
  const tripNowEl       = document.getElementById('trip-now');
  const tripNowToday    = document.getElementById('trip-now-today');
  const tripNowTodayVal = document.getElementById('trip-now-today-value');
  const tripNowNext     = document.getElementById('trip-now-next');
  const tripNowNextVal  = document.getElementById('trip-now-next-value');

  let activeTrip = null;
  let activeSegments = [];

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
      const data = await api.get('/api/trips/next');
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

    // Strip top line: name
    tripStripName.textContent = activeTrip.name;

    // Compact date range "5/12 → 6/24" for the strip — fits on one line
    function shortDate(s) {
      if (!s) return '';
      const d = new Date(s);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    const ds = shortDate(activeTrip.date_start);
    const de = shortDate(activeTrip.date_end);
    tripStripDates.textContent = (ds && de) ? `${ds} → ${de}` : (ds || '');

    // Load segments and compute today/next
    try {
      const data = await api.get('/api/trips/' + activeTrip.id);
      activeSegments = (data.segments || []).filter(s => s.date_start);
      activeSegments.sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));

      // We removed the arc — one line is enough. Hide it.
      tripStripArc.textContent = '';
      tripStripArc.style.display = 'none';
      const sepEl = document.getElementById('trip-strip-sep');
      if (sepEl) sepEl.style.display = 'none';

      const today = new Date().toISOString().split('T')[0];
      const isUpcoming = activeTrip.phase === 'upcoming';

      // Single contextual phrase below the strip
      let phrase = '';
      if (isUpcoming) {
        const firstSeg = activeSegments[0];
        const firstStart = firstSeg ? firstSeg.date_start : activeTrip.date_start;
        if (firstStart) {
          const days = Math.ceil((new Date(firstStart) - new Date(today)) / 86400000);
          if (days === 0)      phrase = 'depart today';
          else if (days === 1) phrase = 'depart tomorrow';
          else                 phrase = `depart in ${days} days`;
        }
      } else {
        const todaySeg = activeSegments.find(s =>
          s.date_start && s.date_end && today >= s.date_start && today <= s.date_end
        );
        const futureSegs = activeSegments.filter(s => s.date_start > today);
        const nextSeg = futureSegs[0];

        if (todaySeg) {
          const label = todaySeg.city_name || todaySeg.region_label || '—';
          const dayInfo = computeDayInfo(todaySeg, today);
          phrase = dayInfo ? `${label} · ${dayInfo}` : label;
        } else if (nextSeg) {
          const label = nextSeg.city_name || nextSeg.region_label || '—';
          const arr = nextSeg.date_start ? util.formatNumericDate(nextSeg.date_start) : '';
          phrase = arr ? `next · ${label} · ${arr}` : `next · ${label}`;
        }
      }

      if (phrase) {
        tripNowToday.style.display = '';
        tripNowTodayVal.textContent = phrase;
        // hide the label column entirely — the phrase is self-describing
        const lbl = tripNowToday.querySelector('.trip-now__label');
        if (lbl) lbl.style.display = 'none';
        tripNowNext.style.display = 'none';
        tripNowEl.style.display = '';
      } else {
        tripNowEl.style.display = 'none';
      }
    } catch (err) {
      console.error('load segments', err);
      tripNowEl.style.display = 'none';
    }
  }

  // For "day 3 of 5" style hints when in an active segment
  function computeDayInfo(seg, today) {
    if (!seg.date_start || !seg.date_end) return null;
    const start = new Date(seg.date_start);
    const end   = new Date(seg.date_end);
    const cur   = new Date(today);
    const totalDays = Math.round((end - start) / 86400000) + 1;
    const dayN      = Math.round((cur - start) / 86400000) + 1;
    if (totalDays < 2) return null;
    return `day ${dayN} of ${totalDays}`;
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

  // ============ ITINERARY OVERLAY ============
  const itinOverlay   = document.getElementById('itin-overlay');
  const itinClose     = document.getElementById('itin-close');
  const itinTitle     = document.getElementById('itin-title');
  const itinDates     = document.getElementById('itin-dates');
  const itinMeta      = document.getElementById('itin-meta');
  const itinSegments  = document.getElementById('itin-segments');
  const itinEditLink  = document.getElementById('itin-edit-link');

  function openItinerary() {
    if (!activeTrip) return;

    itinTitle.textContent = activeTrip.name;
    const ds = activeTrip.date_start ? util.formatLongDate(activeTrip.date_start) : '';
    const de = activeTrip.date_end   ? util.formatLongDate(activeTrip.date_end)   : '';
    itinDates.textContent = (ds && de) ? `${ds} — ${de}` : (ds || '');

    // Owner attribution if not yours
    if (activeTrip.owner_name && !activeTrip.is_owner) {
      itinMeta.textContent = `${activeTrip.owner_name}'s trip`;
    } else {
      itinMeta.textContent = '';
    }

    // Trip-level notes
    const itinTripNotesEl = document.getElementById('itin-trip-notes');
    if (itinTripNotesEl) {
      if (activeTrip.notes && activeTrip.notes.trim()) {
        itinTripNotesEl.innerHTML = util.safeMarkdown(activeTrip.notes);
        itinTripNotesEl.style.display = '';
      } else {
        itinTripNotesEl.innerHTML = '';
        itinTripNotesEl.style.display = 'none';
      }
    }

    // Render segments as a vertical timeline
    if (!activeSegments.length) {
      itinSegments.innerHTML = '<p class="itin-fs__empty">No stops yet.</p>';
    } else {
      itinSegments.innerHTML = activeSegments.map(s => {
        const label = s.city_name || s.region_label || '—';
        const arr = s.date_start ? util.formatLongDate(s.date_start) : '';
        const dep = s.date_end   ? util.formatLongDate(s.date_end)   : '';
        const nights = (s.date_start && s.date_end)
          ? Math.max(0, Math.round((new Date(s.date_end) - new Date(s.date_start)) / 86400000))
          : null;
        const nightsLabel = nights !== null
          ? `${nights} ${nights === 1 ? 'night' : 'nights'}`
          : '';
        const isToday = s.date_start && s.date_end &&
          (new Date().toISOString().split('T')[0] >= s.date_start &&
           new Date().toISOString().split('T')[0] <= s.date_end);
        const notes = s.notes
          ? `<p class="itin-fs__seg-notes">${util.safeMarkdown(s.notes)}</p>`
          : '';
        return `<article class="itin-fs__seg${isToday ? ' is-here' : ''}">
          <div class="itin-fs__seg-date">${arr || '—'}</div>
          <div class="itin-fs__seg-body">
            <h3 class="itin-fs__seg-name">${util.escapeHtml(label)}</h3>
            <div class="itin-fs__seg-meta">
              ${nightsLabel ? `<span>${nightsLabel}</span>` : ''}
              ${dep ? `<span>→ ${dep}</span>` : ''}
              ${isToday ? '<span class="itin-fs__here">you are here</span>' : ''}
            </div>
            ${notes}
          </div>
        </article>`;
      }).join('');
    }

    // Edit link points to trip page
    itinEditLink.href = '/trip.html?id=' + activeTrip.id;

    itinOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeItinerary() {
    itinOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  if (tripStripEl) tripStripEl.addEventListener('click', openItinerary);
  if (itinClose)   itinClose.addEventListener('click', closeItinerary);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && itinOverlay && itinOverlay.classList.contains('is-open')) {
      closeItinerary();
    }
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
      autoGrow();
      tagsBox.innerHTML = '';

      // Show a ghost row immediately so the stream visibly responds.
      // It's a generic blank pulse — NOT an echo of the raw text.
      injectGhostRow();

      await api.post('/api/saves', { text });
      // Wait a beat for AI parse to land before reloading from server
      setTimeout(() => loadStream(), 2500);
      setTimeout(() => loadStream(), 6000);
    } catch (err) {
      console.error('save', err);
      toast(err.message || 'Save failed');
      input.value = text;
      autoGrow();
      // Ensure we clean up the ghost on failure
      const ghost = streamEl.querySelector('.stream__ghost');
      if (ghost) ghost.remove();
    }
  }

  // Inject a generic pulsing ghost row at the top of the stream while AI parses.
  // No raw text echo — just shape, so user sees something is happening.
  function injectGhostRow() {
    // Remove the empty state if present
    const empty = streamEl.querySelector('.stream__empty');
    if (empty) empty.remove();

    const ghost = document.createElement('div');
    ghost.className = 'stream__item stream__ghost';
    ghost.innerHTML = `
      <div class="stream__body">
        <span class="stream__ghost-bar stream__ghost-bar--name"></span>
        <span class="stream__ghost-bar stream__ghost-bar--tip"></span>
        <span class="stream__ghost-bar stream__ghost-bar--meta"></span>
      </div>
      <span class="stream__when">…</span>
    `;
    streamEl.insertBefore(ghost, streamEl.firstChild);
  }

  // Auto-grow textarea: shrink to one line when empty, expand up to ~6 lines
  function autoGrow() {
    input.style.height = 'auto';
    const max = 6 * parseFloat(getComputedStyle(input).lineHeight || 22);
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
  }
  input.addEventListener('input', autoGrow);
  autoGrow();

  send.addEventListener('click', saveCapture);
  input.addEventListener('keydown', (e) => {
    // Enter alone → submit. Shift+Enter → insert newline (default).
    // Cmd/Ctrl+Enter → also submit (already handled by global shortcut elsewhere).
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      saveCapture();
    }
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
      const hasPlace = s.place_name && s.place_name.trim();
      const isPending = !s.ai_parsed_at && !s.ai_parse_error;

      // Build the quiet metadata line: "drink · bali" or just "bali" or just "drink"
      const cityNames = (s.attached_cities || []).map(c => c.name.toLowerCase());
      const metaParts = [];
      if (s.category) metaParts.push(s.category);
      if (cityNames.length) metaParts.push(cityNames.join(' · '));
      const metaLine = metaParts.length
        ? `<span class="stream__meta">${util.escapeHtml(metaParts.join(' · '))}</span>`
        : '';

      const tagsLine = (s.tags && s.tags.length)
        ? `<span class="stream__meta">${s.tags.map(t => '#' + util.escapeHtml(t)).join(' · ')}</span>`
        : '';

      let bodyHtml;
      if (hasPlace) {
        const tipLine = s.tip
          ? `<span class="stream__tip">${util.escapeHtml(s.tip)}</span>`
          : '';
        bodyHtml = `
          <span class="stream__name">${util.escapeHtml(s.place_name)}</span>
          ${tipLine}
          ${metaLine}
        `;
      } else {
        const pendingBadge = isPending ? `<span class="stream__pending">…</span>` : '';
        bodyHtml = `
          <span class="stream__name stream__name--raw">${util.escapeHtml(s.text)} ${pendingBadge}</span>
          ${metaLine || tagsLine}
        `;
      }

      return `<div class="stream__item${hasPlace ? ' is-structured' : ''}" data-id="${s.id}">
        <div class="stream__body">
          ${bodyHtml}
        </div>
        <span class="stream__when">${util.timeAgo(s.created_at)}</span>
      </div>`;
    }).join('');
  }
  loadStream();
  // refresh stream every 5 minutes to update relative times AND pick up async-parsed structures
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
    // Update the Map optimistically with the new body so renderAll sees latest content
    const existing = todos.get(id);
    if (existing) todos.set(id, { ...existing, ...body });
    patchTimers.set(id, setTimeout(async () => {
      // If the todo was deleted while debounce was waiting, skip
      if (!todos.has(id)) return;
      try {
        const data = await api.patch('/api/todos/' + id, body);
        if (data && data.todo) todos.set(id, data.todo);
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
        // Save current content into the Map BEFORE the addNewTodoAfter triggers renderAll
        const currentContent = text.textContent;
        const local = todos.get(id);
        if (local) todos.set(id, { ...local, content: currentContent });
        try {
          const data = await api.patch('/api/todos/' + id, { content: currentContent });
          if (data && data.todo) todos.set(id, data.todo);
        } catch (err) {
          console.error('save todo on enter', err);
          toast(err.message || 'Save failed');
        }
        const after = row;
        const newRow = await addNewTodoAfter(after, false);
        if (newRow) {
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
        try { await api.patch('/api/todos/' + id, { archived: true }); } catch (err) { console.error(err); }
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
      // Local-midnight cutoff: completed-before-today gets hidden in user's local TZ.
      // Server may not have archived them yet (UTC vs local mismatch on rollover day).
      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);
      (data.todos || []).forEach(t => {
        if (t.completed_at) {
          const completedDate = new Date(t.completed_at);
          if (completedDate < localMidnight) return; // hide; rolled over
        }
        todos.set(t.id, t);
      });
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
