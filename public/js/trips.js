// TRIPS.JS — Summer Holiday / Lola v0.3
import { getAllDays, getDayData, getDayTripId, getLegsForDay, getTodayKey, getTripData, getAllTrips, getTripsData, getCache, getViewedKey, setViewedKey, setCacheJournal, clearJournalTimer, setJournalTimer, loadCityLinks, loadCityNote } from './state.js';
import { toKey, formatDate, cacheKey, ck, moonSVG } from './util.js';
import { api } from './api.js';


// ─────────────────────────────────────────
// HOME / TODAY VIEW
// ─────────────────────────────────────────
export function renderHome(key) {
  setViewedKey(key);
  const el = document.getElementById('home-content');
  const today = toKey(new Date());
  const allDays = getAllDays(); // all days across all trips, sorted
  const allKeys = allDays.map(d => d.date);
  const tripStart = allKeys[0];
  const tripEnd = allKeys[allKeys.length - 1];

  let html = `<div class="today-wrap">`;

  // Pre/post trip state
  if (!key) {
    if (!tripStart) {
      html += `<div class="pretrip-card"><div style="font-family:var(--font-display);font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--black);margin-bottom:8px;">No trips yet</div><div style="font-size:14px;color:var(--gray-mid);line-height:1.6;">Go to Plan to import your itinerary.</div></div>`;
      html += `</div>`;
      el.innerHTML = html;
      return;
    } else if (today < tripStart) {
      const daysLeft = Math.ceil((new Date(tripStart) - new Date(today)) / (1000*60*60*24));
      const [sy,sm,sd] = tripStart.split('-').map(Number);
      // Find which trip starts first
      const firstTrip = getAllTrips().find(t => getTripData(t.id).days.find(d => d.date === tripStart));
      html += `<div class="pretrip-card">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray-mid);margin-bottom:8px;">Coming up${firstTrip ? ` · ${firstTrip.name}` : ''}</div>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.02em;color:var(--black);margin-bottom:4px;">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</div>
        <div style="font-size:14px;color:var(--gray-mid);">Starts ${new Date(sy,sm-1,sd).toLocaleDateString('en-US',{month:'long',day:'numeric'})}</div>
      </div>`;
      key = today;
    } else {
      html += `<div class="pretrip-card"><div style="font-family:var(--font-display);font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--black);margin-bottom:8px;">All done</div><div style="font-size:14px;color:var(--gray-mid);">What a ride.</div></div>`;
      html += `</div>`;
      el.innerHTML = html;
      return;
    }
  }

  // Find the day and which trip it belongs to
  const dayObj = allDays.find(d => d.date === key);
  const tripId = dayObj ? dayObj.tripId : getDayTripId(key);
  const day = dayObj || null;
  const keyIndex = allKeys.indexOf(key);

  if (!day) {
    // Day outside any trip — just journal
    const journalTripId = tripId || (Object.keys(getTripsData())[0] ? parseInt(Object.keys(getTripsData())[0]) : 1);
    const journalKey = `${journalTripId}-${key}`;
    const journalContent = getCache().journal[journalKey] || '';
    html += `<div class="today-card" style="min-height:unset;">
      <div style="margin-bottom:0.75rem;"><div class="today-date">${formatDate(key)}</div></div>
      <div class="today-label">Journal</div>
      <textarea id="journal-ta-${key}" placeholder="Notes for today..."
        style="width:100%;min-height:90px;font-family:var(--font-body);font-size:16px;line-height:1.7;border:none;outline:none;background:none;color:var(--black);resize:none;padding:6px 0;"
        oninput="saveJournalEntry('${key}',${journalTripId},this.value);this.style.height='auto';this.style.height=this.scrollHeight+'px'"
      >${journalContent}</textarea>
    </div></div>`;
    el.innerHTML = html;
    return;
  }

  const prevKey = keyIndex > 0 ? allKeys[keyIndex - 1] : null;
  const nextKey = keyIndex < allKeys.length - 1 ? allKeys[keyIndex + 1] : null;
  const legs = getLegsForDay(day.id, tripId);
  const tripName = getAllTrips().find(t => t.id === tripId)?.name || '';

  html += `<div class="today-card">
    <div class="today-header">
      <div>
        <div class="today-date">${formatDate(key)}</div>
        <div class="today-location">${day.location || ''}${tripName ? `<span style="color:var(--gray-light);margin-left:6px;">· ${tripName}</span>` : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <div class="today-badge ${day.type}">${day.type}</div>
        <div style="display:flex;gap:0;">
          <button class="day-nav-btn" onclick="navigateDay(-1)" ${!prevKey?'disabled':''}>‹</button>
          <button class="day-nav-btn" onclick="navigateDay(1)" ${!nextKey?'disabled':''}>›</button>
        </div>
      </div>
    </div>`;

  if (legs.length) {
    html += `<div style="margin-bottom:1.25rem;">
      <div class="today-label">Travel</div>
      ${renderTravelLegs(legs)}
    </div>`;
  }

  if (day.stay) {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(day.stay)}`;
    html += `<div style="margin-bottom:1.25rem;">
      <div class="today-label">Stay</div>
      <div class="today-content"><a href="${mapsUrl}" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--gray-xlight);">${day.stay}</a></div>
    </div>`;
  }

  if (day.alert) {
    html += `<div class="alert-bar">${day.alert}</div>`;
  }

  // Journal — scoped to this trip
  const journalKey = `${tripId}-${key}`;
  const journalContent = getCache().journal[journalKey] || '';
  html += `<div style="margin-top:1.5rem;">
    <div class="today-label">Journal</div>
    <textarea id="journal-ta-${key}" placeholder="What happened today..."
      style="width:100%;min-height:90px;font-family:var(--font-body);font-size:16px;line-height:1.7;border:none;outline:none;background:none;color:var(--black);resize:none;padding:6px 0;"
      oninput="saveJournalEntry('${key}',${tripId},this.value);this.style.height='auto';this.style.height=this.scrollHeight+'px'"
    >${journalContent}</textarea>
  </div>`;

  html += `</div></div>`;
  el.innerHTML = html;

  if (!getCache().journal[journalKey]) {
    api('GET', `/api/journal/${tripId}/${key}`).then(data => {
      if (data && data.entry && data.entry.content) {
        setCacheJournal(journalKey, data.entry.content);
        const ta = document.getElementById(`journal-ta-${key}`);
        if (ta && !ta.value) { ta.value = data.entry.content; ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
      }
    });
  }

  const ta = document.getElementById(`journal-ta-${key}`);
  if (ta && ta.value) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
}

export function renderSummary() {
  const el = document.getElementById('summary-content');
  if (!el) return;

  const allTripData = Object.entries(getTripsData());
  if (!allTripData.length) { el.innerHTML = ''; return; }

  // Sort trips by their first day
  const sortedTrips = getAllTrips().filter(t => getTripsData()[t.id] && getTripsData()[t.id].days.length)
    .sort((a, b) => {
      const aStart = getTripsData()[a.id].days[0]?.date || '';
      const bStart = getTripsData()[b.id].days[0]?.date || '';
      return aStart.localeCompare(bStart);
    });

  const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtD = k => { if (!k) return ''; const [y,m,d] = k.split('-'); return MONTHS_S[+m-1]+' '+(+d); };
  let html = '';

  sortedTrips.forEach(trip => {
    const td = getTripsData()[trip.id];
    const allDates = td.days.map(d => d.date).sort();

    // Trip header
    html += `<div class="summary-trip-section">`;
    html += `<div style="padding:1.5rem 1rem 0.75rem;">
      <div style="font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-0.02em;color:var(--black);">${trip.name}</div>
      ${allDates.length ? `<div style="font-size:13px;color:var(--gray-mid);margin-top:2px;">${fmtD(allDates[0])} &ndash; ${fmtD(allDates[allDates.length-1])} &middot; ${allDates.length} days</div>` : ''}
    </div>`;

    // Build city groups for this trip
    const cityGroups = [];
    let current = null;
    td.days.forEach(day => {
      if (day.type === 'stay' || day.type === 'arrive') {
        if (!current || current.city !== day.location) {
          if (current) cityGroups.push(current);
          current = { city: day.location, dates: [], days: [], tripId: trip.id };
        }
        current.dates.push(day.date);
        current.days.push(day);
      } else if (day.type === 'travel') {
        if (current) { cityGroups.push(current); current = null; }
      }
    });
    if (current) cityGroups.push(current);

  cityGroups.forEach((group, groupIdx) => {
    const fmt = k => { const [y,m,d] = k.split('-'); return new Date(+y,+m-1,+d).toLocaleDateString('en-US',{month:'short',day:'numeric'}); };

    // Find travel day immediately before and after this city
    const tripDays = getTripData(group.tripId).days;
    const cityStartIdx = tripDays.findIndex(d => d.date === group.dates[0]);
    const cityEndIdx = tripDays.findIndex(d => d.date === group.dates[group.dates.length - 1]);
    const dayBefore = cityStartIdx > 0 ? tripDays[cityStartIdx - 1] : null;
    const dayAfter = cityEndIdx < tripDays.length - 1 ? tripDays[cityEndIdx + 1] : null;
    const prevTravelDay = (dayBefore && dayBefore.type === 'travel') ? dayBefore : null;
    const nextTravelDay = (dayAfter && dayAfter.type === 'travel') ? dayAfter : null;
    const incomingLegs = prevTravelDay ? getLegsForDay(prevTravelDay.id, group.tripId) : [];

    const nights = group.dates.length;
    const nightsLabel = `${nights} night${nights !== 1 ? 's' : ''}`;
    // Start date = incoming travel day if there is one (e.g. May 18 TGV arrives Marseille)
    const displayStartDate = prevTravelDay ? prevTravelDay.date : group.dates[0];
    // End date = outgoing travel day if there is one (e.g. May 18 TGV departs Paris)
    const displayEndDate = nextTravelDay ? nextTravelDay.date : group.dates[group.dates.length - 1];
    const datesLabel = `${fmt(displayStartDate)} – ${fmt(displayEndDate)}`;

    const k = cacheKey(group.tripId, group.city);
    const links = getCache().links[k] || [];
    const note = getCache().notes[k] || '';
    html += `<div class="trip-card" id="summary-city-${ck(group.city)}">
      <div class="trip-card-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div onclick="openCityFromSummary(${group.tripId},'${group.city}')" style="cursor:pointer;" class="trip-card-name">${group.city}</div>
            <div class="trip-card-meta">${datesLabel} · ${nightsLabel}</div>
          </div>
          <div onclick="openCityFromSummary(${group.tripId},'${group.city}')" style="cursor:pointer;color:var(--gray-light);font-size:18px;padding-top:4px;">›</div>
        </div>
      </div>`;

    // Incoming legs — only show on first city (the journey to get there from home)
    if (groupIdx === 0 && incomingLegs.length) {
      html += `<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--gray-xlight);">
        ${renderTravelLegs(incomingLegs)}
      </div>`;
    }

    // Group distinct stays
    const stayGroups = [];
    group.days.forEach(d => {
      if (!d.stay) return;
      const last = stayGroups[stayGroups.length - 1];
      if (last && last.stay === d.stay) {
        last.dates.push(d.date);
      } else {
        stayGroups.push({ stay: d.stay, dates: [d.date] });
      }
    });

    if (stayGroups.length) {
      html += `<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--gray-xlight);">
        <div class="section-label" style="margin-bottom:4px;">Stay</div>`;
      stayGroups.forEach((sg, i) => {
        const showDates = stayGroups.length > 1;
        const dateRange = showDates ? `<span style="font-size:11px;color:var(--gray-mid);margin-left:6px;">${fmt(sg.dates[0])}${sg.dates.length > 1 ? ` – ${fmt(sg.dates[sg.dates.length-1])}` : ''}</span>` : '';
        const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(sg.stay)}`;
        html += `<div class="section-content"${i > 0 ? ' style="margin-top:6px;"' : ''}><a href="${mapsUrl}" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--gray-xlight);">${sg.stay}</a>${dateRange}</div>`;
      });
      html += `</div>`;
    }

    if (note) {
      html += `<div style="padding:0.875rem 1.25rem;border-bottom:1px solid var(--gray-xlight);">
        <div style="font-size:13px;color:var(--gray-mid);white-space:pre-line;line-height:1.6;">${note}</div>
      </div>`;
    }

    if (links.length) {
      html += `<div style="padding:0.75rem 1.25rem;border-bottom:1px solid var(--gray-xlight);">`;
      links.forEach(link => {
        html += `<div style="display:flex;align-items:center;gap:7px;padding:3px 0;">
          <span style="color:var(--accent);font-size:12px;">↗</span>
          <a href="${link.url}" target="_blank" style="font-size:13px;color:var(--accent);text-decoration:none;">${link.title}</a>
        </div>`;
      });
      html += `</div>`;
    }

    // Outgoing legs — only on last city (return flight home)
    if (groupIdx === cityGroups.length - 1) {
      const outgoingLegs = [];
      let nextIdx = cityEndIdx + 1;
      while (nextIdx < tripDays.length && tripDays[nextIdx].type === 'travel') {
        getLegsForDay(tripDays[nextIdx].id, group.tripId).forEach(l => outgoingLegs.push(l));
        nextIdx++;
      }
      if (outgoingLegs.length) {
        html += `<div style="padding:1rem 1.25rem;border-top:1px solid var(--gray-xlight);">
          ${renderTravelLegs(outgoingLegs)}
        </div>`;
      }
    }

    html += `</div>`; // close trip-card
    });

    html += `<div style="height:1rem;"></div></div>`; // spacing + close summary-trip-section
  }); // end sortedTrips.forEach

  el.innerHTML = html;
}

