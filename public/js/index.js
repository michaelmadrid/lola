/* =========================================================
   index.js — Index page (public directory)
   ========================================================= */

(async function () {
  const catLabels = {
    'bookshop': 'bookshop',
    'coffee':   'coffee',
    'film-lab': 'film lab',
    'gallery':  'gallery',
    'hotel':    'hotel',
    'shop':     'shop',
    'restaurant': 'restaurant',
  };

  let places = [];
  let activeCat = 'all';
  let activeCity = 'all';
  let activeSort = 'name';
  let searchTerm = '';

  const listEl       = document.getElementById('list');
  const citySel      = document.getElementById('city-select');
  const searchInput  = document.getElementById('search-input');
  const catSelMobile = document.getElementById('cat-select-mobile');
  const sortSel      = document.getElementById('sort-select');

  async function loadPlaces() {
    try {
      const data = await api.get('/api/places');
      places = data.places || [];
      populateCityDropdown();
      render();
    } catch (err) {
      console.error('loadPlaces', err);
      listEl.innerHTML = '<div class="list-empty">Could not load places.</div>';
    }
  }

  function populateCityDropdown() {
    const cities = [...new Set(places.map(p => p.city_name).filter(Boolean))].sort();
    citySel.innerHTML = '<option value="all">All cities</option>' +
      cities.map(c => `<option value="${util.escapeHtml(c)}">${util.escapeHtml(c)}</option>`).join('');
  }

  function render() {
    const term = searchTerm.toLowerCase().trim();
    let filtered = places.filter(p => {
      if (activeCat !== 'all' && p.category !== activeCat) return false;
      if (activeCity !== 'all' && p.city_name !== activeCity) return false;
      if (term && !(p.name || '').toLowerCase().includes(term)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const aCity = a.city_name || '';
      const bCity = b.city_name || '';
      const aCountry = a.city_country || '';
      const bCountry = b.city_country || '';
      if (activeSort === 'city') return aCity.localeCompare(bCity) || a.name.localeCompare(b.name);
      if (activeSort === 'country') return aCountry.localeCompare(bCountry) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });

    if (!filtered.length) {
      const msg = term ? `No matches for "${util.escapeHtml(searchTerm.trim())}"` : 'No places match these filters.';
      listEl.innerHTML = `<div class="list-empty">${msg}</div>`;
      return;
    }
    listEl.innerHTML = filtered.map(p => {
      const cat = catLabels[p.category] || p.category || '';
      const href = p.maps_url || p.url || '#';
      return `<a class="list-row" href="${util.escapeHtml(href)}" target="_blank" rel="noopener">
        <span class="row-name">${util.escapeHtml(p.name)}<span class="cat">${util.escapeHtml(cat)}</span></span>
        <span class="row-city">${util.escapeHtml(p.city_name || '')}</span>
        <span class="row-country">${util.escapeHtml(p.city_country || '')}</span>
        <span class="row-arrow">→</span>
      </a>`;
    }).join('');
  }

  // Type chips (desktop) — clicking syncs the mobile select too
  document.querySelectorAll('#cat-filters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCat = chip.dataset.cat;
      document.querySelectorAll('#cat-filters .filter-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      if (catSelMobile) catSelMobile.value = activeCat;
      render();
    });
  });

  // Type select (mobile) — syncs the chips back
  if (catSelMobile) {
    catSelMobile.addEventListener('change', () => {
      activeCat = catSelMobile.value;
      document.querySelectorAll('#cat-filters .filter-chip').forEach(c => {
        c.classList.toggle('is-active', c.dataset.cat === activeCat);
      });
      render();
    });
  }

  citySel.addEventListener('change', () => { activeCity = citySel.value; render(); });
  sortSel.addEventListener('change', (e) => { activeSort = e.target.value; render(); });

  // Search — debounced for snappy typing
  if (searchInput) {
    let t = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        searchTerm = searchInput.value;
        render();
      }, 50);
    });
    // Esc clears
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchTerm = '';
        render();
      }
    });
  }

  loadPlaces();
})();
