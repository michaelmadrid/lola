const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

function extractTags(text) {
  const matches = String(text).match(/#[a-z0-9_-]+/gi) || [];
  return [...new Set(matches.map(t => t.toLowerCase().slice(1)))];
}

function extractFirstUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

// GET /api/saves — user's saves, newest first, optional filters
// Query params:
//   ?include_archived=true
//   ?tag=paris
//   ?trip_id=5
//   ?limit=30
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT s.*,
                      c.name AS city_name,
                      p.name AS place_name,
                      t.name AS trip_name
               FROM saves s
               LEFT JOIN cities c ON s.city_id = c.id
               LEFT JOIN places p ON s.place_id = p.id
               LEFT JOIN trips t ON s.trip_id = t.id
               WHERE s.user_id = $1`;
    const params = [req.user.id];

    if (req.query.include_archived !== 'true') {
      sql += ` AND s.archived_at IS NULL`;
    }
    if (req.query.tag) {
      params.push(req.query.tag);
      sql += ` AND $${params.length} = ANY(s.tags)`;
    }
    if (req.query.trip_id) {
      params.push(req.query.trip_id);
      sql += ` AND s.trip_id = $${params.length}`;
    }
    sql += ` ORDER BY s.created_at DESC`;

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ saves: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/saves — create a save. Auto-binds active trip if applicable.
router.post('/', authenticate, async (req, res) => {
  const { text, tags: explicitTags, url: explicitUrl, trip_id, city_id, place_id } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    // Auto-detect: if user is on a trip today and trip_id wasn't passed, bind it
    let resolvedTripId = trip_id || null;
    if (!resolvedTripId) {
      const active = await pool.query(
        `SELECT t.id FROM trips t
         JOIN trip_members tm ON t.id = tm.trip_id
         WHERE tm.user_id = $1
           AND t.date_start IS NOT NULL AND t.date_end IS NOT NULL
           AND CURRENT_DATE BETWEEN t.date_start AND t.date_end
         LIMIT 1`,
        [req.user.id]
      );
      if (active.rows[0]) resolvedTripId = active.rows[0].id;
    }

    const tags = explicitTags || extractTags(text);
    const url = explicitUrl || extractFirstUrl(text);

    const result = await pool.query(
      `INSERT INTO saves (user_id, text, tags, url, trip_id, city_id, place_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, text.trim(), tags, url, resolvedTripId, city_id || null, place_id || null]
    );
    res.json({ save: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/saves/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['text', 'tags', 'url', 'trip_id', 'city_id', 'place_id', 'archived_at'];
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
  params.push(req.user.id);
  try {
    const result = await pool.query(
      `UPDATE saves SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Save not found' });
    res.json({ save: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/saves/:id — hard delete (use PATCH with archived_at to soft-delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM saves WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
