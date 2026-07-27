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
    let sql = `SELECT bn.*, u.name AS author_name,
                      (SELECT COUNT(*) FROM note_spot_links l WHERE l.note_id = bn.id) AS link_count
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

// GET /api/board-notes/public — posto.world front page feed. No auth.
// Published, not trashed, not expired. Pinned float to top.
router.get('/public', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await pool.query(`
      SELECT id, type, headline, body, image_url, reference_title, reference_url,
             pin, featured, publish_date, show_in_feed
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
      SELECT bn.id, bn.type, bn.headline, bn.reference_title,
             bn.reference_url, bn.pin, bn.featured, bn.publish_date, bn.category,
             -- Two images for the shelf's hover swap:
             --   cover = gallery's first image (the evocative/abstract one)
             --           shown at rest; falls back to the hero when there's
             --           no gallery.
             --   hero  = the note's own image_url (the legible/product shot)
             --           revealed on hover.
             -- The client shows cover at rest and fades hero in on top.
             COALESCE(
               (SELECT ni.image_url FROM note_images ni
                 WHERE ni.note_id = bn.id
                 ORDER BY ni.position ASC, ni.id ASC
                 LIMIT 1),
               bn.image_url
             ) AS image_url,           -- resting cover (name kept for compat)
             bn.image_url AS hero_url,  -- hover reveal
             -- Linked spots, for the provenance line ("From X, City").
             (SELECT json_agg(json_build_object(
                        'name', s.place_name,
                        'slug', s.slug,
                        'city', c.name,
                        'city_slug', c.slug
                      ) ORDER BY s.place_name)
                FROM note_spot_links l
                JOIN spots s ON s.id = l.spot_id
                LEFT JOIN cities c ON c.id = s.city_id
               WHERE l.note_id = bn.id) AS spots
      FROM board_notes bn
      WHERE bn.status = 'published'
        AND bn.deleted_at IS NULL
        AND bn.publish_date <= NOW()
        AND (bn.expires_at IS NULL OR bn.expires_at > NOW())
      ORDER BY bn.pin DESC, bn.publish_date DESC
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
             pin, featured, publish_date, show_in_feed
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
          status, pin, featured, publish_date, expires_at, show_in_feed, category } = req.body;
  if (!headline || !headline.trim()) return res.status(400).json({ error: 'headline required' });
  if (type && !TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });

  try {
    const result = await pool.query(
      `INSERT INTO board_notes
         (user_id, type, headline, body, image_url, reference_title, reference_url,
          status, pin, featured, publish_date, expires_at, show_in_feed, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, NOW()),$12,$13,$14)
       RETURNING *`,
      [req.user.id, type || 'note', headline.trim(), body || null, image_url || null,
       reference_title || null, reference_url || null, status || 'draft', !!pin, !!featured,
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
                    'reference_url', 'status', 'pin', 'featured', 'publish_date', 'expires_at', 'deleted_at', 'show_in_feed', 'category'];
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

// ── Gallery (note_images) — optional supporting images, separate from
//    the hero image_url. All under /api/board-notes/:id/images. ──

// GET /api/board-notes/:id/images — ordered gallery for a note
router.get('/:id/images', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, image_url, thumb_url, position
         FROM note_images WHERE note_id = $1
        ORDER BY position ASC, id ASC`,
      [req.params.id]
    );
    res.json({ images: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/board-notes/:id/images  { image_url, thumb_url? }
// Appends to the end of the gallery.
router.post('/:id/images', authenticate, async (req, res) => {
  const { image_url, thumb_url } = req.body;
  if (!image_url) return res.status(400).json({ error: 'image_url required' });
  try {
    const { rows: pos } = await pool.query(
      `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM note_images WHERE note_id = $1`,
      [req.params.id]
    );
    const { rows } = await pool.query(
      `INSERT INTO note_images (note_id, image_url, thumb_url, position)
       VALUES ($1, $2, $3, $4) RETURNING id, image_url, thumb_url, position`,
      [req.params.id, image_url, thumb_url || null, pos[0].next]
    );
    res.json({ image: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/board-notes/:id/images/:imageId
router.delete('/:id/images/:imageId', authenticate, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM note_images WHERE id = $1 AND note_id = $2`,
      [req.params.imageId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/board-notes/:id/images/order  { ids: [imageId, ...] }
// Rewrites position from array order.
router.patch('/:id/images/order', authenticate, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: 'ids array required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query(
        `UPDATE note_images SET position = $1 WHERE id = $2 AND note_id = $3`,
        [i, ids[i], req.params.id]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
