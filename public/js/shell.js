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
    // Set title on the wrapping span so the browser tooltip shows reliably
    const wrap = document.getElementById('moon-wrap');
    if (wrap) wrap.setAttribute('title', phaseName);
  }
  renderMoonPath();
  setInterval(renderMoonPath, 60 * 60 * 1000);
})();
