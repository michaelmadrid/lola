// CITY.JS — Summer Holiday / Lola v0.3
import { getTripData, getAllTrips, getCache, setCacheLinks, setCacheNote, setCacheJournal, getCurrentTripId, setCurrentTripId, getCurrentCity, setCurrentCity, loadCityLinks, loadCityNote } from './state.js';
import { ck, cacheKey, normalizeUrl, getDomain } from './util.js';
import { api } from './api.js';
import { renderManageList } from './trips.js';


export function renderCityDetail(tripId, city) {
  const key = ck(city);
  const el = document.getElementById('trips-city-detail');
  el.innerHTML = `<div style="padding:2rem 1rem;font-size:14px;color:var(--gray-mid);">Loading...</div>`;

  Promise.all([loadCityLinks(tripId, city), loadCityNote(tripId, city)])
    .then(([links, note]) => { _renderCityDetailHTML(tripId, city, key, links, note); });
}

export function renderCityList(tripId) {
  const td = getTripData(tripId); renderCityListFromData(tripId, td.days, td.legs);
}

export function renderCityListFromData(tripId, days, legs) {
  const el = document.getElementById('trips-city-list');
  if (!el) return;
  const trip = _allTrips.find(t => t.id === tripId);
  const stayDays = days.filter(d => d.type === 'stay' || d.type === 'arrive');
  const cities = [...new Set(stayDays.map(d => d.location).filter(Boolean))];

  let html = '';

  // Editable trip name header
  if (trip) {
    html += `<div style="padding:1.25rem 1rem 1rem;display:flex;align-items:center;gap:8px;">
      <input id="trip-name-input" value="${trip.name}"
        style="font-family:var(--font-display);font-size:24px;font-weight:600;letter-spacing:-0.02em;color:var(--black);background:none;border:none;border-bottom:2px solid transparent;outline:none;flex:1;transition:border-color 0.15s;padding-bottom:2px;"
        onfocus="this.style.borderColor='var(--accent)';document.getElementById('trip-name-save').style.opacity='1'"
        onblur="setTimeout(()=>document.getElementById('trip-name-save').style.opacity='0',200)"
        onkeydown="if(event.key==='Enter'){saveTripName(${tripId},this.value);this.blur()}" />
      <button id="trip-name-save" onclick="saveTripName(${tripId},document.getElementById('trip-name-input').value)"
        style="opacity:0;transition:opacity 0.15s;background:var(--accent);color:white;border:none;border-radius:20px;padding:6px 14px;font-size:13px;font-family:var(--font-body);cursor:pointer;white-space:nowrap;">Save</button>
    </div>`;
  }

  if (!cities.length) {
    html += `<div style="padding:0 1rem;">
      <div class="manage-card" style="padding:2rem 1.25rem;text-align:center;">
        <div style="font-size:14px;color:var(--gray-mid);margin-bottom:4px;">No cities yet</div>
        <div style="font-size:12px;color:var(--gray-light);">Go to Plan to import your itinerary</div>
      </div>
    </div>`;
    // Still show delete option for empty trips
    const tripForDelete = _allTrips.find(t => t.id === tripId);
    const tname = tripForDelete ? tripForDelete.name : '';
    html += '<div style="padding:1rem 1rem 2rem;">'
      + '<div id="delete-trip-confirm" style="display:none;background:var(--card);border-radius:var(--radius);padding:1.25rem;margin-bottom:0.75rem;box-shadow:var(--shadow);">'
      + '<div style="font-size:13px;color:var(--gray-mid);margin-bottom:6px;">Type the trip name to confirm deletion:</div>'
      + '<div style="font-size:15px;font-weight:500;color:var(--black);margin-bottom:10px;">' + tname + '</div>'
      + '<input id="delete-trip-input" type="text" placeholder="Type trip name..." style="width:100%;font-family:var(--font-body);font-size:14px;padding:10px 14px;border:1.5px solid var(--gray-xlight);border-radius:var(--radius-sm);background:var(--bg);color:var(--black);outline:none;margin-bottom:10px;" oninput="validateDeleteInput(' + tripId + ')" />'
      + '<div style="display:flex;gap:8px;">'
      + '<button id="delete-trip-btn" onclick="confirmDeleteTrip(' + tripId + ')" disabled style="font-family:var(--font-body);font-size:13px;padding:8px 16px;background:#e74c3c;color:white;border:none;border-radius:20px;cursor:pointer;opacity:0.4;transition:opacity 0.15s;">Delete</button>'
      + '<button onclick="document.getElementById(\'delete-trip-confirm\').style.display=\'none\'" style="font-family:var(--font-body);font-size:13px;padding:8px 16px;background:none;color:var(--gray-mid);border:1.5px solid var(--gray-xlight);border-radius:20px;cursor:pointer;">Cancel</button>'
      + '</div></div>'
      + '<div style="display:flex;gap:1.5rem;">' + '<button onclick="exportTrip(' + tripId + ')" style="font-family:var(--font-body);font-size:13px;color:var(--gray-mid);background:none;border:none;cursor:pointer;padding:4px 0;">Export trip</button>' + '<button onclick="document.getElementById(\'delete-trip-confirm\').style.display=\'block\'" style="font-family:var(--font-body);font-size:13px;color:var(--gray-mid);background:none;border:none;cursor:pointer;padding:4px 0;">Delete this trip</button>' + '</div>'
      + '</div>';
    el.innerHTML = html;
    return;
  }

  html += `<div class="manage-card" style="margin:0 1rem 1rem;">`;
  cities.forEach(city => {
    const k = cacheKey(tripId, city);
    const links = _cache.links[k] || [];
    const note = _cache.notes[k] || '';
    const parts = [links.length > 0 ? `${links.length} link${links.length !== 1 ? 's' : ''}` : '', note ? 'note' : ''].filter(Boolean);
    const sub = parts.length ? parts.join(' · ') : '';

    html += `<div class="manage-row" onclick="openLevel3(${tripId},'${city}')">
      <div style="flex:1;min-width:0;">
        <div class="manage-row-title">${city}</div>
        ${sub ? `<div class="manage-row-sub">${sub}</div>` : ''}
      </div>
      <span class="manage-chevron">›</span>
    </div>`;
  });
  html += `</div>`;

  // Delete trip section
  const tripForDelete = _allTrips.find(t => t.id === tripId);
  const tname = tripForDelete ? tripForDelete.name : '';
  html += '<div style="padding:1rem 1rem 2rem;">'
    + '<div id="delete-trip-confirm" style="display:none;background:var(--card);border-radius:var(--radius);padding:1.25rem;margin-bottom:0.75rem;box-shadow:var(--shadow);">'
    + '<div style="font-size:13px;color:var(--gray-mid);margin-bottom:6px;">Type the trip name to confirm deletion:</div>'
    + '<div style="font-size:15px;font-weight:500;color:var(--black);margin-bottom:10px;">' + tname + '</div>'
    + '<input id="delete-trip-input" type="text" placeholder="Type trip name..." style="width:100%;font-family:var(--font-body);font-size:14px;padding:10px 14px;border:1.5px solid var(--gray-xlight);border-radius:var(--radius-sm);background:var(--bg);color:var(--black);outline:none;margin-bottom:10px;" oninput="validateDeleteInput(' + tripId + ')" />'
    + '<div style="display:flex;gap:8px;">'
    + '<button id="delete-trip-btn" onclick="confirmDeleteTrip(' + tripId + ')" disabled style="font-family:var(--font-body);font-size:13px;padding:8px 16px;background:#e74c3c;color:white;border:none;border-radius:20px;cursor:pointer;opacity:0.4;transition:opacity 0.15s;">Delete</button>'
    + '<button onclick="document.getElementById(\'delete-trip-confirm\').style.display=\'none\'" style="font-family:var(--font-body);font-size:13px;padding:8px 16px;background:none;color:var(--gray-mid);border:1.5px solid var(--gray-xlight);border-radius:20px;cursor:pointer;">Cancel</button>'
    + '</div></div>'
    + '<div style="display:flex;gap:1.5rem;">' + '<button onclick="exportTrip(' + tripId + ')" style="font-family:var(--font-body);font-size:13px;color:var(--gray-mid);background:none;border:none;cursor:pointer;padding:4px 0;">Export trip</button>' + '<button onclick="document.getElementById(\'delete-trip-confirm\').style.display=\'block\'" style="font-family:var(--font-body);font-size:13px;color:var(--gray-mid);background:none;border:none;cursor:pointer;padding:4px 0;">Delete this trip</button>' + '</div>'
    + '</div>';

  el.innerHTML = html;
}

