/* =========================================================
   trips.js — trips list page
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('trip-list');
  const newBtn = document.getElementById('new-trip-btn');
  const modal = document.getElementById('trip-modal');
  const modalClose = document.getElementById('trip-modal-close');
  const saveBtn = document.getElementById('trip-save');
  const form = document.getElementById('trip-form');

  async function load() {
    try {
      const data = await api.get('/api/trips');
      render(data.trips || []);
    } catch (err) {
      console.error('load trips', err);
      listEl.innerHTML = '<div class="list-empty">Could not load trips.</div>';
    }
  }

  function render(trips) {
    if (!trips.length) {
      listEl.innerHTML = '<div class="list-empty">No trips yet. Click + New trip to start.</div>';
      return;
    }
    listEl.innerHTML = trips.map(t => {
      const dates = (t.date_start && t.date_end)
        ? `${util.formatNumericDate(t.date_start)} — ${util.formatNumericDate(t.date_end)}`
        : (t.date_start ? `from ${util.formatNumericDate(t.date_start)}` : '—');
      const ownerSuffix = (!t.is_owner && t.owner_name)
        ? `<span class="trip-row__by">${util.escapeHtml(t.owner_name)}</span>`
        : '';
      return `<a class="trip-row${t.is_owner ? '' : ' is-shared'}" href="/trip.html?id=${t.id}">
        <span class="trip-name">${util.escapeHtml(t.name)}${ownerSuffix}</span>
        <span class="trip-dates">${dates}</span>
        <span class="trip-arrow">→</span>
      </a>`;
    }).join('');
  }

  function openModal() {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('t-name').focus(), 50);
  }
  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
    form.reset();
  }
  newBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  async function save() {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { document.getElementById('t-name').focus(); return; }
    const date_start = document.getElementById('t-date-start').value || null;
    const date_end = document.getElementById('t-date-end').value || null;
    const notes = document.getElementById('t-notes').value.trim() || null;
    try {
      const data = await api.post('/api/trips', { name, date_start, date_end, notes });
      closeModal();
      // navigate straight into the new trip
      location.href = '/trip.html?id=' + data.trip.id;
    } catch (err) {
      console.error('save trip', err);
      toast(err.message || 'Save failed');
    }
  }
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  // sign out
  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  async function loadGraveyardCount() {
    try {
      const data = await api.get('/api/trips/graveyard');
      const count = (data.trips || []).length;
      const footEl = document.getElementById('trips-foot');
      if (count > 0) {
        footEl.innerHTML = `<a class="graveyard-link" href="/travel/graveyard/">Graveyard (${count})</a>`;
      } else {
        footEl.innerHTML = '';
      }
    } catch (err) { /* silent */ }
  }

  load().then(loadGraveyardCount);
})();
