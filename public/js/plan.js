// PLAN.JS — Summer Holiday / Lola v0.3
import { getTripsData, setTripData, getAllTrips, filterAllTrips, pushTrip, getSelectedPlanTripId, setSelectedPlanTripId, getPlanMode, setPlanMode, getCache, loadAllTripsData, preloadCityData, getTripData, getLegsForDay } from './state.js';
import { api } from './api.js';
import { toKey, formatDate } from './util.js';
import { renderHome, renderSummary, renderCalendar, renderManageList } from './trips.js';


export async function parseTripWithClaude() {
  const text = document.getElementById('plan-text').value.trim();
  const newName = document.getElementById('plan-new-name').value.trim();
  const btn = document.getElementById('parse-btn');
  const status = document.getElementById('parse-status');

  if (!text) {
    status.textContent = 'Please paste some itinerary text first.';
    status.style.color = '#e74c3c';
    return;
  }
  if (!getSelectedPlanTripId() && !newName) {
    status.textContent = 'Select an existing trip or name a new one.';
    status.style.color = '#e74c3c';
    return;
  }

  // Warn on replace mode if trip has data
  if (_planMode === 'replace' && getSelectedPlanTripId()) {
    const confirmEl = document.getElementById('replace-confirm');
    if (confirmEl) confirmEl.style.display = 'block';
    return;
  }

  await _doImport();
}

export async function _doImport() {
  const text = document.getElementById('plan-text').value.trim();
  const newName = document.getElementById('plan-new-name').value.trim();
  const btn = document.getElementById('parse-btn');
  const status = document.getElementById('parse-status');
  const textarea = document.getElementById('plan-text');
  const confirmEl = document.getElementById('replace-confirm');
  if (confirmEl) confirmEl.style.display = 'none';

  // Lock UI
  textarea.disabled = true;
  btn.textContent = 'Parsing... please wait 10–15 seconds';
  btn.disabled = true;
  btn.classList.add('btn-parsing');
  status.textContent = '';
  status.style.color = '';

  try {
    let tripId = getSelectedPlanTripId();

    if (!tripId && newName) {
      const data = await api('POST', '/api/trips', { name: newName });
      if (!data || !data.trip) throw new Error('Failed to create trip');
      tripId = data.trip.id;
      pushTrip(data.trip);
    }

    const result = await api('POST', '/api/trips/import', { tripId, text, mode: getPlanMode() });

    if (result && result.success) {
      btn.textContent = `✓ ${result.days} days ${_planMode === 'update' ? 'updated' : 'imported'}`;
      btn.classList.remove('btn-parsing');
      document.getElementById('plan-text').value = '';
      document.getElementById('plan-new-name').value = '';
      setSelectedPlanTripId(null);

      await loadAllTripsData();
      await preloadCityData();
      renderHome(getTodayKey() || toKey(new Date()));
      renderSummary();
      renderCalendar();

      setTimeout(() => {
        btn.textContent = 'Parse with Claude →';
        btn.disabled = false;
        textarea.disabled = false;
        renderPlanView();
        showView('trips', document.getElementById('nav-trips'));
        switchTripsView('summary');      }, 1500);
    } else {
      throw new Error(result?.error || 'Import failed');
    }
  } catch (err) {
    btn.textContent = 'Parse with Claude →';
    btn.classList.remove('btn-parsing');
    btn.disabled = false;
    textarea.disabled = false;
    status.textContent = `Error: ${err.message}`;
    status.style.color = '#e74c3c';
  }
}

export function renderPlanView() {
  const list = document.getElementById('plan-trip-list');
  if (!list) return;

  if (!_allTrips.length) {
    list.innerHTML = `<div style="font-size:13px;color:var(--gray-mid);padding:4px 0 8px;">No trips yet — create one below.</div>`;
    return;
  }

  list.innerHTML = _allTrips.map(trip =>
    `<div class="plan-trip-row" data-trip-id="${trip.id}" onclick="selectPlanTrip(${trip.id})">
      <span class="plan-trip-name">${trip.name}</span>
      <span class="plan-trip-check">✓</span>
    </div>`
  ).join('');
}

export function selectPlanTrip(id) {
  setSelectedPlanTripId(id);
  document.getElementById('plan-new-name').value = '';
  document.querySelectorAll('.plan-trip-row').forEach(r => {
    const selected = r.dataset.tripId == id;
    r.querySelector('.plan-trip-check').style.display = selected ? 'block' : 'none';
    r.querySelector('.plan-trip-name').style.color = selected ? 'var(--accent)' : '';
  });
}

export function clearPlanSelection() {
  setSelectedPlanTripId(null);
  document.querySelectorAll('.plan-trip-row').forEach(r => {
    r.querySelector('.plan-trip-check').style.display = 'none';
    r.querySelector('.plan-trip-name').style.color = '';
  });
}

