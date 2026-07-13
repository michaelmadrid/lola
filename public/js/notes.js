(function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('notes-list');
  const countEl = document.getElementById('note-count');
  const viewSwitch = document.getElementById('view-switch');
  let activeView = 'all'; // all | published | draft | trash
  let allNotes = [];
  let selected = new Set();

  const esc = s => util.escapeHtml(String(s || ''));
  const TYPE_LABELS = { note: 'Note', photograph: 'Photograph', link: 'Link', announcement: 'Announcement' };

  async function load() {
    listEl.innerHTML = '<div class="stream__empty">Loading…</div>';
    try {
      const q = activeView === 'trash' ? '?trashed=true' : '';
      const data = await api.get('/api/board-notes' + q);
      allNotes = data.notes || [];
      render();
    } catch (err) {
      listEl.innerHTML = '<div class="stream__empty">Could not load notes.</div>';
    }
  }

  function render() {
    let rows = allNotes;
    if (activeView === 'published') rows = rows.filter(n => n.status === 'published');
    if (activeView === 'draft') rows = rows.filter(n => n.status === 'draft');

    countEl.textContent = rows.length + (rows.length === 1 ? ' note' : ' notes');

    if (!rows.length) {
      listEl.innerHTML = '<div class="stream__empty">No notes here.</div>';
      return;
    }

    listEl.innerHTML = rows.map(n => `
      <div class="stream__item is-structured" data-id="${n.id}">
        <input type="checkbox" class="stream__check" data-check="${n.id}" aria-label="Select ${esc(n.headline)}">
        <div class="stream__body">
          <span class="stream__name">${n.pin ? '📌 ' : ''}${esc(n.headline)}</span>
          ${n.body ? `<span class="stream__tip">${esc(n.body.slice(0, 120))}</span>` : ''}
          <span class="stream__meta">${TYPE_LABELS[n.type] || n.type} · ${n.status}</span>
        </div>
        <span class="stream__when">${util.timeAgo(n.created_at)}</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.stream__item').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('stream__check')) return;
        const note = allNotes.find(n => n.id === parseInt(row.dataset.id, 10));
        if (note) openEditor(note);
      });
    });
    updateBulkBar();
  }

  function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    if (selected.size === 0) { bar.hidden = true; return; }
    bar.hidden = false;
    document.getElementById('bulk-count').textContent = selected.size + ' selected';
    const inTrash = activeView === 'trash';
    document.getElementById('bulk-publish').hidden = inTrash;
    document.getElementById('bulk-draft').hidden = inTrash;
    document.getElementById('bulk-trash').hidden = inTrash;
    document.getElementById('bulk-restore').hidden = !inTrash;
    document.getElementById('bulk-delete-forever').hidden = !inTrash;
  }

  async function bulkPatch(body) {
    await Promise.all([...selected].map(id => api.patch('/api/board-notes/' + id, body)));
    selected.clear();
    load();
  }

  listEl.addEventListener('change', (e) => {
    if (!e.target.classList.contains('stream__check')) return;
    const id = parseInt(e.target.dataset.check, 10);
    e.target.checked ? selected.add(id) : selected.delete(id);
    updateBulkBar();
  });

  document.getElementById('bulk-publish').addEventListener('click', () => bulkPatch({ status: 'published' }));
  document.getElementById('bulk-draft').addEventListener('click', () => bulkPatch({ status: 'draft' }));
  document.getElementById('bulk-trash').addEventListener('click', () => {
    if (!confirm('Move ' + selected.size + ' notes to trash?')) return;
    bulkPatch({ deleted_at: new Date().toISOString() });
  });
  document.getElementById('bulk-restore').addEventListener('click', () => bulkPatch({ deleted_at: null }));
  document.getElementById('bulk-delete-forever').addEventListener('click', async () => {
    if (!confirm('Permanently delete ' + selected.size + ' notes? This cannot be undone.')) return;
    await Promise.all([...selected].map(id => api.delete('/api/board-notes/' + id)));
    selected.clear();
    load();
  });
  document.getElementById('bulk-clear').addEventListener('click', () => {
    selected.clear();
    document.querySelectorAll('.stream__check').forEach(cb => cb.checked = false);
    updateBulkBar();
  });

  viewSwitch.querySelectorAll('.view-switch__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === activeView) return;
      activeView = v;
      viewSwitch.querySelectorAll('.view-switch__item').forEach(b =>
        b.classList.toggle('is-active', b.dataset.view === v));
      load();
    });
  });

  // -------- Editor --------
  const editor = document.getElementById('note-editor');
  const closeBtn = document.getElementById('note-editor-close');
  const typeRow = document.getElementById('note-type-row');
  const headlineEl = document.getElementById('note-headline');
  const bodyEl = document.getElementById('note-body');
  const refTitleEl = document.getElementById('note-ref-title');
  const refUrlEl = document.getElementById('note-ref-url');
  const pinOffBtn = document.getElementById('note-pin-off');
  const pinOnBtn = document.getElementById('note-pin-on');
  const publishDateEl = document.getElementById('note-publish-date');
  const expiresEl = document.getElementById('note-expires');
  const deleteBtn = document.getElementById('note-delete');
  const saveDraftBtn = document.getElementById('note-save-draft');
  const publishBtn = document.getElementById('note-publish');
  const imageRemoveBtn = document.getElementById('note-image-remove');

  let editingId = null;
  let editingType = 'note';
  let editingPin = false;
  let editingImageUrl = null;

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function setType(t) {
    editingType = t;
    typeRow.querySelectorAll('.spot-fs__been-pill').forEach(b =>
      b.dataset.active = String(b.dataset.type === t));
  }
  typeRow.querySelectorAll('.spot-fs__been-pill').forEach(b =>
    b.addEventListener('click', () => setType(b.dataset.type)));

  function setPin(v) {
    editingPin = v;
    pinOffBtn.dataset.active = String(!v);
    pinOnBtn.dataset.active = String(v);
  }
  pinOffBtn.addEventListener('click', () => setPin(false));
  pinOnBtn.addEventListener('click', () => setPin(true));

  document.getElementById('note-expires-clear').addEventListener('click', () => {
    expiresEl.value = '';
  });

  function openEditor(note) {
    editingId = note ? note.id : null;
    setType(note ? note.type : 'note');
    headlineEl.value = note ? note.headline : '';
    bodyEl.value = note ? (note.body || '') : '';
    refTitleEl.value = note ? (note.reference_title || '') : '';
    refUrlEl.value = note ? (note.reference_url || '') : '';
    setPin(note ? !!note.pin : false);
    publishDateEl.value = note ? toLocalInput(note.publish_date) : toLocalInput(new Date().toISOString());
    expiresEl.value = note ? toLocalInput(note.expires_at) : '';
    editingImageUrl = note ? note.image_url : null;
    deleteBtn.style.display = note ? '' : 'none';

    const preview = document.querySelector('#note-fs-uploader .uploader__preview');
    if (preview) preview.innerHTML = '';
    imageRemoveBtn.hidden = !editingImageUrl;
    if (window.Uploader) {
      window.Uploader.attach('#note-fs-uploader', {
        initialUrl: editingImageUrl,
        onUploaded: async (result) => {
          editingImageUrl = result.url;
          imageRemoveBtn.hidden = false;
          if (editingId) {
            try {
              await api.patch('/api/board-notes/' + editingId, { image_url: result.url });
            } catch (err) { alert('Image save failed: ' + err.message); }
          }
        },
      });
    }

    editor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    editor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingId = null;
  }
  closeBtn.addEventListener('click', closeEditor);

  imageRemoveBtn.addEventListener('click', async () => {
    editingImageUrl = null;
    const preview = document.querySelector('#note-fs-uploader .uploader__preview');
    if (preview) preview.innerHTML = '';
    imageRemoveBtn.hidden = true;
    if (editingId) {
      try {
        await api.patch('/api/board-notes/' + editingId, { image_url: null });
      } catch (err) { alert('Remove failed: ' + err.message); }
    }
  });

  function buildBody(status) {
    return {
      type: editingType,
      headline: headlineEl.value.trim(),
      body: bodyEl.value.trim() || null,
      image_url: editingImageUrl,
      reference_title: refTitleEl.value.trim() || null,
      reference_url: refUrlEl.value.trim() || null,
      status,
      pin: editingPin,
      publish_date: publishDateEl.value ? new Date(publishDateEl.value).toISOString() : null,
      expires_at: expiresEl.value ? new Date(expiresEl.value).toISOString() : null,
    };
  }

  async function save(status) {
    const body = buildBody(status);
    if (!body.headline) { alert('Headline required'); return; }
    try {
      if (editingId) await api.patch('/api/board-notes/' + editingId, body);
      else await api.post('/api/board-notes', body);
      closeEditor();
      load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  }
  saveDraftBtn.addEventListener('click', () => save('draft'));
  publishBtn.addEventListener('click', () => save('published'));

  deleteBtn.addEventListener('click', async () => {
    if (!editingId) return;
    if (!confirm('Move this note to trash?')) return;
    try {
      await api.patch('/api/board-notes/' + editingId, { deleted_at: new Date().toISOString() });
      closeEditor();
      load();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });

  document.getElementById('note-add-btn').addEventListener('click', () => openEditor(null));

  document.addEventListener('keydown', (e) => {
    if (!editor.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeEditor();
  });

  load();
})();
