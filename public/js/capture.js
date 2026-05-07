/* =========================================================
   capture.js — Complex Capture page
   ========================================================= */

(async function () {
  const cityBtn       = document.getElementById('city-btn');
  const cityBtnName   = document.getElementById('city-btn-name');
  const cityPopover   = document.getElementById('city-popover');
  const citySearch    = document.getElementById('city-search');
  const cityList      = document.getElementById('city-list');
  const textarea      = document.getElementById('capture-textarea');
  const counter       = document.getElementById('capture-counter');
  const statusEl      = document.getElementById('capture-status');
  const submitContinue = document.getElementById('submit-continue');
  const submitClose    = document.getElementById('submit-close');
  const closeBtn       = document.getElementById('capture-close');

  const STORAGE_KEY = 'kit.capture.lastCity';
  let allCities = [];
  let pickedCity = null;  // { id, name, country }
  let isSubmitting = false;

  // ---------- City binding ----------
  async function loadCities() {
    try {
      const data = await api.get('/api/cities');
      allCities = (data.cities || []).filter(c => c.status !== 0);
    } catch (err) {
      allCities = [];
    }
  }

  function setPickedCity(city) {
    pickedCity = city;
    cityBtnName.textContent = city ? city.name : 'pick a city';
    if (city) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: city.id, name: city.name, country: city.country || null })); } catch {}
    }
    cityPopover.classList.remove('is-open');
  }

  async function loadDefaultCity() {
    // Cascade:
    // 1. localStorage last-used (recent capture session)
    //    Note: Settings clears this when home city changes, so a fresh home takes effect.
    // 2. user's home_city from API
    // 3. localStorage home_location string (legacy/fallback)
    // 4. first featured city
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        const found = allCities.find(x => x.id === c.id);
        if (found) { setPickedCity(found); return; }
      }
    } catch {}
    try {
      const me = await api.get('/api/auth/me');
      if (me && me.user && me.user.home_city_id) {
        const found = allCities.find(c => c.id === me.user.home_city_id);
        if (found) { setPickedCity(found); return; }
      }
    } catch {}
    try {
      const lsName = localStorage.getItem('lola.home_location');
      if (lsName) {
        const match = allCities.find(c => c.name.toLowerCase() === lsName.toLowerCase());
        if (match) { setPickedCity(match); return; }
      }
    } catch {}
    const firstFeatured = allCities.find(c => c.status === 3);
    if (firstFeatured) { setPickedCity(firstFeatured); return; }
    setPickedCity(null);
  }

  function renderCityList(query) {
    const q = (query || '').trim().toLowerCase();
    const featured = allCities.filter(c => c.status === 3);
    const all = q
      ? allCities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 12)
      : featured.slice(0, 20);
    const exact = all.find(c => c.name.toLowerCase() === q);

    let html = all.map(c =>
      `<button class="capture-page__city-item${pickedCity && pickedCity.id === c.id ? ' is-current' : ''}" data-city-id="${c.id}">
        ${util.escapeHtml(c.name)}${c.country ? `<span class="capture-page__city-country">${util.escapeHtml(c.country)}</span>` : ''}
      </button>`
    ).join('');
    if (q && !exact) {
      html += `<button class="capture-page__city-item capture-page__city-item--create" data-city-name="${util.escapeHtml(query.trim())}">
        + create "${util.escapeHtml(query.trim())}"
      </button>`;
    }
    cityList.innerHTML = html || '<div class="capture-page__city-empty">No matches.</div>';

    cityList.querySelectorAll('.capture-page__city-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cid = btn.dataset.cityId;
        const cname = btn.dataset.cityName;
        if (cid) {
          const c = allCities.find(x => x.id === parseInt(cid, 10));
          if (c) setPickedCity(c);
        } else if (cname) {
          // Create new
          try {
            const result = await api.post('/api/cities', { name: cname });
            const newCity = result.city || result;
            allCities.push(newCity);
            setPickedCity(newCity);
          } catch (err) {
            toast(err.message || 'Could not create city');
          }
        }
        // Refocus textarea
        setTimeout(() => textarea.focus(), 50);
      });
    });
  }

  cityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cityPopover.classList.toggle('is-open');
    if (cityPopover.classList.contains('is-open')) {
      citySearch.value = '';
      renderCityList('');
      setTimeout(() => citySearch.focus(), 50);
    }
  });
  citySearch.addEventListener('input', () => renderCityList(citySearch.value));
  citySearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cityPopover.classList.remove('is-open');
      textarea.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // If exactly one match, pick it
      const items = cityList.querySelectorAll('.capture-page__city-item');
      if (items.length === 1) items[0].click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!cityPopover.contains(e.target) && !cityBtn.contains(e.target)) {
      cityPopover.classList.remove('is-open');
    }
  });

  // ---------- Counter ----------
  function updateCounter() {
    const lines = textarea.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const n = lines.length;
    counter.textContent = n === 0
      ? 'nothing yet'
      : n === 1
        ? '1 place to add'
        : `${n} places to add`;
  }
  textarea.addEventListener('input', updateCounter);

  // ---------- Submit ----------
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-visible'), 10);
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 2400);
  }

  async function doSubmit({ thenClose }) {
    if (isSubmitting) return;
    const text = textarea.value.trim();
    if (!text) {
      toast('Nothing to submit');
      return;
    }
    if (!pickedCity) {
      toast('Pick a city first');
      return;
    }
    isSubmitting = true;
    submitContinue.disabled = true;
    submitClose.disabled = true;

    try {
      const body = { text, city_id: pickedCity.id, city_name: pickedCity.name };
      const result = await api.post('/api/saves', body);
      const count = result.count || 1;

      if (thenClose) {
        // Reset state IMMEDIATELY so UI doesn't get stuck if redirect stalls
        isSubmitting = false;
        submitContinue.disabled = false;
        submitClose.disabled = false;
        toast(count === 1 ? 'Saved' : `${count} saves added`);
        // Redirect after short delay so user sees the toast
        const redirectTimer = setTimeout(() => {
          window.location.href = '/';
        }, 600);
        // Safety net: if for any reason we're still here after 3s, force-redirect
        setTimeout(() => {
          if (window.location.pathname.startsWith('/capture')) {
            clearTimeout(redirectTimer);
            window.location.href = '/';
          }
        }, 3000);
      } else {
        showStatus(count);
        textarea.value = '';
        updateCounter();
        textarea.focus();
        isSubmitting = false;
        submitContinue.disabled = false;
        submitClose.disabled = false;
      }
    } catch (err) {
      toast(err.message || 'Save failed');
      isSubmitting = false;
      submitContinue.disabled = false;
      submitClose.disabled = false;
    }
  }

  // ---------- Inline status line ----------
  let statusTimer = null;
  function showStatus(count) {
    if (!statusEl) return;
    const word = count === 1 ? 'place' : 'places';
    statusEl.textContent = `Last batch: ${count} ${word} added · just now`;
    statusEl.classList.add('is-visible');
    clearTimeout(statusTimer);
    // Tick the timestamp once a second for the first 30s, then leave the line in place
    let secs = 0;
    statusTimer = setInterval(() => {
      secs += 1;
      if (secs >= 60) {
        clearInterval(statusTimer);
        return;
      }
      const ago = secs < 5 ? 'just now' : `${secs}s ago`;
      statusEl.textContent = `Last batch: ${count} ${word} added · ${ago}`;
    }, 1000);
  }
  submitContinue.addEventListener('click', () => doSubmit({ thenClose: false }));
  submitClose.addEventListener('click', () => doSubmit({ thenClose: true }));
  closeBtn.addEventListener('click', () => { window.location.href = '/'; });

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close popover first if open, else navigate home
      if (cityPopover.classList.contains('is-open')) {
        cityPopover.classList.remove('is-open');
        return;
      }
      // Only close if textarea is empty (avoid accidental loss)
      if (!textarea.value.trim()) {
        window.location.href = '/';
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) doSubmit({ thenClose: true });
      else doSubmit({ thenClose: false });
    }
  });

  // ---------- Init ----------
  await loadCities();
  await loadDefaultCity();
  updateCounter();
})();
