(function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('notes-list');
  const countEl = document.getElementById('note-count');
  const LS_VIEW = 'annex.notes.view';
  function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

  let activeView = lsGet(LS_VIEW, 'all'); // all | feed | published | draft | scheduled | trash
  let allNotes = [];
  let selected = new Set();
  let searchTerm = '';

  const esc = s => util.escapeHtml(String(s || ''));
  const TYPE_LABELS = { note: 'Note', photograph: 'Photograph', link: 'Link', article: 'Article' };

  // Brief publish date, e.g. "Jul 20" — add year only when not the current year.
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = '2-digit';
    return d.toLocaleDateString(undefined, opts).replace(',', '');
  }

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
    const now = new Date();
    let rows = allNotes.slice();
    // Default order everywhere: pinned first, then newest publish_date. This
    // makes "above = later date" consistent so drag-to-reorder behaves the same
    // in every view. (Scheduled overrides to oldest-first below.)
    rows.sort((a, b) => {
      if (!!b.pin !== !!a.pin) return (b.pin ? 1 : 0) - (a.pin ? 1 : 0);
      return new Date(b.publish_date) - new Date(a.publish_date);
    });
    if (activeView === 'published') rows = rows.filter(n => n.status === 'published');
    if (activeView === 'draft') rows = rows.filter(n => n.status === 'draft');
    // Feed = what actually appears on the homepage: published + show_in_feed,
    // and not future-dated. Sorted like the real feed (pinned first, newest).
    if (activeView === 'feed') {
      rows = rows.filter(n =>
        n.status === 'published' &&
        n.show_in_feed !== false &&
        (!n.publish_date || new Date(n.publish_date) <= now)
      ).sort((a, b) => {
        if (!!b.pin !== !!a.pin) return (b.pin ? 1 : 0) - (a.pin ? 1 : 0);
        return new Date(b.publish_date) - new Date(a.publish_date);
      });
    }
    // Scheduled = has a future publish_date (waiting to go live)
    if (activeView === 'scheduled') {
      rows = rows.filter(n => !n.deleted_at && n.publish_date && new Date(n.publish_date) > now)
                 .sort((a, b) => new Date(a.publish_date) - new Date(b.publish_date));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(n =>
        (n.headline || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q));
    }

    countEl.textContent = rows.length + (rows.length === 1 ? ' note' : ' notes');

    if (!rows.length) {
      listEl.innerHTML = '<div class="stream__empty">No notes here.</div>';
      updateBulkBar();
      return;
    }

    listEl.innerHTML = rows.map(n => {
      const meta = (TYPE_LABELS[n.type] || n.type) + ' · ' + n.status;
      const thumb = n.image_url
        ? `<div class="spot-card__thumb"><img src="${esc(n.image_url)}" alt=""></div>`
        : '';
      return `<div class="spot-card" data-id="${n.id}">
        <input type="checkbox" class="spot-card__check" data-check="${n.id}" aria-label="Select ${esc(n.headline)}">
        ${thumb}
        <div class="spot-card__body">
          <span class="spot-card__name">${n.pin ? '📌 ' : ''}${esc(n.headline)}</span>
          <span class="spot-card__meta">${esc(meta)}</span>
        </div>
        <span class="spot-card__when">${esc(fmtDate(n.publish_date))}</span>
      </div>`;
    }).join('');

    // Drag-to-reorder (not in Draft/Trash where order is meaningless, nor in
    // Scheduled where the date IS the schedule and sorts oldest-first).
    const orderable = activeView !== 'draft' && activeView !== 'trash' && activeView !== 'scheduled';
    if (orderable) enableDrag(rows);

    listEl.querySelectorAll('.spot-card').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('spot-card__check')) return;
        if (row.dataset.dragging === '1') return; // ignore click fired after a drag
        const note = allNotes.find(n => n.id === parseInt(row.dataset.id, 10));
        if (note) openEditor(note);
      });
    });
    updateBulkBar();
  }

  let dragEl = null;
  function enableDrag(rows) {
    listEl.querySelectorAll('.spot-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', () => { dragEl = card; card.classList.add('is-dragging'); });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        setTimeout(() => { card.dataset.dragging = '0'; }, 0);
        dragEl = null;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === card) return;
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === card) return;
        dragEl.dataset.dragging = '1';
        reorderByDate(
          parseInt(dragEl.dataset.id, 10),
          parseInt(card.dataset.id, 10),
          rows
        );
      });
    });
  }

  // Set dragged note's publish_date to land just before the target note's,
  // between the target and the note currently above it (so it sorts in that gap).
  async function reorderByDate(dragId, targetId, rows) {
    const drag = allNotes.find(n => n.id === dragId);
    const target = allNotes.find(n => n.id === targetId);
    if (!drag || !target) return;

    // Find the note currently displayed just ABOVE the target in this view.
    const idx = rows.findIndex(n => n.id === targetId);
    const above = idx > 0 ? rows[idx - 1] : null;

    const targetT = new Date(target.publish_date).getTime();
    let newT;
    if (above && above.id !== dragId) {
      // Land at the midpoint between the note above and the target.
      const aboveT = new Date(above.publish_date).getTime();
      newT = Math.floor((aboveT + targetT) / 2);
      if (newT === targetT || newT === aboveT) newT = targetT + 1000; // fallback
    } else {
      // Target is at the top → land 1 minute after it so drag sorts above.
      newT = targetT + 60 * 1000;
    }

    const iso = new Date(newT).toISOString();
    // Optimistic: update locally + re-render, then persist.
    drag.publish_date = iso;
    render();
    try {
      await api.patch('/api/board-notes/' + dragId, { publish_date: iso });
    } catch (err) {
      // On failure, reload to resync
      load();
    }
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
    if (!e.target.classList.contains('spot-card__check')) return;
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
    document.querySelectorAll('.spot-card__check').forEach(cb => cb.checked = false);
    updateBulkBar();
  });

  const notesSearchEl = document.getElementById('notes-search');
  if (notesSearchEl) {
    notesSearchEl.addEventListener('input', () => {
      searchTerm = notesSearchEl.value.trim();
      render();
    });
  }

  // View filter as a picker dropdown (matches the Spots pattern)
  const viewBtn   = document.getElementById('view-picker-btn');
  const viewLabel = document.getElementById('view-picker-label');
  const viewPop   = document.getElementById('view-picker-popover');
  const viewList  = document.getElementById('view-picker-list');
  const VIEW_STATES = [
    { value: 'all',       label: 'All' },
    { value: 'feed',      label: 'Feed' },
    { value: 'published', label: 'Published' },
    { value: 'draft',     label: 'Draft' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'trash',     label: 'Trash', danger: true },
  ];

  function buildViewPicker() {
    if (!viewList) return;
    viewList.innerHTML = VIEW_STATES.map(v =>
      `<button class="picker-item ${activeView === v.value ? 'is-current' : ''}${v.danger ? ' picker-item--danger' : ''}" data-value="${v.value}">
         <span>${v.label}</span>
       </button>`
    ).join('');
    viewList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.value;
        viewPop.hidden = true;
        if (v === activeView) return;
        activeView = v;
        lsSet(LS_VIEW, v);
        const found = VIEW_STATES.find(s => s.value === v);
        if (viewLabel && found) viewLabel.textContent = found.label;
        selected.clear();
        // Scheduled filters client-side from the full set; others may hit the
        // server (trash). load() re-fetches; render() applies the filter.
        if (v === 'trash' || activeView === 'trash') load();
        else load();
        buildViewPicker();
      });
    });
  }

  if (viewBtn) {
    const init = VIEW_STATES.find(s => s.value === activeView);
    if (viewLabel && init) viewLabel.textContent = init.label;
    buildViewPicker();
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      viewPop.hidden = !viewPop.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!viewPop.hidden && !viewPop.contains(e.target) && !viewBtn.contains(e.target)) {
        viewPop.hidden = true;
      }
    });
  }

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
  const feedOnBtn = document.getElementById('note-feed-on');
  const feedOffBtn = document.getElementById('note-feed-off');
  const categoryEl = document.getElementById('note-category');

  // Load the note-category options once. Active only (the picker is
  // for assigning, not managing). Keeps the "— none —" default option.
  let noteCategories = [];
  (async function loadNoteCategories() {
    try {
      const data = await api.get('/api/notes/categories');
      noteCategories = data.categories || [];
      noteCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.value;      // slug
        opt.textContent = c.label;
        categoryEl.appendChild(opt);
      });
    } catch (err) {
      console.error('Could not load note categories', err);
    }
  })();
  const richWrap = document.getElementById('note-body-rich');
  const permalinkLink = document.getElementById('note-permalink');

  let editingId = null;
  let editingType = 'note';
  let editingPin = false;
  let editingImageUrl = null;
  let editingFeed = true;
  let quill = null;

  // Lazily init Quill once (only when first needed for an Article).
  function ensureQuill() {
    if (quill || typeof Quill === 'undefined') return quill;
    quill = new Quill('#note-quill-editor', {
      theme: 'snow',
      placeholder: 'Write the article…',
      modules: {
        toolbar: '#note-quill-toolbar',
        // Only allow the formats we expose (bold, italic, link, blockquote)
      },
      formats: ['bold', 'italic', 'link', 'blockquote', 'align'],
    });
    return quill;
  }

  // Quill is the body editor for all note types now.
  function applyBodyMode(type) {
    ensureQuill();
    richWrap.hidden = false;
    bodyEl.hidden = true;
  }

  function setFeed(v) {
    editingFeed = v;
    feedOnBtn.dataset.active = String(v);
    feedOffBtn.dataset.active = String(!v);
  }
  feedOnBtn.addEventListener('click', () => setFeed(true));
  feedOffBtn.addEventListener('click', () => setFeed(false));

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
    applyBodyMode(t);
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
    setFeed(note ? note.show_in_feed !== false : false); // new notes default OFF feed
    categoryEl.value = note ? (note.category || '') : ''; // existing note's category, or none
    // Load body HTML into Quill (all note types use it now)
    ensureQuill();
    if (quill) quill.root.innerHTML = note ? (note.body || '') : '';
    refTitleEl.value = note ? (note.reference_title || '') : '';
    refUrlEl.value = note ? (note.reference_url || '') : '';
    setPin(note ? !!note.pin : false);
    publishDateEl.value = note ? toLocalInput(note.publish_date) : toLocalInput(new Date().toISOString());
    expiresEl.value = note ? toLocalInput(note.expires_at) : '';
    editingImageUrl = note ? note.image_url : null;
    deleteBtn.style.display = note ? '' : 'none';

    // Permalink — only for saved, published notes (drafts have no live page).
    if (note && note.id && note.status === 'published') {
      permalinkLink.href = 'https://annex.site/notes/' + note.id;
      permalinkLink.hidden = false;
    } else {
      permalinkLink.hidden = true;
    }

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
    // All note bodies come from Quill (HTML) now.
    let bodyVal = null;
    if (quill) {
      const html = quill.root.innerHTML;
      bodyVal = (html && html !== '<p><br></p>') ? html : null;
    } else {
      bodyVal = bodyEl.value.trim() || null;
    }
    return {
      type: editingType,
      headline: headlineEl.value.trim(),
      body: bodyVal,
      image_url: editingImageUrl,
      reference_title: refTitleEl.value.trim() || null,
      reference_url: refUrlEl.value.trim() || null,
      status,
      pin: editingPin,
      show_in_feed: editingFeed,
      category: categoryEl.value || null,
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
