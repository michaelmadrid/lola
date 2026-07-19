// api/routes/boards.js
//
// Admin CRUD for boards ("Editions") + the public endpoint the
// homepage fetches from. Placement is free x/y percentages against
// a fixed-aspect canvas frame (see migrations/042_boards_free_placement.sql)
// — the whole composed frame drifts as one rigid unit on the public
// side; items never move relative to each other ("moving the glass").

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../auth');

// ── Admin: list boards ──────────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, COUNT(bi.id) AS item_count
       FROM boards b
       LEFT JOIN board_items bi ON bi.board_id = b.id
       WHERE b.user_id = $1
       GROUP BY b.id
       ORDER BY b.updated_at DESC`,
      [req.user.id]
    );
    res.json({ boards: rows });
  } catch (err) {
    console.error('GET /api/boards failed:', err);
    res.status(500).json({ error: 'Could not load boards' });
  }
});

// ── Admin: get one board with its items (full editor data) ─────
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const boardResult = await pool.query(
      `SELECT * FROM boards WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!boardResult.rows.length) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // position DESC — highest position = front of stack = first in
    // the list, matching the admin's "top of list = front" convention.
    const itemsResult = await pool.query(
      `SELECT bi.*, bn.image_url, bn.headline, bn.type
       FROM board_items bi
       JOIN board_notes bn ON bn.id = bi.note_id
       WHERE bi.board_id = $1
       ORDER BY bi.position DESC`,
      [req.params.id]
    );

    res.json({ board: boardResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    console.error('GET /api/boards/:id failed:', err);
    res.status(500).json({ error: 'Could not load board' });
  }
});

// ── Admin: create a board ───────────────────────────────────────
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, vibe } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO boards (user_id, title, vibe)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, title.trim(), vibe || null]
    );
    res.status(201).json({ board: rows[0] });
  } catch (err) {
    console.error('POST /api/boards failed:', err);
    res.status(500).json({ error: 'Could not create board' });
  }
});

// ── Admin: update title / vibe / status ─────────────────────────
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, vibe, status } = req.body;
    const validStatus = ['draft', 'published', 'archived'];
    if (status && !validStatus.includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }

    const { rows } = await pool.query(
      `UPDATE boards
       SET title = COALESCE($1, title),
           vibe = COALESCE($2, vibe),
           status = COALESCE($3, status),
           published_at = CASE WHEN $3 = 'published' AND status != 'published'
                                THEN NOW() ELSE published_at END,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [title || null, vibe || null, status || null, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Board not found' });
    res.json({ board: rows[0] });
  } catch (err) {
    console.error('PATCH /api/boards/:id failed:', err);
    res.status(500).json({ error: 'Could not update board' });
  }
});

// ── Admin: delete a board (cascades items; never touches board_notes) ──
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    // If this board is currently set as home, fall back to feed
    // rather than leaving home_config pointing at a dangling id.
    await pool.query(
      `UPDATE home_config SET source = 'feed', board_id = NULL, updated_at = NOW()
       WHERE board_id = $1`,
      [req.params.id]
    );
    const { rowCount } = await pool.query(
      `DELETE FROM boards WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Board not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/boards/:id failed:', err);
    res.status(500).json({ error: 'Could not delete board' });
  }
});

