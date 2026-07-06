// =============================================================
// places-resolver.js
//
// Wraps places-lookup.js with DB persistence. The job: given a
// place name + bound city, either find the existing row in the
// `places` table (by google_place_id) or create one, and return
// its `places.id`.
//
// Idempotent: calling twice with the same Google match returns
// the same id and does NOT modify the existing row.
//
// Used by:
//   - api/routes/saves.js capture pipeline (Job 5, fire-and-forget after AI parse)
//   - api/routes/places.js admin endpoint (manual testing / one-off fixes)
//
// Contract:
//   resolveOrCreatePlace({ name, cityId, cityName })
//     → Promise<number|null>
//   Returns places.id on success, null if Google found no match.
//   Throws on DB errors or Google API errors (caller decides what to do).
// =============================================================

const pool = require('./db');
const { lookupPlace } = require('./places-lookup');

/**
 * Resolve a captured place name to a row in the `places` table.
 *
 * @param {object} opts
 * @param {string} opts.name - the venue / place name to look up
 * @param {number|string|null} [opts.cityId] - bound city id (FK), set on new rows
 * @param {string|null} [opts.cityName] - bound city name, concatenated into Google query
 * @returns {Promise<number|null>} places.id, or null if Google had no match
 * @throws on DB or Google API errors
 */
async function resolveOrCreatePlace({ name, cityId, cityName } = {}) {
  if (!name || !String(name).trim()) {
    throw new Error('resolveOrCreatePlace: name is required');
  }

  // 1. Ask Google. Returns structured object or null (no match).
  //    Throws on API/network errors — let it propagate so caller can log/handle.
  const looked = await lookupPlace({
    name: String(name).trim(),
    city: cityName ? String(cityName).trim() : null,
  });

  if (!looked) {
    // Legitimate "Google found nothing" result. Caller should treat
    // this as a normal outcome (set saves.google_lookup_status = 'not_found').
    return { id: null, website: null };
  }

  // 2. Check if we already have a row for this google_place_id.
  const existing = await pool.query(
    `SELECT id FROM places WHERE google_place_id = $1 LIMIT 1`,
    [looked.google_place_id]
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, website: looked.website || null };
  }

  // 3. New place. Insert with bound cityId (may be null if unbound capture).
  //    last_synced_at is set on creation since this is when we pulled fresh data.
  const cityIdInt = cityId ? parseInt(cityId, 10) : null;
  const inserted = await pool.query(
    `INSERT INTO places (
       google_place_id, name, address, lat, lng,
       primary_type, primary_type_label,
       city_id, last_synced_at, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (google_place_id) DO UPDATE
       SET last_synced_at = places.last_synced_at  -- no-op, but lets us RETURN id
     RETURNING id`,
    [
      looked.google_place_id,
      looked.name,
      looked.address,
      looked.lat,
      looked.lng,
      looked.primary_type,
      looked.primary_type_label,
      cityIdInt,
    ]
  );
  return { id: inserted.rows[0].id, website: looked.website || null };
}

module.exports = { resolveOrCreatePlace };
