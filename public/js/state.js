// STATE.JS — Summer Holiday / Lola v0.3
// All mutable app state lives here. Other modules import getters/setters.
// Nothing touches window directly.

import { api } from './api.js';

// ─── Private state ────────────────────────────────────────────────────────────
let _tripsData = {};
let _cache = { links: {}, notes: {}, journal: {} };
let _allTrips = [];
let _currentTripId = null;
let _currentCity = null;
let _viewedKey = null;
let _selectedPlanTripId = null;
let _planMode = 'update';
let _settingsOpen = false;
let _journalTimer = null;
export let LANGUAGES = {};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem('lola_token');
export const getUser = () => { try { return JSON.parse(localStorage.getItem('lola_user')); } catch { return null; } };
export const setToken = (t) => localStorage.setItem('lola_token', t);
export const setUser = (u) => localStorage.setItem('lola_user', JSON.stringify(u));
export const clearAuth = () => { localStorage.removeItem('lola_token'); localStorage.removeItem('lola_user'); };

// ─── State getters ────────────────────────────────────────────────────────────
export const getTripsData = () => _tripsData;
export const getCache = () => _cache;
export const getAllTrips = () => _allTrips;
export const getCurrentTripId = () => _currentTripId;
export const getCurrentCity = () => _currentCity;
export const getViewedKey = () => _viewedKey;
export const getSelectedPlanTripId = () => _selectedPlanTripId;
export const getPlanMode = () => _planMode;
export const getSettingsOpen = () => _settingsOpen;

// ─── State setters ────────────────────────────────────────────────────────────
export const setCurrentTripId = (v) => { _currentTripId = v; };
export const setCurrentCity = (v) => { _currentCity = v; };
export const setViewedKey = (v) => { _viewedKey = v; };
export const setSelectedPlanTripId = (v) => { _selectedPlanTripId = v; };
export const setPlanMode = (v) => { _planMode = v; };
export const setSettingsOpen = (v) => { _settingsOpen = v; };
export const setAllTrips = (v) => { _allTrips = v; };
export const setTripData = (tripId, data) => { _tripsData[tripId] = data; };
export const deleteTripData = (tripId) => { delete _tripsData[tripId]; };
export const filterAllTrips = (fn) => { _allTrips = _allTrips.filter(fn); };
export const pushTrip = (trip) => { _allTrips.push(trip); };
export const setCacheLinks = (key, val) => { _cache.links[key] = val; };
export const setCacheNote = (key, val) => { _cache.notes[key] = val; };
export const setCacheJournal = (key, val) => { _cache.journal[key] = val; };
export const clearJournalTimer = () => { clearTimeout(_journalTimer); };
export const setJournalTimer = (fn, ms) => { _journalTimer = setTimeout(fn, ms); };

// ─── Derived getters ──────────────────────────────────────────────────────────
export function getAllDays() {
  return Object.entries(_tripsData)
    .flatMap(([tripId, td]) => td.days.map(d => ({ ...d, tripId: parseInt(tripId) })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getTripData(tripId) {
  return _tripsData[tripId] || { days: [], legs: [] };
}

export function getDayData(key, tripId) {
  if (tripId) return getTripData(tripId).days.find(d => d.date === key) || null;
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
  const legs = tripId
    ? getTripData(tripId).legs
    : Object.values(_tripsData).flatMap(td => td.legs);
  return legs.filter(l => l.day_id === dayId).sort((a, b) => a.sort_order - b.sort_order);
}

export function getTodayKey() {
  const today = new Date().toISOString().split('T')[0];
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

// ─── Data loaders ─────────────────────────────────────────────────────────────
export async function loadTripData(tripId) {
  const data = await api('GET', '/api/trips/' + tripId);
  if (!data || !data.days) return;
  _tripsData[tripId] = {
    days: data.days.map(d => ({ ...d, date: d.date.substring(0, 10) })),
    legs: data.legs || []
  };
}

export async function loadAllTripsData() {
  await Promise.all(_allTrips.map(t => loadTripData(t.id)));
}

export async function loadUserTrips() {
  const data = await api('GET', '/api/trips');
  if (data && data.trips) _allTrips = data.trips;
}

export async function loadCityLinks(tripId, city) {
  const key = tripId + '-' + city;
  const data = await api('GET', '/api/links/' + tripId + '/' + encodeURIComponent(city));
  _cache.links[key] = data && data.links ? data.links : [];
  return _cache.links[key];
}

export async function loadCityNote(tripId, city) {
  const key = tripId + '-' + city;
  const data = await api('GET', '/api/notes/' + tripId + '/' + encodeURIComponent(city));
  _cache.notes[key] = data && data.note ? (data.note.content || data.note) : '';
  return _cache.notes[key];
}

export async function preloadCityData() {
  const promises = [];
  for (const [tripId, td] of Object.entries(_tripsData)) {
    const cities = [...new Set(
      td.days.filter(d => d.type === 'stay' || d.type === 'arrive')
             .map(d => d.location).filter(Boolean)
    )];
    cities.forEach(city => {
      promises.push(loadCityLinks(parseInt(tripId), city));
      promises.push(loadCityNote(parseInt(tripId), city));
    });
  }
  await Promise.all(promises);
}

export async function loadLanguages() {
  try {
    const res = await fetch('/languages.json');
    LANGUAGES = await res.json();
  } catch(e) {
    console.warn('Could not load languages.json');
  }
}
