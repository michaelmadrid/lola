/* =========================================================
   jetlag.js — Jetlag recovery planner
   Pure rule-based. No AI, no DB writes — reads /api/auth/me
   and /api/trips/next for prefill.
   ========================================================= */

(async function () {
  // ---------- State ----------
  let allCities = [];
  let homeCity = null;
  let fromCity = null;
  let toCity = null;
  let depDate = null;            // YYYY-MM-DD string
  let popoverWhich = null;       // 'from' | 'to'
  let popoverAnchor = null;

  // ---------- DOM ----------
  const fromBtn  = document.getElementById('jl-from-btn');
  const toBtn    = document.getElementById('jl-to-btn');
  const dateInput = document.getElementById('jl-date');
  const prefillHint = document.getElementById('jl-prefill-hint');

  const popover     = document.getElementById('jl-popover');
  const popSearch   = document.getElementById('jl-popover-search');
  const popList     = document.getElementById('jl-popover-list');

  const sumSection  = document.getElementById('jl-summary-section');
  const sumEl       = document.getElementById('jl-summary');
  const beforeSection = document.getElementById('jl-before-section');
  const beforeEl    = document.getElementById('jl-before');
  const arrivalSection = document.getElementById('jl-arrival-section');
  const arrivalEl   = document.getElementById('jl-arrival');
  const followSection = document.getElementById('jl-followup-section');
  const followEl    = document.getElementById('jl-followup');
  const tipsSection = document.getElementById('jl-tips-section');
  const tipsEl      = document.getElementById('jl-tips');
  const emptySection = document.getElementById('jl-empty-section');

  // ---------- Time math ----------
  // Hour difference between two timezones at a given moment.
  // Positive = `to` is AHEAD of `from` (going east means +N hours).
  function hourDiff(fromTz, toTz, atDate = new Date()) {
    if (!fromTz || !toTz) return 0;
    const fromH = hourFloat(fromTz, atDate);
    const toH = hourFloat(toTz, atDate);
    let diff = toH - fromH;
    // Normalize to [-12, +14] range (canonical timezone diff range)
    if (diff > 14)  diff -= 24;
    if (diff < -12) diff += 24;
    return Math.round(diff);
  }

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

  // ---------- Loading ----------
  async function loadAllCities() {
    try {
      const data = await api.get('/api/cities');
      allCities = (data.cities || []).filter(c => c.timezone && c.status !== 0);
    } catch {
      allCities = [];
    }
  }

  async function loadMe() {
    const data = await api.get('/api/auth/me');
    if (data && data.user && data.user.home_city) {
      homeCity = data.user.home_city;
    }
  }

  async function loadActiveTrip() {
    try {
      const data = await api.get('/api/trips/next');
      if (!data || !data.trip || !data.trip.id) return null;
      // Fetch trip detail to get segments with timezone
      const detail = await api.get('/api/trips/' + data.trip.id);
      return { trip: detail.trip, segments: detail.segments || [] };
    } catch {
      return null;
    }
  }

  // ---------- Setters ----------
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

  // ---------- Picker popover ----------
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

    if (!list.length) {
      popList.innerHTML = '<div class="time-add-empty">No matches.</div>';
      return;
    }
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
    if (!popover.contains(e.target) && !(popoverAnchor && popoverAnchor.contains(e.target))) {
      closePopover();
    }
  });

  fromBtn.addEventListener('click', (e) => { e.stopPropagation(); openPopover('from', fromBtn); });
  toBtn.addEventListener('click', (e) => { e.stopPropagation(); openPopover('to', toBtn); });
  dateInput.addEventListener('change', () => setDate(dateInput.value));

  // ---------- Recommendations ----------
  // Returns the full plan based on hour diff.
  // Sign convention: positive diff = destination is ahead of origin (east).
  function buildPlan(diff) {
    const absDiff = Math.abs(diff);
    if (absDiff < 2) {
      return {
        severity: 'mild',
        days: 1,
        direction: diff === 0 ? 'no time change' : (diff > 0 ? 'eastbound' : 'westbound'),
        directionNote: 'Less than 2 hours — barely jetlag. You\'ll feel fine in a day.',
        before: [],
        arrival: [
          { time: 'all day', text: 'Stay on local schedule. Light breakfast on arrival, normal meals.' },
          { time: 'evening', text: 'Sleep at the local bedtime. Don\'t nap during the day.' },
        ],
        followup: [
          { text: 'You\'re basically adjusted by day 2. Continue local schedule.' },
        ],
      };
    }

    const eastbound = diff > 0;
    const days = eastbound ? Math.ceil(absDiff * 1.0) : Math.ceil(absDiff * 0.7);
    const severity = absDiff <= 4 ? 'moderate' : (absDiff <= 8 ? 'significant' : 'severe');

    // Pre-trip shift: cap at 3 hours, 1h per day
    const shiftDays = Math.min(3, absDiff);
    const before = [];
    if (shiftDays > 0) {
      for (let d = shiftDays; d >= 1; d--) {
        const shift = d;
        if (eastbound) {
          before.push({
            time: `${d} day${d === 1 ? '' : 's'} before`,
            text: `Sleep ${shift}h earlier. Get bright light early. Avoid screens after dinner.`,
          });
        } else {
          before.push({
            time: `${d} day${d === 1 ? '' : 's'} before`,
            text: `Sleep ${shift}h later. Get bright light in the evening. Coffee later in the day is fine.`,
          });
        }
      }
    }

    // Day 1 plan in destination local time
    let arrival = [];
    if (eastbound) {
      arrival = [
        { time: 'on arrival', text: 'If you land in the morning, get sunlight immediately. If you land at night, dim the lights and aim for sleep.' },
        { time: '07:00', text: 'Wake. Bright light walk. No napping today.' },
        { time: '08:00', text: 'Light breakfast — protein, fruit, no heavy carbs.' },
        { time: '13:00', text: 'Lunch outside if possible. Keep light exposure going.' },
        { time: 'until 14:00', text: 'Caffeine OK before this. Cut it after.' },
        { time: 'avoid', text: 'Bright light after sunset on day 1. Heavy dinners. Alcohol.' },
        { time: '21:30', text: 'Dim lights. Optional 0.3–0.5mg melatonin.' },
        { time: '22:00', text: 'Bedtime. Dark room, cool temperature.' },
      ];
    } else {
      arrival = [
        { time: 'on arrival', text: 'If you land mid-day, push through to a normal local bedtime. Power naps under 30min OK.' },
        { time: '08:00', text: 'Wake at local time. Skip morning bright light if you\'re struggling — soft indoor light fine.' },
        { time: '13:00', text: 'Lunch. Caffeine OK with lunch.' },
        { time: 'after 17:00', text: 'Get strong evening light — sunset walk, café outside.' },
        { time: 'until 16:00', text: 'Caffeine OK before this. Cut it after.' },
        { time: 'avoid', text: 'Going to bed too early. Big nap after 16:00.' },
        { time: '23:00', text: 'Bedtime — push later than feels natural to align with local.' },
      ];
    }

    // Days 2-3
    const followup = [];
    if (severity === 'mild' || severity === 'moderate') {
      followup.push({ text: 'Same daily plan. By day 3 you\'ll feel mostly aligned.' });
    } else if (severity === 'significant') {
      followup.push({ text: 'Same daily plan. Day 2 is often the worst — push through. Day 3 you turn the corner.' });
      followup.push({ text: 'If you crashed early on day 1, expect a 4 AM wake-up. Don\'t fight it — get up, dim light, read, sleep again at 6 AM.' });
    } else {
      followup.push({ text: 'Severe shift. Stick to the plan strictly for 4–5 days. Resist napping past 30 minutes.' });
      followup.push({ text: 'Day 2-3: weakest point. Don\'t schedule important meetings in the first 48 hours if you can avoid it.' });
      followup.push({ text: `Full alignment around day ${days}.` });
    }

    return {
      severity,
      days,
      direction: eastbound ? 'eastbound' : 'westbound',
      directionNote: eastbound
        ? 'Eastbound is harder — your body has to advance its clock, which fights its natural drift.'
        : 'Westbound is easier — you\'re extending your day, which aligns with your natural drift.',
      before,
      arrival,
      followup,
    };
  }

  // ---------- Render ----------
  function render() {
    if (!fromCity || !toCity) {
      [sumSection, beforeSection, arrivalSection, followSection, tipsSection]
        .forEach(s => s.style.display = 'none');
      emptySection.style.display = '';
      return;
    }
    emptySection.style.display = 'none';

    const refDate = depDate ? new Date(depDate + 'T12:00:00') : new Date();
    const diff = hourDiff(fromCity.timezone, toCity.timezone, refDate);
    const plan = buildPlan(diff);

    // ----- Summary
    const diffLabel = diff === 0 ? 'no time difference' :
      `${Math.abs(diff)} hour${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead' : 'behind'}`;
    sumEl.innerHTML = `
      <div class="jl-summary__row">
        <span class="jl-summary__k">Difference</span>
        <span class="jl-summary__v">${util.escapeHtml(diffLabel)}</span>
      </div>
      <div class="jl-summary__row">
        <span class="jl-summary__k">Direction</span>
        <span class="jl-summary__v">${util.escapeHtml(plan.direction)}</span>
      </div>
      <div class="jl-summary__row">
        <span class="jl-summary__k">Severity</span>
        <span class="jl-summary__v">${util.escapeHtml(plan.severity)}</span>
      </div>
      <div class="jl-summary__row">
        <span class="jl-summary__k">Time to recover</span>
        <span class="jl-summary__v">~${plan.days} day${plan.days === 1 ? '' : 's'}</span>
      </div>
      <p class="jl-summary__note">${util.escapeHtml(plan.directionNote)}</p>
    `;
    sumSection.style.display = '';

    // ----- Before
    if (plan.before.length) {
      beforeEl.innerHTML = plan.before.map(p => `
        <div class="jl-plan__row">
          <span class="jl-plan__when">${util.escapeHtml(p.time)}</span>
          <span class="jl-plan__what">${util.escapeHtml(p.text)}</span>
        </div>
      `).join('');
      beforeSection.style.display = '';
    } else {
      beforeSection.style.display = 'none';
    }

    // ----- Arrival
    arrivalEl.innerHTML = plan.arrival.map(p => `
      <div class="jl-plan__row">
        <span class="jl-plan__when">${util.escapeHtml(p.time)}</span>
        <span class="jl-plan__what">${util.escapeHtml(p.text)}</span>
      </div>
    `).join('');
    arrivalSection.style.display = '';

    // ----- Followup
    followEl.innerHTML = plan.followup.map(p => `
      <div class="jl-plan__row">
        <span class="jl-plan__what">${util.escapeHtml(p.text)}</span>
      </div>
    `).join('');
    followSection.style.display = '';

    // ----- Tips
    tipsEl.innerHTML = jlTips.map(t => `<li>${util.escapeHtml(t)}</li>`).join('');
    tipsSection.style.display = '';
  }

  const jlTips = [
    'Hydration matters more than supplements. Two large glasses of water per flight hour.',
    'Melatonin works best at low doses (0.3–0.5mg, not the 5mg pills). Take 30 minutes before target bedtime.',
    'Skip the airport coffee unless it\'s your morning at destination. Adjust caffeine to local schedule.',
    'Move your watch to destination time when you board. Eat and sleep on that schedule on the flight.',
    'Sunlight is the strongest cue. Outdoor light in the morning at destination resets faster than any pill.',
    'No alcohol on the flight. It compounds dehydration and disrupts the sleep architecture you need.',
  ];

  // ---------- Sign-in gate ----------
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  // ---------- Init ----------
  await loadAllCities();
  await loadMe();

  // Default 'from' = home
  if (homeCity) {
    setCity('from', { id: homeCity.id, name: homeCity.name, country: homeCity.country, timezone: homeCity.timezone });
  }

  // Try to prefill 'to' + departure from active/upcoming trip
  const activeTrip = await loadActiveTrip();
  if (activeTrip && activeTrip.segments.length) {
    // Sort segments by start date or sort_order to find the FIRST destination
    const segs = activeTrip.segments.slice().sort((a, b) => {
      if (a.date_start && b.date_start) return a.date_start.localeCompare(b.date_start);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    const first = segs.find(s => s.city_timezone && s.city_id);
    if (first) {
      setCity('to', {
        id: first.city_id,
        name: first.city_name,
        country: first.city_country,
        timezone: first.city_timezone,
      });
      // Departure = trip start date (or first segment date)
      const dep = activeTrip.trip.date_start || first.date_start;
      if (dep) {
        const isoDate = String(dep).slice(0, 10);
        setDate(isoDate);
      }
      prefillHint.style.display = '';
      prefillHint.innerHTML = `Prefilled from <a href="/trip.html?id=${activeTrip.trip.id}">${util.escapeHtml(activeTrip.trip.name)}</a>. Change anything above to plan a different trip.`;
    }
  }

  // Trigger render after init
  render();

  // ---------- Footer signout ----------
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
})();
