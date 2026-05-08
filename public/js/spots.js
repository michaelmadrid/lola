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
  const citiesBar = document.getElementById('spots-cities');
  const searchInput = document.getElementById('search-input');
  const catSelMobile = document.getElementById('cat-select-mobile');

  // -------- Load --------
  async function loadSpots() {
    try {
      const data = await api.get('/api/saves?limit=500');
      // Spots = saves where AI extracted a place_name
      allSaves = (data.saves || []).filter(s => s.place_name && s.place_name.trim());
      buildCityPills();
      render();
    } catch (err) {
      console.error('loadSpots', err);
      listEl.innerHTML = '<div class="stream__empty">Could not load spots.</div>';
    }
  }

  // -------- City pills (derived from current spots) --------
  function buildCityPills() {
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
    const cities = [...cityMap.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const allCount = allSaves.length;
    const pillsHtml = [
      `<button class="city-pill ${activeCity === 'all' ? 'is-active' : ''}" data-city="all">all <span class="city-pill__count">${allCount}</span></button>`,
      ...cities.map(c =>
        `<button class="city-pill ${activeCity === c.name ? 'is-active' : ''}" data-city="${util.escapeHtml(c.name)}">${util.escapeHtml(c.name.toLowerCase())} <span class="city-pill__count">${c.count}</span></button>`
      )
    ].join('');
    citiesBar.innerHTML = pillsHtml;

    citiesBar.querySelectorAll('.city-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCity = btn.dataset.city;
        citiesBar.querySelectorAll('.city-pill').forEach(c => c.classList.remove('is-active'));
        btn.classList.add('is-active');
        render();
      });
    });
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

      return `<div class="stream__item is-structured${s.been === false ? ' is-want' : ''}" data-id="${s.id}">
        <div class="stream__body">
          <span class="stream__name">${util.escapeHtml(s.place_name)}</span>
          ${tipLine}
          ${metaLine}
        </div>
        <span class="stream__when">${util.timeAgo(s.created_at)}</span>
      </div>`;
    }).join('');
  }

  // -------- Filters --------
  document.querySelectorAll('#cat-filters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCat = chip.dataset.cat;
      document.querySelectorAll('#cat-filters .filter-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      if (catSelMobile) catSelMobile.value = activeCat;
      render();
    });
  });
  if (catSelMobile) {
    catSelMobile.addEventListener('change', () => {
      activeCat = catSelMobile.value;
      document.querySelectorAll('#cat-filters .filter-chip').forEach(c => {
        c.classList.toggle('is-active', c.dataset.cat === activeCat);
      });
      render();
    });
  }
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
  let editingPickedCityId = null;
  let editingOriginalCityName = '';
  let editingBeen = true;
  let allCitiesCache = null;

  function applyEditingBeen(val) {
    editingBeen = !!val;
    if (saveFsBeenYes) saveFsBeenYes.dataset.active = editingBeen ? 'true' : 'false';
    if (saveFsBeenNo)  saveFsBeenNo.dataset.active  = editingBeen ? 'false' : 'true';
  }
  if (saveFsBeenYes) saveFsBeenYes.addEventListener('click', () => applyEditingBeen(true));
  if (saveFsBeenNo)  saveFsBeenNo.addEventListener('click', () => applyEditingBeen(false));

  function toast(msg) {
    // Lightweight toast — match shell.css patterns
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-visible'), 10);
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 2400);
  }

  async function ensureCitiesCache() {
    if (allCitiesCache) return allCitiesCache;
    try {
      const data = await api.get('/api/cities');
      allCitiesCache = (data.cities || []).filter(c => c.status !== 0);
    } catch {
      allCitiesCache = [];
    }
    return allCitiesCache;
  }

  function openSaveEditor(saveId) {
    const save = allSaves.find(s => s.id === parseInt(saveId, 10));
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
    applyEditingBeen(typeof save.been === 'boolean' ? save.been : true);

    saveEditor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => saveFsPlace.focus(), 50);
  }

  function closeSaveEditor() {
    saveEditor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSaveId = null;
    editingPickedCityId = null;
    saveFsCitySuggest.innerHTML = '';
  }
  saveFsClose.addEventListener('click', closeSaveEditor);

  // Click delegation on the spots list
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.stream__item');
    if (!row) return;
    const id = row.dataset.id;
    if (id) openSaveEditor(id);
  });

  async function renderCitySuggestions(query) {
    const cities = await ensureCitiesCache();
    const q = (query || '').trim().toLowerCase();
    if (!q) { saveFsCitySuggest.innerHTML = ''; return; }
    if (editingPickedCityId) {
      const picked = cities.find(c => c.id === editingPickedCityId);
      if (picked && picked.name.toLowerCase() === q) {
        saveFsCitySuggest.innerHTML = '';
        return;
      }
    }
    const matches = cities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
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
          try {
            const result = await api.post('/api/cities', { name: cname });
            const newCity = result.city || result;
            editingPickedCityId = newCity.id;
            saveFsCity.value = newCity.name;
            allCitiesCache = null;
          } catch (err) {
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
    if (saveFsCity.value !== editingOriginalCityName) {
      editingPickedCityId = null;
    }
    clearTimeout(cityDebounce);
    cityDebounce = setTimeout(() => renderCitySuggestions(saveFsCity.value), 80);
  });
  saveFsCity.addEventListener('blur', () => {
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
      const targetCityName = saveFsCity.value.trim();
      if (targetCityName !== editingOriginalCityName && editingPickedCityId) {
        await api.post(`/api/saves/${editingSaveId}/cities`, { city_id: editingPickedCityId });
      }
      closeSaveEditor();
      await loadSpots();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  }
  saveFsSave.addEventListener('click', commitSaveEdit);

  saveFsArchive.addEventListener('click', async () => {
    if (!editingSaveId) return;
    if (!confirm('Archive this save?')) return;
    try {
      await api.patch('/api/saves/' + editingSaveId, { archived_at: new Date().toISOString() });
      closeSaveEditor();
      await loadSpots();
    } catch (err) {
      toast(err.message || 'Archive failed');
    }
  });

  saveFsReparse.addEventListener('click', async () => {
    if (!editingSaveId) return;
    try {
      await api.post('/api/saves/' + editingSaveId + '/reparse', {});
      toast('Re-parsing…');
      setTimeout(async () => {
        closeSaveEditor();
        await loadSpots();
      }, 2000);
    } catch (err) {
      toast(err.message || 'Re-parse failed');
    }
  });

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

  loadSpots();
})();