// ─────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────
export function renderCalendar() {
  const today = toKey(new Date());
  const dayMap = {};
  getAllDays().forEach(d => { dayMap[d.date] = d; });

  function buildMonth(name, year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const offset = (firstDay === 0) ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const DOWS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    let html = `<div class="cal-month"><div class="cal-month-name">${name}</div><div class="cal-grid">`;
    DOWS.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });
    for (let i = 0; i < offset; i++) html += `<div class="cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const day = dayMap[key];
      let cls = 'cal-day';
      let tag = '';
      if (!day) cls += ' inactive';
      else if (day.type === 'travel') { cls += ' transit'; tag = day.location ? day.location.split(' - ')[0].substring(0,3).toUpperCase() : 'TRV'; }
      else { cls += ' trip'; tag = day.location ? day.location.substring(0,3).toUpperCase() : ''; }
      if (key === today) cls += ' today-dot';
      html += `<div class="${cls}"><span class="day-num">${d}</span>${tag?`<span class="day-tag">${tag}</span>`:''}`;
      html += `</div>`;
    }
    html += `</div></div>`;
    return html;
  }

  const cal = document.getElementById('cal-content');
  if (!cal) return;
  const allDays = getAllDays();
  if (!allDays.length) { cal.innerHTML = ''; return; }
  const firstDate = new Date(allDays[0].date);
  const lastDate = new Date(allDays[allDays.length - 1].date);
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let calHtml = '';
  let y = firstDate.getFullYear(), m = firstDate.getMonth();
  const endY = lastDate.getFullYear(), endM = lastDate.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    calHtml += buildMonth(MONTH_NAMES[m], y, m);
    m++; if (m > 11) { m = 0; y++; }
  }
  cal.innerHTML = calHtml;
}

// ─────────────────────────────────────────
// MANAGE LIST
// ─────────────────────────────────────────
export function renderManageList() {
  const el = document.getElementById('manage-trips-list');
  if (!el) return;

  // Use the loaded trips list
  if (!getAllTrips().length) {
    el.innerHTML = `<div style="padding:1.5rem 1rem;font-size:14px;color:var(--gray-mid);">No trips yet. Go to Plan to create one.</div>`;
    return;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html = `<div class="manage-card">`;

  const sortedForManage = [...getAllTrips()].sort((a, b) => {
    const aStart = getTripsData()[a.id]?.days[0]?.date || 'z';
    const bStart = getTripsData()[b.id]?.days[0]?.date || 'z';
    return aStart.localeCompare(bStart);
  });
  sortedForManage.forEach(trip => {
    const tripDays = getTripsData()[trip.id] ? getTripsData()[trip.id].days : [];
    const dates = tripDays.map(d => d.date).sort();
    const start = dates[0];
    const end = dates[dates.length - 1];
    const fmt = k => {
      if (!k) return '?';
      const [y,m,d] = k.substring(0,10).split('-');
      return `${MONTHS[+m-1]} ${+d}`;
    };
    const today = toKey(new Date());
    let status, statusStyle;
    if (!start) { status = 'No data'; statusStyle = 'background:var(--gray-xlight);color:var(--gray-mid);'; }
    else if (today < start) { status = 'Upcoming'; statusStyle = 'background:var(--gray-xlight);color:var(--gray-mid);'; }
    else if (today > end) { status = 'Past'; statusStyle = 'background:var(--gray-xlight);color:var(--gray-mid);'; }
    else { status = 'Current'; statusStyle = 'background:var(--accent);color:white;'; }

    html += `<div class="manage-row" onclick="openLevel2(${trip.id})">
      <div style="flex:1;min-width:0;">
        <div class="manage-row-title">${trip.name}</div>
        <div class="manage-row-sub">${start ? `${fmt(start)} – ${fmt(end)} · ${dates.length} days` : 'Import itinerary to get started'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px;">
        <span style="font-size:10px;letter-spacing:0.05em;text-transform:uppercase;padding:3px 9px;border-radius:20px;white-space:nowrap;${statusStyle}">${status}</span>
        <span class="manage-chevron">›</span>
      </div>
    </div>`;
  });
  html += `</div>`;
  el.innerHTML = html;
}

export function navigateDay(dir) {
  const allKeys = getAllDays().map(d => d.date);
  const idx = allKeys.indexOf(getViewedKey());
  if (idx === -1) {
    if (dir > 0 && allKeys.length) { setViewedKey(allKeys[0]); renderHome(getViewedKey()); }
    return;
  }
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= allKeys.length) return;
  setViewedKey(allKeys[newIdx]);
  renderHome(getViewedKey());
}

// ─────────────────────────────────────────
// TRIPS SUMMARY
// ─────────────────────────────────────────
export function filterSummary(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#summary-content .summary-trip-section').forEach(section => {
    const cards = section.querySelectorAll('.trip-card');
    let anyVisible = false;
    cards.forEach(card => {
      const show = !q || card.textContent.toLowerCase().includes(q);
      card.style.display = show ? '' : 'none';
      if (show) anyVisible = true;
    });
    section.style.display = (!q || anyVisible) ? '' : 'none';
  });
}

export function buildMonth(name, year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const offset = (firstDay === 0) ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const DOWS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
    let html = `<div class="cal-month"><div class="cal-month-name">${name}</div><div class="cal-grid">`;
    DOWS.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });
    for (let i = 0; i < offset; i++) html += `<div class="cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const day = dayMap[key];
      let cls = 'cal-day';
      let tag = '';
      if (!day) cls += ' inactive';
      else if (day.type === 'travel') { cls += ' transit'; tag = day.location ? day.location.split(' - ')[0].substring(0,3).toUpperCase() : 'TRV'; }
      else { cls += ' trip'; tag = day.location ? day.location.substring(0,3).toUpperCase() : ''; }
      if (key === today) cls += ' today-dot';
      html += `<div class="${cls}"><span class="day-num">${d}</span>${tag?`<span class="day-tag">${tag}</span>`:''}`;
      html += `</div>`;
    }
    html += `</div></div>`;
    return html;
  }

