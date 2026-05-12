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

// Find a city by name (case-insensitive whole match). If found, optionally enrich
// missing timezone/country from the AI parse data. Never creates new cities —
// kit's cities table is admin-curated. If AI suggests a name that doesn't exist,
// we log it for visibility and return null. The save still works, it just won't
// be city-linked unless regex detection or bound-city fallback covers it.
//
// Returns the city row, or null if no match.
async function findOrEnrichCity(name, country, timezone) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  // Case-insensitive exact name match
  const existing = await pool.query(
    `SELECT * FROM cities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [trimmed]
  );
  if (!existing.rows[0]) {
    // AI suggested a city that doesn't exist in kit's curated list.
    // Log for visibility; do not create. Bound-city fallback may still attach
    // a city to this save downstream.
    console.log(`[city-not-found] AI suggested "${trimmed}" (country=${country || 'null'}, tz=${timezone || 'null'}) — not in cities table, ignoring`);
    return null;
  }

  const row = existing.rows[0];
  // Enrich existing row: backfill timezone or country if null and AI gave us one
  const updates = [];
  const params = [];
  if (!row.timezone && timezone) {
    params.push(timezone);
    updates.push(`timezone = $${params.length}`);
  }
  if (!row.country && country) {
    params.push(country);
    updates.push(`country = $${params.length}`);
  }
  if (updates.length) {
    params.push(row.id);
    const r = await pool.query(
      `UPDATE cities SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return r.rows[0];
  }
  return row;
}

// Background: parse a save with Claude, update the row + attach city if needed.
// Fire and forget — never blocks the user's POST. Errors are stored on the row.
async function parseAndUpdate(saveId, text, opts = {}) {
  const { boundCityName, cityIdHint } = opts;
  const parsed = await parseCapture(text, { boundCityName });

  if (parsed.error) {
    // Record the error, leave structured fields null
    await pool.query(
      `UPDATE saves SET ai_parsed_at = NOW(), ai_parse_error = $1 WHERE id = $2`,
      [parsed.error, saveId]
    );
    return;
  }

  // Find (do not create) city if AI returned one
  let cityRow = null;
  if (parsed.city) {
    try {
      cityRow = await findOrEnrichCity(parsed.city, parsed.country, parsed.timezone);
    } catch (err) {
      console.error('parseAndUpdate findOrEnrichCity', err.message);
    }
  }

  // Update saves row with structured fields
  await pool.query(
    `UPDATE saves
       SET place_name = $1,
           category = $2,
           tip = $3,
           country = $4,
           neighborhood = $5,
           ai_parsed_at = NOW(),
           ai_parse_error = NULL
     WHERE id = $6`,
    [parsed.place_name, parsed.category, parsed.tip, parsed.country, parsed.neighborhood, saveId]
  );

  // Attach city via save_cities if AI gave us one and it matched
  if (cityRow) {
    await pool.query(
      `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [saveId, cityRow.id]
    );
    refreshCitiesCache();
    return;
  }

  // FALLBACK: if AI returned no city (or AI's city wasn't in our table) AND no
  // city is currently attached from regex detection, attach the user's bound
  // city as a last resort. This is the safety net for "Della Terra, good food"
  // captured while bound to Bali — nothing in the text names a city, AI may
  // not have inferred one, but the user told us they're in Bali.
  if (cityIdHint) {
    const existing = await pool.query(
      `SELECT 1 FROM save_cities WHERE save_id = $1 LIMIT 1`,
      [saveId]
    );
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [saveId, parseInt(cityIdHint, 10)]
      );
    }
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
// boundCityName is passed to the AI parser as disambiguation context.
//
// City attachment policy (option D, strict cities edition):
// - Regex-based detection runs immediately; if it finds cities in the text
//   (case-insensitive match against existing cities), attach them.
// - AI may add a city later via parseAndUpdate — but ONLY if AI's returned
//   city name matches an existing city in the table. AI never creates cities.
// - cityIdHint (the user's bound city) is attached ONLY if regex + AI both
//   return zero cities. This prevents "Della Terra Marseille" (bound to Bali)
//   from being tagged in BOTH cities — Marseille wins because text named it.
async function createSingleSave({ userId, text, tags, url, cityIdHint, boundCityName, place_id, been }) {
  // Default `been` to true if not specified
  const beenValue = (typeof been === 'boolean') ? been : true;
  const result = await pool.query(
    `INSERT INTO saves (user_id, text, tags, url, place_id, been)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, text.trim(), tags, url, place_id || null, beenValue]
  );
  const save = result.rows[0];

  // Regex-based city tagging (fast, deterministic) — attaches whatever cities are
  // explicitly named in the text. NOTE: we no longer auto-attach the bound city here.
  const detectedIds = detectCities(text);
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

  // Fire async AI parse — don't await. Bound city flows through as disambiguation
  // hint AND as the cityIdHint fallback (used only if AI also finds no city).
  parseAndUpdate(save.id, save.text, { boundCityName, cityIdHint }).catch(err => {
    console.error('parseAndUpdate failed for save', save.id, err);
  });

  return save;
}

