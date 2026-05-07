const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');
const { parseCapture, CATEGORIES } = require('../parse-capture');

function extractTags(text) {
  const matches = String(text).match(/#[a-z0-9_-]+/gi) || [];
  return [...new Set(matches.map(t => t.toLowerCase().slice(1)))];
}

function extractFirstUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function slugifyCity(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// Find a city by name (case-insensitive whole match), or create it with status=1.
// Returns the city row.
async function findOrCreateCity(name, country) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  // Case-insensitive exact name match
  const existing = await pool.query(
    `SELECT * FROM cities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [trimmed]
  );
  if (existing.rows[0]) return existing.rows[0];

  // Create new with status=1 (auto-created)
  const slug = slugifyCity(trimmed);
  try {
    const created = await pool.query(
      `INSERT INTO cities (name, slug, country, status, created_at)
       VALUES ($1, $2, $3, 1, NOW())
       RETURNING *`,
      [trimmed, slug, country || null]
    );
    return created.rows[0];
  } catch (err) {
    // Slug conflict — try with random suffix
    if (/duplicate key/i.test(err.message)) {
      const altSlug = slug + '-' + Math.floor(Math.random() * 9999);
      const retry = await pool.query(
        `INSERT INTO cities (name, slug, country, status, created_at)
         VALUES ($1, $2, $3, 1, NOW())
         RETURNING *`,
        [trimmed, altSlug, country || null]
      );
      return retry.rows[0];
    }
    throw err;
  }
}

// Background: parse a save with Claude, update the row + attach city if needed.
// Fire and forget — never blocks the user's POST. Errors are stored on the row.
async function parseAndUpdate(saveId, text) {
  const parsed = await parseCapture(text);

  if (parsed.error) {
    // Record the error, leave structured fields null
    await pool.query(
      `UPDATE saves SET ai_parsed_at = NOW(), ai_parse_error = $1 WHERE id = $2`,
      [parsed.error, saveId]
    );
    return;
  }

  // Find or create city if AI returned one
  let cityRow = null;
  if (parsed.city) {
    try {
      cityRow = await findOrCreateCity(parsed.city, parsed.country);
    } catch (err) {
      console.error('parseAndUpdate findOrCreateCity', err.message);
    }
  }

  // Update saves row with structured fields
  await pool.query(
    `UPDATE saves
       SET place_name = $1,
           category = $2,
           tip = $3,
           country = $4,
           address = $5,
           address_source = $6,
           ai_parsed_at = NOW(),
           ai_parse_error = NULL
     WHERE id = $7`,
    [
      parsed.place_name,
      parsed.category,
      parsed.tip,
      parsed.country,
      parsed.address || null,
      parsed.address ? 'ai' : null,
      saveId,
    ]
  );

  // Attach city via save_cities if AI gave us one (and regex didn't already)
  if (cityRow) {
    await pool.query(
      `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [saveId, cityRow.id]
    );
    // Also refresh cache so future captures see the new city
    refreshCitiesCache();
  }
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
    let sql = `SELECT s.*
               FROM saves s
               WHERE s.user_id = $1`;
    const params = [req.user.id];

    if (req.query.include_archived !== 'true') {
      sql += ` AND s.archived_at IS NULL`;
    }
    if (req.query.tag) {
      params.push(req.query.tag);
      sql += ` AND $${params.length} = ANY(s.tags)`;
    }
    if (req.query.city_id) {
      // Filter saves that have this city attached (via save_cities)
      params.push(req.query.city_id);
      sql += ` AND s.id IN (SELECT save_id FROM save_cities WHERE city_id = $${params.length})`;
    }
    if (req.query.category) {
      params.push(req.query.category);
      sql += ` AND s.category = $${params.length}`;
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

// Create a single save row + run regex city detection. Async AI parse fires after.
// Used by POST in both single-line and multi-line modes.
// Note: cityIdHint is attached via save_cities (not a column on saves anymore).
async function createSingleSave({ userId, text, tags, url, cityIdHint, place_id }) {
  const result = await pool.query(
    `INSERT INTO saves (user_id, text, tags, url, place_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, text.trim(), tags, url, place_id || null]
  );
  const save = result.rows[0];

  // Regex-based city tagging (fast, deterministic)
  const detectedIds = detectCities(text);
  if (cityIdHint && !detectedIds.includes(parseInt(cityIdHint, 10))) {
    detectedIds.push(parseInt(cityIdHint, 10));
  }
  for (const cid of detectedIds) {
    try {
      await pool.query(
        `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [save.id, cid]
      );
    } catch (e) {}
  }
  let attached = [];
  if (detectedIds.length) {
    const r = await pool.query(
      `SELECT id, name, slug FROM cities WHERE id = ANY($1::int[])`,
      [detectedIds]
    );
    attached = r.rows;
  }
  save.attached_cities = attached;

  // Fire async AI parse — don't await
  parseAndUpdate(save.id, save.text).catch(err => {
    console.error('parseAndUpdate failed for save', save.id, err);
  });

  return save;
}

// POST /api/saves
// Supports single-line input (one save) OR multi-line input (one save per line).
// Multi-line: each non-empty line becomes its own save with its own AI parse.
router.post('/', authenticate, async (req, res) => {
  const { text, tags: explicitTags, url: explicitUrl, city_id, place_id } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    // Split on newlines, drop empty lines after trimming
    const lines = String(text)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    // Single line: create one save, return {save}
    if (lines.length <= 1) {
      const single = lines[0] || text.trim();
      const tags = explicitTags || extractTags(single);
      const url = explicitUrl || extractFirstUrl(single);
      const save = await createSingleSave({
        userId: req.user.id,
        text: single,
        tags,
        url,
        cityIdHint: city_id,
        place_id,
      });
      return res.json({ save });
    }

    // Multi-line: one save per line, return {saves: [...]}
    const created = [];
    for (const line of lines) {
      const tags = extractTags(line);
      const url = extractFirstUrl(line);
      const save = await createSingleSave({
        userId: req.user.id,
        text: line,
        tags,
        url,
        cityIdHint: city_id, // shared across batch if explicit
        place_id: null,
      });
      created.push(save);
    }
    res.json({ saves: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/saves/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = [
    'text', 'tags', 'url', 'place_id', 'archived_at',
    'place_name', 'category', 'tip', 'country', 'address', 'address_source',
  ];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  // If user is editing address but didn't pass an explicit source, mark it confirmed
  if (req.body.address !== undefined && req.body.address_source === undefined) {
    params.push('confirmed');
    updates.push(`address_source = $${params.length}`);
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