// ─────────────────────────────────────────
// TRAVEL LEGS RENDERER
// ─────────────────────────────────────────
export function renderTravelLegs(legs) {
  if (!legs || !legs.length) return '';
  return legs.map((leg, i) => {
    const isLast = i === legs.length - 1;
    const duration = leg.dep_time && leg.arr_time ? calcDuration(leg.dep_time, leg.arr_time) : null;
    const arrDisplay = leg.arr_note ? `${leg.arr_time} (${leg.arr_note})` : (leg.arr_time || '');
    const refs = [leg.carrier, leg.ref, leg.ref_code ? `#${leg.ref_code}` : null].filter(Boolean);
    return `<div style="margin-bottom:${isLast?'0':'1rem'};padding-bottom:${isLast?'0':'1rem'};${isLast?'':'border-bottom:1px solid var(--gray-xlight);'}">
      ${leg.from_city && leg.to_city ? `<div class="travel-route">${leg.from_city} → ${leg.to_city}</div>` : ''}
      ${(leg.dep_time || leg.arr_time) ? `<div class="travel-times">${leg.dep_time||''}${leg.dep_time&&leg.arr_time?' – ':''}${arrDisplay}${duration?`<span style="color:var(--gray-mid);margin-left:10px;">${duration}</span>`:''}</div>` : ''}
      ${refs.length ? `<div class="travel-ref">${refs.join('  ')}</div>` : ''}
      ${leg.note ? `<div class="travel-note">${leg.note}</div>` : ''}
    </div>`;
  }).join('');
}

