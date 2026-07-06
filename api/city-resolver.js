// api/city-resolver.js — resolve a city name to structured data via Google.
//
// Returns candidate matches (name, country, admin region, lat/lng, timezone)
// so the caller can disambiguate "Paris, France" vs "Paris, Texas".
//
// Uses Places Text Search (with a locality bias) for candidates, then the
// Time Zone API for the timezone of the chosen lat/lng.

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';

const CITY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
].join(',');

function pickComponent(components, type) {
  if (!Array.isArray(components)) return null;
  const hit = components.find(c => (c.types || []).includes(type));
  return hit ? (hit.longText || hit.long_name || null) : null;
}

/**
 * Search for city candidates. Returns up to `max` matches.
 * @param {string} query e.g. "Paris" or "Portland, United States"
 */
async function searchCities(query, max = 5) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY not set');
  if (!query || !query.trim()) throw new Error('query required');

  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': CITY_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query.trim(),
      maxResultCount: max,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Places error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const places = data.places || [];

  return places.map(p => ({
    google_place_id: p.id,
    name: p.displayName && p.displayName.text ? p.displayName.text : null,
    formatted: p.formattedAddress || null,
    country: pickComponent(p.addressComponents, 'country'),
    region: pickComponent(p.addressComponents, 'administrative_area_level_1'),
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
  }));
}

/**
 * Get IANA timezone for a lat/lng via Google Time Zone API.
 */
async function lookupTimezone(lat, lng) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const ts = Math.floor(Date.now() / 1000);
  const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.timeZoneId || null; // e.g. "Europe/Paris"
  } catch {
    return null;
  }
}

/**
 * Full resolve: search + attach timezone to each candidate's coords.
 * For pickers we resolve timezone lazily (only for the chosen one) to save
 * calls, but expose a helper that does the top match end-to-end for CSV import.
 */
async function resolveTopCity(query) {
  const candidates = await searchCities(query, 1);
  if (!candidates.length) return null;
  const top = candidates[0];
  top.timezone = await lookupTimezone(top.lat, top.lng);
  return top;
}

module.exports = { searchCities, lookupTimezone, resolveTopCity };
