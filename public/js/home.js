/* =========================================================
   home.js — homepage behavior, wired to API
   ========================================================= */

// DEBUG BANNER — temporary diagnostic. Tells us whether home.js executes
// and what state the DOM is in when it does. Remove after we resolve the
// launcher-not-appearing bug.
(function debugBanner() {
  try {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2a4ed4;color:#fff;padding:8px 12px;font:12px/1.4 monospace;text-align:center;';
    const launcher = document.getElementById('capture-launcher');
    const fs = document.getElementById('capture-fs');
    banner.textContent = 'home.js ran · launcher: ' + (launcher ? 'FOUND' : 'NULL') +
                         ' · overlay: ' + (fs ? 'FOUND' : 'NULL') +
                         ' · body chars: ' + document.body.innerHTML.length;
    document.body.appendChild(banner);
  } catch (e) {
    alert('home.js banner failed: ' + e.message);
  }
})();

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
      // Only highlight the start and end dates, not the full range
      return ymd === tripStart || ymd === tripEnd;
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

  // ============ CAPTURE — launcher + fullscreen overlay ============
  // The home page no longer has an inline capture textarea.
  // Instead, a "launcher" button looks like a field but opens a fullscreen
  // overlay editor. Same UX as /capture/ but in-page (no navigation).

  const launcher           = document.getElementById('capture-launcher');
  const launcherCityName   = document.getElementById('capture-launcher-city-name');

  const captFs                 = document.getElementById('capture-captFs');
  const captFsClose            = document.getElementById('capture-captFs-close');
  const captFsTextarea         = document.getElementById('capture-captFs-textarea');
  const captFsStatus           = document.getElementById('capture-captFs-status');
  const captFsSubmitContinue   = document.getElementById('capture-captFs-submit-continue');
  const captFsSubmitClose      = document.getElementById('capture-captFs-submit-close');

  const captFsCityBtn          = document.getElementById('capture-captFs-city-btn');
  const captFsCityBtnName      = document.getElementById('capture-captFs-city-btn-name');
  const captFsCityPopover      = document.getElementById('capture-captFs-city-popover');
  const captFsCitySearch       = document.getElementById('capture-captFs-city-search');
  const captFsCityList         = document.getElementById('capture-captFs-city-list');

  const captFsBeenBtn          = document.getElementById('capture-captFs-been-btn');
  const captFsBeenText         = document.getElementById('capture-captFs-been-text');

  // Shared keys — match /capture/ page so preferences persist across surfaces
  const CITY_STORAGE_KEY = 'kit.capture.lastCity';
  const BEEN_STORAGE_KEY = 'kit.capture.lastBeen';

  let captFsAllCities = [];
  let captFsPickedCity = null;
  let captFsBeen = true;
  let captFsIsSubmitting = false;

  // ---- Been toggle ----
  function applyCaptFsBeen(val) {
    captFsBeen = !!val;
    if (captFsBeenBtn)  captFsBeenBtn.dataset.been = captFsBeen ? 'true' : 'false';
    if (captFsBeenText) captFsBeenText.textContent = captFsBeen ? "I've been here" : "I want to go";
    try { localStorage.setItem(BEEN_STORAGE_KEY, captFsBeen ? '1' : '0'); } catch {}
  }
  try {
    const stored = localStorage.getItem(BEEN_STORAGE_KEY);
    applyCaptFsBeen(stored !== '0');
  } catch { applyCaptFsBeen(true); }
  if (captFsBeenBtn) captFsBeenBtn.addEventListener('click', () => applyCaptFsBeen(!captFsBeen));

  // ---- City picker ----
  function setPickedCity(city) {
    captFsPickedCity = city;
    if (captFsCityBtnName) captFsCityBtnName.textContent = city ? city.name : 'pick a city';
    if (launcherCityName) launcherCityName.textContent = city ? city.name : 'pick a city';
    if (city) {
      try {
        localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify({ id: city.id, name: city.name, country: city.country }));
      } catch {}
    }
  }

  // Try to restore last city from localStorage so the launcher knows where you were
  try {
    const raw = localStorage.getItem(CITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) {
        // Provisional set — will be replaced once cities are loaded for full data
        setPickedCity(parsed);
      }
    }
  } catch {}

  async function loadCitiesIfNeeded() {
    if (captFsAllCities.length) return;
    try {
      const data = await api.get('/api/cities?limit=200');
      captFsAllCities = data.cities || [];
      // If no city picked yet, default to user's home_city, else first city
      if (!captFsPickedCity || !captFsPickedCity.id) {
        try {
          const me = await api.get('/api/auth/me');
          if (me && me.home_city_id) {
            const home = captFsAllCities.find(c => c.id === me.home_city_id);
            if (home) setPickedCity(home);
          }
        } catch {}
        if (!captFsPickedCity || !captFsPickedCity.id) {
          if (captFsAllCities[0]) setPickedCity(captFsAllCities[0]);
        }
      }
    } catch (err) {
      console.error('loadCities', err);
    }
  }

  function renderCityList(filter) {
    if (!captFsCityList) return;
    const f = (filter || '').toLowerCase().trim();
    let cities = captFsAllCities;
    if (f) {
      cities = cities.filter(c =>
        c.name.toLowerCase().includes(f) ||
        (c.country && c.country.toLowerCase().includes(f))
      );
    }
    cities = cities.slice(0, 80);
    captFsCityList.innerHTML = cities.map(c =>
      `<button class="capture-fs__city-item${captFsPickedCity && captFsPickedCity.id === c.id ? ' is-current' : ''}" data-city-id="${c.id}">
         ${util.escapeHtml(c.name)}<span class="capture-fs__city-item__country">${util.escapeHtml(c.country || '')}</span>
       </button>`
    ).join('');
    captFsCityList.querySelectorAll('.capture-fs__city-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.cityId, 10);
        const city = captFsAllCities.find(c => c.id === id);
        if (city) {
          setPickedCity(city);
          closeCityPopover();
        }
      });
    });
  }

  function openCityPopover() {
    if (!captFsCityPopover) return;
    captFsCityPopover.classList.add('is-open');
    if (captFsCitySearch) {
      captFsCitySearch.value = '';
      renderCityList('');
      // Slight delay to focus after layout
      setTimeout(() => captFsCitySearch.focus(), 30);
    }
  }
  function closeCityPopover() {
    if (captFsCityPopover) captFsCityPopover.classList.remove('is-open');
  }
  if (captFsCityBtn) {
    captFsCityBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await loadCitiesIfNeeded();
      if (captFsCityPopover && captFsCityPopover.classList.contains('is-open')) closeCityPopover();
      else openCityPopover();
    });
  }
  if (captFsCitySearch) captFsCitySearch.addEventListener('input', () => renderCityList(captFsCitySearch.value));
  document.addEventListener('click', (e) => {
    if (captFsCityPopover && !captFsCityPopover.contains(e.target) && !captFsCityBtn.contains(e.target)) {
      closeCityPopover();
    }
  });

  // ---- Open / close overlay ----
  function openCaptFs() {
    if (!captFs) return;
    // Snapshot current scroll for restoration on close
    captFs.hidden = false;
    document.body.style.overflow = 'hidden';
    // Force reflow so the entrance transition runs
    void captFs.offsetHeight;
    captFs.classList.add('is-open');
    captFs.setAttribute('aria-hidden', 'false');
    // Make sure cities load in the background
    loadCitiesIfNeeded();
    // Focus the textarea after the slide-in animation lands
    setTimeout(() => {
      if (captFsTextarea) captFsTextarea.focus();
      autoGrowCaptFs();
    }, 80);
  }
  function closeCaptFs() {
    if (!captFs) return;
    captFs.classList.remove('is-open');
    captFs.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // After the transition, hide entirely so it's out of tab order
    setTimeout(() => {
      if (!captFs.classList.contains('is-open')) captFs.hidden = true;
    }, 260);
  }
  if (launcher) launcher.addEventListener('click', openCaptFs);
  if (captFsClose)  captFsClose.addEventListener('click', closeCaptFs);
  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && captFs && captFs.classList.contains('is-open')) {
      closeCaptFs();
    }
  });

  // ---- Textarea grow + status ----
  function autoGrowCaptFs() {
    if (!captFsTextarea) return;
    captFsTextarea.style.height = 'auto';
    captFsTextarea.style.height = captFsTextarea.scrollHeight + 'px';
  }
  function updateStatus() {
    if (!captFsStatus || !captFsTextarea) return;
    const lines = captFsTextarea.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { captFsStatus.textContent = ''; return; }
    captFsStatus.textContent = lines.length === 1
      ? `1 entry`
      : `${lines.length} entries`;
  }
  if (captFsTextarea) {
    captFsTextarea.addEventListener('input', () => { autoGrowCaptFs(); updateStatus(); });
  }

  // ---- Submit ----
  async function captFsDoSubmit({ thenClose }) {
    if (captFsIsSubmitting) return;
    if (!captFsTextarea) return;
    const text = captFsTextarea.value.trim();
    if (!text) return;
    if (!captFsPickedCity) return;
    captFsIsSubmitting = true;
    captFsSubmitClose.disabled = true;
    captFsSubmitContinue.disabled = true;
    try {
      const body = { text, city_id: captFsPickedCity.id, city_name: captFsPickedCity.name, been: captFsBeen };
      const result = await api.post('/api/saves', body);
      const count = result.count || 1;
      // Reset state immediately so UI never gets stuck
      captFsIsSubmitting = false;
      captFsSubmitClose.disabled = false;
      captFsSubmitContinue.disabled = false;
      if (thenClose) {
        // Clear, close, refresh stream
        captFsTextarea.value = '';
        autoGrowCaptFs();
        updateStatus();
        toast(count === 1 ? 'Saved' : `${count} saves`);
        closeCaptFs();
        // Show ghost row right away so home stream feels live, then poll for AI parse
        injectGhostRow();
        setTimeout(() => loadStream(), 1500);
        setTimeout(() => loadStream(), 3500);
        setTimeout(() => loadStream(), 7000);
        setTimeout(() => loadStream(), 12000);
      } else {
        // Continue: clear field but keep overlay open
        captFsTextarea.value = '';
        autoGrowCaptFs();
        updateStatus();
        if (count === 1) toast('Saved');
        else toast(`${count} saves`);
        captFsTextarea.focus();
        // Background-poll the stream so when user closes, it's already up to date
        setTimeout(() => loadStream(), 1500);
        setTimeout(() => loadStream(), 4000);
      }
    } catch (err) {
      console.error('captFs save', err);
      captFsIsSubmitting = false;
      captFsSubmitClose.disabled = false;
      captFsSubmitContinue.disabled = false;
      toast(err.message || 'Save failed');
    }
  }
  if (captFsSubmitClose)    captFsSubmitClose.addEventListener('click', () => captFsDoSubmit({ thenClose: true }));
  if (captFsSubmitContinue) captFsSubmitContinue.addEventListener('click', () => captFsDoSubmit({ thenClose: false }));
  // Keyboard shortcuts inside the textarea
  if (captFsTextarea) {
    captFsTextarea.addEventListener('keydown', (e) => {
      // Cmd+Enter or Ctrl+Enter → save & continue
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        captFsDoSubmit({ thenClose: false });
        return;
      }
      // Shift+Cmd+Enter → save & close
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        captFsDoSubmit({ thenClose: true });
        return;
      }
    });
  }

  // Inject a generic pulsing ghost row at the top of the stream while AI parses.
  // Same as before — used after captFs submit-and-close.
  function injectGhostRow() {
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


  // ============ STREAM ============
  const streamEl = document.getElementById('stream');
  const streamEmpty = document.getElementById('stream-empty');

  async function loadStream() {
    try {
      const data = await api.get('/api/saves?limit=30');
      renderStream(data.saves || []);
      // If any ghost rows are visible (just-captured saves still being parsed by AI),
      // schedule retry-fetches to replace them once parsing completes.
      schedulePendingRetries();
    } catch (err) {
      console.error('loadStream', err);
    }
  }

  // If pending/ghost saves exist in the stream, poll a few times to catch the
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
      return `<div class="stream__item${variantClass}${wantClass}" data-id="${s.id}">
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
  const saveFsCountry  = document.getElementById('save-fs-country');
  const saveFsClose    = document.getElementById('save-editor-close');
  const saveFsSave     = document.getElementById('save-fs-save');
  const saveFsArchive  = document.getElementById('save-fs-archive');
  const saveFsReparse  = document.getElementById('save-fs-reparse');
  const saveFsBeenYes  = document.getElementById('save-fs-been-yes');
  const saveFsBeenNo   = document.getElementById('save-fs-been-no');

  let editingSaveId = null;
  let editingPickedCityId = null; // city id the user picked from suggestions
  let editingOriginalCityName = '';
  let editingBeen = true;

  function applyEditingBeen(val) {
    editingBeen = !!val;
    if (saveFsBeenYes) saveFsBeenYes.dataset.active = editingBeen ? 'true' : 'false';
    if (saveFsBeenNo)  saveFsBeenNo.dataset.active  = editingBeen ? 'false' : 'true';
  }
  if (saveFsBeenYes) saveFsBeenYes.addEventListener('click', () => applyEditingBeen(true));
  if (saveFsBeenNo)  saveFsBeenNo.addEventListener('click', () => applyEditingBeen(false));

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
      saveFsCountry.textContent = save.country || '—';
      saveFsCitySuggest.innerHTML = '';
      // Default to true if missing (legacy rows before migration)
      applyEditingBeen(typeof save.been === 'boolean' ? save.been : true);

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
      been:         editingBeen,
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
