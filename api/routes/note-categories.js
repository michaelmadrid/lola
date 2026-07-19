// api/routes/note-categories.js
//
// Notes taxonomy management — a faithful clone of the spot categories
// endpoints (see api/routes/spots.js). Same shapes, same admin guard
// (authenticate + role check), same slug-migration + reorder logic,
// operating on note_categories + board_notes.category instead of
// spot_categories + spots.category.
//
// Mounted at /api/notes/categories in server.js:
//   app.use('/api/notes/categories', require('./api/routes/note-categories'));

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate } = require('../auth');

// GET /api/notes/categories — public list (active only, ordered).
// favorites first, then sort_order, then label. includeInactive=true
// (admin) returns everything for management.
router.get('/', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const all = req.query.includeInactive === 'true';
    const sql = `
      SELECT id, slug, label, favorite, sort_order, active
      FROM note_categories
      ${all ? '' : 'WHERE active = true'}
      ORDER BY favorite DESC, sort_order ASC, label ASC`;
    const result = await pool.query(sql);
    const categories = result.rows.map(r => ({
      value: r.slug, label: r.label, core: r.favorite,
      id: r.id, favorite: r.favorite, sort_order: r.sort_order, active: r.active,
    }));
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notes/categories — create (admin)
router.post('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { slug, label, favorite, sort_order } = req.body;
  if (!slug || !label) return res.status(400).json({ error: 'slug and label required' });
  const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  try {
    const r = await pool.query(
      `INSERT INTO note_categories (slug, label, favorite, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [cleanSlug, label.trim(), !!favorite, Number.isInteger(sort_order) ? sort_order : 100]
    );
    res.json({ category: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/categories/reorder — batch-set sort_order after a drag.
// MUST be declared before /:id so "reorder" isn't read as an id.
// Body: { order: [id, id, ...] } in the new visual sequence.
router.patch('/reorder', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const order = Array.isArray(req.body && req.body.order) ? req.body.order : null;
  if (!order) return res.status(400).json({ error: 'order array required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      const id = parseInt(order[i], 10);
      if (!id) continue;
      await client.query('UPDATE note_categories SET sort_order = $1 WHERE id = $2', [i * 10, id]);
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

// PATCH /api/notes/categories/:id — update label/favorite/sort_order/active (admin)
router.patch('/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const allowed = ['label', 'favorite', 'sort_order', 'active'];
  const sets = [], params = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) { params.push(req.body[k]); sets.push(`${k} = $${params.length}`); }
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  params.push(req.params.id);
  try {
    const r = await pool.query(
      `UPDATE note_categories SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
    res.json({ category: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notes/categories/:id/slug — rename a slug AND cascade the
// change to every note using the old slug (atomic), so renaming never
// orphans notes.
router.patch('/:id/slug', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const newSlug = String(req.body.slug || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!newSlug) return res.status(400).json({ error: 'slug required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT slug FROM note_categories WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }
    const oldSlug = cur.rows[0].slug;
    if (oldSlug === newSlug) { await client.query('ROLLBACK'); return res.json({ ok: true, unchanged: true }); }
    const clash = await client.query('SELECT id FROM note_categories WHERE slug = $1 AND id <> $2', [newSlug, req.params.id]);
    if (clash.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That slug already exists' }); }
    await client.query('UPDATE note_categories SET slug = $1 WHERE id = $2', [newSlug, req.params.id]);
    const moved = await client.query('UPDATE board_notes SET category = $1 WHERE category = $2', [newSlug, oldSlug]);
    await client.query('COMMIT');
    res.json({ ok: true, old_slug: oldSlug, new_slug: newSlug, notes_moved: moved.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/notes/categories/reassign — move all notes from one slug to
// another. Body: { from: 'x', to: 'y' }
router.post('/reassign', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const from = String(req.body.from || '').trim().toLowerCase();
  const to = String(req.body.to || '').trim().toLowerCase();
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const r = await pool.query('UPDATE board_notes SET category = $1 WHERE category = $2', [to, from]);
    res.json({ ok: true, notes_moved: r.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