// POST /api/saves
// Supports single-line input (one save) OR multi-line input (one save per line).
// Multi-line: each non-empty line becomes its own save with its own AI parse.
router.post('/', authenticate, async (req, res) => {
  const { text, tags: explicitTags, url: explicitUrl, city_id, city_name, place_id, been } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    // If client sent city_id but not city_name, resolve it for AI context
    let resolvedBoundCityName = city_name || null;
    if (city_id && !resolvedBoundCityName) {
      try {
        const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [city_id]);
        if (r.rows[0]) resolvedBoundCityName = r.rows[0].name;
      } catch {}
    }

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
        boundCityName: resolvedBoundCityName,
        place_id,
        been,
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
        cityIdHint: city_id,
        boundCityName: resolvedBoundCityName,
        place_id: null,
        been,
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
    'place_name', 'category', 'tip', 'country', 'neighborhood',
    'been',
  ];
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

// POST /api/saves/:id/cities — attach a city to a save, REPLACING any existing attachments.
// Used by the save editor when user picks a different city.
router.post('/:id/cities', authenticate, async (req, res) => {
  const { city_id } = req.body;
  if (!city_id) return res.status(400).json({ error: 'city_id required' });
  try {
    const own = await pool.query(
      `SELECT 1 FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });

    // Replace: clear existing attachments, then add the picked one
    await pool.query(`DELETE FROM save_cities WHERE save_id = $1`, [req.params.id]);
    await pool.query(
      `INSERT INTO save_cities (save_id, city_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, city_id]
    );
    res.json({ success: true, save_id: parseInt(req.params.id, 10), city_id: parseInt(city_id, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/saves/:id/reparse — re-run AI parser on the original text, overwriting structured fields
router.post('/:id/reparse', authenticate, async (req, res) => {
  try {
    const own = await pool.query(
      `SELECT id, text FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });
    const save = own.rows[0];

    // Use first attached city (if any) as disambiguation context
    let boundCityName = null;
    try {
      const cityRes = await pool.query(
        `SELECT c.name FROM save_cities sc JOIN cities c ON sc.city_id = c.id
         WHERE sc.save_id = $1 LIMIT 1`,
        [save.id]
      );
      if (cityRes.rows[0]) boundCityName = cityRes.rows[0].name;
    } catch {}

    // Reset parse markers so the row renders as ghost during re-parse
    await pool.query(
      `UPDATE saves SET ai_parsed_at = NULL, ai_parse_error = NULL WHERE id = $1`,
      [save.id]
    );

    // Respond immediately, fire async re-parse
    res.json({ success: true, save_id: save.id });
    parseAndUpdate(save.id, save.text, { boundCityName }).catch(err => {
      console.error('reparse failed for save', save.id, err);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.refreshCitiesCache = refreshCitiesCache;
