/* =========================================================
   spots.js — your captured places, by city
   Reuses save editor modal markup; logic is self-contained.
   ========================================================= */

(function () {
  let allSaves = [];
  let activeCity = 'all';
  let activeCat  = 'all';
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

  // Type options — keep in sync with edit drawer Category select
  const TYPES = [
    { value: 'all',    label: 'All types' },
    { value: 'eat',    label: 'Eat' },
    { value: 'drink',  label: 'Drink' },
    { value: 'coffee', label: 'Coffee' },
    { value: 'stay',   label: 'Stay' },
    { value: 'shop',   label: 'Shop' },
    { value: 'see',    label: 'See' },
    { value: 'other',  label: 'Other' },
  ];

  // -------- Load --------
  async function loadSpots() {
    try {
      const data = await api.get('/api/saves?limit=500');
      // Spots = saves where AI extracted a place_name
      allSaves = (data.saves || []).filter(s => s.place_name && s.place_name.trim());
      buildCityPickerOptions();
      buildTypePickerOptions();
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
    for (const s of allSaves) {
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
    const allCount = allSaves.length;
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
        const found = TYPES.find(t => t.value === activeCat);
        typeLabel.textContent = found ? found.label : 'All types';
        closePopover(typePop);
        buildTypePickerOptions(); // refresh active state
        render();
      });
    });
  }

  // -------- Generic popover open/close --------
  function openPopover(pop) {
    closeAllPopovers();
    pop.hidden = false;
    pop.classList.add('is-open');
  }
  function closePopover(pop) {
    pop.classList.remove('is-open');
    pop.hidden = true;
  }
  function closeAllPopovers() {
    [cityPop, typePop].forEach(p => p && closePopover(p));
  }
  document.addEventListener('click', (e) => {
    // Close on outside click
    if (cityPop && !cityPop.hidden && !cityPop.contains(e.target) && !cityBtn.contains(e.target)) closePopover(cityPop);
    if (typePop && !typePop.hidden && !typePop.contains(e.target) && !typeBtn.contains(e.target)) closePopover(typePop);
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
  if (citySearch) {
    citySearch.addEventListener('input', () => buildCityPickerOptions(citySearch.value));
  }

  // -------- Render the list --------
  function render() {
    const term = searchTerm.toLowerCase().trim();
    const filtered = allSaves.filter(s => {
      if (activeCat !== 'all' && s.category !== activeCat) return false;
      if (activeCity !== 'all') {
        const cities = (s.attached_cities || []).map(c => c.name);
        if (!cities.includes(activeCity)) return false;
      }
      if (term) {
        const haystack = [s.place_name, s.tip, s.neighborhood].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

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
      return `<div class="stream__item is-structured${s.been === false ? ' is-want' : ''}" data-id="${s.id}"${catAttr}>
        <div class="stream__body">
          <span class="stream__name">${util.escapeHtml(s.place_name)}</span>
          ${tipLine}
          ${metaLine}
        </div>
        <span class="stream__when">${util.timeAgo(s.created_at)}</span>
      </div>`;
    }).join('');
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

  // -------- Save editor (self-contained) --------
  const saveEditor = document.getElementById('save-editor');
  const saveFsPlace    = document.getElementById('save-fs-place');
  const saveFsTip      = document.getElementById('save-fs-tip');
  const saveFsCat      = document.getElementById('save-fs-category');
  const saveFsClose    = document.getElementById('save-editor-close');
  const saveFsSave     = document.getElementById('save-fs-save');
  const saveFsDelete   = document.getElementById('save-fs-delete');
  const saveFsBeenYes  = document.getElementById('save-fs-been-yes');
  const saveFsBeenNo   = document.getElementById('save-fs-been-no');

  let editingSaveId = null;
  let editingBeen = true;

  function applyEditingBeen(val) {
    editingBeen = !!val;
    if (saveFsBeenYes) saveFsBeenYes.dataset.active = editingBeen ? 'true' : 'false';
    if (saveFsBeenNo)  saveFsBeenNo.dataset.active  = editingBeen ? 'false' : 'true';
  }
  if (saveFsBeenYes) saveFsBeenYes.addEventListener('click', () => applyEditingBeen(true));
  if (saveFsBeenNo)  saveFsBeenNo.addEventListener('click', () => applyEditingBeen(false));

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-visible'), 10);
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 2400);
  }

  function openSaveEditor(saveId) {
    const save = allSaves.find(s => s.id === parseInt(saveId, 10));
    if (!save) {
      toast('Save not found');
      return;
    }
    editingSaveId = save.id;
    saveFsPlace.value = save.place_name || '';
    saveFsTip.value = save.tip || '';
    saveFsCat.value = save.category || '';
    applyEditingBeen(typeof save.been === 'boolean' ? save.been : true);

    saveEditor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => saveFsPlace.focus(), 50);
  }

  function closeSaveEditor() {
    saveEditor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSaveId = null;
  }
  saveFsClose.addEventListener('click', closeSaveEditor);

  // Click delegation on the spots list
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.stream__item');
    if (!row) return;
    const id = row.dataset.id;
    if (id) openSaveEditor(id);
  });

  async function commitSaveEdit() {
    if (!editingSaveId) return;
    const body = {
      place_name: saveFsPlace.value.trim() || null,
      tip:        saveFsTip.value.trim() || null,
      category:   saveFsCat.value || null,
      been:       editingBeen,
    };
    try {
      await api.patch('/api/saves/' + editingSaveId, body);
      closeSaveEditor();
      await loadSpots();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  }
  saveFsSave.addEventListener('click', commitSaveEdit);

  if (saveFsDelete) {
    saveFsDelete.addEventListener('click', async () => {
      if (!editingSaveId) return;
      if (!confirm('Delete this spot? This cannot be undone.')) return;
      try {
        await api.delete('/api/saves/' + editingSaveId);
        closeSaveEditor();
        await loadSpots();
      } catch (err) {
        toast(err.message || 'Delete failed');
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!saveEditor.classList.contains('is-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSaveEditor(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitSaveEdit(); }
  });

  // Sign out from footer
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) {
    signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });
  }

  // Wire the shared capture overlay. After a save, re-fetch the spots list.
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

  loadSpots();
})();
