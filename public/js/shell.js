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
      timeEl.textContent = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: tz,
      });
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
  // Computes today's lunar phase and draws an SVG path matching it.
  // Path approach: two arcs joined to form a moon shape. Inner arc's
  // x-radius and sweep direction encode whether it's crescent or gibbous,
  // waxing or waning.
  function renderMoonPath() {
    const path = document.getElementById('moon-path');
    if (!path) return;

    // Synodic month from a known new moon (Jan 6, 2000 18:14 UTC)
    const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
    const SYNODIC = 29.53058867;
    const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
    const phase = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC; // 0..1

    // SVG coords (matches viewBox 0 0 12 12)
    const cx = 6, cy = 6, r = 5.5;
    // Illumination factor: -1 (new) → +1 (full)
    const f = -Math.cos(2 * Math.PI * phase);
    // Inner arc x-radius: 0 at half-moon, r at new/full
    const xR = r * Math.abs(f);

    // For waxing (phase < 0.5), the lit side is on the right
    // For waning (phase > 0.5), the lit side is on the left
    const waxing = phase < 0.5;
    const gibbous = Math.abs(f) > 0 && f > 0; // full-ish (lit > 50%)
    // Wait — f = -cos(2π·p). At full (p=0.5), f = -cos(π) = +1 (max bright).
    // At new (p=0 or 1), f = -cos(0) = -1 (no light).
    // So "gibbous-ish" = f > 0 (more than half illuminated)
    // "crescent-ish" = f < 0 (less than half illuminated)

    // Build the path:
    // - Always draw outer half: from top to bottom along the lit side
    // - Then inner arc back to top, with x-radius = xR
    //   The sweep flag of the inner arc determines crescent vs gibbous
    // - For waxing: lit side is right (sweep CW = 0 outer, then inner sweep depends on phase)
    // - For waning: mirror it

    let d;
    if (waxing) {
      // Lit on the right — outer arc goes clockwise from top to bottom (right side)
      // Then inner arc back. Sweep flag: 0 for crescent (curves leftward into moon), 1 for gibbous
      const innerSweep = gibbous ? 0 : 1;
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${xR} ${r} 0 0 ${innerSweep} ${cx} ${cy - r} Z`;
    } else {
      // Lit on the left — outer arc goes counterclockwise from top to bottom (left side)
      // Mirror of waxing
      const innerSweep = gibbous ? 1 : 0;
      d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${xR} ${r} 0 0 ${innerSweep} ${cx} ${cy - r} Z`;
    }
    path.setAttribute('d', d);

    // Pick a label for accessibility (and tooltip)
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
    if (svg) svg.setAttribute('title', phaseName);
  }
  renderMoonPath();
  // Re-render once an hour in case the page is left open across midnight
  setInterval(renderMoonPath, 60 * 60 * 1000);
})();
