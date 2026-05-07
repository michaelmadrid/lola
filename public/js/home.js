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

  // Click the date heading to open the year-view overlay
  dayDateEl.style.cursor = 'pointer';
  dayDateEl.setAttribute('role', 'button');
  dayDateEl.setAttribute('tabindex', '0');
  dayDateEl.setAttribute('aria-label', 'Open year calendar');
  function openYearOverlay() {
    const overlay = document.getElementById('year-overlay');
    if (!overlay) return;
    renderYearGrid();
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeYearOverlay() {
    const overlay = document.getElementById('year-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  dayDateEl.addEventListener('click', openYearOverlay);
  dayDateEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openYearOverlay(); }
  });
  // Close handlers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeYearOverlay();
  });
  // Wire close button after DOM ready
  setTimeout(() => {
    const closeBtn = document.getElementById('year-overlay-close');
    if (closeBtn) closeBtn.addEventListener('click', closeYearOverlay);
    const overlay = document.getElementById('year-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        // Click on the overlay backdrop (not inner content) closes
        if (e.target === overlay) closeYearOverlay();
      });
    }
  }, 0);

  // ---------- Year overlay rendering ----------
  function renderYearGrid() {
    const monthsEl = document.getElementById('year-months');
    if (!monthsEl) return;

    const today = new Date();
    const year = today.getFullYear();
    const titleEl = document.getElementById('year-overlay-title');
    if (titleEl) titleEl.textContent = String(year);

    // Trip dates from the active trip — for blue underline
    const tripStart = activeTrip && activeTrip.date_start ? activeTrip.date_start.slice(0, 10) : null;
    const tripEnd   = activeTrip && activeTrip.date_end   ? activeTrip.date_end.slice(0, 10)   : null;

    function isInTrip(year, month, day) {
      if (!tripStart || !tripEnd) return false;
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return ymd >= tripStart && ymd <= tripEnd;
    }

    let html = '';
    for (let m = 0; m < 12; m++) {
      const firstDay = new Date(year, m, 1);
      const startCol = firstDay.getDay();
      const daysInMonth = new Date(year, m + 1, 0).getDate();

      let grid = '';
      for (let i = 0; i < startCol; i++) {
        grid += `<span class="ym__cell ym__cell--empty"></span>`;
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const cls = ['ym__cell'];
        if (isInTrip(year, m, d)) cls.push('ym__cell--trip');
        grid += `<span class="${cls.join(' ')}">${d}</span>`;
      }

      html += `
        <div class="ym__month">
          <div class="ym__num">${m + 1}</div>
          <div class="ym__grid">${grid}</div>
        </div>
      `;
    }
    monthsEl.innerHTML = html;
  }

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

      const today = new Date().toISOString().split('T')[0];
      const isUpcoming = activeTrip.phase === 'upcoming';

      // For UPCOMING trips: put "depart in N days" inline next to dates (in the __arc slot)
      // For ACTIVE trips: keep using the trip-now sub-row for "Today: city · day 3 of 5"
      if (isUpcoming) {
        const firstSeg = activeSegments[0];
        const firstStart = firstSeg ? firstSeg.date_start : activeTrip.date_start;
        let phrase = '';
        if (firstStart) {
          const days = Math.ceil((new Date(firstStart) - new Date(today)) / 86400000);
          if (days === 0)      phrase = 'depart today';
          else if (days === 1) phrase = 'depart tomorrow';
          else                 phrase = `depart in ${days} days`;
        }
        if (phrase) {
          tripStripArc.textContent = phrase;
          tripStripArc.style.display = '';
          const sepEl = document.getElementById('trip-strip-sep');
          if (sepEl) sepEl.style.display = '';
        } else {
          tripStripArc.style.display = 'none';
          const sepEl = document.getElementById('trip-strip-sep');
          if (sepEl) sepEl.style.display = 'none';
        }
        // Hide the old trip-now block — phrase is inline now
        tripNowEl.style.display = 'none';
      } else {
        // Active phase: hide the inline arc, use trip-now block
        tripStripArc.textContent = '';
        tripStripArc.style.display = 'none';
        const sepEl = document.getElementById('trip-strip-sep');
        if (sepEl) sepEl.style.display = 'none';

        const todaySeg = activeSegments.find(s =>
          s.date_start && s.date_end && today >= s.date_start && today <= s.date_end
        );
        const futureSegs = activeSegments.filter(s => s.date_start > today);
        const nextSeg = futureSegs[0];

        let phrase = '';
        if (todaySeg) {
          const label = todaySeg.city_name || todaySeg.region_label || '—';
          const dayInfo = computeDayInfo(todaySeg, today);
          phrase = dayInfo ? `${label} · ${dayInfo}` : label;
        } else if (nextSeg) {
          const label = nextSeg.city_name || nextSeg.region_label || '—';
          const arr = nextSeg.date_start ? util.formatNumericDate(nextSeg.date_start) : '';
          phrase = arr ? `next · ${label} · ${arr}` : `next · ${label}`;
        }

        if (phrase) {
          tripNowToday.style.display = '';
          tripNowTodayVal.textContent = phrase;
          const lbl = tripNowToday.querySelector('.trip-now__label');
          if (lbl) lbl.style.display = 'none';
          tripNowNext.style.display = 'none';
          tripNowEl.style.display = '';
        } else {
          tripNowEl.style.display = 'none';
        }
      }

      // Render the mini-month calendar with trip dates highlighted
      renderMiniMonth(activeTrip);
    } catch (err) {
      console.error('load segments', err);
      tripNowEl.style.display = 'none';
    }
  }

  // Render a CdG-style mini-month grid below the trip strip.
  // Days only, Sunday-first, no headers, blue underline on trip dates within the month.
  function renderMiniMonth(trip) {
    const container = document.getElementById('mini-month');
    if (!container) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed

    const firstOfMonth = new Date(year, month, 1);
    const startCol = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Parse trip dates as YYYY-MM-DD strings to avoid TZ issues
    const tripStart = trip.date_start ? trip.date_start.slice(0, 10) : null;
    const tripEnd   = trip.date_end   ? trip.date_end.slice(0, 10)   : null;

    function isInTrip(day) {
      if (!tripStart || !tripEnd) return false;
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return ymd >= tripStart && ymd <= tripEnd;
    }

    let html = '';
    // Empty cells before the 1st
    for (let i = 0; i < startCol; i++) {
      html += `<span class="mm__cell mm__cell--empty"></span>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cls = ['mm__cell'];
      if (isInTrip(d)) cls.push('mm__cell--trip');
      html += `<span class="${cls.join(' ')}">${d}</span>`;
    }
    container.innerHTML = html;
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
      // Poll a few times to catch the AI parse landing.
      // renderStream knows to render not-yet-parsed-and-recent rows as ghosts,
      // so race conditions never expose raw text.
      setTimeout(() => loadStream(), 1500);
      setTimeout(() => loadStream(), 3500);
      setTimeout(() => loadStream(), 7000);
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
    const now = Date.now();
    streamEl.innerHTML = saves.map(s => {
      const hasPlace = s.place_name && s.place_name.trim();
      const hasParseRun = s.ai_parsed_at || s.ai_parse_error;
      const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;
      const isRecent = (now - createdMs) < 30000; // 30s window

      // If parse hasn't run yet AND save is fresh → still pending → render as ghost
      const isPendingFresh = !hasParseRun && isRecent;

      if (isPendingFresh) {
        return `<div class="stream__item stream__ghost" data-id="${s.id}">
          <div class="stream__body">
            <span class="stream__ghost-bar stream__ghost-bar--name"></span>
            <span class="stream__ghost-bar stream__ghost-bar--tip"></span>
            <span class="stream__ghost-bar stream__ghost-bar--meta"></span>
          </div>
          <span class="stream__when">…</span>
        </div>`;
      }

      // Build the quiet metadata line: "drink · canggu, bali" or "drink · paris" etc.
      const cityNames = (s.attached_cities || []).map(c => c.name.toLowerCase());
      const cityLabel = cityNames.length
        ? (s.neighborhood
            ? `${s.neighborhood.toLowerCase()}, ${cityNames[0]}`
            : cityNames.join(' · '))
        : (s.neighborhood ? s.neighborhood.toLowerCase() : '');
      const metaParts = [];
      if (s.category) metaParts.push(s.category);
      if (cityLabel) metaParts.push(cityLabel);
      const metaLine = metaParts.length
        ? `<span class="stream__meta">${util.escapeHtml(metaParts.join(' · '))}</span>`
        : '';

      const tagsLine = (s.tags && s.tags.length)
        ? `<span class="stream__meta">${s.tags.map(t => '#' + util.escapeHtml(t)).join(' · ')}</span>`
        : '';

      let bodyHtml;
      let isTipOnly = false;
      if (hasPlace) {
        const tipLine = s.tip
          ? `<span class="stream__tip">${util.escapeHtml(s.tip)}</span>`
          : '';
        bodyHtml = `
          <span class="stream__name">${util.escapeHtml(s.place_name)}</span>
          ${tipLine}
          ${metaLine}
        `;
      } else if (s.tip && s.tip.trim()) {
        // Tip-only: no specific place was named, but user wrote a hint.
        // Render the tip as the heading (italicized to signal "not a place yet").
        isTipOnly = true;
        bodyHtml = `
          <span class="stream__name stream__name--tip">${util.escapeHtml(s.tip)}</span>
          ${metaLine}
        `;
      } else {
        // Truly raw — no place, no tip (just freeform note)
        bodyHtml = `
          <span class="stream__name stream__name--raw">${util.escapeHtml(s.text)}</span>
          ${metaLine || tagsLine}
        `;
      }

      const variantClass = hasPlace ? ' is-structured' : (isTipOnly ? ' is-tip-only' : '');
      return `<div class="stream__item${variantClass}" data-id="${s.id}">
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

  // ============ SAVE EDITOR ============
  const saveEditor = document.getElementById('save-editor');
  const saveFsCaptured = document.getElementById('save-fs-captured');
  const saveFsPlace    = document.getElementById('save-fs-place');
  const saveFsTip      = document.getElementById('save-fs-tip');
  const saveFsCat      = document.getElementById('save-fs-category');
  const saveFsCity     = document.getElementById('save-fs-city');
  const saveFsCitySuggest = document.getElementById('save-fs-city-suggest');
  const saveFsHood     = document.getElementById('save-fs-hood');
  const saveFsCountry  = document.getElementById('save-fs-country');
  const saveFsClose    = document.getElementById('save-editor-close');
  const saveFsSave     = document.getElementById('save-fs-save');
  const saveFsArchive  = document.getElementById('save-fs-archive');
  const saveFsReparse  = document.getElementById('save-fs-reparse');

  let editingSaveId = null;
  let editingPickedCityId = null; // city id the user picked from suggestions
  let editingOriginalCityName = '';

  // Cache cities for autocomplete — refresh once on first open
  let allCitiesCache = null;
  async function ensureCitiesCache() {
    if (allCitiesCache) return allCitiesCache;
    try {
      const data = await api.get('/api/cities');
      allCitiesCache = (data.cities || []).filter(c => c.status !== 0);
    } catch (err) {
      console.error('ensureCitiesCache', err);
      allCitiesCache = [];
    }
    return allCitiesCache;
  }

  function openSaveEditor(saveId) {
    // Find the save row data — fetch the latest from server to be safe
    api.get('/api/saves?limit=200').then(data => {
      const save = (data.saves || []).find(s => s.id === parseInt(saveId, 10));
      if (!save) {
        toast('Save not found');
        return;
      }
      editingSaveId = save.id;
      editingPickedCityId = (save.attached_cities && save.attached_cities[0]) ? save.attached_cities[0].id : null;
      editingOriginalCityName = (save.attached_cities && save.attached_cities[0]) ? save.attached_cities[0].name : '';

      saveFsCaptured.textContent = save.text || '—';
      saveFsPlace.value = save.place_name || '';
      saveFsTip.value = save.tip || '';
      saveFsCat.value = save.category || '';
      saveFsCity.value = editingOriginalCityName;
      saveFsHood.value = save.neighborhood || '';
      saveFsCountry.textContent = save.country || '—';
      saveFsCitySuggest.innerHTML = '';

      saveEditor.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => saveFsPlace.focus(), 50);
    }).catch(err => {
      console.error('openSaveEditor', err);
      toast('Could not load save');
    });
  }

  function closeSaveEditor() {
    saveEditor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSaveId = null;
    editingPickedCityId = null;
    saveFsCitySuggest.innerHTML = '';
  }

  if (saveFsClose) saveFsClose.addEventListener('click', closeSaveEditor);

  // Click delegation: any stream row → open editor (skip ghost rows)
  streamEl.addEventListener('click', (e) => {
    const row = e.target.closest('.stream__item');
    if (!row) return;
    if (row.classList.contains('stream__ghost')) return;
    const id = row.dataset.id;
    if (id) openSaveEditor(id);
  });

  // City autocomplete in editor
  async function renderCitySuggestions(query) {
    const cities = await ensureCitiesCache();
    const q = (query || '').trim().toLowerCase();
    if (!q) { saveFsCitySuggest.innerHTML = ''; return; }

    // Don't show suggestions if input matches the picked city's name
    if (editingPickedCityId) {
      const picked = cities.find(c => c.id === editingPickedCityId);
      if (picked && picked.name.toLowerCase() === q) {
        saveFsCitySuggest.innerHTML = '';
        return;
      }
    }

    const matches = cities
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 6);
    const exact = matches.find(c => c.name.toLowerCase() === q);

    let html = matches.map(c =>
      `<button class="save-fs__suggest-item" data-city-id="${c.id}" data-city-name="${util.escapeHtml(c.name)}">
        ${util.escapeHtml(c.name)}${c.country ? ` <span class="save-fs__suggest-meta">${util.escapeHtml(c.country)}</span>` : ''}
      </button>`
    ).join('');
    if (!exact) {
      html += `<button class="save-fs__suggest-item save-fs__suggest-item--create" data-city-name="${util.escapeHtml(query.trim())}">
        + create "${util.escapeHtml(query.trim())}"
      </button>`;
    }
    saveFsCitySuggest.innerHTML = html;

    saveFsCitySuggest.querySelectorAll('.save-fs__suggest-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const cid = btn.dataset.cityId;
        const cname = btn.dataset.cityName;
        if (cid) {
          editingPickedCityId = parseInt(cid, 10);
          saveFsCity.value = cname;
        } else {
          // Create new city
          try {
            const result = await api.post('/api/cities', { name: cname });
            const newCity = result.city || result;
            editingPickedCityId = newCity.id;
            saveFsCity.value = newCity.name;
            // Bust cache so future opens see it
            allCitiesCache = null;
          } catch (err) {
            console.error('create city', err);
            toast(err.message || 'Could not create city');
            return;
          }
        }
        saveFsCitySuggest.innerHTML = '';
      });
    });
  }
  let cityDebounce = null;
  saveFsCity.addEventListener('input', () => {
    // If user is typing freely, clear the picked id so we don't re-attach the wrong city
    if (saveFsCity.value !== editingOriginalCityName) {
      editingPickedCityId = null;
    }
    clearTimeout(cityDebounce);
    cityDebounce = setTimeout(() => renderCitySuggestions(saveFsCity.value), 80);
  });
  saveFsCity.addEventListener('blur', () => {
    // Hide suggestions on blur after a tick (allow click to fire first)
    setTimeout(() => { saveFsCitySuggest.innerHTML = ''; }, 200);
  });

  async function commitSaveEdit() {
    if (!editingSaveId) return;
    const body = {
      place_name:   saveFsPlace.value.trim() || null,
      tip:          saveFsTip.value.trim() || null,
      category:     saveFsCat.value || null,
      neighborhood: saveFsHood.value.trim() || null,
    };
    try {
      await api.patch('/api/saves/' + editingSaveId, body);

      // Update city attachment if it changed
      const targetCityName = saveFsCity.value.trim();
      if (targetCityName !== editingOriginalCityName) {
        // Clear all current attachments, then attach the picked one if any
        // Cheapest path: delete prior attachments for this save+city, then add fresh
        if (editingPickedCityId) {
          await api.post(`/api/saves/${editingSaveId}/cities`, { city_id: editingPickedCityId });
        }
        // Note: removing the OLD city attachment isn't yet wired here.
        // For V1, we let the new attachment be added; orphaned old ones can be cleaned in admin.
        // (In practice, we'll add a proper detach in C-3 or here as a follow-up.)
      }
      closeSaveEditor();
      await loadStream();
    } catch (err) {
      console.error('save edit', err);
      toast(err.message || 'Save failed');
    }
  }
  if (saveFsSave) saveFsSave.addEventListener('click', commitSaveEdit);

  // Archive
  if (saveFsArchive) {
    saveFsArchive.addEventListener('click', async () => {
      if (!editingSaveId) return;
      if (!confirm('Archive this save?')) return;
      try {
        await api.patch('/api/saves/' + editingSaveId, { archived_at: new Date().toISOString() });
        closeSaveEditor();
        await loadStream();
      } catch (err) {
        toast(err.message || 'Archive failed');
      }
    });
  }

  // Re-parse with AI
  if (saveFsReparse) {
    saveFsReparse.addEventListener('click', async () => {
      if (!editingSaveId) return;
      try {
        // Endpoint we'll add server-side: POST /api/saves/:id/reparse
        await api.post('/api/saves/' + editingSaveId + '/reparse', {});
        // Wait a moment for parse to complete, then reload
        toast('Re-parsing…');
        setTimeout(async () => {
          closeSaveEditor();
          await loadStream();
        }, 2000);
      } catch (err) {
        console.error('reparse', err);
        toast(err.message || 'Re-parse failed');
      }
    });
  }

  // Esc + Cmd+Enter
  document.addEventListener('keydown', (e) => {
    if (!saveEditor.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSaveEditor(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitSaveEdit(); }
  });

  // ============ MISC ============
  // sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }
})();
