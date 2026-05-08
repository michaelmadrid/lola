/* =========================================================
   admin-blackbook.js — manage Blackbook entries (places table)
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('places-list');
  const searchEl = document.getElementById('search-input');
  const addBtn = document.getElementById('add-place-btn');
  const modal = document.getElementById('place-modal');
  const modalTitle = document.getElementById('place-modal-title');
  const closeBtn = document.getElementById('place-modal-close');
  const saveBtn = document.getElementById('place-save');
  const deleteBtn = document.getElementById('delete-place-btn');
  const citySelect = document.getElementById('p-city');

  let places = [];
  let cities = [];
  let editingId = null;
  let filterText = '';

  async function loadAll() {
    try {
      const [pData, cData] = await Promise.all([
        api.get('/api/places'),
        api.get('/api/cities'),
      ]);
      places = pData.places || [];
      cities = cData.cities || [];
      populateCityDropdown();
      render();
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function populateCityDropdown() {
    const sorted = [...cities].sort((a, b) => a.name.localeCompare(b.name));
    citySelect.innerHTML = '<option value="">— select —</option>' +
      sorted.map(c => `<option value="${c.id}">${util.escapeHtml(c.name)}${c.country ? ', ' + util.escapeHtml(c.country) : ''}</option>`).join('');
  }

  function render() {
    let filtered = places;
    if (filterText) {
      const q = filterText.toLowerCase();
      filtered = places.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.city_name && p.city_name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (!filtered.length) {
      listEl.innerHTML = '<div class="list-empty">No places match.</div>';
      return;
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    listEl.innerHTML = filtered.map(p => `
      <div class="admin-table__row places-row">
        <span class="col-name">${util.escapeHtml(p.name)}</span>
        <span class="col-city">${util.escapeHtml(p.city_name || '')}</span>
        <span>${util.escapeHtml(p.city_country || '')}</span>
        <span class="col-cat">${util.escapeHtml(p.category || '')}</span>
        <span class="admin-actions">
          <button data-id="${p.id}" class="edit-btn">Edit</button>
          <button data-id="${p.id}" data-name="${util.escapeHtml(p.name || '')}" class="row-delete-btn" title="Delete">×</button>
        </span>
      </div>
    `).join('');

    listEl.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEdit(parseInt(btn.dataset.id, 10)));
    });
    listEl.querySelectorAll('.row-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const name = btn.dataset.name || 'this place';
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        const row = btn.closest('.admin-table__row');
        if (row) row.style.opacity = '0.4';
        try {
          await api.delete('/api/places/' + id);
          await loadAll();
        } catch (err) {
          if (row) row.style.opacity = '';
          alert(err.message || 'Delete failed');
        }
      });
    });
  }

  // Search filter
  searchEl.addEventListener('input', util.debounce(() => {
    filterText = searchEl.value.trim();
    render();
  }, 200));

  // Modal open/close
  function openAdd() {
    editingId = null;
    modalTitle.textContent = 'Add place';
    deleteBtn.style.display = 'none';
    document.getElementById('place-form').reset();
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('p-name').focus(), 50);
  }
  function openEdit(id) {
    const p = places.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    modalTitle.textContent = 'Edit place';
    deleteBtn.style.display = '';
    document.getElementById('p-name').value = p.name || '';
    document.getElementById('p-category').value = p.category || 'bookshop';
    document.getElementById('p-city').value = p.city_id || '';
    document.getElementById('p-address').value = p.address || '';
    document.getElementById('p-maps').value = p.maps_url || '';
    document.getElementById('p-url').value = p.url || '';
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-hours').value = p.hours || '';
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  addBtn.addEventListener('click', openAdd);
  closeBtn.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Save
  async function save() {
    const body = {
      name: document.getElementById('p-name').value.trim(),
      category: document.getElementById('p-category').value,
      city_id: document.getElementById('p-city').value || null,
      address: document.getElementById('p-address').value.trim() || null,
      maps_url: document.getElementById('p-maps').value.trim() || null,
      url: document.getElementById('p-url').value.trim() || null,
      description: document.getElementById('p-description').value.trim() || null,
      hours: document.getElementById('p-hours').value.trim() || null,
    };
    if (!body.name) return;
    try {
      if (editingId) {
        await api.patch('/api/places/' + editingId, body);
        toast('Saved');
      } else {
        await api.post('/api/places', body);
        toast('Added');
      }
      closeModal();
      await loadAll();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  }
  saveBtn.addEventListener('click', save);
  document.getElementById('place-form').addEventListener('submit', (e) => {
    e.preventDefault(); save();
  });

  // Delete
  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Delete this place permanently?')) return;
    try {
      await api.delete('/api/places/' + editingId);
      toast('Deleted');
      closeModal();
      await loadAll();
    } catch (err) {
      toast(err.message || 'Delete failed');
    }
  });

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  loadAll();
})();
