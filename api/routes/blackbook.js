const router = require('express').Router();
const pool = require('../db');
const { authenticate, softAuthenticate } = require('../auth');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// GET /api/blackbook — list blackbook entries (public-visibility filtered)
// Optional: ?city_id=  ?category=  ?search=
router.get('/', softAuthenticate, async (req, res) => {
  try {
    const { city_id, category, search } = req.query;
    let sql = `
      SELECT b.*,
             c.name AS city_name,
             c.country AS city_country,
             c.slug AS city_slug
      FROM blackbook b
      LEFT JOIN cities c ON b.city_id = c.id
      WHERE b.is_public = TRUE
    `;
    const params = [];
    if (city_id) { params.push(city_id); sql += ` AND b.city_id = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND b.category = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (b.name ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }
    sql += ` ORDER BY b.name`;
    const result = await pool.query(sql, params);
    res.json({ blackbook: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/blackbook/:idOrSlug
router.get('/:idOrSlug', softAuthenticate, async (req, res) => {
  const { idOrSlug } = req.params;
  try {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const sql = `
      SELECT b.*, c.name AS city_name, c.country AS city_country, c.slug AS city_slug
      FROM blackbook b
      LEFT JOIN cities c ON b.city_id = c.id
      WHERE ${isNumeric ? 'b.id = $1' : 'b.slug = $1'}
    `;
    const result = await pool.query(sql, [idOrSlug]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blackbook — create
router.post('/', authenticate, async (req, res) => {
  const { name, city_id, category, address, maps_url, url, description, hours, is_public } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'Name and category required' });
  try {
    const slug = slugify(name);
    const result = await pool.query(
      `INSERT INTO blackbook (name, slug, city_id, category, address, maps_url, url, description, hours, is_public, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, slug, city_id || null, category, address || null,
       maps_url || null, url || null, description || null, hours || null,
       is_public !== false, req.user.id]
    );
    res.json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/blackbook/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['name', 'slug', 'city_id', 'category', 'address', 'maps_url', 'url', 'description', 'hours', 'is_public'];
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
  try {
    const result = await pool.query(
      `UPDATE blackbook SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blackbook/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM blackbook WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
