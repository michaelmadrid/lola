/* =========================================================
   spots.js — your captured places, by city
   Reuses spot editor modal markup; logic is self-contained.
   ========================================================= */

(function () {
  // Filter state (persisted in localStorage). Initial values restored from storage,
  // saved back on every change. Reset on page is preserved across refresh, browser
  // close, etc. Survives until cleared explicitly or browser data is wiped.
  const LS_CITY = 'kit.spots.filterCity';
  const LS_CAT  = 'kit.spots.filterCat';
  const LS_BEEN = 'kit.spots.filterBeen';

  function lsGet(k, fallback) {
    try { return localStorage.getItem(k) || fallback; } catch (_) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (_) {}
  }

  let allSpots = [];
  let activeView = (new URLSearchParams(location.search).get('view')) || 'all'; // all | curated | standard | trash
  let isAdmin = false;
  let selected = new Set();
  let activeCity = lsGet(LS_CITY, 'all');
  let activeCat  = lsGet(LS_CAT, 'all');
  let activeBeen = lsGet(LS_BEEN, 'all'); // 'all' | 'want' | 'been'
  let searchTerm = '';

  const listEl = document.getElementById('spots-list');
  const searchInput = document.getElementById('search-input');

  // Picker controls
  const cityBtn   = document.getElementById('city-picker-btn');
  const cityLabel = document.getElementById('city-picker-label');
  const cityPop   = document.getElementById('city-picker-popover');
  const citySearch = document.getElementById('city-picker-search');
  const cityList  = document.getElementById('city-picker-list');

  const typeBtn   = document.getElementById('type-picker-btn');
  const typeLabel = document.getElementById('type-picker-label');
  const typePop   = document.getElementById('type-picker-popover');
  const typeList  = document.getElementById('type-picker-list');

  const beenBtn   = document.getElementById('been-picker-btn');
  const beenLabel = document.getElementById('been-picker-label');
  const beenPop   = document.getElementById('been-picker-popover');
  const beenList  = document.getElementById('been-picker-list');

  // Type options — keep in sync with edit drawer Category select
  const TYPES = [
    { value: 'all',          label: 'All types' },
    { value: 'bookstore',    label: 'Bookstore' },
    { value: 'film_lab',     label: 'Film Lab' },
    { value: 'record_store', label: 'Record Store' },
    { value: 'cinema',       label: 'Cinema' },
    { value: 'gallery',      label: 'Gallery' },
    { value: 'coffee',       label: 'Coffee' },
    { value: 'eat',          label: 'Eat' },
    { value: 'drink',        label: 'Drink' },
    { value: 'hotel',        label: 'Hotel' },
    { value: 'shop',         label: 'Shop' },
    { value: 'other',        label: 'Other' },
  ];

  // Been-state options — three-tier filter
  const BEEN_STATES = [
    { value: 'all',  label: 'All' },
    { value: 'want', label: 'Want to go' },
    { value: 'been', label: 'Been' },
  ];

  // Restore labels from saved state on initial render
  function restoreLabelsFromState() {
    const t = TYPES.find(t => t.value === activeCat);
    if (t && typeLabel) typeLabel.textContent = t.label;

    const b = BEEN_STATES.find(b => b.value === activeBeen);
    if (b && beenLabel) beenLabel.textContent = b.label;

    if (cityLabel) {
      cityLabel.textContent = activeCity === 'all' ? 'All cities' : activeCity;
    }
  }

  // -------- Load --------
  async function loadSpots() {
    try {
      // Shared library: all users' spots. Trash view pulls soft-deleted.
      const q = activeView === 'trash'
        ? '/api/spots?all=true&trashed=true&limit=500'
        : '/api/spots?all=true&limit=500';
      const data = await api.get(q);
      allSpots = (data.spots || []).filter(s => s.place_name && s.place_name.trim());
      restoreLabelsFromState();
      buildCityPickerOptions();
      buildTypePickerOptions();
      buildBeenPickerOptions();
      render();
    } catch (err) {
      console.error('loadSpots', err);
      listEl.innerHTML = '<div class="stream__empty">Could not load spots.</div>';
    }
  }

  // -------- City picker --------
  function getCities() {
    // Aggregate cities from attached_cities, by name
    const cityMap = new Map();
    for (const s of allSpots) {
      for (const c of (s.attached_cities || [])) {
        if (!cityMap.has(c.name)) {
          cityMap.set(c.name, { name: c.name, count: 0 });
        }
        cityMap.get(c.name).count += 1;
      }
    }
    return [...cityMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function buildCityPickerOptions(filter) {
    const f = (filter || '').toLowerCase().trim();
    const all = getCities();
    const cities = f ? all.filter(c => c.name.toLowerCase().includes(f)) : all;
    const allCount = allSpots.length;
    const items = [
      `<button class="picker-item ${activeCity === 'all' ? 'is-current' : ''}" data-value="all">
         <span>All cities</span>
         <span class="picker-item__count">${allCount}</span>
       </button>`,
      ...cities.map(c =>
        `<button class="picker-item ${activeCity === c.name ? 'is-current' : ''}" data-value="${util.escapeHtml(c.name)}">
           <span>${util.escapeHtml(c.name)}</span>
           <span class="picker-item__count">${c.count}</span>
         </button>`
      ),
    ];
    if (cities.length === 0 && f) {
      items.push('<div class="picker-empty">No matches.</div>');
    }
    cityList.innerHTML = items.join('');
    cityList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCity = btn.dataset.value;
        lsSet(LS_CITY, activeCity);
        cityLabel.textContent = activeCity === 'all'
          ? 'All cities'
          : activeCity;
        closePopover(cityPop);
        if (citySearch) { citySearch.value = ''; }
        buildCityPickerOptions(); // refresh active state
        render();
      });
    });
  }

  function buildTypePickerOptions() {
    typeList.innerHTML = TYPES.map(t =>
      `<button class="picker-item ${activeCat === t.value ? 'is-current' : ''}" data-value="${t.value}">
         <span>${t.label}</span>
       </button>`
    ).join('');
    typeList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.value;
        lsSet(LS_CAT, activeCat);
        const found = TYPES.find(t => t.value === activeCat);
        typeLabel.textContent = found ? found.label : 'All types';
        closePopover(typePop);
        buildTypePickerOptions(); // refresh active state
        render();
      });
    });
  }

  // -------- Been picker (Want / Been / All) --------
  function buildBeenPickerOptions() {
    beenList.innerHTML = BEEN_STATES.map(b =>
      `<button class="picker-item ${activeBeen === b.value ? 'is-current' : ''}" data-value="${b.value}">
         <span>${b.label}</span>
       </button>`
    ).join('');
    beenList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        activeBeen = btn.dataset.value;
        lsSet(LS_BEEN, activeBeen);
        const found = BEEN_STATES.find(b => b.value === activeBeen);
        beenLabel.textContent = found ? found.label : 'All';
        closePopover(beenPop);
        buildBeenPickerOptions();
        render();
      });
    });
  }

  // -------- Generic popover open/close --------
  // Standard popover positioning logic (the "Floating UI / Popper.js" pattern):
  //   1. Reset to default left-aligned position
  //   2. Measure where popover actually lands in viewport
  //   3. If it overflows right edge: flip to right-aligned
  //   4. Clamp to viewport edges if still overflowing
  // No JS positioning library needed — this is enough for our 3 pickers.
  function positionPopover(pop) {
    // Reset any inline styles from previous opens
    pop.style.left = '';
    pop.style.right = '';
    pop.style.transform = '';

    const margin = 8;          // breathing room from viewport edge
    const vw = window.innerWidth;

    // Force layout — read offsetWidth before measuring rect so the browser
    // has computed dimensions for the freshly-shown popover. Mobile Safari
    // in particular needs this nudge.
    void pop.offsetWidth;

    const rect = pop.getBoundingClientRect();

    // Default position is left:0 from the .picker-group parent.
    // If the popover's right edge overflows the viewport, flip to right:0
    // so it extends LEFT from the trigger button's right edge instead.
    if (rect.right > vw - margin) {
      pop.style.left = 'auto';
      pop.style.right = '0';

      // After flipping, check if it now overflows the LEFT edge.
      // (Common on mobile when popover is wider than the trigger's
      // horizontal position allows.)
      void pop.offsetWidth;
      const rect2 = pop.getBoundingClientRect();
      if (rect2.left < margin) {
        // Calculate how much to shift right to fit within viewport.
        // Use translateX so we don't fight the right:0 anchor.
        const shift = margin - rect2.left;
        pop.style.transform = `translateX(${shift}px)`;
      }
    } else if (rect.left < margin) {
      // Edge case: even with default left:0, popover extends past left edge.
      // Shift right to fit.
      const shift = margin - rect.left;
      pop.style.transform = `translateX(${shift}px)`;
    }
  }

  function openPopover(pop) {
    closeAllPopovers();
    pop.hidden = false;
    pop.classList.add('is-open');
    // Position AFTER the browser has computed layout for the popover.
    // requestAnimationFrame ensures the popover is fully laid out before
    // we measure with getBoundingClientRect — without this, mobile browsers
    // may return stale or zero values from a popover that just transitioned
    // from `hidden` to visible.
    requestAnimationFrame(() => positionPopover(pop));
  }
  function closePopover(pop) {
    pop.classList.remove('is-open');
    pop.hidden = true;
    // Clear inline styles so next open starts clean
    pop.style.left = '';
    pop.style.right = '';
    pop.style.transform = '';
  }
  function closeAllPopovers() {
    [cityPop, typePop, beenPop].forEach(p => p && closePopover(p));
  }
  document.addEventListener('click', (e) => {
    // Close on outside click
    if (cityPop && !cityPop.hidden && !cityPop.contains(e.target) && !cityBtn.contains(e.target)) closePopover(cityPop);
    if (typePop && !typePop.hidden && !typePop.contains(e.target) && !typeBtn.contains(e.target)) closePopover(typePop);
    if (beenPop && !beenPop.hidden && !beenPop.contains(e.target) && !beenBtn.contains(e.target)) closePopover(beenPop);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllPopovers();
  });
  cityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cityPop.classList.contains('is-open')) closePopover(cityPop);
    else { openPopover(cityPop); citySearch && citySearch.focus(); }
  });
  typeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typePop.classList.contains('is-open')) closePopover(typePop);
    else openPopover(typePop);
  });
  beenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (beenPop.classList.contains('is-open')) closePopover(beenPop);
    else openPopover(beenPop);
  });
  if (citySearch) {
    citySearch.addEventListener('input', () => buildCityPickerOptions(citySearch.value));
  }

  // -------- Render the list --------
  function render() {
    const term = searchTerm.toLowerCase().trim();
    const filtered = allSpots.filter(s => {
      // View filter (curated / standard — trash is handled at load time)
      if (activeView === 'curated' && !s.curated) return false;
      if (activeView === 'standard' && s.curated) return false;
      if (activeCat !== 'all' && s.category !== activeCat) return false;
      if (activeCity !== 'all') {
        const cities = (s.attached_cities || []).map(c => c.name);
        if (!cities.includes(activeCity)) return false;
      }
      // Been filter: 'want' = not been (s.been === false), 'been' = visited (s.been === true).
      // Spots default to been=false on capture, so 'want' is the natural state.
      if (activeBeen === 'want' && s.been !== false) return false;
      if (activeBeen === 'been' && s.been !== true)  return false;
      if (term) {
        const haystack = [s.place_name, s.tip, s.neighborhood].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    const countEl = document.getElementById('spot-count');
    if (countEl) countEl.textContent = filtered.length + (filtered.length === 1 ? ' spot' : ' spots');

    if (!filtered.length) {
      const msg = term
        ? `No matches for "${util.escapeHtml(searchTerm.trim())}"`
        : 'No spots match these filters.';
      listEl.innerHTML = `<div class="stream__empty">${msg}</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(s => {
      const cityNames = (s.attached_cities || []).map(c => c.name.toLowerCase());
      const cityLabel = cityNames.length ? cityNames.join(' · ') : '';
      const metaParts = [];
      if (s.category) metaParts.push(s.category);
      if (cityLabel) metaParts.push(cityLabel);
      const metaLine = metaParts.length
        ? `<span class="stream__meta">${util.escapeHtml(metaParts.join(' · '))}</span>`
        : '';
      const tipLine = s.tip ? `<span class="stream__tip">${util.escapeHtml(s.tip)}</span>` : '';

      const catAttr = s.category ? ` data-category="${util.escapeHtml(s.category)}"` : '';
      const treatment = (parseInt(s.id, 10) % 7);
      const checkboxHtml = isAdmin
        ? `<input type="checkbox" class="stream__check" data-check="${s.id}" aria-label="Select ${util.escapeHtml(s.place_name)}">`
        : '';
      return `<div class="stream__item is-structured${s.been === false ? ' is-want' : ''}" data-id="${s.id}" data-treatment="${treatment}"${catAttr}>
        ${checkboxHtml}
        <div class="stream__body">
          <span class="stream__name">${util.escapeHtml(s.place_name)}</span>
          ${tipLine}
          ${metaLine}
        </div>
        <span class="stream__when">${util.timeAgo(s.created_at)}</span>
      </div>`;
    }).join('');
    updateBulkBar();
  }

  // -------- Search --------
  if (searchInput) {
    let t = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        searchTerm = searchInput.value;
        render();
      }, 50);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchTerm = '';
        render();
      }
    });
  }

  // -------- Shared spot editor --------
  SpotEditor.init({
    onSaved: () => { loadSpots(); },
    onDeleted: () => { loadSpots(); },
    softDelete: false,
  });

  // Click delegation on the spots list
  listEl.addEventListener('click', (e) => {
    if (e.target.classList.contains('stream__check')) return;
    const row = e.target.closest('.stream__item');
    if (!row) return;
    const id = row.dataset.id;
    if (!id) return;
    const spot = allSpots.find(s => s.id === parseInt(id, 10));
    if (spot) SpotEditor.open(spot);
  });

  // Sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }

  // Wire the shared capture overlay. After a spot is saved, re-fetch the spots list.
  if (window.CaptureOverlay) {
    window.CaptureOverlay.init({
      launcher: '#capture-launcher',
      // No launcherCity — the spots launcher is a simple "+ Add a spot" button
      // and doesn't display the bound city. The overlay still tracks it internally.
      onSaved: ({ thenClose }) => {
        // Re-fetch list a few times to catch the AI parse landing
        setTimeout(() => loadSpots(), 1500);
        setTimeout(() => loadSpots(), 4000);
        setTimeout(() => loadSpots(), 9000);
      },
    });
  }

  async function checkAdmin() {
    try {
      const me = await api.get('/api/auth/me');
      isAdmin = !!(me.user && me.user.role === 'admin');
      document.body.classList.toggle('has-admin-checks', isAdmin);
    } catch { isAdmin = false; }
  }

  function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    if (!isAdmin || selected.size === 0) { bar.hidden = true; return; }
    bar.hidden = false;
    document.getElementById('bulk-count').textContent = selected.size + ' selected';
    const inTrash = activeView === 'trash';
    document.getElementById('bulk-curate').hidden = inTrash;
    document.getElementById('bulk-standard').hidden = inTrash;
    document.getElementById('bulk-trash').hidden = inTrash;
    document.getElementById('bulk-restore').hidden = !inTrash;
    document.getElementById('bulk-delete-forever').hidden = !inTrash;
  }

  async function bulkPatch(body) {
    await Promise.all([...selected].map(id => api.patch('/api/spots/' + id, body)));
    selected.clear();
    loadSpots();
  }

  function wireBulkActions() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    document.getElementById('bulk-curate').addEventListener('click', () => bulkPatch({ curated: true }));
    document.getElementById('bulk-standard').addEventListener('click', () => bulkPatch({ curated: false }));
    document.getElementById('bulk-trash').addEventListener('click', () => {
      if (!confirm('Move ' + selected.size + ' spots to trash?')) return;
      bulkPatch({ deleted_at: new Date().toISOString() });
    });
    document.getElementById('bulk-restore').addEventListener('click', () => bulkPatch({ deleted_at: null }));
    document.getElementById('bulk-delete-forever').addEventListener('click', async () => {
      if (!confirm('Permanently delete ' + selected.size + ' spots? This cannot be undone.')) return;
      await Promise.all([...selected].map(id => api.delete('/api/spots/' + id)));
      selected.clear();
      loadSpots();
    });
    document.getElementById('bulk-clear').addEventListener('click', () => {
      selected.clear();
      document.querySelectorAll('.stream__check').forEach(cb => cb.checked = false);
      updateBulkBar();
    });
  }

  listEl.addEventListener('change', (e) => {
    if (!e.target.classList.contains('stream__check')) return;
    const id = parseInt(e.target.dataset.check, 10);
    e.target.checked ? selected.add(id) : selected.delete(id);
    updateBulkBar();
  });

  // View switcher
  const viewSwitch = document.getElementById('view-switch');
  if (viewSwitch) {
    viewSwitch.querySelectorAll('.view-switch__item').forEach(b =>
      b.classList.toggle('is-active', b.dataset.view === activeView));
  }
  if (viewSwitch) {
    viewSwitch.querySelectorAll('.view-switch__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.view;
        if (v === activeView) return;
        activeView = v;
        activeCity = 'all'; activeCat = 'all'; activeBeen = 'all'; searchTerm = '';
        if (searchInput) searchInput.value = '';
        lsSet(LS_CITY, 'all'); lsSet(LS_CAT, 'all'); lsSet(LS_BEEN, 'all');
        viewSwitch.querySelectorAll('.view-switch__item').forEach(b =>
          b.classList.toggle('is-active', b.dataset.view === v));
        selected.clear();
        // Always reload fresh from the server — simplest, avoids stale-state bugs.
        loadSpots();
      });
    });
  }

  wireBulkActions();
  checkAdmin().then(loadSpots);
})();
