// APP.JS — Summer Holiday / Lola v0.3
import { toKey } from './util.js';
import { _allTrips, LANGUAGES, loadLanguages, loadUserTrips, loadAllTripsData, preloadCityData } from './state.js';
import { renderHome, renderSummary, renderCalendar, renderManageList, updateDestClock } from './trips.js';
import { renderPlanView } from './plan.js';
import { snakeInit } from './snake.js';


// ─── App state ─────────────────────────────
const TRIP_ID = 1;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
export async function init() {
  await Promise.all([loadLanguages(), loadUserTrips()]);
  await loadAllTripsData();
  const key = getTodayKey() || toKey(new Date());
  renderHome(key);
  renderSummary();
  renderCalendar();
  renderManageList();
  renderLingo();
  updateDestClock();
  preloadCityData();
}

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────
export function showView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  if (btn) btn.classList.add('active');
  document.body.style.overflow = '';
  // Close any open panels
  ['trips-level-2','trips-level-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') {
      el.style.transform = 'translateX(100%)';
      setTimeout(() => el.style.display = 'none', 280);
    }
  });
  if (name === 'idle') snakeInit();
}

export function switchTripsView(name) {
  ['summary','cal','manage','plan'].forEach(v => {
    document.getElementById('trips-' + v).style.display = v === name ? 'block' : 'none';
    document.getElementById('tab-' + v).classList.toggle('active', v === name);
  });
  if (name === 'plan') renderPlanView();
}

export function switchExploreView(name) {
  document.getElementById('explore-recs').style.display = name === 'recs' ? 'block' : 'none';
  document.getElementById('explore-speak').style.display = name === 'speak' ? 'block' : 'none';
  document.getElementById('tab-recs').classList.toggle('active', name === 'recs');
  document.getElementById('tab-speak').classList.toggle('active', name === 'speak');
}

// ─────────────────────────────────────────
// THEME
// ─────────────────────────────────────────
export function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const toggle = document.getElementById('dark-toggle');
  const knob = document.getElementById('dark-toggle-knob');
  if (toggle) toggle.style.background = dark ? 'var(--accent)' : 'var(--gray-xlight)';
  if (knob) knob.style.transform = dark ? 'translateX(20px)' : 'translateX(0)';
}

export function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  localStorage.setItem('lola_theme', !isDark ? 'dark' : 'light');
  applyTheme(!isDark);
}

// ─────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────
export function toggleSettings() {
  _settingsOpen = !_settingsOpen;
  const panel = document.getElementById('settings-panel');
  if (_settingsOpen) {
    populateSettingsUser();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
    panel.style.display = 'block';
    requestAnimationFrame(() => panel.style.transform = 'translateY(0)');
  } else {
    panel.style.transform = 'translateY(100%)';
    setTimeout(() => panel.style.display = 'none', 300);
  }
}

export function populateSettingsUser() {
  const user = JSON.parse(localStorage.getItem('lola_user') || '{}');
  const nameEl = document.getElementById('settings-user-name');
  const emailEl = document.getElementById('settings-user-email');
  if (nameEl) nameEl.textContent = user.name || 'Your account';
  if (emailEl) emailEl.textContent = user.email || '';
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
export function logout() {
  localStorage.removeItem('lola_token');
  localStorage.removeItem('lola_user');
  window.location.href = '/';
}

export function renderLingo(override) {
  const lang = override || detectLanguage();
  const langData = LANGUAGES[lang];
  const switcher = document.getElementById('local-lang-switcher');
  const content = document.getElementById('local-content');

  if (switcher) {
    const available = Object.keys(LANGUAGES).filter(k => LANGUAGES[k]);
    switcher.innerHTML = available.map(k =>
      `<button class="lang-pill${k === lang ? ' active' : ''}" onclick="renderLingo('${k}')">${LANGUAGES[k]?.name || k}</button>`
    ).join('');
  }

  if (!content) return;
  if (!langData) {
    content.innerHTML = `<div style="padding:1rem 0;font-size:14px;color:var(--gray-mid);">No phrases available for this language yet.</div>`;
    return;
  }

  const cats = [...new Set(langData.phrases.map(p => p.cat))];
  let html = '';
  cats.forEach(cat => {
    html += `<div style="font-size:10px;letter-spacing:0.09em;text-transform:uppercase;color:var(--gray-mid);margin:1.5rem 0 0.25rem;padding-top:0.5rem;border-top:1px solid var(--gray-xlight);">${cat}</div>`;
    langData.phrases.filter(p => p.cat === cat).forEach((p, i) => {
      const id = `phrase-${cat}-${i}`;
      html += `<div class="local-phrase" onclick="togglePhonetic('${id}')">
        <div class="local-phrase-top">
          <span class="local-phrase-local">${p.local}</span>
          <span class="local-phrase-toggle">+</span>
        </div>
        <div class="local-phrase-english">${p.english}</div>
        <div class="local-phrase-phonetic" id="${id}">${p.phonetic}</div>
      </div>`;
    });
  });
  content.innerHTML = html;
}

// ─────────────────────────────────────────
// LANGUAGE / DISCOVER
// ─────────────────────────────────────────
export function detectLanguage() {
  const today = toKey(new Date());
  const current = getAllDays().find(d => d.date === today);
  if (current) {
    const data = CITY_DATA[current.location];
    if (data && data.lang) return data.lang;
  }
  // Default to France (first city)
  return 'France';
}

export function togglePhonetic(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isShown = el.style.display === 'block';
  el.style.display = isShown ? 'none' : 'block';
  const toggle = el.closest('.local-phrase')?.querySelector('.local-phrase-toggle');
  if (toggle) toggle.textContent = isShown ? '+' : '−';
}
}