export function setPlanMode(mode) {
  _planMode = mode;
  const updateBtn = document.getElementById('mode-update');
  const replaceBtn = document.getElementById('mode-replace');
  const desc = document.getElementById('mode-description');
  if (!updateBtn) return;
  if (mode === 'update') {
    updateBtn.style.background = 'var(--accent)'; updateBtn.style.color = 'white'; updateBtn.style.borderColor = 'var(--accent)';
    replaceBtn.style.background = 'none'; replaceBtn.style.color = 'var(--gray-mid)'; replaceBtn.style.borderColor = 'var(--gray-xlight)';
    desc.textContent = 'Add or update specific days without touching the rest of your trip.';
  } else {
    replaceBtn.style.background = 'var(--accent)'; replaceBtn.style.color = 'white'; replaceBtn.style.borderColor = 'var(--accent)';
    updateBtn.style.background = 'none'; updateBtn.style.color = 'var(--gray-mid)'; updateBtn.style.borderColor = 'var(--gray-xlight)';
    desc.textContent = 'Wipe all existing days and reimport from scratch. Use for full re-imports only.';
  }
}

export function exportTrip(tripId) {
  const trip = _allTrips.find(t => t.id === tripId);
  const td = getTripData(tripId);
  if (!td || !td.days.length) { alert('No data to export.'); return; }

  const tripName = trip ? trip.name : 'Trip';
  const lines = [tripName.toUpperCase(), ''];
  const days = td.days;
  const fmt = k => { const [y,m,d] = k.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); };
  const fmtShort = k => { const [y,m,d] = k.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US',{month:'short',day:'numeric'}); };

  let i = 0;
  while (i < days.length) {
    const day = days[i];

    if (day.type === 'travel') {
      const legs = getLegsForDay(day.id, tripId);
      legs.forEach(l => {
        const route = [l.from_city, l.to_city].filter(Boolean).join(' → ');
        const times = [l.dep_time, l.arr_time].filter(Boolean).join(' - ');
        const arrNote = l.arr_note ? ' (' + l.arr_note + ')' : '';
        const carrier = [l.carrier, l.ref].filter(Boolean).join(' ');
        const ref = l.ref_code ? ' #' + l.ref_code : '';
        lines.push(route + ' ' + fmt(day.date));
        if (carrier || ref) lines.push(carrier + ref);
        if (times) lines.push(times + arrNote);
      });
      lines.push('');
      i++;

    } else if (day.type === 'arrive' || day.type === 'stay') {
      // Group all consecutive days in same city with same stay
      const city = day.location;
      const stay = day.stay;
      let j = i;
      while (j < days.length && (days[j].type === 'stay' || days[j].type === 'arrive') && days[j].location === city) {
        j++;
      }
      const firstDate = days[i].date;
      const lastDate = days[j-1].date;
      const dateRange = firstDate === lastDate
        ? fmtShort(firstDate)
        : fmtShort(firstDate) + ' - ' + fmtShort(lastDate);
      const stayStr = stay ? ', ' + stay : '';
      lines.push(city + ' ' + dateRange + stayStr);
      lines.push('');
      i = j;

    } else {
      i++;
    }
  }

  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const blob = new Blob([text], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = tripName.replace(/\s+/g, '_') + '.txt';
  a.click();
}

export async function saveTripName(tripId, name) {
  name = name.trim();
  if (!name) {
    // Restore old name
    const trip = _allTrips.find(t => t.id === tripId);
    const input = document.getElementById('trip-name-input');
    if (input && trip) input.value = trip.name;
    return;
  }
  const trip = _allTrips.find(t => t.id === tripId);
  if (trip && trip.name === name) return; // no change
  await api('PATCH', `/api/trips/${tripId}`, { name });
  if (trip) { trip.name = name; document.getElementById('level2-title').textContent = name; }
  renderManageList();
}

export function validateDeleteInput(tripId) {
  const trip = _allTrips.find(t => t.id === tripId);
  const input = document.getElementById('delete-trip-input');
  const btn = document.getElementById('delete-trip-btn');
  if (!trip || !input || !btn) return;
  const match = input.value.trim() === trip.name.trim();
  btn.disabled = !match;
  btn.style.opacity = match ? '1' : '0.4';
  btn.style.cursor = match ? 'pointer' : 'default';
}

export async function confirmDeleteTrip(tripId) {
  const trip = _allTrips.find(t => t.id === tripId);
  const input = document.getElementById('delete-trip-input');
  if (!trip || !input || input.value.trim() !== trip.name.trim()) return;
  const result = await api('DELETE', '/api/trips/' + tripId);
  if (result && result.success) {
    setAllTrips(_allTrips.filter(t => t.id !== tripId));
    deleteTripData(tripId);
    closeLevel2();
    renderManageList();
    renderSummary();
    renderCalendar();
    renderHome(getTodayKey() || toKey(new Date()));
  }
}
