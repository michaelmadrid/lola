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

  // ----- Stream theme (separate from dark/light) -----
  // Stream themes change how saves are rendered (default list, pills, etc).
  // Storage key: kit.streamTheme. Override with ?theme=NAME for one-off testing.
  // Recognized values: 'default' (current look, no class), 'pills'.
  // Body class added: theme-{name} when set to a non-default value.
  try {
    const params = new URLSearchParams(location.search);
    const queryTheme = params.get('theme');
    let theme = queryTheme || localStorage.getItem('kit.streamTheme') || 'default';
    // Persist query override so subsequent navigations remember it
    if (queryTheme) localStorage.setItem('kit.streamTheme', queryTheme);
    if (theme && theme !== 'default') {
      document.body.classList.add('theme-' + theme);
    }
  } catch (e) {}

  // ----- Apply header location label -----
  // The user identity now lives in the avatar (top-right desktop, bottom-right mobile).
  // The .where element is just the location/home city — always.
  try {
    const homeLoc = localStorage.getItem('lola.home_location') || 'Bali';
    const whereEls = document.querySelectorAll('.head__right .where');
    whereEls.forEach(el => { el.textContent = homeLoc; });
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

  // ----- Wrap header right (.where + #hdr-time) into a tappable button on desktop -----
  // On click → opens a mini Clocks popover. Hover → blue.
  // Mobile: no popover (clocks live at /clocks/, accessible via menu).
  // Idempotent — if already wrapped, skip.
  const headRight = document.querySelector('.head__right');
  if (headRight && timeEl && !document.getElementById('time-trigger')) {
    const where = headRight.querySelector('.where');
    if (where) {
      const trigger = document.createElement('button');
      trigger.id = 'time-trigger';
      trigger.type = 'button';
      trigger.className = 'time-trigger';
      trigger.setAttribute('aria-label', 'Clocks');
      trigger.setAttribute('aria-haspopup', 'true');
      // Move .where + #hdr-time INSIDE the button
      where.parentNode.insertBefore(trigger, where);
      trigger.appendChild(where);
      trigger.appendChild(timeEl);
      trigger.addEventListener('click', toggleTimePopover);
    }
  }

  // ----- Build time popover (once per page) -----
  function buildTimePopover() {
    if (document.getElementById('time-popover')) return;
    const panel = document.createElement('div');
    panel.id = 'time-popover';
    panel.className = 'time-popover';
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="time-popover__scrim" aria-hidden="true"></div>
      <div class="time-popover__sheet" role="dialog" aria-label="Clocks">
        <div class="time-popover__list" id="time-popover-list">
          <div class="time-popover__loading">Loading…</div>
        </div>
        <a href="/clocks/" class="time-popover__open">Open clocks →</a>
      </div>
    `;
    document.body.appendChild(panel);

    // Scrim closes (used on mobile only, transparent on desktop)
    panel.querySelector('.time-popover__scrim').addEventListener('click', closeTimePopover);

    // Esc closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) closeTimePopover();
    });
  }

  function toggleTimePopover(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const panel = document.getElementById('time-popover');
    if (!panel) {
      buildTimePopover();
      // re-find
      return setTimeout(() => toggleTimePopover(), 10);
    }
    if (panel.classList.contains('is-open')) closeTimePopover();
    else openTimePopover();
  }

  async function openTimePopover() {
    const panel = document.getElementById('time-popover');
    if (!panel) return;
    panel.hidden = false;
    void panel.offsetHeight;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    // Refresh content
    await renderTimePopoverList();
  }

  function closeTimePopover() {
    const panel = document.getElementById('time-popover');
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true;
    }, 200);
  }

  // Render the city list inside the popover.
  // Reads from /api/auth/me (home_city + tracked_cities). Shows up to 6 cities.
  async function renderTimePopoverList() {
    const list = document.getElementById('time-popover-list');
    if (!list) return;
    if (!window.api || !window.api.isSignedIn || !window.api.isSignedIn()) {
      list.innerHTML = '<div class="time-popover__empty">Sign in to track cities.</div>';
      return;
    }
    try {
      const meResp = await window.api.get('/api/auth/me');
      const u = meResp && meResp.user;
      if (!u) { list.innerHTML = '<div class="time-popover__empty">No data.</div>'; return; }
      const home = u.home_city;
      const tracked = Array.isArray(u.tracked_cities) ? u.tracked_cities : [];
      // Build rows: home first, then tracked, max 6
      const rows = [];
      if (home) rows.push({ name: home.name, timezone: home.timezone, isHome: true });
      for (const t of tracked) {
        rows.push({ name: t.name, timezone: t.timezone, isHome: false });
        if (rows.length >= 6) break;
      }
      if (!rows.length) {
        list.innerHTML = '<div class="time-popover__empty">No cities yet — <a href="/clocks/">add one</a>.</div>';
        return;
      }

      const homeTz = home ? home.timezone : null;
      const homeH = homeTz ? hourFloatTz(homeTz) : 0;

      list.innerHTML = rows.map(r => {
        const time = window.util ? window.util.fmtTime(new Date(), { timeZone: r.timezone })
          : new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: r.timezone });
        const offLabel = r.isHome ? '' : fmtOffsetFromHome(r.timezone, homeH);
        return `
          <div class="time-popover__row">
            <div class="time-popover__row-lhs">
              <div class="time-popover__city">${escapeHtml(r.name)}</div>
              <div class="time-popover__off">${offLabel || '\u00a0'}</div>
            </div>
            <div class="time-popover__time">${time}</div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('renderTimePopoverList', err);
      list.innerHTML = '<div class="time-popover__empty">Couldn\u2019t load.</div>';
    }
  }

  // Helpers (small dupes from time.js — kept inline for shell isolation)
  function hourFloatTz(tz) {
    try {
      const d = new Date();
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
      });
      const parts = fmt.formatToParts(d);
      const hh = parseInt((parts.find(p => p.type === 'hour') || {}).value || '0', 10);
      const mm = parseInt((parts.find(p => p.type === 'minute') || {}).value || '0', 10);
      return hh + mm / 60;
    } catch { return 0; }
  }
  function fmtOffsetFromHome(tz, homeH) {
    const otherH = hourFloatTz(tz);
    let diff = otherH - homeH;
    if (diff > 14)  diff -= 24;
    if (diff < -12) diff += 24;
    diff = Math.round(diff * 2) / 2;
    if (diff === 0) return 'same';
    const sign = diff > 0 ? '+' : '−';
    const v = Math.abs(diff);
    const whole = Math.floor(v);
    const frac = v - whole;
    return frac === 0 ? `${sign}${whole}h` : `${sign}${whole}.${Math.round(frac * 10)}h`;
  }

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

    // ===== Avatar: tap → opens user panel =====
    // Two surfaces:
    //   Desktop: lives in header__right next to time
    //   Mobile:  ALSO inject a floating bottom-right copy into <body> so the
    //            avatar is in thumb reach. The header version is hidden on
    //            mobile via CSS; the floating one is shown on mobile only.
    const right = header.querySelector('.head__right');
    if (right && !document.getElementById('slim-avatar')) {
      const btn = document.createElement('button');
      btn.id = 'slim-avatar';
      btn.className = 'slim-avatar';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Account');
      btn.setAttribute('aria-haspopup', 'true');
      btn.textContent = '—';
      btn.addEventListener('click', toggleUserPanel);
      right.appendChild(btn);
    }

    // Floating mobile avatar — fixed bottom-right, only visible <720px
    if (!document.getElementById('floating-avatar')) {
      const float = document.createElement('button');
      float.id = 'floating-avatar';
      float.className = 'floating-avatar';
      float.type = 'button';
      float.setAttribute('aria-label', 'Account');
      float.setAttribute('aria-haspopup', 'true');
      float.textContent = '—';
      float.addEventListener('click', toggleUserPanel);
      document.body.appendChild(float);
    }

    // Build the user panel (hidden by default)
    if (!document.getElementById('user-panel')) {
      buildUserPanel();
    }
  }

  // ===== USER PANEL =====
  // Desktop: popover anchored top-right under the header avatar.
  // Mobile:  bottom sheet, slides up from below, drag handle at top.
  // Same content, same data.
  function buildUserPanel() {
    const user = (window.api && window.api.user.get()) || {};
    const isAdmin = !!(user && user.role === 'admin');
    const name = user.name || user.display_name || user.email || 'kit user';

    // Panel container — appended to body for stacking simplicity
    const panel = document.createElement('div');
    panel.id = 'user-panel';
    panel.className = 'user-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="user-panel__scrim" aria-hidden="true"></div>
      <div class="user-panel__sheet" role="dialog" aria-label="Account">
        <div class="user-panel__handle" aria-hidden="true"></div>
        <div class="user-panel__head">
          <div class="user-panel__avatar">${escapeHtml((name || '?').charAt(0).toUpperCase())}</div>
          <div class="user-panel__name">${escapeHtml(name)}</div>
        </div>
        <nav class="user-panel__nav">
          <a href="/settings.html" class="user-panel__link">Settings</a>
          ${isAdmin ? '<a href="/admin/" class="user-panel__link">Admin</a>' : ''}
          <a href="/idle/" class="user-panel__link">Idle</a>
          <button type="button" class="user-panel__signout" id="user-panel-signout">Sign out</button>
        </nav>
        <div class="user-panel__foot">
          <span class="user-panel__ver">kit v0.5.2</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Close on scrim tap
    const scrim = panel.querySelector('.user-panel__scrim');
    if (scrim) scrim.addEventListener('click', closeUserPanel);

    // Sign out
    const signoutBtn = document.getElementById('user-panel-signout');
    if (signoutBtn) {
      signoutBtn.addEventListener('click', () => {
        closeUserPanel();
        if (window.api && window.api.signOut) window.api.signOut();
      });
    }

    // Esc closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) closeUserPanel();
    });
  }

  function toggleUserPanel(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const panel = document.getElementById('user-panel');
    if (!panel) return;
    if (panel.classList.contains('is-open')) closeUserPanel();
    else openUserPanel();
  }

  function openUserPanel() {
    const panel = document.getElementById('user-panel');
    if (!panel) return;
    panel.hidden = false;
    void panel.offsetHeight; // reflow for transition
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeUserPanel() {
    const panel = document.getElementById('user-panel');
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    // Hide after animation
    setTimeout(() => {
      if (!panel.classList.contains('is-open')) panel.hidden = true;
    }, 260);
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
    let initial = '?';
    try {
      const user = window.api && window.api.user.get();
      const name = (user && user.name) ? user.name.trim() : '';
      if (name) initial = name.charAt(0).toUpperCase();
    } catch (e) {}
    const av = document.getElementById('slim-avatar');
    const float = document.getElementById('floating-avatar');
    if (av) av.textContent = initial;
    if (float) float.textContent = initial;
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

  // ============================================================
  // Mobile hamburger-menu shortcuts (Trip + Todos)
  //
  // Injects tappable tiles at the top of the menu overlay, ABOVE the standard
  // nav links. Tiles render only on home page (where the underlying overlays
  // live) and only when the data exists (no trip → no trip tile).
  //
  // Tap behavior: close menu + click the existing on-page button that owns
  // the overlay. This avoids duplicating overlay state in shell.js.
  // ============================================================
  async function buildMenuShortcuts() {
    const path = window.location.pathname;
    const isHome = (path === '/' || path === '/index.html');
    if (!isHome) return;

    const overlay = document.getElementById('menu-overlay');
    const inner = overlay && overlay.querySelector('.menu-overlay__inner');
    if (!inner) return;

    // Already built? bail.
    if (document.getElementById('menu-shortcuts')) return;

    // Container for the shortcut tiles
    const wrap = document.createElement('div');
    wrap.id = 'menu-shortcuts';
    wrap.className = 'menu-shortcuts';
    inner.insertBefore(wrap, inner.firstChild);

    const isSignedIn = (window.api && window.api.isSignedIn && window.api.isSignedIn());
    if (!isSignedIn) return;

    // ---- Trip shortcut ----
    try {
      const data = await window.api.get('/api/trips');
      const trips = (data && data.trips) || [];
      const today = new Date();
      const todayMs = today.setHours(0, 0, 0, 0);
      let bestTrip = null;
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
        const tile = document.createElement('a');
        tile.href = '#';
        tile.className = 'menu-shortcut';
        tile.id = 'menu-shortcut-trip';
        tile.innerHTML = `
          <span class="menu-shortcut__label">${isOnTrip ? 'On trip' : 'Next trip'}</span>
          <span class="menu-shortcut__arrow">→</span>
        `;
        tile.addEventListener('click', (e) => {
          e.preventDefault();
          // Close the menu
          overlay.classList.remove('is-open');
          // Then trigger the on-page trip strip click (opens itinerary overlay)
          const tripStrip = document.getElementById('trip-strip');
          if (tripStrip) {
            // Defer so the menu close animation can settle first
            setTimeout(() => tripStrip.click(), 50);
          }
        });
        wrap.appendChild(tile);
      }
    } catch (e) {
      // No trips, no shortcut. Silent fail.
    }

    // ---- Todos shortcut ----
    try {
      const data = await window.api.get('/api/todos?view=today');
      const todos = (data && data.todos) || [];
      const open = todos.filter(t => !t.completed_at).length;
      if (open > 0) {
        const tile = document.createElement('a');
        tile.href = '#';
        tile.className = 'menu-shortcut';
        tile.id = 'menu-shortcut-todos';
        tile.innerHTML = `
          <span class="menu-shortcut__label">Todos</span>
          <span class="menu-shortcut__count">${open}</span>
          <span class="menu-shortcut__arrow">→</span>
        `;
        tile.addEventListener('click', (e) => {
          e.preventDefault();
          overlay.classList.remove('is-open');
          // Trigger fullscreen todo editor (existing button)
          const todosExpand = document.getElementById('todos-expand');
          if (todosExpand) {
            setTimeout(() => todosExpand.click(), 50);
          }
        });
        wrap.appendChild(tile);
      }
    } catch (e) {
      // No todos endpoint yet, or no open todos. Silent fail.
    }

    // If neither tile was added, remove the empty wrap so menu doesn't have a phantom block
    if (!wrap.firstChild) {
      wrap.remove();
    }
  }


  buildSlimHeader();
  renderSlimAvatar();
})();
