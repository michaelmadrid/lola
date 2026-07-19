// api/routes/board-notes.js — notice-board Notes (Theatre of Possibilities)
const router = require('express').Router();
const pool = require('../db');
const { authenticate, softAuthenticate } = require('../auth');

const TYPES = ['note', 'photograph', 'link', 'article'];

function shape(row) {
  return row;
}

// GET /api/board-notes — studio list (all users, shared library, like spots)
// ?status=draft|published  ?trashed=true  ?type=note
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT bn.*, u.name AS author_name
               FROM board_notes bn
               LEFT JOIN users u ON bn.user_id = u.id
               WHERE 1=1`;
    const params = [];

    if (req.query.trashed === 'true') {
      sql += ` AND bn.deleted_at IS NOT NULL`;
    } else {
      sql += ` AND bn.deleted_at IS NULL`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      sql += ` AND bn.status = $${params.length}`;
    }
    if (req.query.type) {
      params.push(req.query.type);
      sql += ` AND bn.type = $${params.length}`;
    }

    sql += ` ORDER BY bn.pin DESC, bn.publish_date DESC`;
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ notes: result.rows.map(shape) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/board-notes/public — annex.site front page feed. No auth.
// Published, not trashed, not expired. Pinned float to top.
router.get('/public', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await pool.query(`
      SELECT id, type, headline, body, image_url, reference_title, reference_url,
             pin, publish_date, show_in_feed
      FROM board_notes
      WHERE status = 'published'
        AND deleted_at IS NULL
        AND show_in_feed = true
        AND publish_date <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY pin DESC, publish_date DESC
      LIMIT 100`);
    res.json({ notes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/board-notes/public/grid — ALL published notes (feed flag
// aside) for the public notes grid page. Unlike /public (which is the
// homepage feed and filters to show_in_feed=true), this shows the full
// published archive. Includes category for future filtering/layouts.
router.get('/public/grid', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await pool.query(`
      SELECT id, type, headline, image_url, reference_title, reference_url,
             pin, publish_date, category
      FROM board_notes
      WHERE status = 'published'
        AND deleted_at IS NULL
        AND publish_date <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY pin DESC, publish_date DESC
      LIMIT 200`);
    res.json({ notes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/board-notes/public/:id — single published note for permalink page
router.get('/public/:id', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await pool.query(`
      SELECT id, type, headline, body, image_url, reference_title, reference_url,
             pin, publish_date, show_in_feed
      FROM board_notes
      WHERE id = $1
        AND status = 'published'
        AND deleted_at IS NULL
        AND publish_date <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Note not found' });
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/board-notes/types — fixed type list for the editor
router.get('/types', (req, res) => {
  res.json({ types: TYPES });
});

// POST /api/board-notes — create (draft by default)
router.post('/', authenticate, async (req, res) => {
  const { type, headline, body, image_url, reference_title, reference_url,
          status, pin, publish_date, expires_at, show_in_feed, category } = req.body;
  if (!headline || !headline.trim()) return res.status(400).json({ error: 'headline required' });
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });

  try {
    const result = await pool.query(
      `INSERT INTO board_notes
         (user_id, type, headline, body, image_url, reference_title, reference_url,
          status, pin, publish_date, expires_at, show_in_feed, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, NOW()),$11,$12,$13)
       RETURNING *`,
      [req.user.id, type || 'note', headline.trim(), body || null, image_url || null,
       reference_title || null, reference_url || null, status || 'draft', !!pin,
       publish_date || null, expires_at || null, show_in_feed !== false, category || null]
    );
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/board-notes/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['type', 'headline', 'body', 'image_url', 'reference_title',
                    'reference_url', 'status', 'pin', 'publish_date', 'expires_at', 'deleted_at', 'show_in_feed', 'category'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { params.push(req.body[k]); sets.push(`${k} = $${params.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  sets.push('updated_at = NOW()');
  params.push(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE board_notes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/board-notes/:id — hard delete (admin only, mirrors spots pattern)
router.delete('/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    await pool.query('DELETE FROM board_notes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
