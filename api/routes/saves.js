const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');
const { parseCapture, CATEGORIES } = require('../parse-capture');
const { resolveOrCreatePlace } = require('../places-resolver');

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

// Helper to fetch the bound-city name from a city id. Used when the resolver
// needs cityName (for the Google query) but only has cityId (because the
// resolution happened via the fallback path).
async function cityNameFromId(cityId) {
  if (!cityId) return null;
  try {
    const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [cityId]);
    return r.rows[0] ? r.rows[0].name : null;
  } catch {
    return null;
  }
}

// Background: parse a save with Claude, update the row + attach city if needed
// + resolve to a canonical place via Google. Fire and forget — never blocks
// the user's POST. Errors are stored on the row (AI) or logged (place lookup).
async function parseAndUpdate(saveId, text, opts = {}) {
  const { boundCityName, cityIdHint } = opts;
  const parsed = await parseCapture(text, { boundCityName });

  if (parsed.error) {
    // Record the error, leave structured fields null. Skip the place resolver —
    // without a confident place_name the Google lookup would be a hail mary
    // (decided in Job 5: option A, skip on AI parse failure).
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

  // ----- City attachment (now direct via saves.city_id) -----
  // Track which city ends up linked, regardless of path. Resolver uses this.
  let attachedCityId = null;
  let attachedCityName = null;

  // Read the current city_id (may have been set by regex detection in createSingleSave)
  const currentRow = await pool.query(
    `SELECT s.city_id, c.name AS city_name
       FROM saves s
       LEFT JOIN cities c ON s.city_id = c.id
       WHERE s.id = $1`,
    [saveId]
  );
  const currentCityId = currentRow.rows[0] ? currentRow.rows[0].city_id : null;
  const currentCityName = currentRow.rows[0] ? currentRow.rows[0].city_name : null;

  if (cityRow) {
    // AI returned a city that matched our table. AI's city wins.
    // (Per Option 3 strict-cities policy: AI overrides bound only when AI's
    // city actually exists in kit's curated list.)
    if (currentCityId !== cityRow.id) {
      await pool.query(`UPDATE saves SET city_id = $1 WHERE id = $2`, [cityRow.id, saveId]);
    }
    refreshCitiesCache();
    attachedCityId = cityRow.id;
    attachedCityName = cityRow.name;
  } else if (currentCityId) {
    // Regex already attached a city — keep it. Use its name for the resolver.
    attachedCityId = currentCityId;
    attachedCityName = currentCityName;
  } else if (cityIdHint) {
    // FALLBACK: AI returned no city (or wasn't in our table) and regex found nothing.
    // Attach the user's bound city as a last resort.
    const cityIdInt = parseInt(cityIdHint, 10);
    await pool.query(`UPDATE saves SET city_id = $1 WHERE id = $2`, [cityIdInt, saveId]);
    attachedCityId = cityIdInt;
    attachedCityName = await cityNameFromId(cityIdInt);
  }

  // ----- Place resolver -----
  // Fire the Google Places resolver IF we have a place_name to look up.
  // The bound/attached city is passed for query disambiguation AND set as
  // places.city_id on a new row. Fire-and-forget: if Google fails, log it
  // and move on — the save is fully written either way, place_id stays null.
  if (parsed.place_name && parsed.place_name.trim()) {
    resolveOrCreatePlace({
      name: parsed.place_name,
      cityId: attachedCityId,
      cityName: attachedCityName,
    })
      .then(async (placeId) => {
        if (placeId) {
          try {
            await pool.query(
              `UPDATE saves SET place_id = $1 WHERE id = $2`,
              [placeId, saveId]
            );
          } catch (err) {
            console.error('parseAndUpdate place_id update', err.message);
          }
        }
        // If placeId is null, Google found no match. The save just lacks a
        // canonical place link. Admin can manually resolve later via the
        // /api/places/_admin/resolve endpoint if it matters.
      })
      .catch(err => {
        console.error(`[place-lookup-error] save ${saveId} "${parsed.place_name}": ${err.message}`);
      });
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

// Detect cities in arbitrary text. Returns array of city ids (whole-word match).
function detectCities(text) {
  if (!text || !citiesCache.length) return [];
  let scratch = ' ' + text + ' ';
  const matched = [];
  for (const c of citiesCache) {
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-zA-Z])(${escaped})(?=$|[^a-zA-Z])`, 'i');
    if (re.test(scratch)) {
      matched.push(c.id);
      scratch = scratch.replace(new RegExp(`(?:^|[^a-zA-Z])(${escaped})(?=$|[^a-zA-Z])`, 'gi'), ' ');
    }
  }
  return matched;
}

// =============================================================
// ROUTES
// =============================================================

// Helper: shape a save row from a JOIN-with-cities query into the API response
// shape. We preserve attached_cities as a 0-or-1 item array so existing
// frontend code (spots.js, home.js, guides-edit.js) doesn't need to change.
function shapeSaveRow(row) {
  const { city_id, city_name, city_slug, ...save } = row;
  save.attached_cities = city_id
    ? [{ id: city_id, name: city_name, slug: city_slug }]
    : [];
  return save;
}

// GET /api/saves — user's saves, newest first
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT s.*,
                      c.id   AS city_id,
                      c.name AS city_name,
                      c.slug AS city_slug
               FROM saves s
               LEFT JOIN cities c ON s.city_id = c.id
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
      // Filter saves with this city as their direct FK
      params.push(req.query.city_id);
      sql += ` AND s.city_id = $${params.length}`;
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
    res.json({ saves: result.rows.map(shapeSaveRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a single save row + run regex city detection. Async AI parse fires after.
//
// City attachment policy (strict cities edition, post-7a):
// - Regex-based detection runs immediately; if it finds cities in the text,
//   the FIRST match wins (one city per save now). Sets saves.city_id directly.
// - AI may later overwrite via parseAndUpdate — but ONLY if AI's returned
//   city name matches an existing city in the table.
// - cityIdHint (the user's bound city) is attached ONLY as a last resort.
async function createSingleSave({ userId, text, tags, url, cityIdHint, boundCityName, place_id, been }) {
  const beenValue = (typeof been === 'boolean') ? been : true;

  // Regex-based detection: first match wins (one city per save).
  const detectedIds = detectCities(text);
  const initialCityId = detectedIds.length ? detectedIds[0] : null;

  const result = await pool.query(
    `INSERT INTO saves (user_id, text, tags, url, place_id, been, city_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, text.trim(), tags, url, place_id || null, beenValue, initialCityId]
  );
  const save = result.rows[0];

  // Build attached_cities for response (0 or 1 item)
  let attached = [];
  if (initialCityId) {
    const r = await pool.query(
      `SELECT id, name, slug FROM cities WHERE id = $1 LIMIT 1`,
      [initialCityId]
    );
    if (r.rows[0]) attached = [r.rows[0]];
  }
  save.attached_cities = attached;

  // Fire async AI parse — don't await. Bound city flows through as disambiguation
  // hint AND as the cityIdHint fallback (used only if regex + AI both find no city).
  parseAndUpdate(save.id, save.text, { boundCityName, cityIdHint }).catch(err => {
    console.error('parseAndUpdate failed for save', save.id, err);
  });

  return save;
}

// POST /api/saves
// Supports single-line input (one save) OR multi-line input (one save per line).
router.post('/', authenticate, async (req, res) => {
  const { text, tags: explicitTags, url: explicitUrl, city_id, city_name, place_id, been } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Text required' });

  try {
    let resolvedBoundCityName = city_name || null;
    if (city_id && !resolvedBoundCityName) {
      try {
        const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [city_id]);
        if (r.rows[0]) resolvedBoundCityName = r.rows[0].name;
      } catch {}
    }

    const lines = String(text)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

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

// DELETE /api/saves/:id/cities/:cityId — remove the attached city chip
// (Pre-7a this removed a row from save_cities. Now it clears saves.city_id
// if it matches the requested cityId. URL kept for frontend compatibility.)
router.delete('/:id/cities/:cityId', authenticate, async (req, res) => {
  try {
    const own = await pool.query(
      `SELECT city_id FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });

    const currentCityId = own.rows[0].city_id;
    const requestedCityId = parseInt(req.params.cityId, 10);
    // Only clear if the current city matches what the client asked to remove
    if (currentCityId === requestedCityId) {
      await pool.query(`UPDATE saves SET city_id = NULL WHERE id = $1`, [req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/saves/:id/cities — set the attached city.
// (Pre-7a this replaced rows in save_cities. Now it just updates saves.city_id.)
router.post('/:id/cities', authenticate, async (req, res) => {
  const { city_id } = req.body;
  if (!city_id) return res.status(400).json({ error: 'city_id required' });
  try {
    const own = await pool.query(
      `SELECT 1 FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });

    await pool.query(`UPDATE saves SET city_id = $1 WHERE id = $2`, [city_id, req.params.id]);
    res.json({ success: true, save_id: parseInt(req.params.id, 10), city_id: parseInt(city_id, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/saves/:id/reparse — re-run AI parser on original text
router.post('/:id/reparse', authenticate, async (req, res) => {
  try {
    const own = await pool.query(
      `SELECT id, text FROM saves WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Save not found' });
    const save = own.rows[0];

    // Use attached city (if any) as disambiguation context
    let boundCityName = null;
    try {
      const cityRes = await pool.query(
        `SELECT c.name FROM saves s
           JOIN cities c ON s.city_id = c.id
           WHERE s.id = $1 LIMIT 1`,
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
