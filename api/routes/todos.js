const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

// Auto-archive completions from prior days (idempotent, runs on every list).
// Cheap: indexed scan over a small slice of rows.
async function autoArchiveStale(userId) {
  await pool.query(
    `UPDATE todos
       SET archived_at = NOW()
     WHERE user_id = $1
       AND archived_at IS NULL
       AND completed_at IS NOT NULL
       AND completed_at::date < CURRENT_DATE`,
    [userId]
  );
}

// GET /api/todos — today's view by default
// ?view=today (default) | graveyard | all
router.get('/', authenticate, async (req, res) => {
  try {
    await autoArchiveStale(req.user.id);

    const view = req.query.view || 'today';
    let sql, params;
    if (view === 'graveyard') {
      sql = `SELECT * FROM todos WHERE user_id = $1 AND archived_at IS NOT NULL
             ORDER BY archived_at DESC, completed_at DESC NULLS LAST`;
      params = [req.user.id];
    } else if (view === 'all') {
      sql = `SELECT * FROM todos WHERE user_id = $1
             ORDER BY sort_order ASC, created_at ASC`;
      params = [req.user.id];
    } else {
      // today: open OR completed-today, never archived
      sql = `SELECT * FROM todos
              WHERE user_id = $1
                AND archived_at IS NULL
              ORDER BY sort_order ASC, created_at ASC`;
      params = [req.user.id];
    }
    const result = await pool.query(sql, params);
    res.json({ todos: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/todos — create
router.post('/', authenticate, async (req, res) => {
  const { content, sort_order } = req.body;
  try {
    // default sort_order = max + 1 if not provided
    let so = sort_order;
    if (so === undefined || so === null) {
      const max = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS m FROM todos
          WHERE user_id = $1 AND archived_at IS NULL`,
        [req.user.id]
      );
      so = (max.rows[0].m || 0) + 1;
    }
    const result = await pool.query(
      `INSERT INTO todos (user_id, content, sort_order)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, content || '', so]
    );
    res.json({ todo: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/todos/:id
// Body fields supported: content, sort_order, completed (bool), archived (bool)
router.patch('/:id', authenticate, async (req, res) => {
  const { content, sort_order, completed, archived } = req.body;
  const updates = [];
  const params = [];

  if (content !== undefined) {
    params.push(content);
    updates.push(`content = $${params.length}`);
  }
  if (sort_order !== undefined) {
    params.push(sort_order);
    updates.push(`sort_order = $${params.length}`);
  }
  if (completed !== undefined) {
    if (completed) {
      updates.push(`completed_at = NOW()`);
    } else {
      updates.push(`completed_at = NULL`);
    }
  }
  if (archived !== undefined) {
    if (archived) {
      updates.push(`archived_at = NOW()`);
    } else {
      updates.push(`archived_at = NULL`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

  params.push(req.params.id);
  params.push(req.user.id);

  try {
    const result = await pool.query(
      `UPDATE todos SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND user_id = $${params.length}
        RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Todo not found' });
    res.json({ todo: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/todos/:id — hard delete (rare; archive instead usually)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/todos/reorder — bulk update of sort_order for today's view
// Body: { ids: [3, 7, 1, 9] } → assigns sort_order in array order
router.put('/reorder', authenticate, async (req, res) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  try {
    for (let i = 0; i < ids.length; i++) {
      await pool.query(
        `UPDATE todos SET sort_order = $1, updated_at = NOW()
          WHERE id = $2 AND user_id = $3`,
        [i, ids[i], req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
