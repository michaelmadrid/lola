const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');
const { parseCapture, parseCaptureStructured, CATEGORIES } = require('../parse-capture');
const { resolveOrCreatePlace } = require('../places-resolver');
const SPOT_CATEGORIES = require('../constants/spot-categories');

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
// we log it for visibility and return null. The spot still works, it just won't
// be city-linked unless regex detection or bound-city fallback covers it.
async function findOrEnrichCity(name, country, timezone) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await pool.query(
    `SELECT * FROM cities WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [trimmed]
  );
  if (!existing.rows[0]) {
    console.log(`[city-not-found] AI suggested "${trimmed}" (country=${country || 'null'}, tz=${timezone || 'null'}) — not in cities table, ignoring`);
    return null;
  }

  const row = existing.rows[0];
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

async function cityNameFromId(cityId) {
  if (!cityId) return null;
  try {
    const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [cityId]);
    return r.rows[0] ? r.rows[0].name : null;
  } catch {
    return null;
  }
}

// Background: parse a spot with Claude, attach city if needed, resolve to a
// canonical place via Google. Fire and forget — never blocks the user's POST.
async function parseAndUpdate(spotId, text, opts = {}) {
  const { boundCityName, cityIdHint } = opts;
  const parsed = await parseCapture(text, { boundCityName });

  if (parsed.error) {
    await pool.query(
      `UPDATE spots SET ai_parsed_at = NOW(), ai_parse_error = $1 WHERE id = $2`,
      [parsed.error, spotId]
    );
    return;
  }

  let cityRow = null;
  if (parsed.city) {
    try {
      cityRow = await findOrEnrichCity(parsed.city, parsed.country, parsed.timezone);
    } catch (err) {
      console.error('parseAndUpdate findOrEnrichCity', err.message);
    }
  }

  await pool.query(
    `UPDATE spots
       SET place_name = $1,
           category = $2,
           tip = $3,
           country = $4,
           neighborhood = $5,
           ai_parsed_at = NOW(),
           ai_parse_error = NULL
     WHERE id = $6`,
    [parsed.place_name, parsed.category, parsed.tip, parsed.country, parsed.neighborhood, spotId]
  );

  // City attachment (direct via spots.city_id, Job 7a)
  let attachedCityId = null;
  let attachedCityName = null;

  const currentRow = await pool.query(
    `SELECT s.city_id, c.name AS city_name
       FROM spots s
       LEFT JOIN cities c ON s.city_id = c.id
       WHERE s.id = $1`,
    [spotId]
  );
  const currentCityId = currentRow.rows[0] ? currentRow.rows[0].city_id : null;
  const currentCityName = currentRow.rows[0] ? currentRow.rows[0].city_name : null;

  if (cityRow) {
    if (currentCityId !== cityRow.id) {
      await pool.query(`UPDATE spots SET city_id = $1 WHERE id = $2`, [cityRow.id, spotId]);
    }
    refreshCitiesCache();
    attachedCityId = cityRow.id;
    attachedCityName = cityRow.name;
  } else if (currentCityId) {
    attachedCityId = currentCityId;
    attachedCityName = currentCityName;
  } else if (cityIdHint) {
    const cityIdInt = parseInt(cityIdHint, 10);
    await pool.query(`UPDATE spots SET city_id = $1 WHERE id = $2`, [cityIdInt, spotId]);
    attachedCityId = cityIdInt;
    attachedCityName = await cityNameFromId(cityIdInt);
  }

  // Place resolver fires only if AI gave us a place_name
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
              `UPDATE spots SET place_id = $1 WHERE id = $2`,
              [placeId, spotId]
            );
          } catch (err) {
            console.error('parseAndUpdate place_id update', err.message);
          }
        }
      })
      .catch(err => {
        console.error(`[place-lookup-error] spot ${spotId} "${parsed.place_name}": ${err.message}`);
      });
  }
}

// =============================================================
// In-memory city cache for fast regex scan during spot creation.
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
setInterval(refreshCitiesCache, 10 * 60 * 1000);

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

// Helper: shape a spot row from a JOIN-with-cities query. Preserves
// attached_cities as a 0-or-1 item array (per Job 7a decision) so
// frontend code doesn't need to flatten/unflatten the response.
function shapeSpotRow(row) {
  const { city_id, city_name, city_slug, ...spot } = row;
  spot.attached_cities = city_id
    ? [{ id: city_id, name: city_name, slug: city_slug }]
    : [];
  return spot;
}

// GET /api/spots — user's spots, newest first
router.get('/', authenticate, async (req, res) => {
  try {
    let sql = `SELECT s.*,
                      c.id   AS city_id,
                      c.name AS city_name,
                      c.slug AS city_slug,
                      p.google_place_id AS google_place_id
               FROM spots s
               LEFT JOIN cities c ON s.city_id = c.id
               LEFT JOIN places p ON s.place_id = p.id
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
      params.push(req.query.city_id);
      sql += ` AND s.city_id = $${params.length}`;
    }
    if (req.query.category) {
      params.push(req.query.category);
      sql += ` AND s.category = ${params.length}`;
    }
    if (req.query.curated === 'true') {
      sql += ` AND s.curated = true`;
    }
    sql += ` ORDER BY s.created_at DESC`;

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const result = await pool.query(sql, params);
    res.json({ spots: result.rows.map(shapeSpotRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a single spot row + run regex city detection. Async AI parse fires after.
async function createSingleSpot({ userId, text, tags, url, cityIdHint, boundCityName, place_id, been, isAdmin }) {
  const beenValue = (typeof been === 'boolean') ? been : true;
  const detectedIds = detectCities(text);
  const initialCityId = detectedIds.length ? detectedIds[0] : null;
  const curatedBy = isAdmin ? userId : null;

  const result = await pool.query(
    `INSERT INTO spots (user_id, text, tags, url, place_id, been, city_id, curated, curated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [userId, text.trim(), tags, url, place_id || null, beenValue, initialCityId, !!isAdmin, curatedBy]
  );
  const spot = result.rows[0];

  let attached = [];
  if (initialCityId) {
    const r = await pool.query(
      `SELECT id, name, slug FROM cities WHERE id = $1 LIMIT 1`,
      [initialCityId]
    );
    if (r.rows[0]) attached = [r.rows[0]];
  }
  spot.attached_cities = attached;

  parseAndUpdate(spot.id, spot.text, { boundCityName, cityIdHint }).catch(err => {
    console.error('parseAndUpdate failed for spot', spot.id, err);
  });

  return spot;
}

// =============================================================
// Structured create path (v0.6 two-field UX).
// User provides explicit place_name + optional tip + bound city.
// We:
//   1. Insert the spot with place_name/tip already set (no AI text parse)
//   2. Attach the bound city directly (no regex scan, no AI city resolution)
//   3. Derive country/timezone from the bound city row
//   4. Fire parseCaptureStructured to derive category + neighborhood
//   5. Fire Google resolver to attach place_id
// Steps 4 and 5 run fire-and-forget after the row is created. The save
// row exists with full structured fields immediately; AI/Google touches
// only auxiliary fields in background.
// =============================================================
async function createSpotStructured({ userId, placeName, tip, cityId, cityName, been, isAdmin }) {
  const beenValue = (typeof been === 'boolean') ? been : true;
  const curatedBy = isAdmin ? userId : null;

  // Fetch city for country/timezone (no AI needed for these — they're derivable)
  let country = null;
  let timezone = null;
  if (cityId) {
    try {
      const r = await pool.query(
        `SELECT country, timezone FROM cities WHERE id = $1 LIMIT 1`,
        [cityId]
      );
      if (r.rows[0]) {
        country = r.rows[0].country || null;
        timezone = r.rows[0].timezone || null;
      }
    } catch {}
  }

  // Reconstruct a text representation for storage (so v1 surfaces that
  // display the raw text still work). Format: "place - tip" if both exist,
  // just "place" otherwise. This is purely cosmetic for legacy display.
  const reconstructedText = tip
    ? `${placeName} - ${tip}`
    : placeName;

  // Insert with structured fields populated immediately. AI parse markers
  // also set: ai_parsed_at = NOW so the row doesn't render as a "ghost"
  // waiting state — the user already provided the parse.
  const result = await pool.query(
    `INSERT INTO spots (user_id, text, place_name, tip, country, city_id, been, ai_parsed_at, curated, curated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)
     RETURNING *`,
    [userId, reconstructedText, placeName, tip || null, country, cityId || null, beenValue, !!isAdmin, curatedBy]
  );
  const spot = result.rows[0];

  // Build attached_cities shape so the response matches the v1 contract
  let attached = [];
  if (cityId && cityName) {
    attached = [{ id: cityId, name: cityName, slug: null }];
  } else if (cityId) {
    try {
      const r = await pool.query(`SELECT id, name, slug FROM cities WHERE id = $1`, [cityId]);
      if (r.rows[0]) attached = [r.rows[0]];
    } catch {}
  }
  spot.attached_cities = attached;

  // Fire structured AI parse for category + neighborhood. Fire-and-forget.
  // If AI fails, the spot is still fully usable — just no category/neighborhood.
  parseCaptureStructured({
    place_name: placeName,
    tip: tip || null,
    boundCityName: cityName,
  })
    .then(async (parsed) => {
      if (parsed.error) {
        try {
          await pool.query(
            `UPDATE spots SET ai_parse_error = $1 WHERE id = $2`,
            [parsed.error, spot.id]
          );
        } catch {}
        return;
      }
      try {
        await pool.query(
          `UPDATE spots
             SET category = $1,
                 neighborhood = $2,
                 ai_parsed_at = NOW(),
                 ai_parse_error = NULL
           WHERE id = $3`,
          [parsed.category, parsed.neighborhood, spot.id]
        );
      } catch (err) {
        console.error('createSpotStructured AI update', err.message);
      }
    })
    .catch(err => {
      console.error(`[structured-parse-error] spot ${spot.id}: ${err.message}`);
    });

  // Fire Google resolver. Clean inputs (no AI inference needed) — pass placeName
  // and the bound city directly.
  resolveOrCreatePlace({
    name: placeName,
    cityId: cityId,
    cityName: cityName,
  })
    .then(async (placeId) => {
      if (placeId) {
        try {
          await pool.query(
            `UPDATE spots SET place_id = $1 WHERE id = $2`,
            [placeId, spot.id]
          );
        } catch (err) {
          console.error('createSpotStructured place_id update', err.message);
        }
      }
    })
    .catch(err => {
      console.error(`[place-lookup-error] spot ${spot.id} "${placeName}": ${err.message}`);
    });

  return spot;
}

// POST /api/spots
// TWO PATHS:
// 1. Structured (v0.6 two-field UX): body has `place_name` (required) and
//    optional `tip`. AI parse skipped — user already provided the boundary.
//    Backend runs `parseCaptureStructured` for category + neighborhood only.
// 2. Single-phrase (legacy / Shortcut / voice / extension): body has `text`.
//    Full AI parse runs as before.
//
// Multi-line single-phrase input (one save per newline) still supported in
// the legacy path.
router.post('/', authenticate, async (req, res) => {
  const {
    text,
    place_name,
    tip,
    tags: explicitTags,
    url: explicitUrl,
    city_id,
    city_name,
    place_id,
    been,
  } = req.body;

  try {
    // Resolve bound city name (used by both paths for context)
    let resolvedBoundCityName = city_name || null;
    if (city_id && !resolvedBoundCityName) {
      try {
        const r = await pool.query(`SELECT name FROM cities WHERE id = $1 LIMIT 1`, [city_id]);
        if (r.rows[0]) resolvedBoundCityName = r.rows[0].name;
      } catch {}
    }

    // ----- Structured path (two-field) -----
    if (place_name && place_name.trim()) {
      if (!city_id) {
        return res.status(400).json({ error: 'city_id required for structured capture' });
      }
      const spot = await createSpotStructured({
        userId: req.user.id,
        placeName: place_name.trim(),
        tip: tip ? tip.trim() : null,
        cityId: city_id,
        cityName: resolvedBoundCityName,
        been,
        isAdmin: req.user.role === 'admin',
      });
      return res.json({ spot });
    }

    // ----- Legacy single-phrase path -----
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text or place_name required' });
    }

    const lines = String(text)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      const single = lines[0] || text.trim();
      const tags = explicitTags || extractTags(single);
      const url = explicitUrl || extractFirstUrl(single);
      const spot = await createSingleSpot({
        userId: req.user.id,
        text: single,
        tags,
        url,
        cityIdHint: city_id,
        boundCityName: resolvedBoundCityName,
        place_id,
        been,
        isAdmin: req.user.role === 'admin',
      });
      return res.json({ spot });
    }

    const created = [];
    for (const line of lines) {
      const tags = extractTags(line);
      const url = extractFirstUrl(line);
      const spot = await createSingleSpot({
        userId: req.user.id,
        text: line,
        tags,
        url,
        cityIdHint: city_id,
        boundCityName: resolvedBoundCityName,
        place_id: null,
        been,
        isAdmin: req.user.role === 'admin',
      });
      created.push(spot);
    }
    res.json({ spots: created, count: created.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/spots/:id
router.patch('/:id', authenticate, async (req, res) => {
  const allowed = [
    'text', 'tags', 'url', 'place_id', 'archived_at',
    'place_name', 'category', 'tip', 'country', 'neighborhood',
    'been', 'curated', 'website', 'image_url',
  ];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(key + ' = $' + params.length);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  const isAdmin = req.user.role === 'admin';
  params.push(req.params.id);
  if (!isAdmin) params.push(req.user.id);
  const idParam = '$' + (isAdmin ? params.length : (params.length - 1));
  const whereClause = isAdmin
    ? 'WHERE id = ' + idParam
    : 'WHERE id = ' + idParam + ' AND user_id = $' + params.length;
  try {
    const result = await pool.query(
      'UPDATE spots SET ' + updates.join(', ') + ', updated_at = NOW() ' + whereClause + ' RETURNING *',
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Spot not found' });
    res.json({ spot: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/spots/:id — hard delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const deleteQuery = isAdmin
      ? 'DELETE FROM spots WHERE id = $1'
      : 'DELETE FROM spots WHERE id = $1 AND user_id = $2';
    const deleteParams = isAdmin ? [req.params.id] : [req.params.id, req.user.id];
    await pool.query(deleteQuery, deleteParams);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/spots/:id/cities/:cityId — remove the attached city chip.
// Pre-7a this removed a row from save_cities. Now it clears spots.city_id
// if it matches the requested cityId. URL kept for frontend compatibility.
router.delete('/:id/cities/:cityId', authenticate, async (req, res) => {
  try {
    const own = await pool.query(
      `SELECT city_id FROM spots WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Spot not found' });

    const currentCityId = own.rows[0].city_id;
    const requestedCityId = parseInt(req.params.cityId, 10);
    if (currentCityId === requestedCityId) {
      await pool.query(`UPDATE spots SET city_id = NULL WHERE id = $1`, [req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spots/:id/cities — set the attached city
router.post('/:id/cities', authenticate, async (req, res) => {
  const { city_id } = req.body;
  if (!city_id) return res.status(400).json({ error: 'city_id required' });
  try {
    const own = await pool.query(
      `SELECT 1 FROM spots WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Spot not found' });

    await pool.query(`UPDATE spots SET city_id = $1 WHERE id = $2`, [city_id, req.params.id]);
    res.json({ success: true, spot_id: parseInt(req.params.id, 10), city_id: parseInt(city_id, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spots/:id/reparse — re-run AI parser on original text
router.post('/:id/reparse', authenticate, async (req, res) => {
  try {
    const own = await pool.query(
      `SELECT id, text FROM spots WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!own.rows[0]) return res.status(404).json({ error: 'Spot not found' });
    const spot = own.rows[0];

    let boundCityName = null;
    try {
      const cityRes = await pool.query(
        `SELECT c.name FROM spots s
           JOIN cities c ON s.city_id = c.id
           WHERE s.id = $1 LIMIT 1`,
        [spot.id]
      );
      if (cityRes.rows[0]) boundCityName = cityRes.rows[0].name;
    } catch {}

    await pool.query(
      `UPDATE spots SET ai_parsed_at = NULL, ai_parse_error = NULL WHERE id = $1`,
      [spot.id]
    );

    res.json({ success: true, spot_id: spot.id });
    parseAndUpdate(spot.id, spot.text, { boundCityName }).catch(err => {
      console.error('reparse failed for spot', spot.id, err);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spots/categories — public category list
router.get('/categories', (req, res) => {
  res.json({ categories: SPOT_CATEGORIES });
});

// =============================================================
// Public index endpoint — no auth required.
// Powers index.summer-holiday.com
// Returns all curated spots ordered by country, city, place_name.
// =============================================================
router.get('/index', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.place_name,
        s.tip,
        s.neighborhood,
        s.country,
        s.website,
        s.image_url,
        s.been,
        p.google_place_id,
        p.lat,
        p.lng,
        p.address,
        c.name  AS city,
        c.slug  AS city_slug
      FROM spots s
      LEFT JOIN cities c ON s.city_id = c.id
      LEFT JOIN places p ON s.place_id = p.id
      WHERE s.curated = true
        AND s.place_name IS NOT NULL
      ORDER BY s.country, c.name, s.place_name
    `);
    res.json({ spots: result.rows, categories: SPOT_CATEGORIES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =============================================================
// POST /api/spots/batch — admin bulk import
// Expects JSON array of { place_name, city_id, category, website, tip, been }
// Dedupes by place_name + city_id (case-insensitive).
// Google resolver fires async per row with 500ms delay.
// =============================================================
router.post('/batch', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const rows = req.body.rows;
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'rows array required' });
  }

  const results = { imported: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      // Dedupe check
      const existing = await pool.query(
        `SELECT id FROM spots WHERE LOWER(place_name) = LOWER($1) AND city_id = $2 LIMIT 1`,
        [row.place_name, row.city_id || null]
      );
      if (existing.rows[0]) {
        results.skipped++;
        continue;
      }

      // Insert
      const ins = await pool.query(
        `INSERT INTO spots (user_id, text, place_name, tip, category, city_id, been, website, curated, curated_by, ai_parsed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $1, NOW())
         RETURNING *`,
        [
          req.user.id,
          row.place_name,
          row.place_name,
          row.tip || null,
          row.category || null,
          row.city_id || null,
          row.been !== false,
          row.website || null,
        ]
      );

      const spot = ins.rows[0];

      // Fire Google resolver async with delay
      setTimeout(() => {
        const cityMatch = citiesCache.find(c => c.id === parseInt(row.city_id));
        resolveOrCreatePlace({
          name: spot.place_name,
          cityId: spot.city_id,
          cityName: cityMatch ? cityMatch.name : null,
        }).then(placeId => {
          if (placeId) {
            pool.query('UPDATE spots SET place_id = $1 WHERE id = $2', [placeId, spot.id])
              .catch(e => console.error('batch place_id update', e.message));
          }
        }).catch(e => console.error('batch resolver', spot.id, e.message));
      }, results.imported * 500);

      results.imported++;
    } catch (err) {
      results.errors.push({ place_name: row.place_name, error: err.message });
    }
  }

  res.json(results);
});

module.exports = router;
module.exports.refreshCitiesCache = refreshCitiesCache;
