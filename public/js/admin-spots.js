/* admin-spots.js — master spots tool: filter, bulk actions, shared editor */
(async function () {
  if (!api.isSignedIn()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }

  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'all'; // all | curated | standard | trash

  AdminShell.render('spots-' + (view === 'all' ? 'all' : view));

  const titles = { all: 'All Spots', curated: 'Curated', standard: 'Standard', trash: 'Trash' };
  document.getElementById('page-title').textContent = titles[view] || 'Spots';

  const listEl   = document.getElementById('spots-list');
  const searchEl = document.getElementById('search-input');
  const cityEl   = document.getElementById('city-filter');
  const catEl    = document.getElementById('cat-filter');
  const checkAll = document.getElementById('check-all');
  const bulkBar  = document.getElementById('bulk-bar');
  const bulkCount= document.getElementById('bulk-count');

  let spots = [];
  let selected = new Set();
  const CAT_LABELS = { bookstore:'Bookstore', film_lab:'Film Lab', record_store:'Record Store', cinema:'Cinema', gallery:'Gallery', coffee:'Coffee', eat:'Eat', drink:'Drink', hotel:'Hotel', shop:'Shop', other:'Other' };
  const esc = (s) => util.escapeHtml(String(s || ''));
  const cityOf = (s) => (s.attached_cities && s.attached_cities[0]) ? s.attached_cities[0].name : '';

  async function load() {
    const q = view === 'trash' ? '?all=true&trashed=true&limit=500' : '?all=true&limit=500';
    try {
      const data = await api.get('/api/spots' + q);
      spots = data.spots || [];
      if (view === 'curated') spots = spots.filter(s => s.curated);
      if (view === 'standard') spots = spots.filter(s => !s.curated);
      buildFilters();
      render();
    } catch (e) {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function buildFilters() {
    const cities = [...new Map(spots.filter(s => cityOf(s)).map(s => [cityOf(s), cityOf(s)])).values()].sort();
    cityEl.innerHTML = '<option value="">All cities</option>' + cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    const cats = [...new Set(spots.map(s => s.category).filter(Boolean))].sort();
    catEl.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option value="${c}">${CAT_LABELS[c]||c}</option>`).join('');
  }

  function filtered() {
    const q = searchEl.value.toLowerCase();
    const city = cityEl.value, cat = catEl.value;
    return spots.filter(s => {
      const mq = !q || (s.place_name||'').toLowerCase().includes(q) || (s.tip||'').toLowerCase().includes(q);
      const mc = !city || cityOf(s) === city;
      const mcat = !cat || s.category === cat;
      return mq && mc && mcat;
    });
  }

  function render() {
    const rows = filtered();
    if (!rows.length) { listEl.innerHTML = '<div class="list-empty">No spots.</div>'; updateBulk(); return; }
    listEl.innerHTML = rows.map(s => `
      <div class="admin-table__row spots-admin-row">
        <span class="col-check"><input type="checkbox" data-check="${s.id}" ${selected.has(s.id)?'checked':''}></span>
        <span class="col-name"><strong>${esc(s.place_name || '—')}</strong>${s.online_only?' <span class="caption">online</span>':''}</span>
        <span>${esc(cityOf(s) || '—')}</span>
        <span>${s.category?`<span class="caption">${esc(CAT_LABELS[s.category]||s.category)}</span>`:'—'}</span>
        <span>${s.curated?'<span class="caption caption--accent">Curated</span>':'<span class="caption">Standard</span>'}</span>
        <span class="admin-actions"><button data-edit="${s.id}">Edit</button></span>
      </div>`).join('');

    listEl.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => { const s = spots.find(x => x.id === parseInt(b.dataset.edit)); if (s) SpotEditor.open(s); }));
    listEl.querySelectorAll('[data-check]').forEach(cb =>
      cb.addEventListener('change', () => {
        const id = parseInt(cb.dataset.check);
        cb.checked ? selected.add(id) : selected.delete(id);
        updateBulk();
      }));
    updateBulk();
  }

  function updateBulk() {
    bulkCount.textContent = selected.size + ' selected';
    bulkBar.hidden = selected.size === 0;
    // Toggle trash-mode buttons
    document.getElementById('bulk-curate').hidden = view === 'trash';
    document.getElementById('bulk-decurate').hidden = view === 'trash';
    document.getElementById('bulk-trash').hidden = view === 'trash';
    document.getElementById('bulk-restore').hidden = view !== 'trash';
    document.getElementById('bulk-delete').hidden = view !== 'trash';
  }

  async function bulkPatch(body) {
    await Promise.all([...selected].map(id => api.patch('/api/spots/' + id, body)));
    selected.clear(); load();
  }

  document.getElementById('bulk-curate').addEventListener('click', () => bulkPatch({ curated: true }));
  document.getElementById('bulk-decurate').addEventListener('click', () => bulkPatch({ curated: false }));
  document.getElementById('bulk-trash').addEventListener('click', () => {
    if (!confirm('Move ' + selected.size + ' spots to trash?')) return;
    bulkPatch({ deleted_at: new Date().toISOString() });
  });
  document.getElementById('bulk-restore').addEventListener('click', () => bulkPatch({ deleted_at: null }));
  document.getElementById('bulk-delete').addEventListener('click', async () => {
    if (!confirm('Permanently delete ' + selected.size + ' spots? Cannot be undone.')) return;
    await Promise.all([...selected].map(id => api.delete('/api/spots/' + id)));
    selected.clear(); load();
  });
  document.getElementById('bulk-clear').addEventListener('click', () => {
    selected.clear(); checkAll.checked = false; render();
  });

  checkAll.addEventListener('change', () => {
    const rows = filtered();
    if (checkAll.checked) rows.forEach(s => selected.add(s.id));
    else selected.clear();
    render();
  });

  searchEl.addEventListener('input', render);
  cityEl.addEventListener('change', render);
  catEl.addEventListener('change', render);

  SpotEditor.init({
    onSaved: () => load(),
    onDeleted: () => load(),
    softDelete: view !== 'trash',
  });

  if (window.CaptureOverlay) {
    CaptureOverlay.init({
      launcher: '#capture-launcher',
      onSaved: () => { setTimeout(load, 1500); },
    });
  }

  load();
})();
