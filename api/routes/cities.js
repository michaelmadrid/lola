const router = require('express').Router();
const pool = require('../db');
const { authenticate, softAuthenticate } = require('../auth');

// Refresh saves' city cache after CRUD on cities
let _savesRefresh = null;
function refreshSavesCache() {
  if (_savesRefresh === null) {
    try { _savesRefresh = require('./saves').refreshCitiesCache; } catch (e) { _savesRefresh = () => {}; }
  }
  try { _savesRefresh && _savesRefresh(); } catch (e) {}
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// GET /api/cities — list all cities
// Optional query params:
//   ?country=France
//   ?parent_id=89  (for neighborhoods)
//   ?search=par   (name LIKE)
router.get('/', softAuthenticate, async (req, res) => {
  try {
    const { country, parent_id, search } = req.query;
    let sql = `
      SELECT c.*,
             p.name as parent_name
      FROM cities c
      LEFT JOIN cities p ON c.parent_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (country) {
      params.push(country);
      sql += ` AND c.country = $${params.length}`;
    }
    if (parent_id !== undefined) {
      if (parent_id === 'null' || parent_id === '') {
        sql += ` AND c.parent_id IS NULL`;
      } else {
        params.push(parent_id);
        sql += ` AND c.parent_id = $${params.length}`;
      }
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND c.name ILIKE $${params.length}`;
    }
    sql += ` ORDER BY c.name`;
    const result = await pool.query(sql, params);
    res.json({ cities: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cities/:idOrSlug — single city by id or slug
router.get('/:idOrSlug', softAuthenticate, async (req, res) => {
  const { idOrSlug } = req.params;
  try {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const sql = isNumeric
      ? `SELECT c.*, p.name as parent_name FROM cities c LEFT JOIN cities p ON c.parent_id = p.id WHERE c.id = $1`
      : `SELECT c.*, p.name as parent_name FROM cities c LEFT JOIN cities p ON c.parent_id = p.id WHERE c.slug = $1`;
    const result = await pool.query(sql, [idOrSlug]);
    if (!result.rows[0]) return res.status(404).json({ error: 'City not found' });
    res.json({ city: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cities — create
router.post('/', authenticate, async (req, res) => {
  const { name, country, parent_id, is_region, lat, lon, timezone, region, language } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const slug = slugify(name);
    const result = await pool.query(
      `INSERT INTO cities (name, slug, country, parent_id, is_region, lat, lon, timezone, region, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, slug, country || null, parent_id || null, !!is_region,
       lat || null, lon || null, timezone || null, region || null, language || null]
    );
    refreshSavesCache();
    res.json({ city: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'City with this name or slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/cities/:id — edit
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['name', 'country', 'parent_id', 'is_region', 'lat', 'lon', 'timezone', 'region', 'language', 'slug'];
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
      `UPDATE cities SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'City not found' });
    refreshSavesCache();
    res.json({ city: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cities/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM cities WHERE id = $1', [req.params.id]);
    refreshSavesCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
