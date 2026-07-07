/* admin-cities.js — cities management with Google resolve + featured status */
(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }
  if (window.AdminShell) AdminShell.render('cities');

  const listEl      = document.getElementById('cities-list');
  const searchEl    = document.getElementById('search-input');
  const statusEl    = document.getElementById('status-filter');
  const addBtn      = document.getElementById('add-city-btn');
  const editor      = document.getElementById('city-editor');
  const editorTitle = document.getElementById('city-editor-title');
  const closeBtn    = document.getElementById('city-editor-close');
  const saveBtn     = document.getElementById('city-save');
  const deleteBtn   = document.getElementById('city-delete');
  const resolveField= document.getElementById('city-resolve-field');
  const resolveInput= document.getElementById('city-resolve-input');
  const resolveBtn  = document.getElementById('city-resolve-btn');
  const resolveOut  = document.getElementById('city-resolve-results');

  const fName = document.getElementById('c-name');
  const fCountry = document.getElementById('c-country');
  const fTimezone = document.getElementById('c-timezone');
  const fIsRegion = document.getElementById('c-is-region');

  // Populate timezone dropdown from the browser's IANA list
  (function populateTimezones() {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = []; }
    fTimezone.innerHTML = '<option value="">— none —</option>' +
      zones.map(z => `<option value="${z}">${z}</option>`).join('');
  })();

  let cities = [];
  let editingId = null;
  let editingStatus = 3;
  let editingLat = null, editingLng = null, editingPlaceId = null;

  const esc = (s) => util.escapeHtml(String(s || ''));
  const statusLabel = (s) => s === 3 ? '★ Featured' : s === 2 ? 'Pending' : 'Normal';

  async function load() {
    try {
      const data = await api.get('/api/cities?include_all=true');
      cities = data.cities || [];
      render();
    } catch {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function render() {
    const q = (searchEl.value || '').toLowerCase();
    const sf = statusEl.value;
    let filtered = cities.filter(c => {
      const matchQ = !q || c.name.toLowerCase().includes(q) || (c.country || '').toLowerCase().includes(q);
      const matchS = !sf || String(c.status) === sf;
      return matchQ && matchS;
    });
    filtered.sort((a, b) => (b.created_at||'').localeCompare(a.created_at||''));

    if (!filtered.length) { listEl.innerHTML = '<div class="list-empty">No cities found.</div>'; return; }

    listEl.innerHTML = filtered.map(c => `
      <div class="admin-table__row cities-row">
        <span class="col-name"><strong>${esc(c.name)}</strong>${c.is_region ? ' <span class="caption">region</span>' : ''}</span>
        <span>${esc(c.country)}</span>
        <span><span class="caption">${esc(c.timezone)}</span></span>
        <span><span class="caption">${statusLabel(c.status)}</span></span>
        <span class="admin-actions"><button data-edit="${c.id}">Edit</button></span>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => openEditor(parseInt(b.dataset.edit))));
  }

  function applyStatus(s) {
    editingStatus = s;
    ['featured', 'auto', 'pending'].forEach(k => {
      const el = document.getElementById('c-status-' + k);
      el.dataset.active = String(parseInt(el.dataset.status) === s);
    });
  }
  document.querySelectorAll('[id^="c-status-"]').forEach(b =>
    b.addEventListener('click', () => applyStatus(parseInt(b.dataset.status))));

  function openEditor(id) {
    editingId = id;
    const c = id ? cities.find(x => x.id === id) : null;
    editorTitle.textContent = c ? 'Edit city' : 'Add city';
    deleteBtn.style.display = c ? '' : 'none';
    resolveField.style.display = c ? 'none' : '';
    resolveOut.innerHTML = '';
    resolveInput.value = '';

    fName.value = c ? c.name : '';
    fCountry.value = c ? (c.country || '') : '';
    fTimezone.value = c ? (c.timezone || '') : '';
    fIsRegion.checked = c ? !!c.is_region : false;
    editingLat = c ? c.lat : null;
    editingLng = c ? c.lon : null;
    editingPlaceId = c ? c.google_place_id : null;
    applyStatus(c ? c.status : 3);

    editor.classList.add('is-open');
  }

  function closeEditor() { editor.classList.remove('is-open'); editingId = null; }
  closeBtn.addEventListener('click', closeEditor);
  addBtn.addEventListener('click', () => openEditor(null));

  // Google resolve
  resolveBtn.addEventListener('click', async () => {
    const q = resolveInput.value.trim();
    if (!q) return;
    resolveOut.innerHTML = '<p class="spot-fs__hint">Searching…</p>';
    try {
      const { candidates } = await api.get('/api/cities/resolve?q=' + encodeURIComponent(q));
      if (!candidates.length) { resolveOut.innerHTML = '<p class="spot-fs__hint">No matches.</p>'; return; }
      resolveOut.innerHTML = candidates.map((c, i) => `
        <button type="button" class="capture-fs__cat-item" data-i="${i}" style="display:block;width:100%;text-align:left;padding:8px 10px;border-radius:4px;background:transparent;border:0;cursor:pointer;font-size:14px">
          <strong>${esc(c.name)}</strong> <span style="color:var(--ink-3)">${esc(c.formatted)}</span>
        </button>
      `).join('');
      resolveOut.querySelectorAll('[data-i]').forEach(btn =>
        btn.addEventListener('click', async () => {
          const c = candidates[parseInt(btn.dataset.i)];
          fName.value = c.name || '';
          fCountry.value = c.country || '';
          editingLat = c.lat; editingLng = c.lng; editingPlaceId = c.google_place_id;
          resolveOut.innerHTML = '<p class="spot-fs__hint">Fetching timezone…</p>';
          try {
            const tz = await api.get('/api/cities/timezone?lat=' + c.lat + '&lng=' + c.lng);
            fTimezone.value = tz.timezone || '';
          } catch {}
          resolveOut.innerHTML = '<p class="spot-fs__hint">✓ Filled from Google. Edit as needed.</p>';
        }));
    } catch (err) {
      resolveOut.innerHTML = '<p class="spot-fs__hint">' + esc(err.message) + '</p>';
    }
  });

  saveBtn.addEventListener('click', async () => {
    const body = {
      name: fName.value.trim(),
      country: fCountry.value.trim() || null,
      timezone: fTimezone.value.trim() || null,
      is_region: fIsRegion.checked,
      status: editingStatus,
      lat: editingLat, lon: editingLng,
      google_place_id: editingPlaceId,
    };
    if (!body.name) { alert('Name required'); return; }
    try {
      if (editingId) await api.patch('/api/cities/' + editingId, body);
      else await api.post('/api/cities', body);
      closeEditor();
      load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!editingId || !confirm('Delete this city?')) return;
    try { await api.delete('/api/cities/' + editingId); closeEditor(); load(); }
    catch (err) { alert('Delete failed: ' + err.message); }
  });

  searchEl.addEventListener('input', render);
  statusEl.addEventListener('change', render);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editor.classList.contains('is-open')) closeEditor();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && editor.classList.contains('is-open')) saveBtn.click();
  });

  load();
})();
