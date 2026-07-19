// api/routes/boards.js
//
// Admin CRUD for boards ("Editions") + the public endpoint the
// homepage actually fetches from. See migrations/041_boards.sql for
// schema notes on why placement is percentage-based, not pixel-based.

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

    const itemsResult = await pool.query(
      `SELECT bi.*, bn.image_url, bn.headline, bn.type
       FROM board_items bi
       JOIN board_notes bn ON bn.id = bi.note_id
       WHERE bi.board_id = $1
       ORDER BY bi.position ASC`,
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
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
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
    console.error('PUT /api/boards/:id failed:', err);
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
router.post('/:id/items', authenticate, requireAdmin, async (req, res) => {
  try {
    const { note_id, position, height_pct, top_pct } = req.body;
    if (!note_id) return res.status(400).json({ error: 'note_id is required' });

    // Default new items to the end of the current sequence unless a
    // position was explicitly given.
    let resolvedPosition = position;
    if (resolvedPosition === undefined || resolvedPosition === null) {
      const { rows } = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM board_items WHERE board_id = $1`,
        [req.params.id]
      );
      resolvedPosition = rows[0].next_position;
    }

    const { rows } = await pool.query(
      `INSERT INTO board_items (board_id, note_id, position, height_pct, top_pct)
       VALUES ($1, $2, $3, COALESCE($4, 70), COALESCE($5, 50))
       RETURNING *`,
      [req.params.id, note_id, resolvedPosition, height_pct, top_pct]
    );
    res.status(201).json({ item: rows[0] });
  } catch (err) {
    console.error('POST /api/boards/:id/items failed:', err);
    res.status(500).json({ error: 'Could not add item' });
  }
});

// ── Admin: update an item's placement (drag/resize) ─────────────
router.put('/:id/items/:itemId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { position, height_pct, top_pct } = req.body;
    const { rows } = await pool.query(
      `UPDATE board_items
       SET position = COALESCE($1, position),
           height_pct = COALESCE($2, height_pct),
           top_pct = COALESCE($3, top_pct)
       WHERE id = $4 AND board_id = $5
       RETURNING *`,
      [position, height_pct, top_pct, req.params.itemId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: rows[0] });
  } catch (err) {
    console.error('PUT /api/boards/:id/items/:itemId failed:', err);
    res.status(500).json({ error: 'Could not update item' });
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
router.put('/_home/config', authenticate, requireAdmin, async (req, res) => {
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
    console.error('PUT /api/boards/_home/config failed:', err);
    res.status(500).json({ error: 'Could not update home config' });
  }
});

// ── PUBLIC: what the live homepage actually fetches ──────────────
// Mirrors board-notes.js's public CORS pattern. Resolves home_config
// and returns items in ONE consistent shape regardless of source, so
// home.html's rendering code doesn't need to know or care which mode
// it's in.
router.get('/_home/public', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const configResult = await pool.query(`SELECT * FROM home_config WHERE id = 1`);
    const config = configResult.rows[0];

    if (!config || config.source === 'feed' || !config.board_id) {
      // Today's behavior — raw published notes, no board placement data.
      // height_pct/top_pct simply come back null; home.html already
      // needs a fallback path for that (see CONFIG.itemHeightRatio).
      const { rows } = await pool.query(
        `SELECT id, type, headline, image_url, body, reference_title,
                reference_url, pin, NULL::numeric AS height_pct, NULL::numeric AS top_pct
         FROM board_notes
         WHERE status = 'published'
         ORDER BY pin DESC, publish_date DESC`
      );
      return res.json({ source: 'feed', notes: rows });
    }

    // Board source — items carry their authored placement.
    const { rows } = await pool.query(
      `SELECT bn.id, bn.type, bn.headline, bn.image_url, bn.body,
              bn.reference_title, bn.reference_url, bn.pin,
              bi.height_pct, bi.top_pct
       FROM board_items bi
       JOIN board_notes bn ON bn.id = bi.note_id
       WHERE bi.board_id = $1
       ORDER BY bi.position ASC`,
      [config.board_id]
    );
    res.json({ source: 'board', board_id: config.board_id, notes: rows });
  } catch (err) {
    console.error('GET /api/boards/_home/public failed:', err);
    res.status(500).json({ error: 'Could not load home feed' });
  }
});

module.exports = router;
