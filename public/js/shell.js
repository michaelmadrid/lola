/* =========================================================
   shell.js
   Header/footer behavior shared by every page.
   Wires: theme, live time, mobile menu, auth state, toast helper.
   ========================================================= */

(function () {
  // ----- Theme (dark mode) ----- runs FIRST to avoid flash
  // The ultra-early <script> in <head> already applies the class;
  // this just keeps in sync if settings change in another tab.
  try {
    if (localStorage.getItem('lola.theme') === 'dark') {
      document.body.classList.add('dark');
    }
  } catch (e) {}

  // ----- Apply header label: greeting if signed in, location if not -----
  // TODO: switch greeting word based on user's home language.
  // For now always "Ciao, [name]" when signed in.
  try {
    const user = window.api && window.api.user.get();
    const homeLoc = localStorage.getItem('lola.home_location') || 'Bali';
    const whereEls = document.querySelectorAll('.head__right .where');
    if (user && user.name) {
      whereEls.forEach(el => { el.textContent = 'Ciao, ' + user.name; });
    } else {
      whereEls.forEach(el => { el.textContent = homeLoc; });
    }
  } catch (e) {}

  // ----- Live time in header -----
  const timeEl = document.getElementById('hdr-time');
  const updateTime = () => {
    if (!timeEl) return;
    try {
      const tz = localStorage.getItem('lola.home_timezone') || 'Asia/Makassar';
      timeEl.textContent = window.util ? window.util.fmtTime(new Date(), { timeZone: tz })
        : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
    } catch (e) {}
  };
  updateTime();
  setInterval(updateTime, 30 * 1000);
  // Allow other pages (like settings) to trigger an immediate re-render
  window.kitUpdateHeaderTime = updateTime;

  // ----- Mobile menu toggle -----
  const menuBtn = document.getElementById('menu-btn');
  const menuOverlay = document.getElementById('menu-overlay');
  if (menuBtn && menuOverlay) {
    const toggleMenu = () => {
      const open = menuOverlay.classList.toggle('is-open');
      menuBtn.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    const closeMenu = () => {
      menuOverlay.classList.remove('is-open');
      menuBtn.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    menuBtn.addEventListener('click', toggleMenu);
    menuOverlay.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOverlay.classList.contains('is-open')) toggleMenu();
    });
  }

  // ----- Sign-out link in mobile menu -----
  const signOutLink = document.getElementById('signout-link');
  if (signOutLink) {
    signOutLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.api && window.api.signOut();
    });
  }

  // ----- Auth-state visibility (for any element with data-auth) -----
  // Elements with data-auth="in" only show when signed in
  // Elements with data-auth="out" only show when signed out
  const isSignedIn = window.api && window.api.isSignedIn();
  document.querySelectorAll('[data-auth="in"]').forEach(el => {
    el.style.display = isSignedIn ? '' : 'none';
  });
  document.querySelectorAll('[data-auth="out"]').forEach(el => {
    el.style.display = isSignedIn ? 'none' : '';
  });

  // ----- Toast helper -----
  let toastEl = null;
  let toastTimeout = null;
  window.toast = function (message, ms = 1800) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  };

  // ----- Global Cmd/Ctrl+Enter → save in any open modal -----
  // Finds the first .modal.is-open in DOM order, then clicks its first
  // non-disabled .save-btn. Works in textarea/input contexts where Enter
  // alone shouldn't submit.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!(e.metaKey || e.ctrlKey)) return;
    const openModal = document.querySelector('.modal.is-open');
    if (!openModal) return;
    const saveBtn = openModal.querySelector('.save-btn:not(:disabled)');
    if (!saveBtn) return;
    e.preventDefault();
    saveBtn.click();
  });
  // ----- Phase-aware moon glyph -----
  // Draws today's lunar phase as the LIT (filled) portion of an SVG path.
  function renderMoonPath() {
    const path = document.getElementById('moon-path');
    if (!path) return;

    // Synodic month from a known new moon (Jan 6, 2000 18:14 UTC)
    const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
    const SYNODIC = 29.53058867;
    const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
    const phase = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC; // 0..1

    const cx = 6, cy = 6, r = 5.5;

    // Lit fraction: 0 (new) → 1 (full) → 0 (new)
    // illum = (1 - cos(2π·phase)) / 2
    const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;

    // Terminator x-radius. At full or new, terminator is at the limb (xR = r).
    // At half phase, terminator is a vertical line through center (xR = 0).
    const xR = r * Math.abs(1 - 2 * illum);

    // We FILL the dark (shadow) side. The unfilled background = lit moon.
    // This matches calendar/Muji convention where the ink is the shadow.
    // Dark side is opposite of lit side: waxing → dark on left, waning → dark on right.
    const darkRight = phase >= 0.5;

    // Whether the SHADOW is the larger area (when moon is mostly dark, near new)
    // or smaller area (when moon is mostly lit, near full).
    const shadowIsBig = illum < 0.5; // less than half lit = mostly shadow

    const outerSweep = darkRight ? 1 : 0;
    let termSweep;
    if (darkRight) termSweep = shadowIsBig ? 1 : 0;
    else           termSweep = shadowIsBig ? 0 : 1;

    const d = `M ${cx} ${cy - r}
               A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r}
               A ${xR} ${r} 0 0 ${termSweep} ${cx} ${cy - r}
               Z`;
    path.setAttribute('d', d);

    // Phase name for tooltip
    const phaseName = (() => {
      if (phase < 0.03 || phase > 0.97) return 'new moon';
      if (phase < 0.22) return 'waxing crescent';
      if (phase < 0.28) return 'first quarter';
      if (phase < 0.47) return 'waxing gibbous';
      if (phase < 0.53) return 'full moon';
      if (phase < 0.72) return 'waning gibbous';
      if (phase < 0.78) return 'last quarter';
      return 'waning crescent';
    })();
    const svg = path.closest('svg');
    if (svg) svg.setAttribute('aria-label', phaseName);
  }
  renderMoonPath();
  setInterval(renderMoonPath, 60 * 60 * 1000);

  // ===== Mobile slim header (rows 2 + 3) =====
  // Injected once per page load. Visible only on mobile via CSS (media query).
  // Row 2: moon glyph + readable date in sans
  // Row 3: contextual items — primary (trip) gets text, secondary (todos, etc.)
  //        get glyph + count. Hidden entirely if neither is present.
  function buildSlimHeader() {
    const header = document.querySelector('header.head');
    if (!header) return;

    // Always inject the mobile avatar circle into header__right (it's a row-1 element,
    // useful on every page).
    const right = header.querySelector('.head__right');
    if (right && !document.getElementById('slim-avatar')) {
      const a = document.createElement('a');
      a.id = 'slim-avatar';
      a.className = 'slim-avatar';
      a.href = '/settings.html';
      a.setAttribute('aria-label', 'Settings');
      a.textContent = '—';
      right.appendChild(a);
    }

    // Rows 2 (date) + 3 (trip/todos pills) are home-only. On other pages, just
    // the standard header (hamburger / logo / avatar) is enough.
    const path = window.location.pathname;
    const isHome = (path === '/' || path === '/index.html');
    if (!isHome) return;

    if (document.getElementById('slim-mobile')) return; // already built

    const slim = document.createElement('div');
    slim.id = 'slim-mobile';
    slim.className = 'slim-mobile';
    slim.innerHTML = `
      <div class="slim-mobile__row2">
        <svg class="slim-mobile__moon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.5" fill="none" stroke="currentColor" stroke-width="1"/>
          <path id="slim-moon-path" fill="currentColor"></path>
        </svg>
        <span class="slim-mobile__date" id="slim-date">—</span>
      </div>
      <div class="slim-mobile__row3" id="slim-row3" hidden>
        <a href="#" class="slim-mobile__pill" id="slim-trip" hidden></a>
        <div class="slim-mobile__glyphs" id="slim-glyphs"></div>
      </div>
    `;
    header.appendChild(slim);
  }

  function renderSlimMoon() {
    const target = document.getElementById('slim-moon-path');
    if (!target) return;
    // Reuse the existing moon math; render into a separate path
    const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
    const SYNODIC = 29.53058867;
    const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
    const phase = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
    const cx = 6, cy = 6, r = 5.5;
    const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
    const xR = r * Math.abs(1 - 2 * illum);
    const darkRight = phase >= 0.5;
    const shadowIsBig = illum < 0.5;
    const outerSweep = darkRight ? 1 : 0;
    let termSweep;
    if (darkRight) termSweep = shadowIsBig ? 1 : 0;
    else           termSweep = shadowIsBig ? 0 : 1;
    const d = `M ${cx} ${cy - r}
               A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r}
               A ${xR} ${r} 0 0 ${termSweep} ${cx} ${cy - r}
               Z`;
    target.setAttribute('d', d);
  }

  function renderSlimDate() {
    const dateEl = document.getElementById('slim-date');
    if (!dateEl) return;
    try {
      const tz = localStorage.getItem('lola.home_timezone') || 'Asia/Makassar';
      const d = new Date();
      // "Friday, May 8" in the user's home tz
      const day = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
      const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: tz });
      const num = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz });
      dateEl.textContent = `${day}, ${month} ${num}`;
    } catch (e) {
      dateEl.textContent = '';
    }
  }

  function renderSlimAvatar() {
    const av = document.getElementById('slim-avatar');
    if (!av) return;
    try {
      const user = window.api && window.api.user.get();
      const name = (user && user.name) ? user.name.trim() : '';
      // First letter of first name, fallback to "?"
      av.textContent = name ? name.charAt(0).toUpperCase() : '?';
    } catch (e) {
      av.textContent = '?';
    }
  }

  // ----- Row 3 context items -----
  // Trip: shown when there's an upcoming or active trip (within 60 days).
  //   - upcoming → "NEXT TRIP · 5 days"
  //   - active   → "ON TRIP · DAY 7"
  //   - past     → hidden
  //   The trip's NAME never appears here — that's reserved for the trip overlay.
  //   Length-stable so any trip name works.
  // Todos: pill button "TODOS · 3", hidden when 0.
  async function renderSlimContext() {
    const row3 = document.getElementById('slim-row3');
    const tripEl = document.getElementById('slim-trip');
    const glyphsEl = document.getElementById('slim-glyphs');
    if (!row3 || !tripEl || !glyphsEl) return;

    // Row 3 (trip + todos) is home-only. Both overlays live on the home page,
    // so showing the pills elsewhere creates dead-end taps. Bail early on other pages.
    const path = window.location.pathname;
    const isHome = (path === '/' || path === '/index.html');
    if (!isHome) {
      row3.hidden = true;
      tripEl.hidden = true;
      glyphsEl.innerHTML = '';
      return;
    }

    let hasTrip = false;
    let hasGlyphs = false;

    // ---- Trip status ----
    let bestTrip = null;
    if (window.api && window.api.isSignedIn && window.api.isSignedIn()) {
      try {
        const data = await window.api.get('/api/trips');
        const trips = (data && data.trips) || [];
        const today = new Date();
        const todayMs = today.setHours(0, 0, 0, 0);
        let bestRank = Infinity;
        for (const t of trips) {
          if (!t.date_start || !t.date_end) continue;
          const startMs = new Date(t.date_start).getTime();
          const endMs   = new Date(t.date_end).getTime();
          if (endMs < todayMs) continue;
          let rank;
          if (startMs <= todayMs && todayMs <= endMs) rank = -1;
          else rank = (startMs - todayMs);
          const daysOut = (startMs - todayMs) / 86400000;
          if (rank > 0 && daysOut > 60) continue;
          if (rank < bestRank) { bestRank = rank; bestTrip = t; }
        }
        if (bestTrip) {
          const startMs = new Date(bestTrip.date_start).getTime();
          const endMs   = new Date(bestTrip.date_end).getTime();
          const isOnTrip = (startMs <= todayMs && todayMs <= endMs);
          const label = isOnTrip ? 'On trip' : 'Next trip';
          // Trip is now a pill matching the todos pill exactly.
          // No countdown, no glyph — just the label. Tap opens trip overlay.
          tripEl.innerHTML = `<span class="slim-mobile__pill-value">${label}</span>`;
          tripEl.dataset.tripId = bestTrip.id;
          tripEl.hidden = false;
          hasTrip = true;
        } else {
          tripEl.hidden = true;
        }
      } catch (e) {
        tripEl.hidden = true;
      }
    } else {
      tripEl.hidden = true;
    }

    // ---- Todos pill ----
    glyphsEl.innerHTML = '';
    if (window.api && window.api.isSignedIn && window.api.isSignedIn()) {
      try {
        const data = await window.api.get('/api/todos?view=today');
        const todos = (data && data.todos) || [];
        const open = todos.filter(t => !t.completed_at && !t.archived_at).length;
        if (open > 0) {
          const a = document.createElement('a');
          a.className = 'slim-mobile__pill';
          a.href = '#';
          a.id = 'slim-todos';
          a.setAttribute('aria-label', `${open} open todos`);
          // Glyph-led, no labels: "✓ 3"
          a.innerHTML = `<span class="slim-mobile__pill-glyph">✓</span><span class="slim-mobile__pill-value">${open}</span>`;
          glyphsEl.appendChild(a);
          hasGlyphs = true;
          a.addEventListener('click', (e) => {
            e.preventDefault();
            const fsBtn = document.getElementById('todos-expand');
            if (fsBtn) { fsBtn.click(); }
            else { window.location.href = '/'; }
          });
        }
      } catch (e) {}
    }

    row3.hidden = !(hasTrip || hasGlyphs);

    if (hasTrip) {
      tripEl.style.cursor = 'pointer';
      tripEl.onclick = (e) => {
        e.preventDefault();
        // On home page: click the existing trip-strip which has the full
        // openItinerary() handler with activeTrip state populated.
        const tripStrip = document.getElementById('trip-strip');
        if (tripStrip) {
          tripStrip.click();
          return;
        }
        // Off home: trip overlay's content is owned by home.js — go home.
        // (User taps trip pill again on home and overlay opens cleanly.)
        window.location.href = '/';
      };
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  buildSlimHeader();
  renderSlimMoon();
  renderSlimDate();
  renderSlimAvatar();
  renderSlimContext();
  // Refresh date around midnight
  setInterval(renderSlimDate, 5 * 60 * 1000);
})();
