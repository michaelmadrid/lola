const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

function extractTags(text) {
  const matches = String(text).match(/#[a-z0-9_-]+/gi) || [];
  return [...new Set(matches.map(t => t.toLowerCase().slice(1)))];
}

function extractFirstUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

// =============================================================
// In-memory city cache for fast scan during save creation.
// Sorted longest-name-first so multi-word matches win.
// Cities under 3 chars are excluded to avoid false positives.
// Refresh on boot, after city CRUD, on errors.
// =============================================================
let citiesCache = [];
async function refreshCitiesCache() {
  try {
    const r = await pool.query(
      `SELECT id, name FROM cities
        WHERE name IS NOT NULL AND LENGTH(name) >= 3
        ORDER BY LENGTH(name) DESC, name ASC`
    );
    citiesCache = r.rows;
  } catch (err) {
    console.error('refreshCitiesCache', err.message);
  }
}
refreshCitiesCache();
// Refresh every 10 minutes as a safety net even if no admin trigger
setInterval(refreshCitiesCache, 10 * 60 * 1000);

// Detect cities in arbitrary text. Returns array of city ids.
// Whole-word, case-insensitive. Multi-word match-once: once matched,
// strip the matched span so a subset doesn't double-match.
function detectCities(text) {
  if (!text || !citiesCache.length) return [];
  let scratch = ' ' + text + ' ';
  const matched = [];
  for (const c of citiesCache) {
    // Build a whole-word, case-insensitive regex for this name
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-zA-Z])(${escaped})(?=$|[^a-zA-Z])`, 'i');
    if (re.test(scratch)) {
      matched.push(c.id);
      // remove this match (and any further occurrences) so shorter
      // names don't double-match within the matched span
      scratch = scratch.replace(new RegExp(`(?:^|[^a-zA-Z])(${escaped})(?=$|[^a-zA-Z])`, 'gi'), ' ');
    }
  }
  return matched;
}

async function attachedCitiesFor(saveIds) {
  if (!saveIds.length) return {};
  const r = await pool.query(
    `SELECT sc.save_id, c.id, c.name, c.slug
       FROM save_cities sc
       JOIN cities c ON sc.city_id = c.id
      WHERE sc.save_id = ANY($1::int[])`,
    [saveIds]
  );
  const map = {};
  for (const row of r.rows) {
    if (!map[row.save_id]) map[row.save_id] = [];
    map[row.save_id].push({ id: row.id, name: row.name, slug: row.slug });
  }
  return map;
}

// =============================================================
// ROUTES
// =============================================================

// GET /api/saves — user's saves, newest first
// Adds attached_cities array per save
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT s.*,
                      c.name AS city_name,
                      p.name AS place_name,
                      t.name AS trip_name
               FROM saves s
               LEFT JOIN cities c ON s.city_id = c.id
               LEFT JOIN places p ON s.place_id = p.id
               LEFT JOIN trips t ON s.trip_id = t.id
               WHERE s.user_id = $1`;
    const params = [req.user.id];

    if (req.query.include_archived !== 'true') {
      sql += ` AND s.archived_at IS NULL`;
    }
    if (req.query.tag) {
      params.push(req.query.tag);
      sql += ` AND $${params.length} = ANY(s.tags)`;
    }
    if (req.query.trip_id) {
      params.push(req.query.trip_id);
      sql += ` AND s.trip_id = $${params.length}`;
    }
    if (req.query.city_id) {
      // Filter saves that have this city attached (via save_cities)
      params.push(req.query.city_id);
      sql += ` AND s.id IN (SELECT save_id FROM save_cities WHERE city_id = $${params.length})`;
    }
    sql += ` ORDER BY s.created_at DESC`;

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    const saves = result.rows;
    const attachedMap = await attachedCitiesFor(saves.map(s => s.id));
    for (const s of saves) {
      s.attached_cities = attachedMap[s.id] || [];
    }
    res.json({ saves });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/saves
router.post('/', authenticate, async (req, res) => {
  const { text, tags: explicitTags, url: explicitUrl, trip_id, city_id, place_id } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    let resolvedTripId = trip_id || null;
    if (!resolvedTripId) {
      const active = await pool.query(
        `SELECT t.id FROM trips t
         JOIN trip_members tm ON t.id = tm.trip_id
         WHERE tm.user_id = $1
           AND t.date_start IS NOT NULL AND t.date_end IS NOT NULL
           AND CURRENT_DATE BETWEEN t.date_start AND t.date_end
         LIMIT 1`,
        [req.user.id]
      );
      if (active.rows[0]) resolvedTripId = active.rows[0].id;
    }

    const tags = explicitTags || extractTags(text);
    const url = explicitUrl || extractFirstUrl(text);

    const result = await pool.query(
      `INSERT INTO saves (user_id, text, tags, url, trip_id, city_id, place_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, text.trim(), tags, url, resolvedTripId, city_id || null, place_id || null]
    );
    const save = result.rows[0];

    // Auto-attach any matched cities from text
    let attached = [];
    const detectedIds = detectCities(text);
    // Also add explicit city_id if user passed one (rare, but supported)
    if (city_id && !detectedIds.includes(parseInt(city_id, 10))) {
      detectedIds.push(parseInt(city_id, 10));
    }
    for (const cid of detectedIds) {
      try {
        await pool.query(
          `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [save.id, cid]
        );
      } catch (e) { /* ignore individual failures */ }
    }
    if (detectedIds.length) {
      const r = await pool.query(
        `SELECT id, name, slug FROM cities WHERE id = ANY($1::int[])`,
        [detectedIds]
      );
      attached = r.rows;
    }
    save.attached_cities = attached;

    res.json({ save });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/saves/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = ['text', 'tags', 'url', 'trip_id', 'city_id', 'place_id', 'archived_at'];
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
  params.push(req.user.id);
  try {
    const result = await pool.query(
      `UPDATE saves SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Save not found' });
    res.json({ save: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/saves/:id — hard delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM saves WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/saves/:id/cities/:cityId — remove an auto-tag chip
router.delete('/:id/cities/:cityId', authenticate, async (req, res) => {
  try {
    // Verify the save belongs to this user
    const own = await pool.query(
      `SELECT 1 FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });
    await pool.query(
      `DELETE FROM save_cities WHERE save_id = $1 AND city_id = $2`,
      [req.params.id, req.params.cityId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.refreshCitiesCache = refreshCitiesCache;
