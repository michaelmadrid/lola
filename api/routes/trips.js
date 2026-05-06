const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// GET /api/trips — list user's trips
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*
       FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE tm.user_id = $1
       ORDER BY COALESCE(t.date_start, t.created_at) DESC`,
      [req.user.id]
    );
    res.json({ trips: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/active — what trip (if any) covers today's date for this user
router.get('/active', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*
       FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE tm.user_id = $1
         AND t.date_start IS NOT NULL
         AND t.date_end IS NOT NULL
         AND CURRENT_DATE BETWEEN t.date_start AND t.date_end
       ORDER BY t.date_start
       LIMIT 1`,
      [req.user.id]
    );
    res.json({ trip: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:id — single trip with segments and city join
router.get('/:id', authenticate, async (req, res) => {
  try {
    const trip = await pool.query(
      `SELECT t.*
       FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE t.id = $1 AND tm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

    const segments = await pool.query(
      `SELECT s.*,
              c.name AS city_name,
              c.country AS city_country,
              c.slug AS city_slug
       FROM trip_segments s
       LEFT JOIN cities c ON s.city_id = c.id
       WHERE s.trip_id = $1
       ORDER BY s.sort_order ASC, s.date_start ASC NULLS LAST`,
      [req.params.id]
    );

    res.json({ trip: trip.rows[0], segments: segments.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips — create
router.post('/', authenticate, async (req, res) => {
  const { name, date_start, date_end, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const slug = slugify(name);
    const tripResult = await pool.query(
      `INSERT INTO trips (name, slug, date_start, date_end, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, slug, date_start || null, date_end || null, notes || null, req.user.id]
    );
    const trip = tripResult.rows[0];
    await pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)`,
      [trip.id, req.user.id, 'owner']
    );
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id — edit
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    const allowed = ['name', 'date_start', 'date_end', 'notes', 'slug'];
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

    const result = await pool.query(
      `UPDATE trips SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ trip: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const member = await pool.query(
      `SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2 AND role = 'owner'`,
      [req.params.id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    // ON DELETE CASCADE handles trip_segments, trip_members, notes (with trip_id), saves' trip_id (set null).
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================
// SEGMENTS (nested under trips)
// ===========================================================

// POST /api/trips/:tripId/segments — add segment to trip
router.post('/:tripId/segments', authenticate, async (req, res) => {
  const { tripId } = req.params;
  const { city_id, region_label, date_start, date_end, sort_order, notes } = req.body;

  if (!city_id && !region_label) {
    return res.status(400).json({ error: 'Either city_id or region_label required' });
  }
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    const result = await pool.query(
      `INSERT INTO trip_segments (trip_id, city_id, region_label, date_start, date_end, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tripId, city_id || null, region_label || null,
       date_start || null, date_end || null, sort_order || 0, notes || null]
    );
    res.json({ segment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:tripId/segments/:segmentId — edit segment
router.patch('/:tripId/segments/:segmentId', authenticate, async (req, res) => {
  const { tripId, segmentId } = req.params;
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    const allowed = ['city_id', 'region_label', 'date_start', 'date_end', 'sort_order', 'notes'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        updates.push(`${key} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(segmentId);
    params.push(tripId);

    const result = await pool.query(
      `UPDATE trip_segments SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND trip_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Segment not found' });
    res.json({ segment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:tripId/segments/:segmentId
router.delete('/:tripId/segments/:segmentId', authenticate, async (req, res) => {
  const { tripId, segmentId } = req.params;
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    await pool.query('DELETE FROM trip_segments WHERE id = $1 AND trip_id = $2', [segmentId, tripId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