export function saveJournalEntry(date, tripId, content) {
  const k = `${tripId}-${date}`;
  setCacheJournal(k, content);
  clearJournalTimer();
  _journalTimer = setTimeout(() => {
    api('POST', `/api/journal/${tripId}/${date}`, { content });
  }, 800);
}

export function updateDestClock() {
  const el = document.getElementById('dest-clock');
  if (!el) return;
  const city = getDestCity();
  const tz = getDestTZ(city);
  if (!tz || !city) { el.style.display = 'none'; return; }
  const local = toKey(new Date());
  const destDate = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const time = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const isDiff = destDate !== local;
  el.style.display = 'block';
  el.textContent = isDiff ? `${city.split(' ')[0]} ${time}` : `${city.split(' ')[0]} ${time}`;
}

// ─────────────────────────────────────────
// DESTINATION CLOCK
// ─────────────────────────────────────────
export function getDestCity() {
  const today = toKey(new Date());
  const current = getAllDays().find(d => d.date === today);
  if (current) return current.location;
  const tripStart = getFirstTripDay();
  const tripEnd = getLastTripDay();
  if (tripStart && today < tripStart) {
    // find first city
    const first = getAllDays().find(d => d.type === 'arrive' || d.type === 'stay');
    return first ? first.location : null;
  }
  return null;
}

export function getDestTZ(city) {
  if (!city) return null;
  const data = CITY_DATA[city];
  if (data) return data.tz;
  // Try matching partial
  for (const [k, v] of Object.entries(CITY_DATA)) {
    if (city.includes(k) || k.includes(city)) return v.tz;
  }
  return null;
}
