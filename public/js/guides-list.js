/* guides-list.js — studio Guides index.
   Lists all guides (shared workspace), filterable by search + city + status.
   Clicking a guide opens the builder at /guides/edit.html?id=N. */
(function () {
  if (!api.isSignedIn()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }

  const listEl   = document.getElementById('guides-list');
  const countEl  = document.getElementById('guide-count');
  const searchEl = document.getElementById('guide-search');
  const cityEl   = document.getElementById('city-filter');
  const switchEl = document.getElementById('view-switch');

  let guides = [];
  let view = 'all';           // all | published | draft
  let q = '';
  let cityFilter = '';

  const esc = (s) => util.escapeHtml(String(s == null ? '' : s));

  async function load() {
    listEl.innerHTML = '<div class="stream__empty">Loading…</div>';
    try {
      const data = await api.get('/api/guides');
      guides = data.guides || [];
      populateCities();
      render();
    } catch (err) {
      listEl.innerHTML = '<div class="stream__empty">Could not load guides.</div>';
    }
  }

  function populateCities() {
    const names = Array.from(new Set(guides.map(g => g.city_name).filter(Boolean))).sort();
    cityEl.innerHTML = '<option value="">All cities</option>' +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  function matches(g) {
    if (view === 'published' && g.status !== 'published') return false;
    if (view === 'draft' && g.status !== 'draft') return false;
    if (cityFilter && g.city_name !== cityFilter) return false;
    if (q) {
      const hay = ((g.title || '') + ' ' + (g.subtitle || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function render() {
    const rows = guides.filter(matches);
    countEl.textContent = rows.length + (rows.length === 1 ? ' guide' : ' guides');

    if (!rows.length) {
      listEl.innerHTML = '<div class="stream__empty">No guides yet. Create one to get started.</div>';
      return;
    }

    listEl.innerHTML = rows.map(g => {
      const spots = parseInt(g.spot_count, 10) || 0;
      const cityLabel = g.city_name || 'Worldwide';
      const statusBadge = g.status === 'published'
        ? '<span class="guide-badge guide-badge--pub">Published</span>'
        : '<span class="guide-badge guide-badge--draft">Draft</span>';
      return `
        <a class="guide-row" href="/guides/edit.html?id=${g.id}">
          <div class="guide-row__main">
            <div class="guide-row__title">${esc(g.title || 'Untitled guide')}</div>
            ${g.subtitle ? `<div class="guide-row__sub">${esc(g.subtitle)}</div>` : ''}
          </div>
          <div class="guide-row__city">${esc(cityLabel)}</div>
          <div class="guide-row__count">${spots} ${spots === 1 ? 'spot' : 'spots'}</div>
          <div class="guide-row__status">${statusBadge}</div>
        </a>`;
    }).join('');
  }

  // Filters
  searchEl.addEventListener('input', () => { q = searchEl.value.toLowerCase().trim(); render(); });
  cityEl.addEventListener('change', () => { cityFilter = cityEl.value; render(); });
  switchEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-switch__item');
    if (!btn) return;
    view = btn.dataset.view;
    switchEl.querySelectorAll('.view-switch__item').forEach(b => b.classList.toggle('is-active', b === btn));
    render();
  });

  // New guide → create a draft, then open the builder
  document.getElementById('new-guide-btn').addEventListener('click', async () => {
    try {
      const data = await api.post('/api/guides', { title: '' });
      location.href = '/guides/edit.html?id=' + data.guide.id;
    } catch (err) {
      alert('Could not create guide: ' + (err.message || err));
    }
  });

  load();
})();
