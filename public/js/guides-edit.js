/* =====================================================================
   guides-edit.js — V1.5

   Pick-and-share city guide editor. Flat list, tap-to-toggle.
   Sections deferred entirely — schema supports them, but no UI.

   Flow:
   1. Setup at top: city picker (locked when items added) + title +
      subtitle + intro. All autosave on blur.
   2. Below setup: full list of every spot from the guide's city.
      Each spot is a row with a tap-to-toggle "in this guide" state.
      Tap → adds (POST /api/guides/:id/items).
      Tap again → removes (DELETE).
      "Select all" / "Deselect all" toggles all visible.
   3. Top bar: Preview, Publish, Delete.
   ===================================================================== */

(function () {
  // ---------- DOM refs ----------
  const loadingEl = document.getElementById('ge-loading');
  const errorEl   = document.getElementById('ge-error');
  const editorEl  = document.getElementById('ge-editor');
  const previewEl = document.getElementById('ge-preview');

  const titleInput    = document.getElementById('ge-title');
  const subtitleInput = document.getElementById('ge-subtitle');
  const introInput    = document.getElementById('ge-intro');

  const cityBtn      = document.getElementById('ge-city-btn');
  const cityName     = document.getElementById('ge-city-name');
  const cityPopover  = document.getElementById('ge-city-popover');
  const citySearch   = document.getElementById('ge-city-search');
  const cityList     = document.getElementById('ge-city-list');

  const pickerListEl = document.getElementById('ge-picker-list');
  const pickerCountEl = document.getElementById('ge-picker-count');
  const pickerSelectAllBtn = document.getElementById('ge-picker-selectall');
  const pickerEmptyEl = document.getElementById('ge-picker-empty');

  const previewBtn   = document.getElementById('ge-preview-btn');
  const publishBtn   = document.getElementById('ge-publish-btn');
  const deleteBtn    = document.getElementById('ge-delete-btn');
  const saveStateEl  = document.getElementById('ge-save-state');

  const previewTitle    = document.getElementById('ge-preview-title');
  const previewSubtitle = document.getElementById('ge-preview-subtitle');
  const previewCity     = document.getElementById('ge-preview-city');
  const previewIntro    = document.getElementById('ge-preview-intro');
  const previewItems    = document.getElementById('ge-preview-items');

  // ---------- State ----------
  let guideId = null;
  let guide = null;
  let items = [];          // flat list — V1.5 doesn't use sections
  let allCities = [];
  let allSaves = [];
  let selectedSet = new Set(); // save_ids in the guide (fast toggle lookup)
  let isPreview = false;

  // ---------- Init ----------
  const params = new URLSearchParams(location.search);
  guideId = parseInt(params.get('id'), 10);
  if (!guideId) {
    showError('No guide id provided.');
    return;
  }

  loadGuide();

  async function loadGuide() {
    try {
      const data = await api.get('/api/guides/' + guideId);
      guide = data.guide;
      items = data.items || [];
      selectedSet = new Set(items.map(it => it.save_id));
      hydrateEditor();
      loadingEl.hidden = true;
      editorEl.hidden = false;
      if (guide.city_id) {
        await loadSavesAndRenderPicker();
      } else {
        renderPickerEmpty();
      }
    } catch (err) {
      console.error('loadGuide', err);
      showError(err.message || 'Could not load guide.');
    }
  }

  function showError(msg) {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  function hydrateEditor() {
    titleInput.value = guide.title || '';
    subtitleInput.value = guide.subtitle || '';
    introInput.value = guide.intro || '';
    updateCityButton();
    updatePublishButton();
    updateDocumentTitle();
  }

  function updateCityButton() {
    cityName.textContent = guide.city_name || 'Pick a city';
    if (guide.city_name) cityName.classList.remove('is-placeholder');
    else cityName.classList.add('is-placeholder');

    if (items.length > 0) {
      cityBtn.classList.add('is-locked');
      cityBtn.title = 'Remove all spots from this guide before changing the city.';
    } else {
      cityBtn.classList.remove('is-locked');
      cityBtn.title = '';
    }
  }

  function updateDocumentTitle() {
    document.title = (guide.title || 'Untitled guide') + ' — kit';
  }

  // ---------- Save state ----------
  let saveStateTimer = null;
  function showSaveState(text, persistent) {
    saveStateEl.textContent = text;
    saveStateEl.classList.add('is-visible');
    clearTimeout(saveStateTimer);
    if (!persistent) {
      saveStateTimer = setTimeout(() => {
        saveStateEl.classList.remove('is-visible');
      }, 1500);
    }
  }

  // ---------- Field saves ----------
  async function saveGuideField(patch) {
    showSaveState('Saving…', true);
    try {
      const data = await api.patch('/api/guides/' + guideId, patch);
      if (data.guide) {
        guide = { ...guide, ...data.guide };
        if ('city_id' in patch) {
          const refreshed = await api.get('/api/guides/' + guideId);
          guide = refreshed.guide;
        }
      }
      updatePublishButton();
      updateDocumentTitle();
      showSaveState('Saved');
      return true;
    } catch (err) {
      console.error('saveGuideField', err);
      if (err.data && err.data.code === 'city_locked') {
        showSaveState('City is locked', true);
        alert(err.message || 'Remove all spots from this guide before changing the city.');
      } else {
        showSaveState('Save failed', true);
      }
      return false;
    }
  }

  titleInput.addEventListener('blur', () => {
    if ((titleInput.value || '') === (guide.title || '')) return;
    saveGuideField({ title: titleInput.value || null });
  });
  subtitleInput.addEventListener('blur', () => {
    if ((subtitleInput.value || '') === (guide.subtitle || '')) return;
    saveGuideField({ subtitle: subtitleInput.value || null });
  });
  introInput.addEventListener('blur', () => {
    if ((introInput.value || '') === (guide.intro || '')) return;
    saveGuideField({ intro: introInput.value || null });
  });

  // ---------- City picker ----------
  async function ensureCities() {
    if (allCities.length) return;
    try {
      const data = await api.get('/api/cities');
      allCities = (data.cities || []).filter(c => c.status !== 0);
    } catch (err) {
      console.error('ensureCities', err);
    }
  }

  function renderCityList(filter) {
    const f = (filter || '').toLowerCase().trim();
    const filtered = (f ? allCities.filter(c => c.name.toLowerCase().includes(f)) : allCities)
      .slice(0, 60)
      .map(c => `
        <button class="picker-item ${guide.city_id === c.id ? 'is-current' : ''}" data-id="${c.id}" data-name="${util.escapeHtml(c.name)}">
          <span>${util.escapeHtml(c.name)}</span>
        </button>
      `);
    if (!filtered.length) {
      cityList.innerHTML = '<div class="picker-empty">No cities found.</div>';
      return;
    }
    cityList.innerHTML = filtered.join('');
    cityList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id, 10);
        const name = btn.dataset.name;
        guide.city_id = id;
        guide.city_name = name;
        cityName.textContent = name;
        cityName.classList.remove('is-placeholder');
        closePicker(cityPopover);
        const ok = await saveGuideField({ city_id: id });
        if (ok) {
          allSaves = []; // bust cache
          await loadSavesAndRenderPicker();
        }
      });
    });
  }

  cityBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (cityBtn.classList.contains('is-locked')) {
      alert('Remove all spots from this guide before changing the city.');
      return;
    }
    if (cityPopover.classList.contains('is-open')) {
      closePicker(cityPopover);
    } else {
      await ensureCities();
      renderCityList('');
      openPicker(cityPopover);
      setTimeout(() => citySearch && citySearch.focus(), 50);
    }
  });
  if (citySearch) {
    citySearch.addEventListener('input', () => renderCityList(citySearch.value));
  }
  document.addEventListener('click', (e) => {
    if (cityPopover && !cityPopover.hidden && !cityPopover.contains(e.target) && !cityBtn.contains(e.target)) {
      closePicker(cityPopover);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePicker(cityPopover);
  });

  function openPicker(pop) { pop.hidden = false; pop.classList.add('is-open'); }
  function closePicker(pop) { pop.classList.remove('is-open'); pop.hidden = true; }

  // ---------- Spot picker ----------
  async function ensureSaves() {
    if (allSaves.length) return;
    try {
      const data = await api.get('/api/saves?limit=500');
      allSaves = (data.saves || []).filter(s => s.place_name && s.place_name.trim());
    } catch (err) {
      console.error('ensureSaves', err);
    }
  }

  function getSpotsForCurrentCity() {
    if (!guide.city_id) return [];
    return allSaves.filter(s => {
      if (!s.attached_cities) return false;
      return s.attached_cities.some(c => c.id === guide.city_id);
    });
  }

  async function loadSavesAndRenderPicker() {
    pickerListEl.innerHTML = '<div class="ge-picker__loading">Loading spots…</div>';
    pickerEmptyEl.hidden = true;
    pickerSelectAllBtn.hidden = true;
    await ensureSaves();
    renderPicker();
  }

  function renderPickerEmpty() {
    pickerEmptyEl.hidden = false;
    pickerEmptyEl.innerHTML = '<p class="ge-picker__empty-line">Pick a city above to see your spots.</p>';
    pickerListEl.innerHTML = '';
    pickerCountEl.textContent = '';
    pickerSelectAllBtn.hidden = true;
  }

  function renderPicker() {
    const spots = getSpotsForCurrentCity();
    pickerEmptyEl.hidden = true;

    updatePickerCount();

    if (!spots.length) {
      pickerSelectAllBtn.hidden = true;
      pickerListEl.innerHTML = `
        <div class="ge-picker__empty-line ge-picker__empty-line--inline">
          No spots tagged for ${util.escapeHtml(guide.city_name || 'this city')} yet.
          <br><a href="/spots/" class="ge-picker__empty-link">Capture some spots first →</a>
        </div>
      `;
      return;
    }

    pickerSelectAllBtn.hidden = false;

    pickerListEl.innerHTML = spots.map(s => {
      const isSelected = selectedSet.has(s.id);
      const tip = s.tip ? `<span class="ge-pick-row__tip">${util.escapeHtml(s.tip)}</span>` : '';
      const cat = s.category ? `<span class="ge-pick-row__cat">${util.escapeHtml(s.category)}</span>` : '';
      return `
        <button class="ge-pick-row ${isSelected ? 'is-selected' : ''}" data-save-id="${s.id}" type="button">
          <span class="ge-pick-row__check" aria-hidden="true">
            <span class="ge-pick-row__check-mark">✓</span>
          </span>
          <span class="ge-pick-row__body">
            <span class="ge-pick-row__name">${util.escapeHtml(s.place_name)}</span>
            ${tip}
          </span>
          ${cat}
        </button>
      `;
    }).join('');

    pickerListEl.querySelectorAll('.ge-pick-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const saveId = parseInt(btn.dataset.saveId, 10);
        toggleSpot(saveId, btn);
      });
    });
  }

  function updatePickerCount() {
    const inGuideCount = items.length;
    pickerCountEl.textContent = inGuideCount === 1 ? '1 spot' : `${inGuideCount} spots`;
    const spots = getSpotsForCurrentCity();
    const allSelected = spots.length > 0 && spots.every(s => selectedSet.has(s.id));
    pickerSelectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
    pickerSelectAllBtn.dataset.mode = allSelected ? 'deselect' : 'select';
  }

  // ---------- Toggle (optimistic) ----------
  async function toggleSpot(saveId, rowEl) {
    const wasSelected = selectedSet.has(saveId);
    if (wasSelected) {
      const item = items.find(it => it.save_id === saveId);
      if (!item) return;
      selectedSet.delete(saveId);
      items = items.filter(it => it.id !== item.id);
      if (rowEl) rowEl.classList.remove('is-selected');
      updatePickerCount();
      updateCityButton();
      showSaveState('Saving…', true);
      try {
        await api.delete('/api/guides/' + guideId + '/items/' + item.id);
        showSaveState('Saved');
      } catch (err) {
        selectedSet.add(saveId);
        items.push(item);
        if (rowEl) rowEl.classList.add('is-selected');
        updatePickerCount();
        updateCityButton();
        showSaveState('Failed — try again', true);
      }
    } else {
      selectedSet.add(saveId);
      const placeholder = { id: 'pending-' + saveId, save_id: saveId, _pending: true };
      items.push(placeholder);
      if (rowEl) rowEl.classList.add('is-selected');
      updatePickerCount();
      updateCityButton();
      showSaveState('Saving…', true);
      try {
        const data = await api.post('/api/guides/' + guideId + '/items', { save_id: saveId });
        const sourceSave = allSaves.find(s => s.id === saveId);
        const realItem = {
          ...data.item,
          place_name: sourceSave ? sourceSave.place_name : null,
          save_tip: sourceSave ? sourceSave.tip : null,
          category: sourceSave ? sourceSave.category : null,
        };
        items = items.filter(it => it.id !== placeholder.id);
        items.push(realItem);
        showSaveState('Saved');
      } catch (err) {
        selectedSet.delete(saveId);
        items = items.filter(it => it.id !== placeholder.id);
        if (rowEl) rowEl.classList.remove('is-selected');
        updatePickerCount();
        updateCityButton();
        showSaveState(err.message || 'Failed', true);
      }
    }
  }

  // ---------- Select all / Deselect all ----------
  pickerSelectAllBtn.addEventListener('click', async () => {
    const spots = getSpotsForCurrentCity();
    if (!spots.length) return;
    const mode = pickerSelectAllBtn.dataset.mode || 'select';
    pickerSelectAllBtn.disabled = true;
    showSaveState(mode === 'select' ? 'Adding all…' : 'Removing all…', true);

    try {
      if (mode === 'select') {
        const toAdd = spots.filter(s => !selectedSet.has(s.id));
        for (const s of toAdd) {
          try {
            const data = await api.post('/api/guides/' + guideId + '/items', { save_id: s.id });
            const realItem = {
              ...data.item,
              place_name: s.place_name,
              save_tip: s.tip,
              category: s.category,
            };
            selectedSet.add(s.id);
            items.push(realItem);
          } catch (err) {
            console.warn('selectAll add failed for save', s.id, err.message);
          }
        }
      } else {
        const toRemove = items.filter(it => spots.some(s => s.id === it.save_id));
        for (const it of toRemove) {
          try {
            await api.delete('/api/guides/' + guideId + '/items/' + it.id);
            selectedSet.delete(it.save_id);
            items = items.filter(x => x.id !== it.id);
          } catch (err) {
            console.warn('selectAll remove failed', it.id, err.message);
          }
        }
      }
      renderPicker();
      updateCityButton();
      showSaveState('Saved');
    } finally {
      pickerSelectAllBtn.disabled = false;
    }
  });

  // ---------- Publish ----------
  function updatePublishButton() {
    if (guide.status === 'published') {
      publishBtn.textContent = 'Unpublish';
      publishBtn.classList.add('is-published');
    } else {
      publishBtn.textContent = 'Publish';
      publishBtn.classList.remove('is-published');
    }
  }

  publishBtn.addEventListener('click', async () => {
    const newStatus = guide.status === 'published' ? 'draft' : 'published';
    showSaveState(newStatus === 'published' ? 'Publishing…' : 'Unpublishing…', true);
    try {
      const data = await api.patch('/api/guides/' + guideId, { status: newStatus });
      guide = { ...guide, ...data.guide };
      updatePublishButton();
      showSaveState(newStatus === 'published' ? 'Published' : 'Unpublished');

      if (newStatus === 'published' && guide.slug) {
        const publicUrl = location.origin + '/g/' + guide.slug;
        const ok = confirm(`Published! Public link:\n\n${publicUrl}\n\nCopy to clipboard?`);
        if (ok && navigator.clipboard) {
          navigator.clipboard.writeText(publicUrl).catch(() => {});
        }
      }
    } catch (err) {
      console.error('publish toggle', err);
      showSaveState('Failed', true);
    }
  });

  // ---------- Delete ----------
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this guide? Spots stay in your library — only the guide is removed. Cannot be undone.')) return;
    try {
      await api.delete('/api/guides/' + guideId);
      location.href = '/guides/';
    } catch (err) {
      console.error('delete', err);
      alert(err.message || 'Could not delete');
    }
  });

  // ---------- Preview toggle ----------
  previewBtn.addEventListener('click', () => {
    isPreview = !isPreview;
    if (isPreview) {
      renderPreview();
      editorEl.hidden = true;
      previewEl.hidden = false;
      previewBtn.textContent = 'Edit';
    } else {
      previewEl.hidden = true;
      editorEl.hidden = false;
      previewBtn.textContent = 'Preview';
    }
  });

  function renderPreview() {
    const md = (s) => util.safeMarkdown ? util.safeMarkdown(s || '') : util.escapeHtml(s || '').replace(/\n/g, '<br>');
    previewCity.textContent = guide.city_name || '';
    previewTitle.textContent = guide.title || 'Untitled guide';
    previewSubtitle.textContent = guide.subtitle || '';
    previewSubtitle.hidden = !guide.subtitle;
    previewIntro.innerHTML = md(guide.intro);
    previewIntro.hidden = !guide.intro;

    if (!items.length) {
      previewItems.innerHTML = '<p class="ge-preview__empty">No spots yet — pick some above.</p>';
      return;
    }
    const realItems = items.filter(it => !it._pending);
    previewItems.innerHTML = `
      <ol class="ge-preview__items">
        ${realItems.map(it => {
          const tip = it.note || it.save_tip || '';
          const tipLine = tip ? `<p class="ge-preview__item-tip">${util.escapeHtml(tip)}</p>` : '';
          return `
            <li class="ge-preview__item">
              <h3 class="ge-preview__item-name">${util.escapeHtml(it.place_name || '(unnamed)')}</h3>
              ${tipLine}
            </li>
          `;
        }).join('')}
      </ol>
    `;
  }
})();
