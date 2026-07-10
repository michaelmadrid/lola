/* =====================================================================
   nav.js — centralized nav renderer

   Source of truth: /data/nav.json. Edit there to update nav everywhere.

   Pages embed empty markers:

     <nav class="nav" data-nav="primary"></nav>
     <div class="menu-overlay" id="menu-overlay" data-nav="drawer">
       <div class="menu-overlay__inner"></div>
     </div>

   This script:
   - Fetches /data/nav.json (cached)
   - Renders the relevant list into each [data-nav] container
   - Filters by auth state (auth: 'any' | 'in' | 'out')
   - Marks current-page link with .is-active
   - Wires the sign-out link if present

   Loaded synchronously before page scripts via <script src="/js/nav.js">.
   ===================================================================== */

(function () {
  const slots = document.querySelectorAll('[data-nav]');
  if (!slots.length) return;

  // Detect auth state — same key as api.js (TOKEN_KEY = 'lola.token').
  function isAuthed() {
    try {
      return Boolean(localStorage.getItem('lola.token'));
    } catch (_) {
      return false;
    }
  }

  // Normalize current path — strip trailing slash except root, lowercase.
  // Used to mark .is-active. Pages that AREN'T in the nav get no active state.
  function currentPath() {
    let p = (location.pathname || '/').toLowerCase();
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }
  function normalizeHref(href) {
    if (!href || href === '#') return '';
    let p = href.toLowerCase();
    // Strip query/hash from comparison
    p = p.split('?')[0].split('#')[0];
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  function shouldShow(item, authed) {
    if (item.auth === 'in')  return authed;
    if (item.auth === 'out') return !authed;
    return true; // 'any' or unspecified
  }

  function buildLink(item, currentNorm) {
    const a = document.createElement('a');
    a.href = item.href;
    a.textContent = item.label;
    // Auth visibility data-attr (some pages use this for non-JS hiding too)
    if (item.auth === 'in')  a.setAttribute('data-auth', 'in');
    if (item.auth === 'out') a.setAttribute('data-auth', 'out');
    if (item.id) a.id = item.id;
    if (item.extra_class) a.className = item.extra_class;

    // Active-state matching — exact path match
    const itemNorm = normalizeHref(item.href);
    if (itemNorm && itemNorm === currentNorm) {
      a.classList.add('is-active');
    }
    return a;
  }

  function render(slot, items, authed, currentNorm) {
    // For drawer slots, items go inside .menu-overlay__inner
    const target = slot.classList.contains('menu-overlay')
      ? (slot.querySelector('.menu-overlay__inner') || slot)
      : slot;

    target.innerHTML = ''; // clear placeholder

    for (const item of items) {
      if (!shouldShow(item, authed)) continue;
      target.appendChild(buildLink(item, currentNorm));
    }
  }

  // Cache the JSON across pages in a single tab session.
  // Cache key includes a version stamp so bumping nav.json's _meta.version
  // automatically invalidates stale caches in users' browsers.
  // Also short-circuit cache if URL has ?nav-fresh=1 (debug escape hatch).
  const CACHE_KEY_PREFIX = 'kit.navCache.v';
  function getCachedNav() {
    if (location.search.includes('nav-fresh=1')) return null;
    try {
      // Find any kit.navCache.v* key and use it
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) {
          const c = sessionStorage.getItem(key);
          if (c) {
            const data = JSON.parse(c);
            // Validate version still matches
            const cachedVersion = data && data._meta && data._meta.version;
            const expectedVersion = parseInt(key.slice(CACHE_KEY_PREFIX.length), 10);
            if (cachedVersion === expectedVersion) return data;
            // Stale — clean it up
            sessionStorage.removeItem(key);
          }
        }
      }
    } catch (_) {}
    return null;
  }
  function setCachedNav(data) {
    try {
      const v = (data && data._meta && data._meta.version) || 1;
      // Clear any other kit.navCache.v* keys before writing the new one
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(CACHE_KEY_PREFIX)) toRemove.push(key);
      }
      toRemove.forEach(k => sessionStorage.removeItem(k));
      sessionStorage.setItem(CACHE_KEY_PREFIX + v, JSON.stringify(data));
    } catch (_) {}
  }

  async function loadNavConfig() {
    const cached = getCachedNav();
    if (cached) return cached;
    // no-store: never let the browser cache nav.json itself.
    // We only cache the parsed result in sessionStorage, keyed by version.
    const r = await fetch('/data/nav.json', { cache: 'no-store' });
    const data = await r.json();
    setCachedNav(data);
    return data;
  }

  function renderAll() {
    const authed = isAuthed();
    const currentNorm = currentPath();
    loadNavConfig().then(config => {
      // Centralized logo — single source of truth.
      const brand = (config._meta && config._meta.brand) || 'annex';
      document.querySelectorAll('.logo').forEach(logo => {
        logo.textContent = brand;
        if (!logo.getAttribute('href')) logo.setAttribute('href', '/');
      });
      slots.forEach(slot => {
        const which = slot.dataset.nav;  // 'primary' | 'drawer'
        const items = config[which];
        if (!Array.isArray(items)) {
          console.warn('nav.js: no items for', which);
          return;
        }
        render(slot, items, authed, currentNorm);
      });
      // Re-bind sign-out link (it gets recreated on every render).
      // Uses api.signOut() to match existing shell.js pattern.
      const so = document.getElementById('signout-link');
      if (so) {
        so.addEventListener('click', (e) => {
          e.preventDefault();
          if (window.api && window.api.signOut) {
            window.api.signOut();
          } else {
            try { localStorage.removeItem('lola.token'); } catch (_) {}
            location.href = '/login.html';
          }
        });
      }
    }).catch(err => {
      console.error('nav.js: failed to load nav config', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();
