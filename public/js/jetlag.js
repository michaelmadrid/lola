/* =========================================================
   jetlag.js — Jetlag planner (v2: timeline grid)
   Pure rule-based. Renders a daily plan with marks at specific hours.
   ========================================================= */

(async function () {
  let allCities = [];
  let homeCity = null;
  let fromCity = null;
  let toCity = null;
  let depDate = null;
  let popoverWhich = null;
  let popoverAnchor = null;

  const fromBtn  = document.getElementById('jl-from-btn');
  const toBtn    = document.getElementById('jl-to-btn');
  const dateInput = document.getElementById('jl-date');
  const prefillHint = document.getElementById('jl-prefill-hint');

  const popover     = document.getElementById('jl-popover');
  const popSearch   = document.getElementById('jl-popover-search');
  const popList     = document.getElementById('jl-popover-list');

  const headerStrip = document.getElementById('jl-header');
  const timelineEl  = document.getElementById('jl-timeline');
  const todayEl     = document.getElementById('jl-today');
  const tipsEl      = document.getElementById('jl-tips');
  const emptyEl     = document.getElementById('jl-empty-section');
  const planSection = document.getElementById('jl-plan-section');
  const noDateEl    = document.getElementById('jl-no-date');
  const noDateBtn   = document.getElementById('jl-no-date-btn');

  if (noDateBtn) {
    noDateBtn.addEventListener('click', () => {
      dateInput.focus();
      try { dateInput.showPicker && dateInput.showPicker(); } catch {}
    });
  }

  // ---------- SVG icons (12x12, currentColor) ----------
  const ICONS = {
    light: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <circle cx="6" cy="6" r="2" fill="currentColor"/>
      <line x1="6" y1="0.5" x2="6" y2="2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="6" y1="10" x2="6" y2="11.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="0.5" y1="6" x2="2" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="10" y1="6" x2="11.5" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
    dark: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <path d="M 8.5 2.2 A 4.2 4.2 0 1 0 8.5 9.8 A 3.2 4.2 0 0 1 8.5 2.2 Z" fill="currentColor"/>
    </svg>`,
    coffee: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <path d="M 2.5 4.5 L 8 4.5 L 8 8 Q 8 9.5 6.5 9.5 L 4 9.5 Q 2.5 9.5 2.5 8 Z" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
      <path d="M 8 5.5 Q 10 5.5 10 7 Q 10 8 9 8" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="3.5" y1="3" x2="3.5" y2="3.8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="5.25" y1="2.5" x2="5.25" y2="3.8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="7" y1="3" x2="7" y2="3.8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
    meal: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1"/>
      <circle cx="6" cy="6" r="1.1" fill="currentColor"/>
      <line x1="1.5" y1="3" x2="1.5" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="10.5" y1="3" x2="10.5" y2="9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
    sleep: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <path d="M 3 4 L 7 4 L 3 8 L 7 8" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="miter" stroke-linecap="round"/>
      <line x1="8" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>`,
    pill: `<svg viewBox="0 0 12 12" class="jl-icon" aria-hidden="true">
      <rect x="2" y="4.5" width="8" height="3" rx="1.5" ry="1.5" fill="none" stroke="currentColor" stroke-width="1"/>
      <line x1="6" y1="4.5" x2="6" y2="7.5" stroke="currentColor" stroke-width="1"/>
    </svg>`,
  };

  // ---------- Time math ----------
  function hourFloat(tz, date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(date);
    let h = 0, m = 0;
    for (const p of parts) {
      if (p.type === 'hour')   h = parseInt(p.value, 10);
      if (p.type === 'minute') m = parseInt(p.value, 10);
    }
    if (h === 24) h = 0;
    return h + m / 60;
  }
  function hourDiff(fromTz, toTz, atDate = new Date()) {
    if (!fromTz || !toTz) return 0;
    const fromH = hourFloat(fromTz, atDate);
    const toH = hourFloat(toTz, atDate);
    let diff = toH - fromH;
    if (diff > 14)  diff -= 24;
    if (diff < -12) diff += 24;
    return Math.round(diff);
  }

  // Take a YYYY-MM-DD string + day offset, return formatted "Sat May 10".
  // Day offset is the day number from buildDays: -3, -2, -1, 1, 2, 3...
  // Day 1 = departure date itself. Day −1 = 1 day before. Day 2 = 1 day after.
  function dateForOffset(depDateStr, offset) {
    if (!depDateStr) return null;
    const base = new Date(depDateStr + 'T12:00:00');
    if (isNaN(base.getTime())) return null;
    // Day 1 = depDate. Day -1 = depDate - 1 day. Day 2 = depDate + 1 day.
    // So: real offset in days = (offset > 0 ? offset - 1 : offset)
    const dayDelta = offset > 0 ? offset - 1 : offset;
    const d = new Date(base);
    d.setDate(d.getDate() + dayDelta);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ---------- Loaders ----------
  async function loadAllCities() {
    try {
      const data = await api.get('/api/cities');
      allCities = (data.cities || []).filter(c => c.timezone && c.status !== 0);
    } catch { allCities = []; }
  }
  async function loadMe() {
    const data = await api.get('/api/auth/me');
    if (data && data.user && data.user.home_city) homeCity = data.user.home_city;
  }
  async function loadActiveTrip() {
    try {
      const data = await api.get('/api/trips/next');
      if (!data || !data.trip || !data.trip.id) return null;
      const detail = await api.get('/api/trips/' + data.trip.id);
      return { trip: detail.trip, segments: detail.segments || [] };
    } catch { return null; }
  }

  // ---------- Plan generator ----------
  function buildDays(diff) {
    const absDiff = Math.abs(diff);
    if (absDiff < 2) {
      return {
        severity: 'mild',
        recoveryDays: 1,
        directionLabel: diff === 0 ? 'no shift' : (diff > 0 ? 'east' : 'west'),
        days: [
          { label: 'Day 1', sublabel: 'arrival', offset: 1, location: 'destination', marks: defaultDayMarks(7, 22, 14) },
          { label: 'Day 2', sublabel: '', offset: 2, location: 'destination', marks: defaultDayMarks(7, 22, 14) },
        ],
      };
    }

    const eastbound = diff > 0;
    const recoveryDays = eastbound ? Math.ceil(absDiff * 1.0) : Math.ceil(absDiff * 0.7);
    const severity = absDiff <= 4 ? 'moderate' : (absDiff <= 8 ? 'significant' : 'severe');
    const shiftDays = Math.min(3, absDiff);

    const days = [];

    for (let d = shiftDays; d >= 1; d--) {
      const dayShift = eastbound ? -d : +d;
      const wakeBase = 7 + dayShift;
      const sleepBase = 22 + dayShift;
      const breakfast = 8 + dayShift;
      const lunch = 13 + dayShift;
      const dinner = 19 + dayShift;
      const lastCoffee = 14 + dayShift;

      const marks = [];
      if (eastbound) {
        marks.push({ hour: wakeBase, type: 'light', label: 'morning light' });
        marks.push({ hour: sleepBase - 4, type: 'dark', label: 'avoid light' });
      } else {
        marks.push({ hour: sleepBase - 4, type: 'light', label: 'evening light' });
      }
      marks.push({ hour: breakfast, type: 'meal', label: 'breakfast' });
      marks.push({ hour: lunch, type: 'meal', label: 'lunch' });
      marks.push({ hour: dinner, type: 'meal', label: 'dinner' });
      marks.push({ hour: lastCoffee, type: 'coffee', label: 'last coffee' });
      marks.push({ hour: sleepBase, type: 'sleep', label: 'bedtime' });
      if (eastbound && d === 1) {
        marks.push({ hour: sleepBase - 0.5, type: 'pill', label: 'optional 0.3mg melatonin' });
      }

      days.push({
        label: `Day −${d}`,
        sublabel: 'before flight',
        offset: -d,
        location: 'origin',
        marks: marks.sort((a, b) => a.hour - b.hour),
      });
    }

    const arrivalMarks = [];
    if (eastbound) {
      arrivalMarks.push({ hour: 7, type: 'light', label: 'morning light' });
      arrivalMarks.push({ hour: 18, type: 'dark', label: 'dim lights' });
      arrivalMarks.push({ hour: 8, type: 'meal', label: 'breakfast' });
      arrivalMarks.push({ hour: 13, type: 'meal', label: 'lunch' });
      arrivalMarks.push({ hour: 19, type: 'meal', label: 'dinner' });
      arrivalMarks.push({ hour: 14, type: 'coffee', label: 'last coffee' });
      arrivalMarks.push({ hour: 21.5, type: 'pill', label: 'optional 0.3mg melatonin' });
      arrivalMarks.push({ hour: 22, type: 'sleep', label: 'bedtime' });
    } else {
      arrivalMarks.push({ hour: 8, type: 'meal', label: 'breakfast' });
      arrivalMarks.push({ hour: 13, type: 'meal', label: 'lunch' });
      arrivalMarks.push({ hour: 17, type: 'light', label: 'evening light' });
      arrivalMarks.push({ hour: 19, type: 'meal', label: 'dinner' });
      arrivalMarks.push({ hour: 16, type: 'coffee', label: 'last coffee' });
      arrivalMarks.push({ hour: 23, type: 'sleep', label: 'bedtime, push later' });
    }
    days.push({
      label: 'Day 1', sublabel: 'arrival', offset: 1, location: 'destination',
      marks: arrivalMarks.slice().sort((a, b) => a.hour - b.hour),
    });

    const followCount = Math.max(2, Math.min(recoveryDays - 1, 4));
    for (let d = 2; d <= followCount + 1; d++) {
      days.push({
        label: `Day ${d}`, sublabel: '', offset: d, location: 'destination',
        marks: arrivalMarks.slice().sort((a, b) => a.hour - b.hour),
      });
    }

    return { severity, recoveryDays, directionLabel: eastbound ? 'east' : 'west', days };
  }

  function defaultDayMarks(wake, sleep, lastCoffee) {
    return [
      { hour: wake, type: 'light', label: 'morning light' },
      { hour: 8, type: 'meal', label: 'breakfast' },
      { hour: 13, type: 'meal', label: 'lunch' },
      { hour: lastCoffee, type: 'coffee', label: 'last coffee' },
      { hour: 19, type: 'meal', label: 'dinner' },
      { hour: sleep, type: 'sleep', label: 'bedtime' },
    ];
  }

  // ---------- Render ----------
  function render() {
    if (!fromCity || !toCity) {
      planSection.style.display = 'none';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';
    planSection.style.display = '';

    // Show the no-date prompt only when departure date is missing
    if (noDateEl) noDateEl.style.display = depDate ? 'none' : '';

    const refDate = depDate ? new Date(depDate + 'T12:00:00') : new Date();
    const diff = hourDiff(fromCity.timezone, toCity.timezone, refDate);
    const plan = buildDays(diff);

    const diffLabel = diff === 0 ? 'no time change' :
      `${Math.abs(diff)}h ${diff > 0 ? 'east' : 'west'}`;

    headerStrip.innerHTML = `
      <span class="jl-header__route">${util.escapeHtml(fromCity.name)} → ${util.escapeHtml(toCity.name)}</span>
      <span class="jl-header__sep">·</span>
      <span class="jl-header__diff">${util.escapeHtml(diffLabel)}</span>
      <span class="jl-header__sep">·</span>
      <span class="jl-header__recover">~${plan.recoveryDays} day${plan.recoveryDays === 1 ? '' : 's'}</span>
      <span class="jl-header__sep">·</span>
      <span class="jl-header__sev jl-header__sev--${plan.severity}">${util.escapeHtml(plan.severity)}</span>
    `;

    // Timeline
    let tlHtml = '';
    tlHtml += `
      <div class="jl-tl__axis-row">
        <div class="jl-tl__axis-spacer"></div>
        <div class="jl-tl__axis">
          ${[0, 6, 12, 18, 24].map(h => `<span class="jl-tl__tick" style="left:${(h/24)*100}%">${h}</span>`).join('')}
        </div>
      </div>
    `;
    for (const day of plan.days) {
      const dateStr = dateForOffset(depDate, day.offset);
      const cityName = day.location === 'origin' ? fromCity.name : toCity.name;
      tlHtml += `
        <div class="jl-tl__row">
          <div class="jl-tl__label">
            <span class="jl-tl__day">${util.escapeHtml(day.label)}</span>
            ${dateStr ? `<span class="jl-tl__date">${util.escapeHtml(dateStr)}</span>` : ''}
            <span class="jl-tl__loc">${util.escapeHtml(cityName)}</span>
          </div>
          <div class="jl-tl__track">
            <div class="jl-tl__baseline"></div>
            ${day.marks.map(m => {
              const left = (m.hour / 24) * 100;
              return `<div class="jl-tl__mark jl-tl__mark--${m.type}" style="left:${left}%" title="${util.escapeHtml(m.label)} · ${util.fmtTimeFloat(m.hour)}">${ICONS[m.type] || ''}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }
    timelineEl.innerHTML = tlHtml;

    // Today card
    const todayInfo = pickTodayDay(plan, refDate);
    if (todayInfo) {
      const day = todayInfo.day;
      const todayDate = dateForOffset(depDate, day.offset);
      const todayCity = day.location === 'origin' ? fromCity.name : toCity.name;
      todayEl.innerHTML = `
        <div class="jl-today__head">
          <span class="jl-today__day">${util.escapeHtml(day.label)}</span>
          ${todayDate ? `<span class="jl-today__date">${util.escapeHtml(todayDate)}</span>` : ''}
          <span class="jl-today__loc">${util.escapeHtml(todayCity)}</span>
          ${todayInfo.sublabel ? `<span class="jl-today__sub">${util.escapeHtml(todayInfo.sublabel)}</span>` : ''}
        </div>
        <div class="jl-today__grid">
          ${day.marks.map(m => `
            <div class="jl-today__row">
              <span class="jl-today__icon">${ICONS[m.type]}</span>
              <span class="jl-today__time">${util.fmtTimeFloat(m.hour)}</span>
              <span class="jl-today__label">${util.escapeHtml(m.label)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      todayEl.innerHTML = '';
    }

    const tips = pickTips(plan.directionLabel, plan.severity);
    tipsEl.textContent = tips.join(' · ');
  }

  function pickTodayDay(plan, refDate) {
    if (!plan.days.length) return null;
    if (!depDate) {
      const idx = plan.days.findIndex(d => d.label === 'Day 1');
      return { day: plan.days[idx >= 0 ? idx : 0], sublabel: 'arrival day plan' };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dep = new Date(depDate + 'T00:00:00');
    const daysUntilDep = Math.round((dep - today) / 86400000);

    if (daysUntilDep > plan.days.filter(d => d.label.startsWith('Day −')).length) {
      const earliest = plan.days.find(d => d.label.startsWith('Day −'));
      if (earliest) return { day: earliest, sublabel: `starts in ${daysUntilDep} days` };
      return { day: plan.days[0], sublabel: '' };
    }
    if (daysUntilDep > 0) {
      const target = `Day −${daysUntilDep}`;
      const day = plan.days.find(d => d.label === target);
      if (day) return { day, sublabel: `${daysUntilDep} day${daysUntilDep === 1 ? '' : 's'} before flight` };
    }
    if (daysUntilDep === 0) {
      const day = plan.days.find(d => d.label === 'Day 1');
      if (day) return { day, sublabel: 'flight day' };
    }
    if (daysUntilDep < 0) {
      const dayN = Math.abs(daysUntilDep) + 1;
      const target = `Day ${dayN}`;
      const day = plan.days.find(d => d.label === target);
      if (day) return { day, sublabel: `day ${dayN} in ${toCity.name}` };
    }
    return { day: plan.days[0], sublabel: '' };
  }

  function pickTips(direction, severity) {
    const tips = ['Hydrate hard'];
    if (direction === 'east') tips.push('Front-load sleep');
    else tips.push('Push bedtime later');
    tips.push('Skip airport coffee');
    tips.push('Move your watch on takeoff');
    tips.push('Sunlight beats supplements');
    if (severity === 'severe' || severity === 'significant') tips.push('No meetings first 48h');
    return tips;
  }

  // ---------- Picker ----------
  function setCity(which, city) {
    if (which === 'from') {
      fromCity = city;
      fromBtn.querySelector('[data-name]').textContent = city ? city.name : '—';
    } else {
      toCity = city;
      toBtn.querySelector('[data-name]').textContent = city ? city.name : '—';
    }
    render();
  }
  function setDate(d) {
    depDate = d || null;
    dateInput.value = d || '';
    render();
  }
  function openPopover(which, anchor) {
    popoverWhich = which;
    popoverAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    popover.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
    popover.style.left = (rect.left + window.scrollX) + 'px';
    popover.classList.add('is-open');
    popSearch.value = '';
    renderPopList('');
    setTimeout(() => popSearch.focus(), 50);
  }
  function closePopover() {
    popover.classList.remove('is-open');
    popoverWhich = null;
  }
  function renderPopList(query) {
    const q = (query || '').trim().toLowerCase();
    const list = q
      ? allCities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 12)
      : allCities.filter(c => c.status === 3).slice(0, 20);
    if (!list.length) { popList.innerHTML = '<div class="time-add-empty">No matches.</div>'; return; }
    popList.innerHTML = list.map(c => `
      <button class="time-add-item" data-city-id="${c.id}">
        <span>${util.escapeHtml(c.name)}${c.country ? `<span class="time-add-country">${util.escapeHtml(c.country)}</span>` : ''}</span>
        <span class="time-add-tz">${util.escapeHtml(c.timezone)}</span>
      </button>
    `).join('');
    popList.querySelectorAll('.time-add-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = parseInt(btn.dataset.cityId, 10);
        const c = allCities.find(x => x.id === cid);
        if (c) setCity(popoverWhich, c);
        closePopover();
      });
    });
  }
  popSearch.addEventListener('input', () => renderPopList(popSearch.value));
  popSearch.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopover(); });
  document.addEventListener('click', (e) => {
    if (popoverWhich === null) return;
    if (!popover.contains(e.target) && !(popoverAnchor && popoverAnchor.contains(e.target))) closePopover();
  });
  fromBtn.addEventListener('click', (e) => { e.stopPropagation(); openPopover('from', fromBtn); });
  toBtn.addEventListener('click', (e) => { e.stopPropagation(); openPopover('to', toBtn); });
  dateInput.addEventListener('change', () => setDate(dateInput.value));

  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  await loadAllCities();
  await loadMe();

  if (homeCity) {
    setCity('from', { id: homeCity.id, name: homeCity.name, country: homeCity.country, timezone: homeCity.timezone });
  }

  const activeTrip = await loadActiveTrip();
  if (activeTrip && activeTrip.segments.length) {
    const segs = activeTrip.segments.slice().sort((a, b) => {
      if (a.date_start && b.date_start) return a.date_start.localeCompare(b.date_start);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    const first = segs.find(s => s.city_timezone && s.city_id);
    if (first) {
      setCity('to', {
        id: first.city_id, name: first.city_name,
        country: first.city_country, timezone: first.city_timezone,
      });
      const dep = activeTrip.trip.date_start || first.date_start;
      if (dep) setDate(String(dep).slice(0, 10));
      prefillHint.style.display = '';
      prefillHint.innerHTML = `Prefilled from <a href="/trip.html?id=${activeTrip.trip.id}">${util.escapeHtml(activeTrip.trip.name)}</a>. Change anything above to plan a different trip.`;
    }
  }

  render();

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
})();
