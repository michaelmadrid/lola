/* =====================================================================
   guides-edit.js
   The /guides/edit.html?id=N page.

   Responsibilities:
   - Load full guide via GET /api/guides/:id
   - Autosave-on-blur for title/subtitle/intro/city
   - Manage sections: add, rename, delete
   - Manage section items: add (via spot picker), remove, reorder
   - Toggle preview mode
   - Publish / unpublish
   - Delete guide
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

  const sectionsEl   = document.getElementById('ge-sections');
  const addSectionBtn = document.getElementById('ge-add-section');

  const previewBtn   = document.getElementById('ge-preview-btn');
  const publishBtn   = document.getElementById('ge-publish-btn');
  const deleteBtn    = document.getElementById('ge-delete-btn');
  const saveStateEl  = document.getElementById('ge-save-state');

  const previewTitle    = document.getElementById('ge-preview-title');
  const previewSubtitle = document.getElementById('ge-preview-subtitle');
  const previewCity     = document.getElementById('ge-preview-city');
  const previewIntro    = document.getElementById('ge-preview-intro');
  const previewSections = document.getElementById('ge-preview-sections');

  const spotpicker      = document.getElementById('ge-spotpicker');
  const spotpickerClose = document.getElementById('ge-spotpicker-close');
  const spotpickerSearch = document.getElementById('ge-spotpicker-search');
  const spotpickerList  = document.getElementById('ge-spotpicker-list');

  // ---------- State ----------
  let guideId = null;
  let guide = null;       // current guide data
  let sections = [];      // [{id, title, intro, position, items: [...]}]
  let allCities = [];     // cached cities list
  let allSaves = [];      // cached saves list (filtered by guide city)
  let isPreview = false;
  let activeSpotpickerSectionId = null;

  // ---------- Init ----------
  const params = new URLSearchParams(location.search);
  guideId = parseInt(params.get('id'), 10);
  if (!guideId) {
    showError('No guide id provided.');
    return;
  }

  loadGuide();

  // ---------- Loading ----------
  async function loadGuide() {
    try {
      const data = await api.get('/api/guides/' + guideId);
      guide = data.guide;
      sections = data.sections || [];
      hydrateEditor();
      loadingEl.hidden = true;
      editorEl.hidden = false;
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
    cityName.textContent = guide.city_name || 'Pick a city';
    if (guide.city_name) cityName.classList.remove('is-placeholder');
    else cityName.classList.add('is-placeholder');

    renderSections();
    updatePublishButton();
    updateDocumentTitle();
  }

  function updateDocumentTitle() {
    document.title = (guide.title || 'Untitled guide') + ' — kit';
  }

  // ---------- Save state indicator ----------
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
  function clearSaveState() {
    saveStateEl.classList.remove('is-visible');
    saveStateEl.textContent = '';
  }

  // ---------- Top-level field saves (title/subtitle/intro/city) ----------
  async function saveGuideField(patch) {
    showSaveState('Saving…', true);
    try {
      const data = await api.patch('/api/guides/' + guideId, patch);
      if (data.guide) {
        guide = { ...guide, ...data.guide };
        if ('city_id' in patch) {
          // Refetch to get city_name
          const refreshed = await api.get('/api/guides/' + guideId);
          guide = refreshed.guide;
        }
      }
      updatePublishButton();
      updateDocumentTitle();
      showSaveState('Saved');
    } catch (err) {
      console.error('saveGuideField', err);
      showSaveState('Save failed', true);
    }
  }

  // Title
  titleInput.addEventListener('blur', () => {
    if ((titleInput.value || '') === (guide.title || '')) return;
    saveGuideField({ title: titleInput.value || null });
  });
  // Subtitle
  subtitleInput.addEventListener('blur', () => {
    if ((subtitleInput.value || '') === (guide.subtitle || '')) return;
    saveGuideField({ subtitle: subtitleInput.value || null });
  });
  // Intro
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
    const items = (f ? allCities.filter(c => c.name.toLowerCase().includes(f)) : allCities)
      .slice(0, 60)
      .map(c => `
        <button class="picker-item ${guide.city_id === c.id ? 'is-current' : ''}" data-id="${c.id}" data-name="${util.escapeHtml(c.name)}">
          <span>${util.escapeHtml(c.name)}</span>
        </button>
      `);
    if (!items.length) {
      cityList.innerHTML = '<div class="picker-empty">No cities found.</div>';
      return;
    }
    cityList.innerHTML = items.join('');
    cityList.querySelectorAll('.picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const name = btn.dataset.name;
        guide.city_id = id;
        guide.city_name = name;
        cityName.textContent = name;
        cityName.classList.remove('is-placeholder');
        closePicker(cityPopover);
        saveGuideField({ city_id: id });
        // Bust cached saves so spot picker re-filters
        allSaves = [];
      });
    });
  }

  cityBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
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
    if (e.key === 'Escape') {
      closePicker(cityPopover);
      closeSpotpicker();
    }
  });

  function openPicker(pop) {
    pop.hidden = false;
    pop.classList.add('is-open');
  }
  function closePicker(pop) {
    pop.classList.remove('is-open');
    pop.hidden = true;
  }

  // ---------- Sections rendering ----------
  function renderSections() {
    if (!sections.length) {
      sectionsEl.innerHTML = `
        <div class="ge-sections__empty">
          No sections yet. Sections are buckets like "Cheap Eats", "Uluwatu", "Best for breakfast" — anything you'd organize by.
        </div>
      `;
      return;
    }
    sectionsEl.innerHTML = sections.map((s, i) => renderSection(s, i)).join('');

    // Wire each section's controls
    sections.forEach(s => wireSection(s));
  }

  function renderSection(section, index) {
    const items = section.items || [];
    const itemsHtml = items.length
      ? items.map(it => renderItem(it)).join('')
      : '<div class="ge-section__empty">No spots yet. Click below to add one.</div>';

    return `
      <div class="ge-section" data-section-id="${section.id}">
        <header class="ge-section__head">
          <input
            type="text"
            class="ge-section__title"
            data-section-id="${section.id}"
            data-field="title"
            value="${util.escapeHtml(section.title || '')}"
            placeholder="Section title"
            autocomplete="off"
          >
          <div class="ge-section__head-actions">
            ${index > 0 ? `<button class="ge-section__action" data-action="up" data-section-id="${section.id}" aria-label="Move up">↑</button>` : ''}
            ${index < sections.length - 1 ? `<button class="ge-section__action" data-action="down" data-section-id="${section.id}" aria-label="Move down">↓</button>` : ''}
            <button class="ge-section__action ge-section__action--danger" data-action="delete" data-section-id="${section.id}" aria-label="Delete section">×</button>
          </div>
        </header>
        <div class="ge-section__items">${itemsHtml}</div>
        <button class="ge-section__add" data-action="add-spot" data-section-id="${section.id}" type="button">+ Add a spot</button>
      </div>
    `;
  }

  function renderItem(item) {
    const placeName = item.place_name || '(unnamed)';
    const tip = item.note || item.save_tip || '';
    const tipLine = tip ? `<span class="ge-item__tip">${util.escapeHtml(tip)}</span>` : '';
    return `
      <div class="ge-item" data-item-id="${item.id}">
        <div class="ge-item__body">
          <span class="ge-item__name">${util.escapeHtml(placeName)}</span>
          ${tipLine}
        </div>
        <button class="ge-item__remove" data-item-id="${item.id}" data-section-id="${item.section_id}" aria-label="Remove">×</button>
      </div>
    `;
  }

  function wireSection(section) {
    const sectionEl = sectionsEl.querySelector(`[data-section-id="${section.id}"]`);
    if (!sectionEl) return;

    // Title input — save on blur
    const titleInputEl = sectionEl.querySelector('.ge-section__title');
    if (titleInputEl) {
      titleInputEl.addEventListener('blur', async () => {
        if ((titleInputEl.value || '') === (section.title || '')) return;
        await saveSectionField(section.id, { title: titleInputEl.value || null });
      });
    }

    // Action buttons (up/down/delete)
    sectionEl.querySelectorAll('.ge-section__action').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        if (action === 'delete') {
          if (!confirm('Delete this section? Spots stay in your library — only this organization is removed.')) return;
          await deleteSection(section.id);
        } else if (action === 'up') {
          await reorderSection(section.id, -1);
        } else if (action === 'down') {
          await reorderSection(section.id, +1);
        }
      });
    });

    // Add spot button
    const addBtn = sectionEl.querySelector('[data-action="add-spot"]');
    if (addBtn) {
      addBtn.addEventListener('click', () => openSpotpicker(section.id));
    }

    // Item remove buttons
    sectionEl.querySelectorAll('.ge-item__remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const itemId = parseInt(btn.dataset.itemId, 10);
        const sectionId = parseInt(btn.dataset.sectionId, 10);
        await removeItem(sectionId, itemId);
      });
    });
  }

  // ---------- Section CRUD ----------
  async function addSection() {
    showSaveState('Saving…', true);
    try {
      const data = await api.post('/api/guides/' + guideId + '/sections', {
        title: '',
      });
      sections.push(data.section);
      renderSections();
      // Focus the new section's title input
      const newEl = sectionsEl.querySelector(`[data-section-id="${data.section.id}"] .ge-section__title`);
      if (newEl) newEl.focus();
      showSaveState('Saved');
    } catch (err) {
      console.error('addSection', err);
      showSaveState('Save failed', true);
    }
  }

  async function saveSectionField(sectionId, patch) {
    showSaveState('Saving…', true);
    try {
      await api.patch('/api/guides/' + guideId + '/sections/' + sectionId, patch);
      const s = sections.find(s => s.id === sectionId);
      if (s) Object.assign(s, patch);
      showSaveState('Saved');
    } catch (err) {
      console.error('saveSectionField', err);
      showSaveState('Save failed', true);
    }
  }

  async function deleteSection(sectionId) {
    showSaveState('Saving…', true);
    try {
      await api.delete('/api/guides/' + guideId + '/sections/' + sectionId);
      sections = sections.filter(s => s.id !== sectionId);
      renderSections();
      showSaveState('Saved');
    } catch (err) {
      console.error('deleteSection', err);
      showSaveState('Delete failed', true);
    }
  }

  async function reorderSection(sectionId, delta) {
    const idx = sections.findIndex(s => s.id === sectionId);
    if (idx < 0) return;
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    // Swap in local state
    const tmp = sections[idx];
    sections[idx] = sections[targetIdx];
    sections[targetIdx] = tmp;
    // Persist new positions for both swapped sections
    showSaveState('Saving…', true);
    try {
      await Promise.all([
        api.patch('/api/guides/' + guideId + '/sections/' + sections[idx].id,    { position: idx }),
        api.patch('/api/guides/' + guideId + '/sections/' + sections[targetIdx].id, { position: targetIdx }),
      ]);
      renderSections();
      showSaveState('Saved');
    } catch (err) {
      console.error('reorderSection', err);
      showSaveState('Save failed', true);
    }
  }

  if (addSectionBtn) addSectionBtn.addEventListener('click', addSection);

  // ---------- Spot picker (modal) ----------
  async function ensureSavesForCity() {
    if (allSaves.length) return;
    try {
      const data = await api.get('/api/saves?limit=500');
      allSaves = (data.saves || []).filter(s => s.place_name && s.place_name.trim());
    } catch (err) {
      console.error('ensureSavesForCity', err);
    }
  }

  function getSpotsForCurrentCity() {
    if (!guide.city_id) return allSaves; // Fallback: show all if no city set
    return allSaves.filter(s => {
      if (!s.attached_cities) return false;
      return s.attached_cities.some(c => c.id === guide.city_id);
    });
  }

  function getSpotsAlreadyInGuide() {
    const set = new Set();
    for (const sec of sections) {
      for (const item of (sec.items || [])) {
        set.add(item.save_id);
      }
    }
    return set;
  }

  function renderSpotpickerList(filter) {
    const f = (filter || '').toLowerCase().trim();
    const inGuide = getSpotsAlreadyInGuide();
    let candidates = getSpotsForCurrentCity();
    if (f) {
      candidates = candidates.filter(s => {
        const hay = [s.place_name, s.tip, s.category].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(f);
      });
    }
    candidates = candidates.slice(0, 80);

    if (!candidates.length) {
      const cityNote = guide.city_id ? ' for ' + (guide.city_name || 'this city') : '';
      spotpickerList.innerHTML = `<div class="ge-spotpicker__empty">No spots${cityNote}${f ? ' match your search' : ' yet'}.</div>`;
      return;
    }

    spotpickerList.innerHTML = candidates.map(s => {
      const already = inGuide.has(s.id);
      const tip = s.tip ? `<span class="ge-spotpicker__item-tip">${util.escapeHtml(s.tip)}</span>` : '';
      const cat = s.category ? `<span class="ge-spotpicker__item-cat">${util.escapeHtml(s.category)}</span>` : '';
      return `
        <button class="ge-spotpicker__item ${already ? 'is-already' : ''}" data-save-id="${s.id}" ${already ? 'disabled' : ''}>
          <span class="ge-spotpicker__item-name">${util.escapeHtml(s.place_name)}</span>
          ${tip}
          ${cat}
          ${already ? '<span class="ge-spotpicker__item-flag">added</span>' : ''}
        </button>
      `;
    }).join('');

    spotpickerList.querySelectorAll('.ge-spotpicker__item:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const saveId = parseInt(btn.dataset.saveId, 10);
        await addItemToSection(activeSpotpickerSectionId, saveId);
        // Re-render list to grey-out the added save
        renderSpotpickerList(spotpickerSearch.value);
      });
    });
  }

  async function openSpotpicker(sectionId) {
    activeSpotpickerSectionId = sectionId;
    spotpicker.hidden = false;
    spotpicker.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    spotpickerSearch.value = '';
    spotpickerList.innerHTML = '<div class="ge-spotpicker__loading">Loading…</div>';
    await ensureSavesForCity();
    renderSpotpickerList('');
    setTimeout(() => spotpickerSearch.focus(), 50);
  }

  function closeSpotpicker() {
    spotpicker.classList.remove('is-open');
    spotpicker.hidden = true;
    document.body.style.overflow = '';
    activeSpotpickerSectionId = null;
  }

  if (spotpickerClose) spotpickerClose.addEventListener('click', closeSpotpicker);
  if (spotpickerSearch) {
    let t = null;
    spotpickerSearch.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => renderSpotpickerList(spotpickerSearch.value), 100);
    });
  }

  async function addItemToSection(sectionId, saveId) {
    showSaveState('Saving…', true);
    try {
      const data = await api.post(
        '/api/guides/' + guideId + '/sections/' + sectionId + '/items',
        { save_id: saveId }
      );
      // Hydrate item with save info from cache for immediate render
      const sourceSave = allSaves.find(s => s.id === saveId);
      const item = {
        ...data.item,
        place_name: sourceSave ? sourceSave.place_name : null,
        save_tip: sourceSave ? sourceSave.tip : null,
        category: sourceSave ? sourceSave.category : null,
      };
      const sec = sections.find(s => s.id === sectionId);
      if (sec) {
        sec.items = sec.items || [];
        sec.items.push(item);
      }
      renderSections();
      showSaveState('Saved');
    } catch (err) {
      console.error('addItemToSection', err);
      showSaveState('Save failed', true);
    }
  }

  async function removeItem(sectionId, itemId) {
    showSaveState('Saving…', true);
    try {
      await api.delete(
        '/api/guides/' + guideId + '/sections/' + sectionId + '/items/' + itemId
      );
      const sec = sections.find(s => s.id === sectionId);
      if (sec) {
        sec.items = (sec.items || []).filter(it => it.id !== itemId);
      }
      renderSections();
      showSaveState('Saved');
    } catch (err) {
      console.error('removeItem', err);
      showSaveState('Save failed', true);
    }
  }

  // ---------- Publish toggle ----------
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
    } catch (err) {
      console.error('publish toggle', err);
      showSaveState('Failed', true);
    }
  });

  // ---------- Delete ----------
  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this guide? Spots stay in your library — only the guide and its sections are removed. Cannot be undone.')) return;
    try {
      await api.delete('/api/guides/' + guideId);
      location.href = '/guides/';
    } catch (err) {
      console.error('delete guide', err);
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

    previewSections.innerHTML = sections.map(s => {
      const items = (s.items || []).map(it => {
        const tip = it.note || it.save_tip || '';
        const tipLine = tip ? `<p class="ge-preview__item-tip">${util.escapeHtml(tip)}</p>` : '';
        return `
          <li class="ge-preview__item">
            <h3 class="ge-preview__item-name">${util.escapeHtml(it.place_name || '(unnamed)')}</h3>
            ${tipLine}
          </li>
        `;
      }).join('');
      return `
        <section class="ge-preview__section">
          ${s.title ? `<h2 class="ge-preview__section-title">${util.escapeHtml(s.title)}</h2>` : ''}
          ${s.intro ? `<div class="ge-preview__section-intro">${md(s.intro)}</div>` : ''}
          ${items ? `<ol class="ge-preview__items">${items}</ol>` : '<p class="ge-preview__section-empty">No spots in this section yet.</p>'}
        </section>
      `;
    }).join('');
  }
})();
