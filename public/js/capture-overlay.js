/* =========================================================
   capture-overlay.js — shared fullscreen capture editor
   =========================================================

   The same overlay UI lives on home, /spots/, /capture/.
   This module owns the overlay's full lifecycle: city picker,
   been toggle, textarea, submit-and-continue, submit-and-close.

   Pages mount the overlay markup (HTML), include this script,
   and call:

     window.CaptureOverlay.init({
       launcher: '#capture-launcher',           // optional — selector for trigger button
       launcherCity: '#capture-launcher-city-name', // optional — element to mirror city name
       onSaved: function(result){ ... },        // optional — called after each save
       autoOpen: false                          // optional — open immediately (for /capture/)
     });

   Internally state is module-scoped — only one overlay per page.
   ========================================================= */
(function () {
  if (window.CaptureOverlay) return; // idempotent

  // Storage keys. CITY key is versioned (-v2) to invalidate caches that
  // got polluted by an earlier bug where Amsterdam (alphabetical first)
  // was set as a "fallback" without user intent.
  const CITY_STORAGE_KEY = 'kit.capture.lastCity-v2';
  const BEEN_STORAGE_KEY = 'kit.capture.lastBeen';

  // Module state
  let opts = {};
  let initialized = false;

  let launcher, launcherCityName;
  let captFs, captFsClose, captFsTextarea;
  let captFsSubmitContinue, captFsSubmitClose;
  let captFsCityBtn, captFsCityBtnName, captFsCityPopover, captFsCitySearch, captFsCityList;
  let captFsBeenBtn, captFsBeenText;

  let allCities = [];
  let pickedCity = null;
  let been = true;
  let isSubmitting = false;
  let placeholderPool = null;

  // ------------------------------------------------------------------
  // Init: call once per page load. Idempotent — calling again is a no-op.
  // ------------------------------------------------------------------
  function init(options) {
    if (initialized) return;
    opts = options || {};

    // Resolve DOM nodes
    launcher              = opts.launcher        ? document.querySelector(opts.launcher)        : null;
    launcherCityName      = opts.launcherCity    ? document.querySelector(opts.launcherCity)    : null;

    captFs                = document.getElementById('capture-fs');
    captFsClose           = document.getElementById('capture-fs-close');
    captFsTextarea        = document.getElementById('capture-fs-textarea');
    captFsSubmitContinue  = document.getElementById('capture-fs-submit-continue');
    captFsSubmitClose     = document.getElementById('capture-fs-submit-close');

    captFsCityBtn         = document.getElementById('capture-fs-city-btn');
    captFsCityBtnName     = document.getElementById('capture-fs-city-btn-name');
    captFsCityPopover     = document.getElementById('capture-fs-city-popover');
    captFsCitySearch      = document.getElementById('capture-fs-city-search');
    captFsCityList        = document.getElementById('capture-fs-city-list');

    captFsBeenBtn         = document.getElementById('capture-fs-been-btn');
    captFsBeenText        = document.getElementById('capture-fs-been-text');

    if (!captFs) {
      console.warn('CaptureOverlay.init: #capture-fs missing — overlay markup not on this page.');
      return;
    }
    initialized = true;

    // Restore been state
    try {
      const stored = localStorage.getItem(BEEN_STORAGE_KEY);
      applyBeen(stored !== '0');
    } catch { applyBeen(true); }
    if (captFsBeenBtn) captFsBeenBtn.addEventListener('click', () => applyBeen(!been));

    // Restore city from storage (provisional, full data resolves in loadCitiesIfNeeded)
    try {
      const raw = localStorage.getItem(CITY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) setPickedCity(parsed);
      }
    } catch {}

    // Wire city button + popover
    if (captFsCityBtn) {
      captFsCityBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await loadCitiesIfNeeded();
        if (captFsCityPopover && captFsCityPopover.classList.contains('is-open')) closeCityPopover();
        else openCityPopover();
      });
    }
    if (captFsCitySearch) {
      captFsCitySearch.addEventListener('input', () => renderCityList(captFsCitySearch.value));
    }
    document.addEventListener('click', (e) => {
      if (captFsCityPopover && captFsCityPopover.classList.contains('is-open') &&
          !captFsCityPopover.contains(e.target) &&
          captFsCityBtn && !captFsCityBtn.contains(e.target)) {
        closeCityPopover();
      }
    });

    // Wire launcher + close
    if (launcher) launcher.addEventListener('click', open);
    if (captFsClose) captFsClose.addEventListener('click', close);

    // Esc to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && captFs.classList.contains('is-open')) close();
    });

    // Textarea grow + status + keyboard shortcuts
    if (captFsTextarea) {
      captFsTextarea.addEventListener('input', () => { autoGrow(); });
      captFsTextarea.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          doSubmit({ thenClose: false });
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          doSubmit({ thenClose: true });
          return;
        }
      });
    }

    // Wire submit buttons
    if (captFsSubmitClose)    captFsSubmitClose.addEventListener('click', () => doSubmit({ thenClose: true }));
    if (captFsSubmitContinue) captFsSubmitContinue.addEventListener('click', () => doSubmit({ thenClose: false }));

    // Auto-open mode (for /capture/ standalone)
    if (opts.autoOpen) {
      // Defer one tick so other init scripts settle
      setTimeout(() => open(), 0);
    }

    // Pre-load city list in background so first open is snappy
    loadCitiesIfNeeded();
  }

  // ------------------------------------------------------------------
  // Been toggle
  // ------------------------------------------------------------------
  function applyBeen(val) {
    been = !!val;
    if (captFsBeenBtn)  captFsBeenBtn.dataset.been = been ? 'true' : 'false';
    if (captFsBeenText) captFsBeenText.textContent = been ? "I've been here" : "I want to go";
    try { localStorage.setItem(BEEN_STORAGE_KEY, been ? '1' : '0'); } catch {}
  }

  // ------------------------------------------------------------------
  // City picker
  // ------------------------------------------------------------------
  function setPickedCity(city) {
    pickedCity = city;
    if (captFsCityBtnName) captFsCityBtnName.textContent = city ? city.name : 'pick a city';
    if (launcherCityName)  launcherCityName.textContent  = city ? city.name : 'pick a city';
    if (city) {
      try {
        localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify({ id: city.id, name: city.name, country: city.country }));
      } catch {}
    }
  }

  async function loadCitiesIfNeeded() {
    if (allCities.length) return;
    try {
      const data = await api.get('/api/cities?limit=200');
      allCities = data.cities || [];
      if (!pickedCity || !pickedCity.id) {
        try {
          const meResp = await api.get('/api/auth/me');
          // Auth response is { user: { home_city_id, home_city: {...}, ... } }
          const u = meResp && meResp.user;
          if (u && u.home_city_id) {
            const home = allCities.find(c => c.id === u.home_city_id);
            if (home) setPickedCity(home);
          }
        } catch {}
        if (!pickedCity || !pickedCity.id) {
          if (allCities[0]) setPickedCity(allCities[0]);
        }
      }
    } catch (err) {
      console.error('CaptureOverlay loadCities', err);
    }
  }

  function renderCityList(filter) {
    if (!captFsCityList) return;
    const f = (filter || '').toLowerCase().trim();
    let cities = allCities;
    if (f) {
      cities = cities.filter(c =>
        c.name.toLowerCase().includes(f) ||
        (c.country && c.country.toLowerCase().includes(f))
      );
    }
    cities = cities.slice(0, 80);
    captFsCityList.innerHTML = cities.map(c =>
      `<button class="capture-fs__city-item${pickedCity && pickedCity.id === c.id ? ' is-current' : ''}" data-city-id="${c.id}">
         ${escapeHtml(c.name)}<span class="capture-fs__city-item__country">${escapeHtml(c.country || '')}</span>
       </button>`
    ).join('');
    captFsCityList.querySelectorAll('.capture-fs__city-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.cityId, 10);
        const city = allCities.find(c => c.id === id);
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
      setTimeout(() => captFsCitySearch.focus(), 30);
    }
  }
  function closeCityPopover() {
    if (captFsCityPopover) captFsCityPopover.classList.remove('is-open');
  }

  // ------------------------------------------------------------------
  // Open / close overlay
  // ------------------------------------------------------------------
  async function ensurePlaceholderPool() {
    if (placeholderPool !== null) return placeholderPool;
    try {
      const res = await fetch('/data/capture-defaults.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      placeholderPool = (data && Array.isArray(data.placeholders)) ? data.placeholders : [];
    } catch (e) {
      placeholderPool = [];
    }
    return placeholderPool;
  }
  async function refreshPlaceholder() {
    const pool = await ensurePlaceholderPool();
    if (!pool.length || !captFsTextarea) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    captFsTextarea.setAttribute('placeholder', pick);
  }

  function open() {
    if (!captFs) return;
    captFs.hidden = false;
    document.body.style.overflow = 'hidden';
    void captFs.offsetHeight; // reflow so transition runs
    captFs.classList.add('is-open');
    captFs.setAttribute('aria-hidden', 'false');
    refreshPlaceholder();
    loadCitiesIfNeeded();
    setTimeout(() => {
      if (captFsTextarea) captFsTextarea.focus();
      autoGrow();
    }, 80);
  }
  function close() {
    if (!captFs) return;
    captFs.classList.remove('is-open');
    captFs.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (!captFs.classList.contains('is-open')) captFs.hidden = true;
    }, 260);
  }

  // ------------------------------------------------------------------
  // Textarea + status
  // ------------------------------------------------------------------
  function autoGrow() {
    if (!captFsTextarea) return;
    captFsTextarea.style.height = 'auto';
    captFsTextarea.style.height = captFsTextarea.scrollHeight + 'px';
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------
  async function doSubmit({ thenClose }) {
    if (isSubmitting) return;
    if (!captFsTextarea) return;
    const text = captFsTextarea.value.trim();
    if (!text) return;
    if (!pickedCity) return;
    isSubmitting = true;
    if (captFsSubmitClose)    captFsSubmitClose.disabled = true;
    if (captFsSubmitContinue) captFsSubmitContinue.disabled = true;
    try {
      const body = { text, city_id: pickedCity.id, city_name: pickedCity.name, been };
      const result = await api.post('/api/saves', body);
      const count = result.count || 1;
      isSubmitting = false;
      if (captFsSubmitClose)    captFsSubmitClose.disabled = false;
      if (captFsSubmitContinue) captFsSubmitContinue.disabled = false;
      // Reset field
      captFsTextarea.value = '';
      autoGrow();
      // Toast
      if (typeof window.toast === 'function') {
        window.toast(count === 1 ? 'Saved' : `${count} saves`);
      }
      // Page-specific callback
      if (typeof opts.onSaved === 'function') {
        try { opts.onSaved({ count, thenClose }); } catch (e) { console.error('onSaved', e); }
      }
      if (thenClose) {
        close();
      } else {
        captFsTextarea.focus();
      }
    } catch (err) {
      console.error('CaptureOverlay save', err);
      isSubmitting = false;
      if (captFsSubmitClose)    captFsSubmitClose.disabled = false;
      if (captFsSubmitContinue) captFsSubmitContinue.disabled = false;
      if (typeof window.toast === 'function') window.toast(err.message || 'Save failed');
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  window.CaptureOverlay = {
    init,
    open,
    close,
    isOpen: () => !!(captFs && captFs.classList.contains('is-open')),
    getPickedCity: () => pickedCity,
  };
})();
