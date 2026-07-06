// =============================================================
// places-lookup.js
//
// Single-purpose wrapper around Google Places API (New) Text Search.
// Given a place name and (optionally) a city, returns the top match
// from Google as a structured object, or null if nothing matches.
//
// This file is PURE — no DB reads or writes. Callers handle storage.
// Job 4 (places-resolver.js) wraps this and persists to the places table.
//
// Field selection (X-Goog-FieldMask): id, displayName, shortFormattedAddress,
// location, primaryType. All Basic SKU — single billable call per lookup.
//
// Pricing context: free tier covers 10,000 Text Search calls/month.
// At kit's scale (5–10 users, ~100 captures/month each) we're nowhere
// near the limit.
// =============================================================

const GOOGLE_PLACES_TEXTSEARCH_URL =
  'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.shortFormattedAddress',
  'places.location',
  'places.primaryType',
  // Enterprise-tier fields. Free under the $200/mo Google credit at our volume.
  // To revert to Pro-tier pricing, remove the two lines below.
  'places.websiteUri',
  'places.internationalPhoneNumber',
].join(',');

/**
 * Convert Google's snake_case primary_type to a title-cased label for search.
 *   "hamburger_restaurant" -> "Hamburger Restaurant"
 *   "book_store"           -> "Book Store"
 *   "point_of_interest"    -> "Point Of Interest"
 * Returns null for falsy input.
 */
function formatPrimaryTypeLabel(snake) {
  if (!snake || typeof snake !== 'string') return null;
  return snake
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Look up a place via Google Places (New) Text Search.
 *
 * @param {object} opts
 * @param {string} opts.name - the venue / place name (e.g. "Della Terra")
 * @param {string} [opts.city] - bound city name to append to the query (e.g. "Bali"). Optional.
 * @returns {Promise<object|null>} structured place data, or null if no match
 * @throws {Error} on API errors (network, non-200 response, malformed JSON)
 */
async function lookupPlace({ name, city, lat, lng } = {}) {
  if (!name || !String(name).trim()) {
    throw new Error('lookupPlace: name is required');
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('lookupPlace: GOOGLE_PLACES_API_KEY env var not set');
  }

  // Build the text query. Bound city, if present, is concatenated to help
  // Google disambiguate ("Della Terra Bali" beats "Della Terra" alone).
  const textQuery = city && String(city).trim()
    ? `${String(name).trim()} ${String(city).trim()}`
    : String(name).trim();

  const body = {
    textQuery,
    maxResultCount: 1,
  };
  if (typeof lat === 'number' && typeof lng === 'number') {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 200 } };
  }

  let response;
  try {
    response = await fetch(GOOGLE_PLACES_TEXTSEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network failure, DNS, etc.
    throw new Error(`lookupPlace network error: ${err.message}`);
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(
      `lookupPlace HTTP ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`lookupPlace JSON parse failed: ${err.message}`);
  }

  // No places key, or empty array → legitimate "not found" result.
  // Callers should treat this as a normal outcome (e.g. set google_lookup_status='not_found'),
  // not as an error.
  if (!data.places || !Array.isArray(data.places) || data.places.length === 0) {
    return null;
  }

  const top = data.places[0];

  // Defensive shape-checks: Google should always include id, but the rest
  // could be missing depending on the place. We tolerate null on non-id fields.
  if (!top.id) {
    throw new Error('lookupPlace: response missing places[0].id');
  }

  const primary_type = top.primaryType || null;

  return {
    google_place_id:    top.id,
    name:               top.displayName && top.displayName.text ? top.displayName.text : null,
    address:            top.shortFormattedAddress || null,
    lat:                top.location && typeof top.location.latitude === 'number'  ? top.location.latitude  : null,
    lng:                top.location && typeof top.location.longitude === 'number' ? top.location.longitude : null,
    primary_type,
    primary_type_label: formatPrimaryTypeLabel(primary_type),
    // Enterprise-tier fields (see FIELD_MASK note). Null if unavailable.
    website:            top.websiteUri || null,
    phone:              top.internationalPhoneNumber || null,
  };
}

module.exports = { lookupPlace, formatPrimaryTypeLabel };
