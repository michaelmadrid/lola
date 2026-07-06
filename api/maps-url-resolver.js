// api/maps-url-resolver.js — paste a Google Maps URL, get back a
// resolved place ready to attach to a spot.
//
// Handles: full google.com/maps/place/... URLs, short maps.app.goo.gl
// links (follows the redirect), and bare coordinate URLs.
//
// Strategy: extract name (from /place/NAME/) and lat/lng (from @lat,lng)
// out of the URL, then run a biased Google Places Text Search using both —
// far more accurate than name alone.

const { lookupPlace } = require('./places-lookup');
const pool = require('./db');

async function expandShortUrl(url) {
  // maps.app.goo.gl and goo.gl links redirect — follow to get the real URL.
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url; // fall back to original if fetch fails
  }
}

function extractFromUrl(url) {
  let name = null, lat = null, lng = null;

  const placeMatch = url.match(/\/place\/([^/@]+)/);
  if (placeMatch) {
    name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
  }

  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
  }

  return { name, lat, lng };
}

/**
 * Resolve a pasted Google Maps URL to a places.id, upserting as needed.
 * @param {string} rawUrl
 * @param {number|null} cityId - optional, used only if creating a new places row
 * @returns {Promise<{placeId: number, name: string, address: string, lat: number, lng: number}>}
 */
async function resolveFromMapsUrl(rawUrl, cityId) {
  let url = String(rawUrl).trim();
  if (!url) throw new Error('No URL provided');

  if (url.includes('goo.gl')) {
    url = await expandShortUrl(url);
  }

  const { name, lat, lng } = extractFromUrl(url);
  if (!name) {
    throw new Error('Could not find a place name in that URL. Try pasting the full Google Maps link (not a shortened one), or a link from the "Share" button.');
  }

  const looked = await lookupPlace({ name, lat, lng });
  if (!looked) {
    throw new Error(`Google couldn't match "${name}" to a place.`);
  }

  const existing = await pool.query(
    `SELECT id FROM places WHERE google_place_id = $1 LIMIT 1`,
    [looked.google_place_id]
  );
  let placeId;
  if (existing.rows[0]) {
    placeId = existing.rows[0].id;
  } else {
    const inserted = await pool.query(
      `INSERT INTO places (google_place_id, name, address, lat, lng, primary_type, primary_type_label, city_id, last_synced_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (google_place_id) DO UPDATE SET last_synced_at = places.last_synced_at
       RETURNING id`,
      [looked.google_place_id, looked.name, looked.address, looked.lat, looked.lng, looked.primary_type, looked.primary_type_label, cityId || null]
    );
    placeId = inserted.rows[0].id;
  }

  return {
    placeId,
    google_place_id: looked.google_place_id,
    name: looked.name,
    address: looked.address,
    lat: looked.lat,
    lng: looked.lng,
  };
}

module.exports = { resolveFromMapsUrl };
