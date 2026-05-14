/* =========================================================
   admin-cities.js — manage cities table
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('cities-list');
  const searchEl = document.getElementById('search-input');
  const addBtn = document.getElementById('add-city-btn');
  const modal = document.getElementById('city-modal');
  const modalTitle = document.getElementById('city-modal-title');
  const closeBtn = document.getElementById('city-modal-close');
  const saveBtn = document.getElementById('city-save');
  const deleteBtn = document.getElementById('delete-city-btn');
  const parentSelect = document.getElementById('c-parent');

  let cities = [];
  let editingId = null;
  let filterText = '';

  async function load() {
    try {
      const data = await api.get('/api/cities?include_all=true');
      cities = data.cities || [];
      render();
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function populateParentDropdown() {
    const sorted = [...cities]
      .filter(c => c.id !== editingId)
      .sort((a, b) => a.name.localeCompare(b.name));
    parentSelect.innerHTML = '<option value="">— none —</option>' +
      sorted.map(c => `<option value="${c.id}">${util.escapeHtml(c.name)}${c.country ? ', ' + util.escapeHtml(c.country) : ''}</option>`).join('');
  }

  function render() {
    let filtered = cities;
    if (filterText) {
      const q = filterText.toLowerCase();
      filtered = cities.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.country && c.country.toLowerCase().includes(q))
      );
    }
    if (!filtered.length) {
      listEl.innerHTML = '<div class="list-empty">No cities match.</div>';
      return;
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    listEl.innerHTML = filtered.map(c => `
      <div class="admin-table__row" style="grid-template-columns: minmax(0,3fr) minmax(0,2fr) minmax(0,2fr) 130px">
        <span>${util.escapeHtml(c.name)}${c.is_region ? ' <span style="font-family:var(--mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:0.06em;margin-left:8px">region</span>' : ''}</span>
        <span>${util.escapeHtml(c.country || '')}</span>
        <span>${util.escapeHtml(c.parent_name || '')}</span>
        <span class="admin-actions">
          <button data-id="${c.id}" class="edit-btn">Edit</button>
        </span>
      </div>
    `).join('');
    listEl.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEdit(parseInt(btn.dataset.id, 10)));
    });
  }

  searchEl.addEventListener('input', util.debounce(() => {
    filterText = searchEl.value.trim();
    render();
  }, 200));

  function openAdd() {
    editingId = null;
    modalTitle.textContent = 'Add city';
    deleteBtn.style.display = 'none';
    document.getElementById('city-form').reset();
    populateParentDropdown();
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('c-name').focus(), 50);
  }
  function openEdit(id) {
    const c = cities.find(x => x.id === id);
    if (!c) return;
    editingId = id;
    modalTitle.textContent = 'Edit city';
    deleteBtn.style.display = '';
    populateParentDropdown();
    document.getElementById('c-name').value = c.name || '';
    document.getElementById('c-country').value = c.country || '';
    document.getElementById('c-parent').value = c.parent_id || '';
    document.getElementById('c-region').value = c.region || '';
    document.getElementById('c-timezone').value = c.timezone || '';
    document.getElementById('c-is-region').checked = !!c.is_region;
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

  async function save() {
    const body = {
      name: document.getElementById('c-name').value.trim(),
      country: document.getElementById('c-country').value.trim() || null,
      parent_id: document.getElementById('c-parent').value || null,
      region: document.getElementById('c-region').value.trim() || null,
      timezone: document.getElementById('c-timezone').value.trim() || null,
      is_region: document.getElementById('c-is-region').checked,
    };
    if (!body.name) return;
    try {
      if (editingId) {
        await api.patch('/api/cities/' + editingId, body);
        toast('Saved');
      } else {
        await api.post('/api/cities', body);
        toast('Added');
      }
      closeModal();
      await load();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  }
  saveBtn.addEventListener('click', save);
  document.getElementById('city-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });

  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Delete this city? Places attached will lose their city link.')) return;
    try {
      await api.delete('/api/cities/' + editingId);
      toast('Deleted');
      closeModal();
      await load();
    } catch (err) {
      toast(err.message || 'Delete failed');
    }
  });

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  load();
})();
