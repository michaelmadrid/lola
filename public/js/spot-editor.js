/* =========================================================
   spot-editor.js — shared spot edit overlay.
   Used by /spots and admin. Owns all editor DOM + logic.

   Usage:
     SpotEditor.init({
       onSaved: (spot) => { ... },   // after successful PATCH
       onDeleted: (id) => { ... },   // after delete (hard or soft)
       softDelete: false,            // if true, delete routes to trash
     });
     SpotEditor.open(spotObject);

   The editor markup (#spot-editor …) must be present in the page.
   Load /admin/_spot-editor.html fragment or copy the markup in.
   ========================================================= */
(function () {
  let opts = {};
  let editingSpotId = null;
  let editingBeen = true;
  let editingImageUrl = null;
  let editingTags = [];
  let editingOnlineOnly = false;
  let currentSpot = null;
  let cityOptions = [];

  // DOM refs (resolved in init)
  let el = {};

  // Category suggestions — mirrors api/constants/spot-categories.js
  const CAT_SUGGESTIONS = {
    bookstore:   ['Photobooks', 'Art Books', 'Literary', 'Secondhand', 'Zines'],
    cinema:      ['Repertory', 'Arthouse', 'Drive-in', 'Outdoor'],
    recordstore: ['Vinyl', 'New Releases', 'Secondhand', 'Jazz', 'Electronic'],
    gallery:     ['Photography', 'Contemporary', 'Print', 'Sculpture', 'Commercial'],
    make:        ['Film Lab', 'Darkroom', 'Screenprint', 'Risograph', 'Print Studio', 'Ceramics'],
    visit:       ['Museum', 'Architecture', 'Landmark', 'Public Space', 'Garden', 'Library'],
    shop:        ['Concept Store', 'Vintage', 'Clothing', 'Objects', 'Homewares'],
  };

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-visible'), 10);
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 2400);
  }

  function applyBeen(val) {
    editingBeen = !!val;
    if (el.beenYes) el.beenYes.dataset.active = editingBeen ? 'true' : 'false';
    if (el.beenNo)  el.beenNo.dataset.active  = editingBeen ? 'false' : 'true';
  }

  function applyOnlineOnly(v) {
    editingOnlineOnly = v;
    if (el.onlineNo)  el.onlineNo.dataset.active = String(!v);
    if (el.onlineYes) el.onlineYes.dataset.active = String(v);
    if (el.mapField)  el.mapField.style.display = v ? 'none' : '';
  }

  function renderTags() {
    if (!el.tagPills) return;
    el.tagPills.innerHTML = editingTags.map(t =>
      '<span class="tag-pill">' + t + '<button type="button" class="tag-pill__x" data-tag="' + t + '">×</button></span>'
    ).join('');
    el.tagPills.querySelectorAll('.tag-pill__x').forEach(x =>
      x.addEventListener('click', () => {
        editingTags = editingTags.filter(t => t !== x.dataset.tag);
        renderTags();
      })
    );
  }

  function renderSuggestions(cat) {
    if (!el.suggestionsField || !el.suggestions) return;
    const list = CAT_SUGGESTIONS[cat] || [];
    if (!list.length) {
      el.suggestionsField.style.display = 'none';
      return;
    }
    el.suggestionsField.style.display = '';
    el.suggestions.innerHTML = list.map(s => {
      const tag = s.toLowerCase();
      const active = editingTags.includes(tag);
      return '<button type="button" class="spot-fs__suggestion' + (active ? ' is-active' : '') + '" data-tag="' + tag + '">' + s + '</button>';
    }).join('');
    el.suggestions.querySelectorAll('.spot-fs__suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (editingTags.includes(tag)) {
          editingTags = editingTags.filter(t => t !== tag);
        } else {
          editingTags.push(tag);
        }
        renderTags();
        renderSuggestions(el.cat.value);
      });
    });
  }

  function addTags(raw) {
    raw.split(',').forEach(part => {
      const tag = part.trim().toLowerCase();
      if (tag && !editingTags.includes(tag)) editingTags.push(tag);
    });
    renderTags();
  }

  function renderMapsLink(spot) {
    if (!el.mapsPill) return;
    if (spot.google_place_id) {
      const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(spot.place_name || '') + '&query_place_id=' + spot.google_place_id;
      el.mapsPill.href = mapsUrl;
      el.mapsPill.hidden = false;
      el.mapsEmpty.hidden = true;
    } else {
      el.mapsPill.hidden = true;
      el.mapsEmpty.hidden = false;
    }
    el.mapsEditor.hidden = true;
    el.mapsStatus.textContent = '';
    el.mapsInput.value = '';
  }

  function open(spot) {
    if (!spot) { toast('Spot not found'); return; }
    currentSpot = spot;
    editingSpotId = spot.id;
    el.place.value = spot.place_name || '';
    el.tip.value = spot.tip || '';
    el.cat.value = spot.category || '';
    if (el.city) el.city.value = (spot.attached_cities && spot.attached_cities[0]) ? spot.attached_cities[0].id : '';
    if (el.website) el.website.value = spot.website || '';
    if (el.instagram) el.instagram.value = spot.instagram || '';
    applyOnlineOnly(!!spot.online_only);
    editingTags = Array.isArray(spot.tags) ? [...spot.tags] : [];
    renderTags();
    renderMapsLink(spot);
    editingImageUrl = spot.image_url || null;
    const preview = document.querySelector('#spot-fs-uploader .uploader__preview');
    if (preview) preview.innerHTML = '';
    if (el.imageRemove) el.imageRemove.hidden = !editingImageUrl;
    if (window.Uploader) {
      window.Uploader.attach('#spot-fs-uploader', {
        initialUrl: editingImageUrl,
        onUploaded: async (result) => {
          editingImageUrl = result.url;
          if (el.imageRemove) el.imageRemove.hidden = false;
          if (editingSpotId) {
            try {
              await api.patch('/api/spots/' + editingSpotId, { image_url: result.url });
              if (currentSpot) currentSpot.image_url = result.url;
              toast('Image saved');
            } catch (err) { toast(err.message || 'Image save failed'); }
          }
        },
      });
    }
    applyBeen(typeof spot.been === 'boolean' ? spot.been : true);

    renderSuggestions(el.cat.value);
    el.editor.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => el.place.focus(), 50);
  }

  function close() {
    el.editor.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSpotId = null;
    currentSpot = null;
  }

  async function commitSave() {
    if (!editingSpotId) return;
    const body = {
      place_name: el.place.value.trim() || null,
      tip:        el.tip.value.trim() || null,
      category:   el.cat.value || null,
      city_id:    el.city ? (el.city.value ? parseInt(el.city.value) : null) : undefined,
      been:       editingBeen,
      website:    el.website ? (el.website.value.trim() || null) : undefined,
      instagram:  el.instagram ? (el.instagram.value.trim() || null) : undefined,
      online_only: editingOnlineOnly,
      image_url:  editingImageUrl,
      tags:       editingTags,
    };
    try {
      const res = await api.patch('/api/spots/' + editingSpotId, body);
      const saved = (res && res.spot) ? res.spot : Object.assign({}, currentSpot, body, { id: editingSpotId });
      close();
      if (typeof opts.onSaved === 'function') opts.onSaved(saved);
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  }

  async function doDelete() {
    if (!editingSpotId) return;
    const soft = !!opts.softDelete;
    const msg = soft ? 'Move this spot to trash?' : 'Delete this spot? This cannot be undone.';
    if (!confirm(msg)) return;
    try {
      if (soft) await api.patch('/api/spots/' + editingSpotId, { deleted_at: new Date().toISOString() });
      else await api.delete('/api/spots/' + editingSpotId);
      const id = editingSpotId;
      close();
      if (typeof opts.onDeleted === 'function') opts.onDeleted(id);
    } catch (err) {
      toast(err.message || 'Delete failed');
    }
  }

  function init(config) {
    opts = config || {};

    el = {
      editor:     $('spot-editor'),
      place:      $('spot-fs-place'),
      tip:        $('spot-fs-tip'),
      cat:        $('spot-fs-category'),
      city:       $('spot-fs-city'),
      website:    $('spot-fs-website'),
      instagram:  $('spot-fs-instagram'),
      mapField:   $('spot-fs-map-field'),
      onlineNo:   $('spot-fs-online-no'),
      onlineYes:  $('spot-fs-online-yes'),
      close:      $('spot-editor-close'),
      save:       $('spot-fs-save'),
      delete:     $('spot-fs-delete'),
      beenYes:    $('spot-fs-been-yes'),
      beenNo:     $('spot-fs-been-no'),
      tagField:   $('tag-field'),
      tagPills:   $('tag-pills'),
      imageRemove: $('spot-fs-image-remove'),
      mapsPill:   $('maps-link-pill'),
      mapsEmpty:  $('maps-link-empty'),
      mapsEditBtn: $('maps-link-edit-btn'),
      mapsEditor: $('maps-link-editor'),
      mapsInput:  $('maps-link-input'),
      mapsSubmit: $('maps-link-submit'),
      mapsCancel: $('maps-link-cancel'),
      mapsRemove: $('maps-link-remove'),
      mapsStatus: $('maps-link-status'),
      suggestionsField: $('spot-fs-suggestions-field'),
      suggestions:      $('spot-fs-suggestions'),
    };

    if (!el.editor) return; // markup not present

    // Load cities for the picker (once)
    if (el.city) {
      api.get('/api/cities').then(data => {
        cityOptions = (data.cities || []).sort((a, b) => a.name.localeCompare(b.name));
        el.city.innerHTML = '<option value="">— none —</option>' +
          cityOptions.map(c => '<option value="' + c.id + '">' + (c.name) + (c.country ? ', ' + c.country : '') + '</option>').join('');
      }).catch(() => {});
    }

    if (el.cat) {
      el.cat.addEventListener('change', () => renderSuggestions(el.cat.value));
    }

    el.beenYes && el.beenYes.addEventListener('click', () => applyBeen(true));
    el.beenNo && el.beenNo.addEventListener('click', () => applyBeen(false));
    el.onlineNo && el.onlineNo.addEventListener('click', () => applyOnlineOnly(false));
    el.onlineYes && el.onlineYes.addEventListener('click', () => applyOnlineOnly(true));
    el.close && el.close.addEventListener('click', close);
    el.save && el.save.addEventListener('click', commitSave);
    el.delete && el.delete.addEventListener('click', doDelete);

    if (el.tagField) {
      el.tagField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault(); addTags(el.tagField.value); el.tagField.value = '';
        } else if (e.key === 'Backspace' && !el.tagField.value && editingTags.length) {
          editingTags.pop(); renderTags();
        }
      });
      el.tagField.addEventListener('blur', () => {
        if (el.tagField.value.trim()) { addTags(el.tagField.value); el.tagField.value = ''; }
      });
    }

    if (el.imageRemove) {
      el.imageRemove.addEventListener('click', async () => {
        if (!editingSpotId) return;
        try {
          await api.delete('/api/spots/' + editingSpotId + '/image');
          editingImageUrl = null;
          const preview = document.querySelector('#spot-fs-uploader .uploader__preview');
          if (preview) preview.innerHTML = '';
          el.imageRemove.hidden = true;
          if (currentSpot) currentSpot.image_url = null;
          toast('Image removed');
        } catch (err) { toast(err.message || 'Could not remove image'); }
      });
    }

    if (el.mapsEditBtn) {
      el.mapsEditBtn.addEventListener('click', () => {
        el.mapsEditor.hidden = !el.mapsEditor.hidden;
        if (!el.mapsEditor.hidden) el.mapsInput.focus();
      });
    }
    el.mapsCancel && el.mapsCancel.addEventListener('click', () => { el.mapsEditor.hidden = true; });

    if (el.mapsSubmit) {
      el.mapsSubmit.addEventListener('click', async () => {
        const url = el.mapsInput.value.trim();
        if (!url || !editingSpotId) return;
        el.mapsStatus.textContent = 'Resolving…';
        el.mapsSubmit.disabled = true;
        try {
          const result = await api.post('/api/spots/' + editingSpotId + '/maps-link', { url });
          el.mapsStatus.textContent = '';
          if (currentSpot) currentSpot.google_place_id = result.google_place_id;
          renderMapsLink({ google_place_id: result.google_place_id, place_name: el.place.value });
          toast('Map linked: ' + result.name);
        } catch (err) {
          el.mapsStatus.textContent = err.message || 'Could not resolve that link';
        } finally { el.mapsSubmit.disabled = false; }
      });
    }

    if (el.mapsRemove) {
      el.mapsRemove.addEventListener('click', async () => {
        if (!editingSpotId) return;
        try {
          await api.delete('/api/spots/' + editingSpotId + '/maps-link');
          renderMapsLink({ google_place_id: null });
          toast('Map link removed');
        } catch (err) { toast(err.message || 'Could not remove link'); }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!el.editor.classList.contains('is-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitSave(); }
    });
  }

  window.SpotEditor = { init, open, close };
})();
