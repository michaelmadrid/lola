/* guides-edit.js — the Guide builder.
   Left: the guide (title, intro, settings, ordered spots w/ per-spot notes).
   Right: persistent filterable spot picker (search + city + category).
   Autosaves guide meta on change; item add/remove/reorder hit the API live. */
(function () {
  if (!api.isSignedIn()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname); return; }

  const guideId = parseInt(new URLSearchParams(location.search).get('id'), 10);
  if (!guideId) { location.href = '/guides/'; return; }

  const esc = (s) => util.escapeHtml(String(s == null ? '' : s));

  const titleEl   = document.getElementById('guide-title');
  const introEl   = document.getElementById('guide-intro');
  const cityEl    = document.getElementById('guide-city');
  const segGroup  = document.getElementById('seg-grouping');
  const segSort   = document.getElementById('seg-sort');
  const spotsEl   = document.getElementById('guide-spots');
  const crumbEl   = document.getElementById('crumb-title');
  const saveStat  = document.getElementById('save-status');
  const publishBtn= document.getElementById('publish-btn');
  const coverBtn  = document.getElementById('cover-btn');
  const coverImg  = document.getElementById('cover-img');
  const coverRm   = document.getElementById('cover-rm');

  const pSearch = document.getElementById('picker-search');
  const pCity   = document.getElementById('picker-city');
  const pCat    = document.getElementById('picker-cat');
  const pList   = document.getElementById('picker-list');

  let guide = null;
  let items = [];
  let allSpots = [];
  let categories = [];
  let grouping = 'list';
  let sortMode = 'manual';
  const CAT_LABELS = {};

  function flash(msg) {
    saveStat.textContent = msg;
    if (msg === 'Saved') setTimeout(() => { if (saveStat.textContent === 'Saved') saveStat.textContent = ''; }, 1500);
  }

  async function init() {
    try {
      const [gData, spotData, catData, cityData] = await Promise.all([
        api.get('/api/guides/' + guideId),
        api.get('/api/spots?all=true&limit=1000'),
        api.get('/api/spots/categories'),
        api.get('/api/cities?include_all=true'),
      ]);
      guide = gData.guide;
      items = (gData.items || []).slice().sort((a, b) => a.position - b.position);
      allSpots = (spotData.spots || []).filter(s => !s.deleted_at && s.curated && s.place_name);
      categories = catData.categories || [];
      categories.forEach(c => { CAT_LABELS[c.value] = c.label; });
      populateCitySelects(cityData.cities || []);
      populateCatSelect();
      hydrateGuideMeta();
      renderGuideSpots();
      renderPicker();
    } catch (err) {
      spotsEl.innerHTML = '<div class="stream__empty">Could not load guide.</div>';
    }
  }

  function spotCity(s) {
    return (s.attached_cities && s.attached_cities[0] && s.attached_cities[0].name) || s.city_name || '';
  }

  function populateCitySelects(cities) {
    const opts = cities.filter(c => c.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    cityEl.innerHTML = '<option value="">Worldwide</option>' + opts;
    const names = Array.from(new Set(allSpots.map(spotCity).filter(Boolean))).sort();
    pCity.innerHTML = '<option value="">All cities</option>' +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  function populateCatSelect() {
    pCat.innerHTML = '<option value="">All categories</option>' +
      categories.map(c => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
  }

  function hydrateGuideMeta() {
    titleEl.value = guide.title || '';
    introEl.value = guide.intro || '';
    cityEl.value = guide.city_id || '';
    grouping = guide.grouping || 'list';
    sortMode = guide.sort_mode || 'manual';
    setSeg(segGroup, grouping);
    setSeg(segSort, sortMode);
    crumbEl.textContent = guide.title || 'Editing';
    publishBtn.textContent = guide.status === 'published' ? 'Unpublish' : 'Publish';
    if (guide.image_url) showCover(guide.image_url);
  }

  function setSeg(seg, val) {
    seg.querySelectorAll('.seg__btn').forEach(b => b.classList.toggle('is-active', b.dataset.val === val));
  }

  let saveTimer = null;
  function patchGuide(patch, immediate) {
    Object.assign(guide, patch);
    clearTimeout(saveTimer);
    const doSave = async () => {
      flash('Saving…');
      try {
        const r = await api.patch('/api/guides/' + guideId, patch);
        if (r.guide) Object.assign(guide, r.guide);
        flash('Saved');
      } catch (e) { flash('Save failed'); }
    };
    if (immediate) doSave(); else saveTimer = setTimeout(doSave, 700);
  }

  titleEl.addEventListener('input', () => {
    crumbEl.textContent = titleEl.value || 'Editing';
    patchGuide({ title: titleEl.value });
  });
  introEl.addEventListener('input', () => patchGuide({ intro: introEl.value }));
  cityEl.addEventListener('change', () => {
    const v = cityEl.value ? parseInt(cityEl.value, 10) : null;
    patchGuide({ city_id: v }, true);
    const name = cityEl.options[cityEl.selectedIndex] ? cityEl.options[cityEl.selectedIndex].textContent : '';
    if (v && name && name !== 'Worldwide') { pCity.value = name; renderPicker(); }
  });

  segGroup.addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn'); if (!b) return;
    grouping = b.dataset.val; setSeg(segGroup, grouping);
    patchGuide({ grouping }, true);
    renderGuideSpots();
  });
  segSort.addEventListener('click', (e) => {
    const b = e.target.closest('.seg__btn'); if (!b) return;
    sortMode = b.dataset.val; setSeg(segSort, sortMode);
    patchGuide({ sort_mode: sortMode }, true);
    if (sortMode === 'alpha') alphabetize();
  });

  coverBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) { inp.remove(); return; }
      flash('Uploading…');
      const fd = new FormData(); fd.append('image', file);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + api.token.get() },
          body: fd,
        });
        if (!res.ok) { flash('Upload failed (' + res.status + ')'); return; }
        const data = await res.json();
        if (data.url) { showCover(data.url); patchGuide({ image_url: data.url }, true); }
        else flash('Upload failed');
      } catch (e) { flash('Upload failed'); }
      finally { inp.remove(); }
    };
    inp.click();
  });
  coverRm.addEventListener('click', () => {
    coverImg.src = '';
    document.getElementById('cover-filled').hidden = true;
    coverBtn.hidden = false;
    patchGuide({ image_url: null }, true);
  });
  function showCover(url) {
    coverImg.src = url;
    document.getElementById('cover-filled').hidden = false;
    coverBtn.hidden = true;
  }

  function renderGuideSpots() {
    if (!items.length) {
      spotsEl.innerHTML = '<div class="stream__empty">No spots yet — add from the right.</div>';
      return;
    }
    if (grouping === 'category') {
      const groups = {};
      items.forEach(it => { const k = it.category || 'other'; (groups[k] = groups[k] || []).push(it); });
      const order = categories.map(c => c.value).filter(v => groups[v]);
      Object.keys(groups).forEach(k => { if (!order.includes(k)) order.push(k); });
      spotsEl.innerHTML = order.map(cat =>
        `<div class="guide-group__label">${esc(CAT_LABELS[cat] || cat)}</div>` +
        groups[cat].map(rowHtml).join('')
      ).join('');
    } else {
      spotsEl.innerHTML = items.map(rowHtml).join('');
    }
    bindSpotRows();
  }

  function rowHtml(it) {
    const cat = CAT_LABELS[it.category] || it.category || '';
    const loc = [cat, it.city].filter(Boolean).join(' · ');
    const ph = it.spot_tip ? esc(it.spot_tip) + '  (spot tip — click to override)' : 'add a note for this guide…';
    return `
      <div class="gspot" data-item="${it.id}" draggable="true">
        <div class="gspot__handle" title="Drag to reorder">⠿</div>
        <div class="gspot__body">
          <div class="gspot__name">${esc(it.place_name)}</div>
          ${loc ? `<div class="gspot__cat">${esc(loc)}</div>` : ''}
          <textarea class="gspot__note" rows="1" data-item="${it.id}" placeholder="${ph}">${esc(it.note || '')}</textarea>
        </div>
        <button class="gspot__rm" data-item="${it.id}" title="Remove">×</button>
      </div>`;
  }

  function bindSpotRows() {
    spotsEl.querySelectorAll('.gspot__note').forEach(t => {
      t.addEventListener('blur', () => {
        const id = parseInt(t.dataset.item, 10);
        const it = items.find(i => i.id === id);
        if (it && (it.note || '') !== t.value) {
          it.note = t.value;
          api.patch('/api/guides/' + guideId + '/items/' + id, { note: t.value }).catch(() => {});
        }
      });
      t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px';
      t.addEventListener('input', () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; });
    });

    spotsEl.querySelectorAll('.gspot__rm').forEach(b => {
      b.addEventListener('click', async () => {
        const id = parseInt(b.dataset.item, 10);
        try {
          await api.delete('/api/guides/' + guideId + '/items/' + id);
          items = items.filter(i => i.id !== id);
          renderGuideSpots(); renderPicker();
        } catch (e) { alert('Could not remove'); }
      });
    });

    bindDrag();
  }

  let dragEl = null;
  function bindDrag() {
    spotsEl.querySelectorAll('.gspot').forEach(row => {
      row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('is-dragging'); });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging'); dragEl = null;
        persistOrder();
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === row) return;
        // In category mode, a spot can only be reordered WITHIN its own
        // category cluster — you can't drag a Stay into Coffee (category is
        // the spot's own property, not something the guide sets).
        if (grouping === 'category') {
          const a = items.find(i => i.id === parseInt(dragEl.dataset.item, 10));
          const b = items.find(i => i.id === parseInt(row.dataset.item, 10));
          if (a && b && (a.category || 'other') !== (b.category || 'other')) return;
        }
        const rect = row.getBoundingClientRect();
        const after = (e.clientY - rect.top) / rect.height > 0.5;
        row.parentNode.insertBefore(dragEl, after ? row.nextSibling : row);
      });
    });
  }

  function persistOrder() {
    const ids = Array.from(spotsEl.querySelectorAll('.gspot')).map(r => parseInt(r.dataset.item, 10));
    items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    items.forEach((it, i) => { it.position = i; });
    api.patch('/api/guides/' + guideId + '/reorder', { order: ids })
      .then(() => flash('Saved')).catch(() => flash('Save failed'));
  }

  async function alphabetize() {
    try {
      await api.post('/api/guides/' + guideId + '/alphabetize', {});
      items.sort((a, b) => (a.place_name || '').localeCompare(b.place_name || ''));
      items.forEach((it, i) => { it.position = i; });
      renderGuideSpots();
      flash('Saved');
    } catch (e) { flash('Save failed'); }
  }

  function renderPicker() {
    const q = (pSearch.value || '').toLowerCase().trim();
    const fCity = pCity.value;
    const fCat = pCat.value;
    const inGuide = new Set(items.map(i => i.spot_id));

    const rows = allSpots.filter(s => {
      if (fCity && spotCity(s) !== fCity) return false;
      if (fCat && (s.category || '') !== fCat) return false;
      if (q) {
        const hay = ((s.place_name || '') + ' ' + (s.tip || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.place_name || '').localeCompare(b.place_name || ''));

    if (!rows.length) { pList.innerHTML = '<div class="stream__empty">No matching spots.</div>'; return; }

    pList.innerHTML = rows.map(s => {
      const added = inGuide.has(s.id);
      const cat = CAT_LABELS[s.category] || s.category || '';
      const meta = [cat, spotCity(s)].filter(Boolean).join(' · ');
      return `
        <div class="pspot ${added ? 'is-added' : ''}" data-spot="${s.id}">
          <div class="pspot__body">
            <div class="pspot__name">${esc(s.place_name)}</div>
            ${meta ? `<div class="pspot__meta">${esc(meta)}</div>` : ''}
          </div>
          <button class="pspot__add" data-spot="${s.id}" ${added ? 'disabled' : ''}>${added ? '✓' : '+'}</button>
        </div>`;
    }).join('');

    pList.querySelectorAll('.pspot__add:not([disabled])').forEach(b => {
      b.addEventListener('click', () => addSpot(parseInt(b.dataset.spot, 10)));
    });
  }

  async function addSpot(spotId) {
    try {
      const r = await api.post('/api/guides/' + guideId + '/items', { spot_id: spotId });
      const s = allSpots.find(x => x.id === spotId) || {};
      items.push({
        id: r.item.id, spot_id: spotId, note: null, position: items.length,
        place_name: s.place_name, spot_tip: s.tip, category: s.category, city: spotCity(s),
      });
      renderGuideSpots();
      renderPicker();
      flash('Saved');
    } catch (e) {
      if (e && e.message && String(e.message).includes('already')) return;
      alert('Could not add spot');
    }
  }

  pSearch.addEventListener('input', renderPicker);
  pCity.addEventListener('change', renderPicker);
  pCat.addEventListener('change', renderPicker);

  publishBtn.addEventListener('click', async () => {
    const publishing = guide.status !== 'published';
    if (publishing && !titleEl.value.trim()) { alert('Give the guide a title before publishing.'); return; }
    try {
      const r = await api.patch('/api/guides/' + guideId, { status: publishing ? 'published' : 'draft' });
      guide.status = r.guide.status;
      if (r.guide.slug) guide.slug = r.guide.slug;
      publishBtn.textContent = guide.status === 'published' ? 'Unpublish' : 'Publish';
      flash(publishing ? 'Published' : 'Unpublished');
    } catch (e) { alert('Could not update status'); }
  });

  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm('Delete this guide? Spots are not affected.')) return;
    try {
      await api.delete('/api/guides/' + guideId);
      location.href = '/guides/';
    } catch (e) { alert('Could not delete'); }
  });

  init();
})();
