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
  const dayIdleEl = document.getElementById('day-idle');

  // Trip-strip + trip-now + mini-month removed in C6.5.
  // Trip access is now the launcher "Open trip" button only.

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

  // Click "Day 127 / 365" to open the year-view overlay (easter egg)
  if (dayDoyEl) {
    dayDoyEl.style.cursor = 'pointer';
    dayDoyEl.setAttribute('role', 'button');
    dayDoyEl.setAttribute('tabindex', '0');
    dayDoyEl.setAttribute('aria-label', 'Open year calendar');
    dayDoyEl.classList.add('day-sum__doy--clickable');
  }
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
  if (dayDoyEl) {
    dayDoyEl.addEventListener('click', openYearOverlay);
    dayDoyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openYearOverlay(); }
    });
  }
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
      // Only highlight the start and end dates, not the full range
      return ymd === tripStart || ymd === tripEnd;
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

  // ============ TRIP DETECTION ============
  // Load whether there's an active/upcoming trip. If yes, show the
  // launcher button "Open <trip name>". If no, hide the launcher.
  // (Trip-strip + mini-month removed in C6.5 — the launcher button is
  // the only trip surface on home now.)
  async function loadActiveTrip() {
    try {
      const data = await api.get('/api/trips/next');
      activeTrip = data.trip;
    } catch (err) {
      console.error('loadActiveTrip', err);
      activeTrip = null;
    }

    // Update launcher button (visible iff trip exists)
    const launchBtn   = document.getElementById('trip-launch');
    const launchLabel = document.getElementById('trip-launch-label');
    if (launchBtn) {
      if (activeTrip) {
        if (launchLabel) launchLabel.textContent = `Open ${activeTrip.name || 'trip'}`;
        launchBtn.hidden = false;
      } else {
        launchBtn.hidden = true;
      }
    }

    // Load segments — needed for the itinerary overlay (clicking the launcher).
    if (activeTrip) {
      try {
        const data = await api.get('/api/trips/' + activeTrip.id);
        activeSegments = (data.segments || []).filter(s => s.date_start);
        activeSegments.sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''));
      } catch (err) {
        console.error('load segments', err);
        activeSegments = [];
      }
    } else {
      activeSegments = [];
    }
  }

  // ============ IDLE STATE — oblique strategies prompt ============
  // Eno + Schmidt — Oblique Strategies. Loaded from oblique.js as window.OBLIQUE_STRATEGIES.
  const idlePrompts = (window.OBLIQUE_STRATEGIES && window.OBLIQUE_STRATEGIES.length)
    ? window.OBLIQUE_STRATEGIES
    : ['Trust in the you of now'];

  function renderIdleQuote() {
    if (!dayIdleEl) return;
    dayIdleEl.style.display = 'flex';
    const idx = Math.floor(Math.random() * idlePrompts.length);
    const quoteEl = document.getElementById('idle-quote');
    const numEl   = document.getElementById('idle-num');
    if (quoteEl) quoteEl.textContent = idlePrompts[idx];
    if (numEl)   numEl.textContent   = String(idx + 1).padStart(3, '0');
  }
  // Idle quote always shows now (no longer trip-state-gated).
  renderIdleQuote();

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

    // Subtitle: "May 12 — Jun 24 • 2026" (sentence case, sans, no weekday)
    if (activeTrip.date_start && activeTrip.date_end) {
      const ds = new Date(activeTrip.date_start);
      const de = new Date(activeTrip.date_end);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const left = `${m[ds.getUTCMonth()]} ${ds.getUTCDate()}`;
      const right = `${m[de.getUTCMonth()]} ${de.getUTCDate()}`;
      const year = ds.getUTCFullYear();
      // If trip spans years (rare, e.g., Dec → Feb), show both years
      const yearLabel = ds.getUTCFullYear() === de.getUTCFullYear()
        ? year
        : `${ds.getUTCFullYear()}–${de.getUTCFullYear()}`;
      itinDates.textContent = `${left} — ${right} • ${yearLabel}`;
    } else if (activeTrip.date_start) {
      itinDates.textContent = util.formatLongDate(activeTrip.date_start);
    } else {
      itinDates.textContent = '';
    }

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

    // Render segments — single column, no date-rail. Title + nights pill on top row,
    // dates underneath, then notes/items.
    if (!activeSegments.length) {
      itinSegments.innerHTML = '<p class="itin-fs__empty">No stops yet.</p>';
    } else {
      const monShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const fmtRange = (a, b) => {
        if (!a) return '';
        const da = new Date(a);
        if (!b) return `${monShort[da.getUTCMonth()]} ${da.getUTCDate()}`;
        const db = new Date(b);
        const left = `${monShort[da.getUTCMonth()]} ${da.getUTCDate()}`;
        const right = (da.getUTCMonth() === db.getUTCMonth())
          ? `${db.getUTCDate()}`
          : `${monShort[db.getUTCMonth()]} ${db.getUTCDate()}`;
        return `${left} — ${right}`;
      };

      itinSegments.innerHTML = activeSegments.map(s => {
        const label = s.city_name || s.region_label || '—';
        const dateRange = fmtRange(s.date_start, s.date_end);
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
          ? `<div class="itin-fs__seg-notes">${util.safeMarkdown(s.notes)}</div>`
          : '';
        return `<article class="itin-fs__seg${isToday ? ' is-here' : ''}">
          <div class="itin-fs__seg-row">
            <h2 class="itin-fs__seg-name">${util.escapeHtml(label)}</h2>
            ${nightsLabel ? `<span class="itin-fs__seg-pill">${nightsLabel}</span>` : ''}
          </div>
          ${dateRange ? `<div class="itin-fs__seg-dates">${dateRange}${isToday ? ' <span class="itin-fs__here">· you are here</span>' : ''}</div>` : ''}
          ${notes}
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
  if (itinClose)   itinClose.addEventListener('click', closeItinerary);
  // Trip-launch button — opens itinerary overlay. Sole trip surface on home.
  const launchBtnEl = document.getElementById('trip-launch');
  if (launchBtnEl) launchBtnEl.addEventListener('click', openItinerary);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && itinOverlay && itinOverlay.classList.contains('is-open')) {
      closeItinerary();
    }
  });

  // ============ CAPTURE — shared overlay module ============
  // The overlay HTML lives in this page; the logic is in /js/capture-overlay.js,
  // a shared module reused on /spots/ and /capture/.
  //
  // Save-time strategy (v0.6): the structured capture path returns the fully
  // shaped spot row in the POST response — place_name, tip, city, been are
  // all already set. We render the pill *instantly* using that data instead
  // of showing a generic skeleton ghost. Google's place_id and AI's
  // category/neighborhood fill in over the following few seconds via the
  // existing background polling, replacing the optimistic row in place.
  if (window.CaptureOverlay) {
    window.CaptureOverlay.init({
      launcher: '#capture-launcher',
      launcherCity: '#capture-launcher-city-name',
      onSaved: ({ thenClose, spot }) => {
        if (spot && spot.id) {
          // Prepend the freshly-saved spot to the stream cache and re-render.
          // The pill appears instantly with place_name + tip + been already
          // visible. Background fields (category, google_place_id) will
          // populate via the reconcile polls below.
          prependOptimisticSpot(spot);
        }
        // Reconcile polls — quick re-fetches to catch Google + AI updates
        // for the just-saved spot. Polling moved closer together because
        // we no longer rely on these to first show the pill; they're now
        // just opportunistic refreshes.
        if (thenClose) {
          setTimeout(() => loadStream(), 1200);
          setTimeout(() => loadStream(), 3000);
          setTimeout(() => loadStream(), 6000);
        } else {
          setTimeout(() => loadStream(), 1200);
          setTimeout(() => loadStream(), 3500);
        }
      },
    });
  }

  // Cache of the most recent loadStream() result so we can render
  // optimistically (instant pill on save) without a refetch.
  let lastSpots = [];

  // Prepend a just-saved spot to the local cache and re-render the stream.
  // Used by the capture overlay's onSaved callback for instant feedback.
  function prependOptimisticSpot(spot) {
    if (!spot || !spot.id) return;
    // Replace any existing entry with same id (defensive — shouldn't happen
    // but if save fires twice somehow, don't duplicate)
    lastSpots = lastSpots.filter(s => s.id !== spot.id);
    lastSpots.unshift(spot);
    // Trim to the same cap that the server returns
    if (lastSpots.length > 30) lastSpots = lastSpots.slice(0, 30);
    renderStream(lastSpots);
  }


  // ============ STREAM ============
  const streamEl = document.getElementById('stream');
  const streamEmpty = document.getElementById('stream-empty');

  async function loadStream() {
    try {
      const data = await api.get('/api/spots?limit=30');
      lastSpots = data.spots || [];
      renderStream(lastSpots);
      // If any ghost rows are visible (just-captured spots still being parsed by AI),
      // schedule retry-fetches to replace them once parsing completes.
      schedulePendingRetries();
    } catch (err) {
      console.error('loadStream', err);
    }
  }

  // If pending/ghost spots exist in the stream, poll a few times to catch the
  // AI-parse completion. Idempotent: clears any prior schedule first.
  let pendingRetryTimers = [];
  function schedulePendingRetries() {
    // Clear previous schedule
    pendingRetryTimers.forEach(t => clearTimeout(t));
    pendingRetryTimers = [];
    const ghosts = streamEl.querySelectorAll('.stream__ghost');
    if (!ghosts.length) return;
    // Poll at 1.5s, 3.5s, 7s, 12s — covers most AI parse completion windows
    [1500, 3500, 7000, 12000].forEach(delay => {
      pendingRetryTimers.push(setTimeout(() => loadStream(), delay));
    });
  }

  function renderStream(spots) {
    if (!spots.length) {
      streamEl.innerHTML = '<div class="stream__empty">No spots yet. Type something above.</div>';
      return;
    }
    const now = Date.now();
    streamEl.innerHTML = spots.map(s => {
      const hasPlace = s.place_name && s.place_name.trim();
      const hasParseRun = s.ai_parsed_at || s.ai_parse_error;
      const createdMs = s.created_at ? new Date(s.created_at).getTime() : 0;
      const isRecent = (now - createdMs) < 30000; // 30s window

      // If parse hasn't run yet AND spot is fresh → still pending → render as ghost
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

      // Build the quiet metadata line: "drink · paris" (no hood, hood is decorative
      // and will be handled at publish-time via curated sections, not here).
      const cityNames = (s.attached_cities || []).map(c => c.name.toLowerCase());
      const cityLabel = cityNames.length ? cityNames.join(' · ') : '';
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
      const wantClass = (s.been === false) ? ' is-want' : '';
      const catAttr = s.category ? ` data-category="${util.escapeHtml(s.category)}"` : '';
      // data-gpid: Google place_id from the canonical places row, used by the
      // click handler to open Google Maps. Spots without a resolved place
      // (place_id null OR Google found no match) have no gpid attribute and
      // the click handler treats them as no-op.
      // data-place-name: the place name for the Maps URL's `query` param.
      // Required by Google's api=1 URL format even when query_place_id is set.
      const gpidAttr = s.google_place_id ? ` data-gpid="${util.escapeHtml(s.google_place_id)}"` : '';
      const placeNameAttr = (s.google_place_id && s.place_name)
        ? ` data-place-name="${util.escapeHtml(s.place_name)}"`
        : '';
      const treatment = (parseInt(s.id, 10) % 7);
      return `<div class="stream__item${variantClass}${wantClass}" data-id="${s.id}" data-treatment="${treatment}"${catAttr}${gpidAttr}${placeNameAttr}>
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

  // Todos UI parked pre-Europe26 — DOM nodes removed from index.html.
  // The entire todos block below only runs if its anchor element exists.
  // Restore: re-add #todo-list to index.html.
  const list = document.getElementById('todo-list');
  if (list) {
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
  } // end if (list) — todos parked pre-Europe26

  // ============ SAVE EDITOR ============
  const spotEditor     = document.getElementById('spot-editor');
  const spotFsPlace    = document.getElementById('spot-fs-place');
  const spotFsTip      = document.getElementById('spot-fs-tip');
  const spotFsCat      = document.getElementById('spot-fs-category');
  const spotFsClose    = document.getElementById('spot-editor-close');
  const spotFsSave     = document.getElementById('spot-fs-save');
  const spotFsDelete   = document.getElementById('spot-fs-delete');
  const spotFsBeenYes  = document.getElementById('spot-fs-been-yes');
  const spotFsBeenNo   = document.getElementById('spot-fs-been-no');

  let editingSpotId = null;
  let editingBeen = true;

  function applyEditingBeen(val) {
    editingBeen = !!val;
    if (spotFsBeenYes) spotFsBeenYes.dataset.active = editingBeen ? 'true' : 'false';
    if (spotFsBeenNo)  spotFsBeenNo.dataset.active  = editingBeen ? 'false' : 'true';
  }
  if (spotFsBeenYes) spotFsBeenYes.addEventListener('click', () => applyEditingBeen(true));
  if (spotFsBeenNo)  spotFsBeenNo.addEventListener('click', () => applyEditingBeen(false));

  function openSpotEditor(spotId) {
    api.get('/api/spots?limit=200').then(data => {
      const spot = (data.spots || []).find(s => s.id === parseInt(spotId, 10));
      if (!spot) {
        toast('Spot not found');
        return;
      }
      editingSpotId = spot.id;
      spotFsPlace.value = spot.place_name || '';
      spotFsTip.value = spot.tip || '';
      spotFsCat.value = spot.category || '';
      applyEditingBeen(typeof spot.been === 'boolean' ? spot.been : true);

      spotEditor.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      setTimeout(() => spotFsPlace.focus(), 50);
    }).catch(err => {
      console.error('openSpotEditor', err);
      toast('Could not load spot');
    });
  }

  function closeSpotEditor() {
    spotEditor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSpotId = null;
  }

  if (spotFsClose) spotFsClose.addEventListener('click', closeSpotEditor);

  // Click delegation: any stream row → open in Google Maps (skip ghost rows)
  // Click on a stream item: if the spot has a resolved Google place_id,
  // open it in Google Maps in a new tab. If not (place_id null — Google
  // had no match, or AI returned no place_name, or it's a raw note),
  // do nothing. Editing lives on /spots/.
  //
  // URL format: uses Google's documented Maps URL API (api=1) with both
  // `query` (place name, required by spec) and `query_place_id` (the
  // canonical Google identifier). Old format `?q=place_id:X` works on
  // desktop but breaks on mobile — Google's mobile Maps treats it as a
  // literal search string. api=1 format works on both.
  streamEl.addEventListener('click', (e) => {
    const row = e.target.closest('.stream__item');
    if (!row) return;
    if (row.classList.contains('stream__ghost')) return;
    const gpid = row.dataset.gpid;
    if (!gpid) return; // no Google place — silently no-op
    const name = row.dataset.placeName || '';
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(gpid)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  async function commitSaveEdit() {
    if (!editingSpotId) return;
    const body = {
      place_name: spotFsPlace.value.trim() || null,
      tip:        spotFsTip.value.trim() || null,
      category:   spotFsCat.value || null,
      been:       editingBeen,
    };
    try {
      await api.patch('/api/spots/' + editingSpotId, body);
      closeSpotEditor();
      await loadStream();
    } catch (err) {
      console.error('save edit', err);
      toast(err.message || 'Save failed');
    }
  }
  if (spotFsSave) spotFsSave.addEventListener('click', commitSaveEdit);

  // Delete (replaces archive + reparse for V0.6)
  if (spotFsDelete) {
    spotFsDelete.addEventListener('click', async () => {
      if (!editingSpotId) return;
      if (!confirm('Delete this save? This cannot be undone.')) return;
      try {
        await api.delete('/api/spots/' + editingSpotId);
        closeSpotEditor();
        await loadStream();
      } catch (err) {
        toast(err.message || 'Delete failed');
      }
    });
  }

  // Esc + Cmd+Enter
  document.addEventListener('keydown', (e) => {
    if (!spotEditor.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSpotEditor(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitSaveEdit(); }
  });

  // ============ MISC ============
  // sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }
})();
