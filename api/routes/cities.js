const router = require('express').Router();
const pool = require('../db');
const { authenticate, softAuthenticate } = require('../auth');
const { searchCities, lookupTimezone } = require('../city-resolver');

// Refresh spots' city cache after CRUD on cities
let _spotsRefresh = null;
function refreshSpotsCache() {
  if (_spotsRefresh === null) {
    try { _spotsRefresh = require('./spots').refreshCitiesCache; } catch (e) { _spotsRefresh = () => {}; }
  }
  try { _spotsRefresh && _spotsRefresh(); } catch (e) {}
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// GET /api/cities — list cities
//
// DEFAULT BEHAVIOR (Job 9, May 14 2026): returns ONLY featured (status=3) cities.
// This is the safe default for user-facing pickers (capture, settings, trip,
// guides, jetlag, time). Per the strict cities policy (Job 0.5), only admin-
// curated cities should appear in user-facing surfaces.
//
// Admin pages MUST opt in to see all cities by passing ?include_all=true.
// Currently only public/js/admin-cities.js uses this.
//
// Optional query params:
//   ?country=France
//   ?parent_id=89  (for neighborhoods)
//   ?search=par   (name LIKE)
//   ?include_all=true  (admin-only: bypass the featured filter; returns all statuses)
//   ?status=1|2|3      (admin-only: explicit status filter; takes precedence over include_all default)
router.get('/', softAuthenticate, async (req, res) => {
  try {
    const { country, parent_id, search, include_all, status } = req.query;
    let sql = `
      SELECT c.*,
             p.name as parent_name
      FROM cities c
      LEFT JOIN cities p ON c.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];

    // Status filter logic:
    //   - explicit ?status=N → filter to that status only
    //   - ?include_all=true → no status filter (admin)
    //   - default → status = 3 (featured only — the safe default for users)
    if (status !== undefined && status !== '') {
      params.push(parseInt(status, 10));
      sql += ` AND c.status = $${params.length}`;
    } else if (include_all !== 'true') {
      sql += ` AND c.status = 3`;
    }

    if (country) {
      params.push(country);
      sql += ` AND c.country = $${params.length}`;
    }
    if (parent_id !== undefined) {
      if (parent_id === 'null' || parent_id === '') {
        sql += ` AND c.parent_id IS NULL`;
      } else {
        params.push(parent_id);
        sql += ` AND c.parent_id = $${params.length}`;
      }
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND c.name ILIKE $${params.length}`;
    }
    sql += ` ORDER BY c.name`;
    const result = await pool.query(sql, params);
    res.json({ cities: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cities/:idOrSlug — single city by id or slug
// No status filter: looking up a specific city by ID (or slug) is intentional.
// If a user has a saved reference to a city that later gets demoted from featured,
// they should still be able to read its name/details.
router.get('/:idOrSlug', softAuthenticate, async (req, res) => {
  const { idOrSlug } = req.params;
  try {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const sql = isNumeric
      ? `SELECT c.*, p.name as parent_name FROM cities c LEFT JOIN cities p ON c.parent_id = p.id WHERE c.id = $1`
      : `SELECT c.*, p.name as parent_name FROM cities c LEFT JOIN cities p ON c.parent_id = p.id WHERE c.slug = $1`;
    const result = await pool.query(sql, [idOrSlug]);
    if (!result.rows[0]) return res.status(404).json({ error: 'City not found' });
    res.json({ city: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cities — create
//
// PARKED TODO: this endpoint is currently authenticated but not admin-gated, which
// means user-facing flows (trip.js, capture.js) can create cities at the default
// status=1, contradicting the strict cities policy from Job 0.5. Lock down to
// admin-only when admin city triage UI lands (Job 8). Until then, the new
// status=1 cities will at least not appear in user-facing pickers (Job 9), so
// they're effectively invisible orphans rather than active pollution.
// GET /api/cities/resolve?q=Paris — Google candidates for disambiguation
router.get('/resolve', authenticate, async (req, res) => {
  try {
    const candidates = await searchCities(req.query.q || '', 5);
    res.json({ candidates });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/cities/timezone?lat=..&lng=.. — IANA tz for coords
router.get('/timezone', authenticate, async (req, res) => {
  try {
    const tz = await lookupTimezone(parseFloat(req.query.lat), parseFloat(req.query.lng));
    res.json({ timezone: tz });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', authenticate, async (req, res) => {
  const { name, country, parent_id, is_region, lat, lon, timezone, region, language, status, google_place_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const slug = slugify(name);
    const result = await pool.query(
      `INSERT INTO cities (name, slug, country, parent_id, is_region, lat, lon, timezone, region, language, status, google_place_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [name, slug, country || null, parent_id || null, !!is_region,
       lat || null, lon || null, timezone || null, region || null, language || null,
       status || 1, google_place_id || null]
    );
    refreshSpotsCache();
    res.json({ city: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'City with this name or slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cities/:id — edit (admin tooling currently uses this for status promotion too)
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['name', 'country', 'parent_id', 'is_region', 'lat', 'lon', 'timezone', 'region', 'language', 'slug', 'status'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE cities SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'City not found' });
    refreshSpotsCache();
    res.json({ city: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cities/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM cities WHERE id = $1', [req.params.id]);
    refreshSpotsCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
