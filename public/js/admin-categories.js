(function () {
  if (!api.isSignedIn()) { location.href = '/login.html'; return; }

  const listEl = document.getElementById('cats-list');
  const editor = document.getElementById('cat-editor');
  const titleEl = document.getElementById('cat-editor-title');
  const labelEl = document.getElementById('cat-label');
  const slugEl = document.getElementById('cat-slug');
  const slugField = document.getElementById('cat-slug-field');
  const sortEl = document.getElementById('cat-sort');
  const favOff = document.getElementById('cat-fav-off');
  const favOn = document.getElementById('cat-fav-on');
  const activeField = document.getElementById('cat-active-field');
  const activeOn = document.getElementById('cat-active-on');
  const activeOff = document.getElementById('cat-active-off');
  const saveBtn = document.getElementById('cat-save');

  let editingId = null;
  let favorite = false;
  let active = true;
  let cats = [];

  const esc = s => util.escapeHtml(String(s || ''));

  async function load() {
    listEl.innerHTML = '<div class="list-empty">Loading…</div>';
    try {
      const data = await api.get('/api/spots/categories?includeInactive=true');
      cats = data.categories || [];
      render();
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Could not load categories.</div>';
    }
  }

  function render() {
    if (!cats.length) { listEl.innerHTML = '<div class="list-empty">No categories.</div>'; return; }
    listEl.innerHTML = cats.map(c => `
      <div class="admin-table__row cats-row" data-id="${c.id}">
        <span class="admin-row__name">${esc(c.label)}</span>
        <span class="admin-row__mono">${esc(c.value)}</span>
        <span>${c.favorite ? '★' : '—'}</span>
        <span>${c.sort_order}</span>
        <span>${c.active ? 'Active' : '<span class="cat-inactive">Inactive</span>'}</span>
        <span class="admin-row__actions">
          <button class="btn btn--small btn--secondary" data-edit="${c.id}">Edit</button>
        </span>
      </div>
    `).join('');
    listEl.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => openEditor(cats.find(c => c.id === parseInt(b.dataset.edit, 10)))));
  }

  function setFav(v) { favorite = v; favOff.dataset.active = String(!v); favOn.dataset.active = String(v); }
  favOff.addEventListener('click', () => setFav(false));
  favOn.addEventListener('click', () => setFav(true));

  function setActive(v) { active = v; activeOn.dataset.active = String(v); activeOff.dataset.active = String(!v); }
  activeOn.addEventListener('click', () => setActive(true));
  activeOff.addEventListener('click', () => setActive(false));

  function openEditor(c) {
    editingId = c ? c.id : null;
    titleEl.textContent = c ? 'Edit category' : 'Add category';
    labelEl.value = c ? c.label : '';
    slugEl.value = c ? c.value : '';
    slugEl.disabled = !!c;           // slug locked after create
    slugField.style.opacity = c ? '0.6' : '1';
    sortEl.value = c ? c.sort_order : 100;
    setFav(c ? !!c.favorite : false);
    activeField.hidden = !c;         // only show active toggle when editing
    setActive(c ? !!c.active : true);
    editor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeEditor() {
    editor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingId = null;
  }
  document.getElementById('cat-editor-close').addEventListener('click', closeEditor);
  document.getElementById('add-cat-btn').addEventListener('click', () => openEditor(null));

  saveBtn.addEventListener('click', async () => {
    const label = labelEl.value.trim();
    if (!label) { alert('Label required'); return; }
    const sort_order = parseInt(sortEl.value, 10);
    try {
      if (editingId) {
        await api.patch('/api/spots/categories/' + editingId, {
          label, favorite, active,
          sort_order: Number.isInteger(sort_order) ? sort_order : 100,
        });
      } else {
        const slug = slugEl.value.trim();
        if (!slug) { alert('Slug required'); return; }
        await api.post('/api/spots/categories', {
          slug, label, favorite,
          sort_order: Number.isInteger(sort_order) ? sort_order : 100,
        });
      }
      closeEditor();
      load();
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (editor.classList.contains('is-open') && e.key === 'Escape') closeEditor();
  });

  load();
})();
