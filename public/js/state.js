// STATE.JS — Summer Holiday / Lola v0.3
import { api } from './api.js';


// ─── State variables ───────────────────────
export let _tripsData = {}; // keyed by trip id: { 1: {days,legs}, 2: {days,legs} }
export let _cache = { links: {}, notes: {}, journal: {} };
export let _currentTripId = null;
export let _currentCity = null;
export let _viewedKey = null;
let _viewedTripId = null;
export let _selectedPlanTripId = null;
export let _planMode = 'update';
export let _settingsOpen = false;
export let _allTrips = [];
let _journalTimer = null;
const API_TOKEN = () => localStorage.getItem('lola_token');

// Get all days across all trips, sorted by date
export function getAllDays() {
  return Object.entries(_tripsData).flatMap(([tripId, td]) =>
    td.days.map(d => ({ ...d, tripId: parseInt(tripId) }))
  ).sort((a, b) => a.date.localeCompare(b.date));
}

export function getDayData(key, tripId) {
  if (tripId) return getTripData(tripId).days.find(d => d.date === key) || null;
  // Search all trips
  for (const td of Object.values(_tripsData)) {
    const day = td.days.find(d => d.date === key);
    if (day) return day;
  }
  return null;
}

export function getDayTripId(key) {
  for (const [tripId, td] of Object.entries(_tripsData)) {
    if (td.days.find(d => d.date === key)) return parseInt(tripId);
  }
  return null;
}

export function getLegsForDay(dayId, tripId) {
  const legs = tripId ? getTripData(tripId).legs : Object.values(_tripsData).flatMap(td => td.legs);
  return legs.filter(l => l.day_id === dayId).sort((a,b) => a.sort_order - b.sort_order);
}

export function getTodayKey() {
  const today = toKey(new Date());
  return getAllDays().find(d => d.date === today) ? today : null;
}

export function getFirstTripDay() {
  const all = getAllDays();
  return all.length ? all[0].date : null;
}

export function getLastTripDay() {
  const all = getAllDays();
  return all.length ? all[all.length - 1].date : null;
}

// Get trip data for a specific trip
export function getTripData(tripId) {
  return _tripsData[tripId] || { days: [], legs: [] };
}

// ─────────────────────────────────────────
// TRIP DATA — load from API
// ─────────────────────────────────────────
export async function loadTripData(tripId) {
  const data = await api('GET', `/api/trips/${tripId}`);
  if (!data || !data.days) return;
  _tripsData[tripId] = {
    days: data.days.map(d => ({ ...d, date: d.date.substring(0, 10) })),
    legs: data.legs || []
  };
}

export async function loadAllTripsData() {
  await Promise.all(_allTrips.map(t => loadTripData(t.id)));
}

// ─────────────────────────────────────────
// PLAN VIEW
// ─────────────────────────────────────────
export async function loadUserTrips() {
  const data = await api('GET', '/api/trips');
  _allTrips = (data && data.trips) ? data.trips : [];
}

// ─────────────────────────────────────────
// CITY CACHE — API-backed
// ─────────────────────────────────────────
export async function loadCityLinks(tripId, city) {
  const k = cacheKey(tripId, city);
  const data = await api('GET', `/api/links/${tripId}/${encodeURIComponent(city)}`);
  _cache.links[k] = (data && data.links) ? data.links.map(l => ({...l, _id: String(l.id), type:'link'})) : [];
  return _cache.links[k];
}

export async function loadCityNote(tripId, city) {
  const k = cacheKey(tripId, city);
  const data = await api('GET', `/api/notes/${tripId}/${encodeURIComponent(city)}`);
  _cache.notes[k] = (data && data.note) ? data.note.content : '';
  return _cache.notes[k];
}

export async function preloadCityData() {
  const promises = [];
  for (const [tripId, td] of Object.entries(_tripsData)) {
    const stayDays = td.days.filter(d => d.type === 'stay' || d.type === 'arrive');
    const cities = [...new Set(stayDays.map(d => d.location).filter(Boolean))];
    cities.forEach(city => {
      promises.push(loadCityLinks(parseInt(tripId), city));
      promises.push(loadCityNote(parseInt(tripId), city));
    });
  }
  await Promise.all(promises);
  renderSummary();
  renderManageList();
}


// ─── Languages ─────────────────────────────
export let LANGUAGES = {};

export async function loadLanguages() {
  try {
    const res = await fetch('/languages.json');
    LANGUAGES = await res.json();
  }