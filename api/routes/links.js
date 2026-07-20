// api/routes/links.js
//
// Note ↔ Spot relationships (bidirectional). Backed by note_spot_links
// (migration 045). All admin-guarded (authenticate + role check),
// matching the rest of the studio API.
//
// Mounted at /api/links in server.js:
//   app.use('/api/links', require('./api/routes/links'));

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../auth');

function requireAdmin(req, res) {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return false; }
  return true;
}

// GET /api/links/note/:noteId — spots related to a note
router.get('/note/:noteId', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.place_name, s.city_id, c.name AS city,
              s.website, s.url, s.google_place_id,
              l.source, l.created_at
       FROM note_spot_links l
       JOIN spots s ON s.id = l.spot_id
       LEFT JOIN cities c ON c.id = s.city_id
       WHERE l.note_id = $1
       ORDER BY l.created_at DESC`,
      [req.params.noteId]
    );
    res.json({ spots: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/links/spot/:spotId — notes related to a spot
router.get('/spot/:spotId', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bn.id, bn.headline, bn.type, bn.image_url, bn.status,
              l.source, l.created_at
       FROM note_spot_links l
       JOIN board_notes bn ON bn.id = l.note_id
       WHERE l.spot_id = $1
       ORDER BY l.created_at DESC`,
      [req.params.spotId]
    );
    res.json({ notes: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/links — create a link. Body: { note_id, spot_id, source? }
router.post('/', authenticate, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const noteId = parseInt(req.body.note_id, 10);
  const spotId = parseInt(req.body.spot_id, 10);
  const source = ['manual', 'url_match', 'suggested'].includes(req.body.source) ? req.body.source : 'manual';
  if (!noteId || !spotId) return res.status(400).json({ error: 'note_id and spot_id required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO note_spot_links (note_id, spot_id, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (note_id, spot_id) DO UPDATE SET source = EXCLUDED.source
       RETURNING *`,
      [noteId, spotId, source]
    );
    res.json({ link: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/links?note_id=&spot_id= — remove a link (ids in query,
// since the client's api.delete sends no body)
router.delete('/', authenticate, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const noteId = parseInt(req.query.note_id, 10);
  const spotId = parseInt(req.query.spot_id, 10);
  if (!noteId || !spotId) return res.status(400).json({ error: 'note_id and spot_id required' });
  try {
    await pool.query(
      `DELETE FROM note_spot_links WHERE note_id = $1 AND spot_id = $2`,
      [noteId, spotId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/links/search-spots?q= — spot search for the picker (name + city)
router.get('/search-spots', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ spots: [] });
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.place_name, c.name AS city
       FROM spots s
       LEFT JOIN cities c ON c.id = s.city_id
       WHERE s.place_name ILIKE $1 OR c.name ILIKE $1
       ORDER BY s.place_name ASC
       LIMIT 20`,
      ['%' + q + '%']
    );
    res.json({ spots: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/links/search-notes?q= — note search for the spot editor's picker
router.get('/search-notes', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ notes: [] });
  try {
    const { rows } = await pool.query(
      `SELECT id, headline, type, image_url, status
       FROM board_notes
       WHERE deleted_at IS NULL AND headline ILIKE $1
       ORDER BY headline ASC
       LIMIT 20`,
      ['%' + q + '%']
    );
    res.json({ notes: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
