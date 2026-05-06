const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

// GET /api/notes — list user's notes, filtered
// Query params (any combination):
//   ?date=2026-05-12
//   ?trip_id=5
//   ?segment_id=12
//   ?city_id=23
//   ?place_id=412
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT * FROM notes WHERE user_id = $1`;
    const params = [req.user.id];
    const filters = ['date', 'trip_id', 'segment_id', 'city_id', 'place_id'];
    for (const key of filters) {
      if (req.query[key] !== undefined) {
        params.push(req.query[key]);
        sql += ` AND ${key} = $${params.length}`;
      }
    }
    sql += ` ORDER BY COALESCE(date, created_at::date) DESC, created_at DESC`;
    const result = await pool.query(sql, params);
    res.json({ notes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Note not found' });
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes — create. At least one attachment required.
router.post('/', authenticate, async (req, res) => {
  const { content, date, trip_id, segment_id, city_id, place_id } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  if (!date && !trip_id && !segment_id && !city_id && !place_id) {
    return res.status(400).json({ error: 'At least one attachment required (date, trip_id, segment_id, city_id, or place_id)' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO notes (user_id, content, date, trip_id, segment_id, city_id, place_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, content, date || null, trip_id || null, segment_id || null, city_id || null, place_id || null]
    );
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/:id — edit content (attachments are immutable for now)
router.patch('/:id', authenticate, async (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'Content required' });
  try {
    const result = await pool.query(
      `UPDATE notes SET content = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [content, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Note not found' });
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