export function _renderCityDetailHTML(tripId, city, key, links, savedNote) {
  let html = '';

  // Notes card
  html += `<div class="manage-card" style="margin:1rem;padding:1.25rem;">
    <div class="section-label" style="margin-bottom:8px;">Notes</div>
    <textarea class="city-notes-area" id="city-note-${key}" placeholder="Anything about ${city}..."
      oninput="saveCityNote('${tripId}','${city}',this.value);this.style.height='auto';this.style.height=this.scrollHeight+'px'"
    >${savedNote || ''}</textarea>
  </div>`;

  // Links card
  html += `<div class="manage-card" style="margin:0 1rem;overflow:hidden;">`;
  html += `<div style="padding:0.875rem 1.25rem 0.625rem;border-bottom:1px solid var(--gray-xlight);">
    <div class="section-label">Links</div>
  </div>`;

  if (!links.length) {
    html += `<div style="padding:1rem 1.25rem;font-size:14px;color:var(--gray-light);font-style:italic;">Nothing saved yet.</div>`;
  } else {
    html += `<div class="swipe-items-container">`;
    links.forEach(item => {
      const safeId = `${key}-${item._id}`;
      const delAction = `deleteGuideItem('${tripId}','${city}','${item._id}')`;
      html += `<div class="swipe-item" id="swipe-${safeId}">
        <div class="swipe-delete-bg" onclick="${delAction}">Delete</div>
        <div class="swipe-item-content" id="swipe-content-${safeId}" style="padding:0.625rem 1.25rem;min-height:44px;display:flex;align-items:center;gap:10px;background:var(--card);">
          <span style="color:var(--accent);font-size:14px;flex-shrink:0;line-height:1;">↗</span>
          <div style="flex:1;min-width:0;">
            <a href="${item.url}" target="_blank" style="font-size:15px;color:var(--accent);text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</a>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--gray-mid);margin-top:1px;">${getDomain(item.url)}</div>
          </div>
          <button onclick="${delAction}" class="desktop-delete-btn">×</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // Add link
  html += `<div style="padding:0 1rem 3rem;">
    <div id="city-input-area" style="display:none;margin:0.75rem 0 0;">
      <input class="guide-input" id="city-input" placeholder="https:// or domain.com..."
        style="margin-bottom:8px;"
        onkeydown="if(event.key==='Enter'){event.preventDefault();submitCityItem('${tripId}','${city}')}" />
      <div class="guide-form-actions">
        <button class="guide-form-btn primary" onclick="submitCityItem('${tripId}','${city}')">Save</button>
        <button class="guide-form-btn secondary" onclick="closeCityInput()">Cancel</button>
      </div>
    </div>
    <div id="city-add-btns">
      <button onclick="showCityInput()" style="font-family:var(--font-body);font-size:14px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0.875rem 0;display:flex;align-items:center;gap:6px;">
        <span style="font-size:18px;line-height:1;">+</span> Add link
      </button>
    </div>
  </div>`;

  document.getElementById('trips-city-detail').innerHTML = html;

  const ta = document.getElementById(`city-note-${key}`);
  if (ta && ta.value) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

  links.forEach(item => initSwipeDelete(`${key}-${item._id}`));
}

// ─────────────────────────────────────────
// LEVEL 2 — Trip city list
// ─────────────────────────────────────────
export async function openLevel2(tripId) {
  setCurrentTripId(tripId);
  const trip = _allTrips.find(t => t.id === tripId);
  document.getElementById('level2-title').textContent = trip ? trip.name : '';
  renderCityList(tripId);
  const el = document.getElementById('trips-level-2');
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.style.transform = 'translateX(0)');
}

// ─────────────────────────────────────────
// LEVEL 3 — City detail
// ─────────────────────────────────────────
export function openLevel3(tripId, city) {
  setCurrentTripId(tripId);
  setCurrentCity(city);
  document.getElementById('level3-title').textContent = city;
  renderCityDetail(tripId, city);
  const el = document.getElementById('trips-level-3');
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.style.transform = 'translateX(0)');
}

export function closeLevel2() {
  const el = document.getElementById('trips-level-2');
  el.style.transform = 'translateX(100%)';
  document.body.style.overflow = '';
  setTimeout(() => el.style.display = 'none', 280);
}

export async function closeLevel3() {
  const el = document.getElementById('trips-level-3');
  el.style.transform = 'translateX(100%)';
  setTimeout(async () => {
    el.style.display = 'none';
    document.body.style.overflow = '';
    // Refresh cache for this city
    if (getCurrentTripId() && getCurrentCity()) {
      delete _cache.links[cacheKey(getCurrentTripId(), getCurrentCity())];
      delete _cache.notes[cacheKey(getCurrentTripId(), getCurrentCity())];
      await Promise.all([
        loadCityLinks(getCurrentTripId(), getCurrentCity()),
        loadCityNote(getCurrentTripId(), getCurrentCity())
      ]);
    }
    if (getCurrentTripId()) renderCityList(getCurrentTripId());
    renderSummary();
  }, 280);
}

export function openCityFromSummary(tripId, city) {
  setCurrentTripId(tripId);
  setCurrentCity(city);
  document.getElementById('level3-title').textContent = city;
  renderCityDetail(tripId, city);
  const el = document.getElementById('trips-level-3');
  el.style.display = 'block';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => el.style.transform = 'translateX(0)');
}

export function saveCityNote(tripId, city, value) {
  const k = cacheKey(tripId, city);
  setCacheNote(k, value);
  clearTimeout(_noteTimer);
  _noteTimer = setTimeout(async () => {
    await api('POST', `/api/notes/${tripId}/${encodeURIComponent(city)}`, { content: value });
    renderSummary();
  }, 800);
}

export function saveGuideItem(tripId, city, item) {
  return api('POST', `/api/links/${tripId}/${encodeURIComponent(city)}`, { title: item.title, url: item.url })
    .then(data => {
      if (data && data.link) {
        const k = cacheKey(tripId, city);
        if (!_cache.links[k]) setCacheLinks(k, []);
        _cache.links[k].push({ ...data.link, _id: String(data.link.id), type: 'link' });
      }
    });
}

export function deleteGuideItem(tripId, city, itemId) {
  const k = cacheKey(tripId, city);
  if (_cache.links[k]) {
    setCacheLinks(k, _cache.links[k].filter(l => String(l.id) !== String(itemId) && String(l._id) !== String(itemId)));
  }
  api('DELETE', `/api/links/${itemId}`);
  _renderCityDetailHTML(tripId, city, ck(city), _cache.links[k] || [], _cache.notes[k] || '');
}

export async function submitCityItem(tripId, city) {
  const input = document.getElementById('city-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const url = normalizeUrl(val);
  const item = { type: 'link', title: getDomain(url.startsWith('http') ? url : val), url: url.startsWith('http') ? url : val };
  closeCityInput();
  await saveGuideItem(tripId, city, item);
  delete _cache.links[cacheKey(tripId, city)];
  await loadCityLinks(tripId, city);
  _renderCityDetailHTML(tripId, city, ck(city), _cache.links[cacheKey(tripId, city)] || [], _cache.notes[cacheKey(tripId, city)] || '');
}

export function showCityInput() {
  document.getElementById('city-input-area').style.display = 'block';
  document.getElementById('city-add-btns').style.display = 'none';
  setTimeout(() => document.getElementById('city-input')?.focus(), 50);
}

export function closeCityInput() {
  const area = document.getElementById('city-input-area');
  const btns = document.getElementById('city-add-btns');
  if (area) { area.style.display = 'none'; const inp = document.getElementById('city-input'); if(inp) inp.value = ''; }
  if (btns) btns.style.display = 'block';
}

// ─────────────────────────────────────────
// SWIPE TO DELETE
// ─────────────────────────────────────────
export function initSwipeDelete(safeId) {
  const item = document.getElementById(`swipe-${safeId}`);
  const content = document.getElementById(`swipe-content-${safeId}`);
  if (!item || !content) return;

  let startX = 0, currentX = 0, isDragging = false;

  item.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = false;
  }, { passive: true });

  item.addEventListener('touchmove', e => {
    currentX = e.touches[0].clientX;
    const dx = currentX - startX;
    if (Math.abs(dx) > 5) isDragging = true;
    if (isDragging && dx < 0) {
      content.style.transform = `translateX(${Math.max(dx, -80)}px)`;
    }
  }, { passive: true });

  item.addEventListener('touchend', () => {
    if (!isDragging) return;
    const dx = currentX - startX;
    if (dx < -40) {
      content.style.transform = 'translateX(-80px)';
    } else {
      content.style.transform = 'translateX(0)';
    }
  });
}
