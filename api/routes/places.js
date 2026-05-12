// =============================================================
// places.js — routes for the new canonical places table.
//
// DO NOT confuse with the old `places` table (now `blackbook`).
// This route serves the NEW places table, created in Job 2,
// populated by the Google Places resolver (Jobs 3-4), wired
// into capture pipeline in Job 5.
//
// Mounted at /api/places.
//
// V1 surface (minimal):
//   GET    /api/places/:id           — fetch a single place row
//   POST   /api/admin/resolve-place  — admin: trigger resolver for a name + city_id
//                                       (mounted at /api/places/_admin/resolve)
// =============================================================

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../auth');
const { resolveOrCreatePlace } = require('../places-resolver');

// GET /api/places/:id — fetch a single place by id (authenticated read)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS city_name, c.country AS city_country, c.slug AS city_slug
         FROM places p
         LEFT JOIN cities c ON p.city_id = c.id
        WHERE p.id = $1
        LIMIT 1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Place not found' });
    res.json({ place: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/places/_admin/resolve
// Admin-only endpoint to manually resolve a name + city through the Google
// Places resolver. Used for testing matches, fixing bad rows, and one-offs.
// Body: { name: "Dumbo", city_id: 12 } (city_id optional)
// Returns: { place_id, place: {...} } on match, { place_id: null } on no-match.
router.post('/_admin/resolve', authenticate, requireAdmin, async (req, res) => {
  const { name, city_id } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name required' });
  }

  try {
    // Resolve city name if city_id provided (the resolver uses cityName for
    // Google's query text and cityId for the places.city_id FK)
    let cityName = null;
    if (city_id) {
      const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [city_id]);
      if (r.rows[0]) cityName = r.rows[0].name;
    }

    const placeId = await resolveOrCreatePlace({ name, cityId: city_id || null, cityName });
    if (!placeId) {
      return res.json({ place_id: null, place: null, note: 'Google returned no match' });
    }

    // Fetch the resolved row for the response (helpful for admin to verify the match)
    const row = await pool.query(
      `SELECT p.*, c.name AS city_name, c.country AS city_country
         FROM places p
         LEFT JOIN cities c ON p.city_id = c.id
        WHERE p.id = $1
        LIMIT 1`,
      [placeId]
    );
    res.json({ place_id: placeId, place: row.rows[0] || null });
  } catch (err) {
    console.error('admin resolve-place', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