// ── Admin: add a note to a board ────────────────────────────────
// New items default to the front (highest position) so they're
// visible/selectable immediately rather than buried at the back.
router.post('/:id/items', authenticate, requireAdmin, async (req, res) => {
  try {
    const { note_id, x_pct, y_pct, width_pct } = req.body;
    if (!note_id) return res.status(400).json({ error: 'note_id is required' });

    const { rows: posRows } = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
       FROM board_items WHERE board_id = $1`,
      [req.params.id]
    );

    const { rows } = await pool.query(
      `INSERT INTO board_items (board_id, note_id, position, x_pct, y_pct, width_pct)
       VALUES ($1, $2, $3, COALESCE($4, 10), COALESCE($5, 10), COALESCE($6, 20))
       RETURNING *`,
      [req.params.id, note_id, posRows[0].next_position, x_pct, y_pct, width_pct]
    );
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    console.error('POST /api/boards/:id/items failed:', err);
    res.status(500).json({ error: 'Could not add item' });
  }
});

// ── Admin: update an item's placement (drag/resize/z-order) ─────
router.patch('/:id/items/:itemId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { position, x_pct, y_pct, width_pct } = req.body;
    const { rows } = await pool.query(
      `UPDATE board_items
       SET position = COALESCE($1, position),
           x_pct = COALESCE($2, x_pct),
           y_pct = COALESCE($3, y_pct),
           width_pct = COALESCE($4, width_pct)
       WHERE id = $5 AND board_id = $6
       RETURNING *`,
      [position, x_pct, y_pct, width_pct, req.params.itemId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: rows[0] });
  } catch (err) {
    console.error('PATCH /api/boards/:id/items/:itemId failed:', err);
    res.status(500).json({ error: 'Could not update item' });
  }
});

// ── Admin: bring-to-front / send-to-back — reorders ALL items in
// one call so position stays a clean dense sequence (0..n-1) rather
// than drifting into gaps over repeated single-item nudges. ─────
router.post('/:id/items/:itemId/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { direction } = req.body; // 'front' | 'back'
    if (!['front', 'back'].includes(direction)) {
      return res.status(400).json({ error: "direction must be 'front' or 'back'" });
    }

    const { rows: items } = await pool.query(
      `SELECT id FROM board_items WHERE board_id = $1 ORDER BY position ASC`,
      [req.params.id]
    );
    const ids = items.map(r => r.id);
    const idx = ids.indexOf(parseInt(req.params.itemId, 10));
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    ids.splice(idx, 1);
    if (direction === 'front') ids.push(parseInt(req.params.itemId, 10));
    else ids.unshift(parseInt(req.params.itemId, 10));

    // Re-write position for every item as its new index — keeps the
    // sequence dense and unambiguous after any number of reorders.
    await Promise.all(
      ids.map((id, position) =>
        pool.query(`UPDATE board_items SET position = $1 WHERE id = $2`, [position, id])
      )
    );

    res.json({ reordered: true });
  } catch (err) {
    console.error('POST /api/boards/:id/items/:itemId/reorder failed:', err);
    res.status(500).json({ error: 'Could not reorder' });
  }
});

// ── Admin: remove an item from a board ──────────────────────────
router.delete('/:id/items/:itemId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM board_items WHERE id = $1 AND board_id = $2`,
      [req.params.itemId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/boards/:id/items/:itemId failed:', err);
    res.status(500).json({ error: 'Could not remove item' });
  }
});

// ── Admin: which board is currently "home"? ─────────────────────
router.get('/_home/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM home_config WHERE id = 1`);
    res.json({ config: rows[0] });
  } catch (err) {
    console.error('GET /api/boards/_home/config failed:', err);
    res.status(500).json({ error: 'Could not load home config' });
  }
});

// ── Admin: set home source — 'feed' or a specific board ─────────
router.patch('/_home/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const { source, board_id } = req.body;
    if (!['feed', 'board'].includes(source)) {
      return res.status(400).json({ error: "source must be 'feed' or 'board'" });
    }
    if (source === 'board' && !board_id) {
      return res.status(400).json({ error: 'board_id is required when source is board' });
    }

    const { rows } = await pool.query(
      `UPDATE home_config
       SET source = $1, board_id = $2, updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [source, source === 'board' ? board_id : null]
    );
    res.json({ config: rows[0] });
  } catch (err) {
    console.error('PATCH /api/boards/_home/config failed:', err);
    res.status(500).json({ error: 'Could not update home config' });
  }
});

// ── PUBLIC: what the live homepage actually fetches ──────────────
// Two very different shapes depending on source — home.html branches
// on `source` to pick a render path (existing flex marquee for
// 'feed', new drifting-composed-frame for 'board').
router.get('/_home/public', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const configResult = await pool.query(`SELECT * FROM home_config WHERE id = 1`);
    const config = configResult.rows[0];

    if (!config || config.source === 'feed' || !config.board_id) {
      const { rows } = await pool.query(
        `SELECT id, type, headline, image_url, body, reference_title,
                reference_url, pin
         FROM board_notes
         WHERE status = 'published'
         ORDER BY pin DESC, publish_date DESC`
      );
      return res.json({ source: 'feed', notes: rows });
    }

    // Board source — items carry free x/y/width placement.
    // position DESC = highest (front) first, so the client can
    // paint back-to-front simply by reversing once.
    const { rows } = await pool.query(
      `SELECT bn.id, bn.type, bn.headline, bn.image_url, bn.body,
              bn.reference_title, bn.reference_url,
              bi.x_pct, bi.y_pct, bi.width_pct, bi.position
       FROM board_items bi
       JOIN board_notes bn ON bn.id = bi.note_id
       WHERE bi.board_id = $1
       ORDER BY bi.position DESC`,
      [config.board_id]
    );
    res.json({ source: 'board', board_id: config.board_id, items: rows });
  } catch (err) {
    console.error('GET /api/boards/_home/public failed:', err);
    res.status(500).json({ error: 'Could not load home feed' });
  }
});

module.exports = router;
