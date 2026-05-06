/* =========================================================
   trip.js — single trip detail page
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    return;
  }

  const tripId = util.query('id');
  if (!tripId) {
    location.href = '/trips.html';
    return;
  }

  const pageEl = document.getElementById('trip-page');
  let trip = null;
  let segments = [];

  // ============ LOAD TRIP ============
  async function load() {
    try {
      const data = await api.get('/api/trips/' + tripId);
      trip = data.trip;
      segments = data.segments || [];
      render();
    } catch (err) {
      console.error('load trip', err);
      pageEl.innerHTML = '<div class="list-empty">Trip not found.</div>';
    }
  }

  function render() {
    const dateLine = (trip.date_start && trip.date_end)
      ? `${util.formatNumericDate(trip.date_start)} — ${util.formatNumericDate(trip.date_end)}`
      : (trip.date_start ? `from ${util.formatNumericDate(trip.date_start)}` : 'No dates set');

    const isOwner = !!trip.is_owner;
    const ownerLabel = (!isOwner && trip.owner_name)
      ? `<span class="trip-mast__by">${util.escapeHtml(trip.owner_name)}'s trip</span>`
      : '';

    let segHtml = '';
    if (!segments.length) {
      const emptyText = isOwner ? 'No stops yet. Add one below.' : 'No stops yet.';
      segHtml = `<div class="list-empty">${emptyText}</div>`;
    } else {
      segHtml = segments.map(s => {
        const label = s.city_name || s.region_label || '—';
        const isRegion = !s.city_name && s.region_label;
        const dates = (s.date_start && s.date_end)
          ? `${util.formatNumericDate(s.date_start)} — ${util.formatNumericDate(s.date_end)}`
          : (s.date_start ? util.formatNumericDate(s.date_start) : '—');
        const hasNotes = s.notes && s.notes.trim();
        const notesHint = hasNotes ? '<span class="segment-notes-hint">notes</span>' : '';
        const deleteBtn = isOwner
          ? `<button class="seg-delete" data-id="${s.id}" aria-label="Delete">×</button>`
          : '';
        const editBtn = isOwner
          ? `<button class="seg-edit" data-id="${s.id}" aria-label="Edit">edit</button>`
          : '';
        return `<div class="segment-row" data-id="${s.id}">
          <span class="segment-name">${util.escapeHtml(label)}${isRegion ? '<span class="region-tag">region</span>' : ''}${notesHint}</span>
          <span class="segment-dates">${dates}</span>
          <span class="segment-actions">${editBtn}${deleteBtn}</span>
        </div>`;
      }).join('');
    }

    const actionBtns = isOwner
      ? `<button class="btn--secondary" id="edit-trip-btn">Edit trip</button>`
      : '';
    const addSegBtn = isOwner
      ? `<div class="trip-add-segment"><button class="btn" id="add-seg-btn">+ Add stop</button></div>`
      : '';

    pageEl.innerHTML = `
      <header class="trip-mast">
        <h1 class="trip-mast__title">${util.escapeHtml(trip.name)}</h1>
        <div class="trip-mast__dates">${dateLine}${ownerLabel}</div>
        <div class="trip-mast__actions">
          <a href="/trips.html" class="btn--secondary">← all trips</a>
          ${actionBtns}
        </div>
      </header>

      <div class="segment-list">${segHtml}</div>

      ${addSegBtn}
    `;

    // wire post-render handlers
    if (isOwner) {
      const editBtn = document.getElementById('edit-trip-btn');
      if (editBtn) editBtn.addEventListener('click', openEditTrip);
      const addBtn = document.getElementById('add-seg-btn');
      if (addBtn) addBtn.addEventListener('click', () => openSegmentModal(null));
      pageEl.querySelectorAll('.seg-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const seg = segments.find(s => String(s.id) === String(btn.dataset.id));
          if (seg) openSegmentModal(seg);
        });
      });
      pageEl.querySelectorAll('.seg-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('.segment-row');
          if (row) row.style.opacity = '0.4';
          try {
            await api.delete(`/api/trips/${tripId}/segments/${btn.dataset.id}`);
            await load();
          } catch (err) {
            if (row) row.style.opacity = '';
            toast(err.message || 'Delete failed');
          }
        });
      });
    }
  }

  // ============ EDIT TRIP MODAL ============
  const editModal = document.getElementById('edit-trip-modal');
  function openEditTrip() {
    document.getElementById('et-name').value = trip.name || '';
    document.getElementById('et-date-start').value = trip.date_start || '';
    document.getElementById('et-date-end').value = trip.date_end || '';
    document.getElementById('et-notes').value = trip.notes || '';
    editModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeEditTrip() {
    editModal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  document.getElementById('edit-trip-close').addEventListener('click', closeEditTrip);
  document.getElementById('edit-trip-save').addEventListener('click', async () => {
    const body = {
      name: document.getElementById('et-name').value.trim(),
      date_start: document.getElementById('et-date-start').value || null,
      date_end: document.getElementById('et-date-end').value || null,
      notes: document.getElementById('et-notes').value.trim() || null,
    };
    if (!body.name) return;
    try {
      await api.patch('/api/trips/' + tripId, body);
      closeEditTrip();
      await load();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  });

  // ============ TYPE-TO-CONFIRM DELETE ============
  const confirmModal = document.getElementById('confirm-delete-modal');
  const confirmInput = document.getElementById('confirm-input');
  const confirmBtn = document.getElementById('confirm-delete-btn');
  const confirmCloseBtn = document.getElementById('confirm-delete-close');

  function openDeleteConfirm() {
    document.getElementById('confirm-trip-name').textContent = trip.name;
    confirmInput.value = '';
    confirmBtn.disabled = true;
    closeEditTrip();
    confirmModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => confirmInput.focus(), 60);
  }
  function closeDeleteConfirm() {
    confirmModal.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  confirmCloseBtn.addEventListener('click', closeDeleteConfirm);
  confirmInput.addEventListener('input', () => {
    confirmBtn.disabled = confirmInput.value.trim() !== (trip ? trip.name : '');
  });
  confirmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !confirmBtn.disabled) confirmBtn.click();
  });
  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    try {
      await api.delete('/api/trips/' + tripId);
      location.href = '/trips.html';
    } catch (err) {
      toast(err.message || 'Delete failed');
      confirmBtn.disabled = false;
    }
  });

  document.getElementById('delete-trip-btn').addEventListener('click', openDeleteConfirm);

  // ============ ADD/EDIT SEGMENT MODAL ============
  const segModal = document.getElementById('seg-modal');
  const segTitle = document.getElementById('seg-modal-title');
  const cityInput = document.getElementById('s-city');
  const suggestBox = document.getElementById('s-city-suggestions');
  let pickedCityId = null;
  let pickedRegionLabel = null;
  let editingSegmentId = null; // null = add, set = edit

  function openSegmentModal(seg) {
    pickedCityId = null;
    pickedRegionLabel = null;
    editingSegmentId = seg ? seg.id : null;
    segTitle.textContent = seg ? 'Edit stop' : 'Add stop';
    document.getElementById('seg-form').reset();
    suggestBox.classList.remove('is-open');
    suggestBox.innerHTML = '';
    if (seg) {
      // prefill
      cityInput.value = seg.city_name || seg.region_label || '';
      pickedCityId = seg.city_id || null;
      pickedRegionLabel = seg.city_id ? null : (seg.region_label || null);
      document.getElementById('s-date-start').value = seg.date_start || '';
      document.getElementById('s-date-end').value = seg.date_end || '';
      document.getElementById('s-notes').value = seg.notes || '';
    }
    segModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => cityInput.focus(), 50);
  }
  function closeSegment() {
    segModal.classList.remove('is-open');
    document.body.style.overflow = '';
    editingSegmentId = null;
  }
  document.getElementById('seg-modal-close').addEventListener('click', closeSegment);

  // City autocomplete
  let cities = [];
  async function loadCities() {
    try {
      const data = await api.get('/api/cities');
      cities = data.cities || [];
    } catch (err) {
      cities = [];
    }
  }
  loadCities();

  const onCityType = util.debounce(() => {
    const q = cityInput.value.trim().toLowerCase();
    pickedCityId = null;
    pickedRegionLabel = null;
    if (!q) { suggestBox.classList.remove('is-open'); return; }
    const matches = cities
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 6);
    let html = matches.map(c =>
      `<div class="city-suggestion" data-id="${c.id}">
        <span>${util.escapeHtml(c.name)}</span>
        <span class="city-suggestion__country">${util.escapeHtml(c.country || '')}</span>
      </div>`
    ).join('');
    html += `<div class="city-suggestion city-suggestion--new" data-action="new-city">+ Add as new city "${util.escapeHtml(cityInput.value.trim())}"</div>`;
    html += `<div class="city-suggestion city-suggestion--new" data-action="region">+ Use as region label (e.g. coast, valley)</div>`;
    suggestBox.innerHTML = html;
    suggestBox.classList.add('is-open');

    suggestBox.querySelectorAll('.city-suggestion').forEach(el => {
      el.addEventListener('click', async () => {
        if (el.dataset.action === 'new-city') {
          // Note: still using prompt() here — consider replacing in V2
          const country = window.prompt('Country for ' + cityInput.value.trim() + '?', '') || '';
          try {
            const data = await api.post('/api/cities', { name: cityInput.value.trim(), country });
            cities.push(data.city);
            pickedCityId = data.city.id;
            pickedRegionLabel = null;
            cityInput.value = data.city.name;
            suggestBox.classList.remove('is-open');
          } catch (err) {
            toast(err.message || 'Could not create city');
          }
        } else if (el.dataset.action === 'region') {
          pickedCityId = null;
          pickedRegionLabel = cityInput.value.trim();
          suggestBox.classList.remove('is-open');
          toast('Will save as region: ' + pickedRegionLabel);
        } else {
          pickedCityId = parseInt(el.dataset.id, 10);
          pickedRegionLabel = null;
          const c = cities.find(x => x.id === pickedCityId);
          cityInput.value = c ? c.name : cityInput.value;
          suggestBox.classList.remove('is-open');
        }
      });
    });
  }, 120);
  cityInput.addEventListener('input', onCityType);
  cityInput.addEventListener('focus', onCityType);

  document.getElementById('seg-save').addEventListener('click', async () => {
    if (!pickedCityId && !pickedRegionLabel) {
      pickedRegionLabel = cityInput.value.trim();
    }
    if (!pickedCityId && !pickedRegionLabel) {
      toast('Enter a city or region');
      return;
    }
    const body = {
      city_id: pickedCityId || null,
      region_label: pickedCityId ? null : pickedRegionLabel,
      date_start: document.getElementById('s-date-start').value || null,
      date_end: document.getElementById('s-date-end').value || null,
      notes: document.getElementById('s-notes').value.trim() || null,
    };
    try {
      if (editingSegmentId) {
        await api.patch(`/api/trips/${tripId}/segments/${editingSegmentId}`, body);
      } else {
        await api.post(`/api/trips/${tripId}/segments`, body);
      }
      closeSegment();
      await load();
    } catch (err) {
      toast(err.message || 'Save failed');
    }
  });

  // ESC closes whichever modal is open
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (confirmModal.classList.contains('is-open')) closeDeleteConfirm();
    else if (segModal.classList.contains('is-open')) closeSegment();
    else if (editModal.classList.contains('is-open')) closeEditTrip();
  });

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  load();
})();
