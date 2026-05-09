/* =========================================================
   time.js — Time meeting finder
   ========================================================= */

(async function () {
  const citiesEl   = document.getElementById('time-cities');
  const timelineEl = document.getElementById('time-timeline');
  const windowsEl  = document.getElementById('time-windows');
  const popover    = document.getElementById('time-add-popover');
  const popSearch  = document.getElementById('time-add-search');
  const popList    = document.getElementById('time-add-list');

  let me = null;
  let homeCity = null;       // {id, name, country, timezone}
  let tracked = [];          // array of {city_id, name, country, timezone, wake_start, wake_end}
  let allCities = [];        // for the add popover
  let expandedCityId = null; // currently expanded for hour-edit
  let popoverAnchor = null;  // element the popover should anchor to

  const MAX_TRACKED = 6;
  const DEFAULT_WAKE_START = 9;
  const DEFAULT_WAKE_END = 22;

  // ---------- Time math helpers ----------
  // Get current "hour float" (hour + minute/60) in a given IANA timezone.
  function hourFloat(tz) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    let h = 0, m = 0;
    for (const p of parts) {
      if (p.type === 'hour')   h = parseInt(p.value, 10);
      if (p.type === 'minute') m = parseInt(p.value, 10);
    }
    if (h === 24) h = 0; // some locales emit 24
    return h + m / 60;
  }

  // Offset (in hours) from the home city's timezone to this city's timezone.
  // Positive means the city is ahead of home; negative means behind.
  function offsetFromHome(tz) {
    if (!homeCity || !homeCity.timezone) return 0;
    const homeH = hourFloat(homeCity.timezone);
    const otherH = hourFloat(tz);
    let diff = otherH - homeH;
    // Normalize to (-12, +14] range
    if (diff > 14)  diff -= 24;
    if (diff < -12) diff += 24;
    return Math.round(diff * 2) / 2; // half-hour precision
  }

  function fmtOffset(off) {
    if (off === 0) return 'same';
    const sign = off > 0 ? '+' : '−';
    const v = Math.abs(off);
    const whole = Math.floor(v);
    const frac = v - whole;
    return frac === 0 ? `${sign}${whole}h` : `${sign}${whole}.${Math.round(frac * 10)}h`;
  }

  // Format current time in a city's timezone, respecting global time format preference
  function fmtCityTime(tz) {
    return util.fmtTime(new Date(), { timeZone: tz });
  }

  // Format current weekday + day in a city's timezone like "Wed May 6"
  function fmtCityDate(tz) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date());
  }

  // ---------- Load ----------
  async function loadMe() {
    const data = await api.get('/api/auth/me');
    me = data.user || null;
    homeCity = me && me.home_city ? me.home_city : null;
    tracked = me && Array.isArray(me.tracked_cities) ? me.tracked_cities : [];
  }

  async function loadAllCities() {
    try {
      const data = await api.get('/api/cities');
      // Only cities with a timezone are meaningful here
      allCities = (data.cities || []).filter(c => c.timezone && c.status !== 0);
    } catch {
      allCities = [];
    }
  }

  // ---------- Save ----------
  async function saveTracked() {
    const payload = tracked.map(t => ({
      city_id: t.city_id,
      wake_start: t.wake_start,
      wake_end: t.wake_end,
    }));
    try {
      await api.patch('/api/auth/me', { tracked_cities: payload });
    } catch (err) {
      console.error('saveTracked', err);
      window.toast && toast(err.message || 'Save failed');
    }
  }

  // ---------- Render: cities list ----------
  function renderCities() {
    if (!homeCity) {
      citiesEl.innerHTML = '<div class="time-cities__empty">Set your home location in <a href="/settings.html">Settings</a> first.</div>';
      return;
    }

    const rows = [];

    // Home city — always shown first, can't be removed or edited (it IS the reference)
    rows.push(renderCityRow({
      city_id: homeCity.id,
      name: homeCity.name,
      country: homeCity.country,
      timezone: homeCity.timezone,
      isHome: true,
      offset: 0,
    }));

    // Tracked cities
    for (const t of tracked) {
      rows.push(renderCityRow({
        city_id: t.city_id,
        name: t.name,
        country: t.country,
        timezone: t.timezone,
        wake_start: t.wake_start,
        wake_end: t.wake_end,
        isHome: false,
        offset: offsetFromHome(t.timezone),
      }));
    }

    // Show "at cap" message inline if user is maxed out — otherwise no inline button
    // (the + Add city action lives in the page mast top-right now)
    let capMsg = '';
    if (tracked.length >= MAX_TRACKED) {
      capMsg = `<div class="time-add-cap">Tracking ${MAX_TRACKED} cities — remove one to add another.</div>`;
    }

    citiesEl.innerHTML = rows.join('') + capMsg;

    // Wire row interactions
    citiesEl.querySelectorAll('.time-card').forEach(card => {
      const cityId = parseInt(card.dataset.cityId, 10);
      const isHome = card.dataset.home === '1';

      // Click main row → toggle expand (only for tracked, not home)
      const main = card.querySelector('.time-card__main');
      if (main && !isHome) {
        main.addEventListener('click', (e) => {
          if (e.target.closest('.time-card__remove')) return;
          expandedCityId = expandedCityId === cityId ? null : cityId;
          renderCities();
          renderTimeline();
          renderWindows();
        });
      }

      // Remove
      const removeBtn = card.querySelector('.time-card__remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          tracked = tracked.filter(t => t.city_id !== cityId);
          if (expandedCityId === cityId) expandedCityId = null;
          await saveTracked();
          renderCities();
          renderTimeline();
          renderWindows();
        });
      }

      // Hour edit selects
      const wakeStartSel = card.querySelector('[data-wake-start]');
      const wakeEndSel   = card.querySelector('[data-wake-end]');
      if (wakeStartSel) {
        wakeStartSel.addEventListener('change', async () => {
          const t = tracked.find(x => x.city_id === cityId);
          if (!t) return;
          t.wake_start = parseInt(wakeStartSel.value, 10);
          // Ensure end > start
          if (t.wake_end <= t.wake_start) t.wake_end = Math.min(24, t.wake_start + 1);
          await saveTracked();
          renderCities();
          renderTimeline();
          renderWindows();
        });
      }
      if (wakeEndSel) {
        wakeEndSel.addEventListener('change', async () => {
          const t = tracked.find(x => x.city_id === cityId);
          if (!t) return;
          t.wake_end = parseInt(wakeEndSel.value, 10);
          if (t.wake_end <= t.wake_start) t.wake_start = Math.max(0, t.wake_end - 1);
          await saveTracked();
          renderCities();
          renderTimeline();
          renderWindows();
        });
      }
    });
  }

  function renderCityRow({ city_id, name, country, timezone, wake_start, wake_end, isHome, offset }) {
    const time = fmtCityTime(timezone);
    const date = fmtCityDate(timezone);
    // Home city: no offset label (it's the reference, no meaningful offset to itself)
    // Tracked cities: show their offset from home (e.g., "−6h", "+5h")
    const offLabel = isHome ? '' : fmtOffset(offset);
    const isExpanded = expandedCityId === city_id;

    let expandedHtml = '';
    if (isExpanded && !isHome) {
      const ws = wake_start ?? DEFAULT_WAKE_START;
      const we = wake_end ?? DEFAULT_WAKE_END;
      expandedHtml = `
        <div class="time-card__edit">
          <span class="time-card__edit-label">Awake</span>
          <select class="time-card__select" data-wake-start>
            ${hourOptions(ws, 0, 23)}
          </select>
          <span class="time-card__edit-sep">to</span>
          <select class="time-card__select" data-wake-end>
            ${hourOptions(we, 1, 24)}
          </select>
        </div>
      `;
    }

    return `
      <div class="time-card${isHome ? ' is-home' : ''}${isExpanded ? ' is-expanded' : ''}" data-city-id="${city_id}" data-home="${isHome ? '1' : '0'}">
        <div class="time-card__main">
          <div class="time-card__lhs">
            <span class="time-card__name">${util.escapeHtml(name)}</span>
            <span class="time-card__date">${util.escapeHtml(date)}</span>
          </div>
          <div class="time-card__time">${time}</div>
          <div class="time-card__offset">${offLabel}</div>
          ${!isHome
            ? '<button class="time-card__remove" type="button" aria-label="Remove">×</button>'
            : '<span class="time-card__remove-slot" aria-hidden="true"></span>'}
        </div>
        ${expandedHtml}
      </div>
    `;
  }

  function hourOptions(selected, min, max) {
    let html = '';
    for (let h = min; h <= max; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      html += `<option value="${h}"${h === selected ? ' selected' : ''}>${label}</option>`;
    }
    return html;
  }

  // ---------- Render: 24-hour overlap timeline ----------
  function renderTimeline() {
    if (!homeCity) {
      timelineEl.innerHTML = '';
      return;
    }

    // Build all rows: home + tracked
    const rows = [];

    // Home row — wake hours stored on user, default to 9-22 (we don't track home's wake yet, use defaults)
    rows.push({
      name: homeCity.name,
      timezone: homeCity.timezone,
      wakeStart: DEFAULT_WAKE_START,
      wakeEnd: DEFAULT_WAKE_END,
      isHome: true,
      offset: 0,
    });

    for (const t of tracked) {
      rows.push({
        name: t.name,
        timezone: t.timezone,
        wakeStart: t.wake_start,
        wakeEnd: t.wake_end,
        isHome: false,
        offset: offsetFromHome(t.timezone),
      });
    }

    // For each row, compute the awake range expressed in HOME-LOCAL hours.
    // city's wake hour = home's wake hour - offset
    // (e.g., Paris awake 9-22 with offset -6 from Bali → 9-(-6)=15 to 22-(-6)=28 → wraps)
    // We render along the home-local 0-24 axis.

    const homeNow = hourFloat(homeCity.timezone); // 0..24

    let html = '';
    // Top axis labels
    html += `<div class="time-tl__axis">`;
    for (let h = 0; h <= 24; h += 3) {
      const pct = (h / 24) * 100;
      html += `<span class="time-tl__tick" style="left:${pct}%">${h}</span>`;
    }
    html += `</div>`;

    // Each row
    for (const r of rows) {
      // Awake hours expressed in home-local hours
      // city_wake_in_home = city_wake_hour - city_offset_from_home
      const homeWakeStart = r.wakeStart - r.offset;
      const homeWakeEnd   = r.wakeEnd - r.offset;

      // Generate 1-2 segments depending on whether the awake window wraps the day
      const segments = wrapSegments(homeWakeStart, homeWakeEnd);

      html += `
        <div class="time-tl__row${r.isHome ? ' is-home' : ''}">
          <div class="time-tl__name">${util.escapeHtml(r.name)}</div>
          <div class="time-tl__track">
      `;
      // Underlay baseline
      html += `<div class="time-tl__baseline"></div>`;
      // Awake segments
      for (const seg of segments) {
        const left = (seg.start / 24) * 100;
        const width = ((seg.end - seg.start) / 24) * 100;
        html += `<div class="time-tl__awake" style="left:${left}%;width:${width}%"></div>`;
      }
      html += `</div></div>`;
    }

    // "Now" line (vertical, at home's current hour)
    const nowLeft = (homeNow / 24) * 100;
    html += `<div class="time-tl__now" style="left:calc(140px + (100% - 140px) * ${nowLeft / 100})">
      <span class="time-tl__now-label">${fmtCityTime(homeCity.timezone)}</span>
    </div>`;

    timelineEl.innerHTML = html;
  }

  // Given a wake range [start, end] possibly outside [0,24], return 1-2 segments clipped to [0,24].
  function wrapSegments(start, end) {
    // Normalize start to [0, 24)
    while (start < 0)  { start += 24; end += 24; }
    while (start >= 24) { start -= 24; end -= 24; }

    if (end <= 24) {
      return [{ start: Math.max(0, start), end: Math.min(24, end) }];
    }
    // Wraps midnight — 2 segments
    return [
      { start: Math.max(0, start), end: 24 },
      { start: 0, end: Math.min(24, end - 24) },
    ];
  }

  // ---------- Render: best call windows ----------
  function renderWindows() {
    if (!homeCity) {
      windowsEl.innerHTML = '';
      return;
    }
    if (!tracked.length) {
      windowsEl.innerHTML = '<div class="time-windows__empty">Add a city above to see overlap windows.</div>';
      return;
    }

    // Home wake hours in home-local (default 9-22)
    const homeWake = { start: DEFAULT_WAKE_START, end: DEFAULT_WAKE_END };

    // For each tracked city, compute overlap in home-local hours
    const lines = [];

    // Group cities that share the same offset (so "You + Paris, Berlin, Rome" reads as one)
    const byOffset = new Map();
    for (const t of tracked) {
      const off = offsetFromHome(t.timezone);
      const key = `${off}:${t.wake_start}:${t.wake_end}`;
      if (!byOffset.has(key)) byOffset.set(key, { offset: off, wake_start: t.wake_start, wake_end: t.wake_end, cities: [] });
      byOffset.get(key).cities.push(t.name);
    }

    for (const grp of byOffset.values()) {
      const cityWakeInHome = wrapSegments(grp.wake_start - grp.offset, grp.wake_end - grp.offset);
      // Intersect with home wake
      const overlaps = [];
      for (const seg of cityWakeInHome) {
        const s = Math.max(seg.start, homeWake.start);
        const e = Math.min(seg.end, homeWake.end);
        if (e > s) overlaps.push({ start: s, end: e });
      }

      const cityList = grp.cities.length === 1
        ? grp.cities[0]
        : grp.cities.length === 2
          ? grp.cities.join(' & ')
          : grp.cities.slice(0, -1).join(', ') + ' & ' + grp.cities[grp.cities.length - 1];

      if (!overlaps.length) {
        lines.push({ label: `You & ${cityList}`, value: 'no overlap during waking hours' });
      } else {
        const fmt = overlaps.map(o => `${fmtHour(o.start)}–${fmtHour(o.end)}`).join(', ');
        lines.push({ label: `You & ${cityList}`, value: fmt });
      }
    }

    // Plus "all together" if more than one tracked city
    if (tracked.length > 1) {
      // Intersect all city wake ranges in home-local
      let segments = [{ start: homeWake.start, end: homeWake.end }];
      for (const t of tracked) {
        const off = offsetFromHome(t.timezone);
        const cityInHome = wrapSegments(t.wake_start - off, t.wake_end - off);
        const next = [];
        for (const s of segments) {
          for (const c of cityInHome) {
            const ns = Math.max(s.start, c.start);
            const ne = Math.min(s.end, c.end);
            if (ne > ns) next.push({ start: ns, end: ne });
          }
        }
        segments = next;
      }
      const allLabel = `You & all ${tracked.length} cities`;
      if (!segments.length) {
        lines.push({ label: allLabel, value: 'no shared awake window' });
      } else {
        const fmt = segments.map(s => `${fmtHour(s.start)}–${fmtHour(s.end)}`).join(', ');
        lines.push({ label: allLabel, value: fmt });
      }
    }

    windowsEl.innerHTML = lines.map(l => `
      <div class="time-window">
        <span class="time-window__label">${util.escapeHtml(l.label)}</span>
        <span class="time-window__value">${util.escapeHtml(l.value)}</span>
      </div>
    `).join('');
  }

  function fmtHour(h) {
    return util.fmtTimeFloat(h);
  }

  // ---------- Add city popover ----------
  function openAddPopover(anchor) {
    popoverAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    const popWidth = 320; // matches .time-add-popover width
    const viewportW = document.documentElement.clientWidth;

    // Decide alignment: prefer left-aligned to anchor (popover grows rightward),
    // but if anchor is too close to right edge to fit, right-align to anchor
    // (popover grows leftward) so it stays in the viewport.
    const naturalRightEdge = rect.left + popWidth;
    const margin = 16; // breathing room from viewport edge

    let left;
    if (naturalRightEdge + margin <= viewportW) {
      // Fits left-aligned — use anchor's left
      left = rect.left + window.scrollX;
    } else {
      // Right-align: popover's right edge sits at anchor's right edge
      left = rect.right - popWidth + window.scrollX;
      // Clamp to viewport (don't go off the LEFT edge if very narrow viewport)
      const minLeft = margin + window.scrollX;
      if (left < minLeft) left = minLeft;
    }

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
    popover.classList.add('is-open');
    popSearch.value = '';
    renderAddList('');
    setTimeout(() => popSearch.focus(), 50);
  }
  function closeAddPopover() {
    popover.classList.remove('is-open');
  }

  function renderAddList(query) {
    const q = (query || '').trim().toLowerCase();
    const trackedIds = new Set(tracked.map(t => t.city_id));
    if (homeCity) trackedIds.add(homeCity.id);

    const matches = (q
      ? allCities.filter(c => c.name.toLowerCase().includes(q))
      : allCities.filter(c => c.status === 3)
    ).filter(c => !trackedIds.has(c.id)).slice(0, 12);

    if (!matches.length) {
      popList.innerHTML = '<div class="time-add-empty">No matches.</div>';
      return;
    }
    popList.innerHTML = matches.map(c => `
      <button class="time-add-item" data-city-id="${c.id}">
        <span>${util.escapeHtml(c.name)}${c.country ? `<span class="time-add-country">${util.escapeHtml(c.country)}</span>` : ''}</span>
        <span class="time-add-tz">${util.escapeHtml(c.timezone)}</span>
      </button>
    `).join('');
    popList.querySelectorAll('.time-add-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cid = parseInt(btn.dataset.cityId, 10);
        const c = allCities.find(x => x.id === cid);
        if (!c) return;
        tracked.push({
          city_id: c.id, name: c.name, country: c.country, timezone: c.timezone,
          wake_start: DEFAULT_WAKE_START, wake_end: DEFAULT_WAKE_END,
        });
        await saveTracked();
        closeAddPopover();
        renderCities();
        renderTimeline();
        renderWindows();
      });
    });
  }

  popSearch.addEventListener('input', () => renderAddList(popSearch.value));
  popSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAddPopover();
  });
  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && !(popoverAnchor && popoverAnchor.contains(e.target))) {
      closeAddPopover();
    }
  });

  // ---------- Tick (re-render every 30s for live time) ----------
  function tick() {
    renderCities();
    renderTimeline();
  }

  // ---------- Footer signout ----------
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  // ---------- Init ----------
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }
  await loadMe();
  await loadAllCities();
  renderCities();
  renderTimeline();
  renderWindows();
  setInterval(tick, 30 * 1000);

  // Wire the top-of-page "+ Add city" button (lives in page mast, not in cities list)
  const topAddBtn = document.getElementById('time-add-btn-top');
  if (topAddBtn) {
    topAddBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tracked.length >= MAX_TRACKED) return; // hard cap; user sees message in list
      openAddPopover(topAddBtn);
    });
  }
})();
