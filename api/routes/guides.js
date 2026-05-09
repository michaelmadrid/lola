/* =====================================================================
   /api/guides — guides CRUD + sections + items.

   All endpoints require auth. Ownership is enforced at the guide level:
   users can only access guides where guide.user_id = req.user.id.
   Section + item operations validate the parent guide is owned before
   touching anything.

   URL shape:
     GET    /api/guides                                              list mine
     POST   /api/guides                                              create
     GET    /api/guides/:id                                          fetch full
     PATCH  /api/guides/:id                                          update
     DELETE /api/guides/:id                                          hard delete

     POST   /api/guides/:id/sections                                 create section
     PATCH  /api/guides/:id/sections/:sectionId                      update section
     DELETE /api/guides/:id/sections/:sectionId                      delete section

     POST   /api/guides/:id/sections/:sectionId/items                add save to section
     PATCH  /api/guides/:id/sections/:sectionId/items/:itemId        update item
     DELETE /api/guides/:id/sections/:sectionId/items/:itemId        remove item

   Schema reference: see migrations/024_guides.sql.
   ===================================================================== */

const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

// ---------- helpers ----------

/**
 * Verify the guide exists and is owned by the authenticated user.
 * Returns the guide row or sends 404/403 and returns null.
 */
async function loadOwnedGuide(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ error: 'Invalid guide id' });
    return null;
  }
  const result = await pool.query(
    'SELECT * FROM guides WHERE id = $1',
    [id]
  );
  const guide = result.rows[0];
  if (!guide) {
    res.status(404).json({ error: 'Guide not found' });
    return null;
  }
  if (guide.user_id !== req.user.id) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return guide;
}

/**
 * Verify section belongs to the given guide. Returns section or null
 * (with response sent).
 */
async function loadSection(res, sectionId, guideId) {
  const sid = parseInt(sectionId, 10);
  if (!sid) {
    res.status(400).json({ error: 'Invalid section id' });
    return null;
  }
  const result = await pool.query(
    'SELECT * FROM guide_sections WHERE id = $1',
    [sid]
  );
  const section = result.rows[0];
  if (!section) {
    res.status(404).json({ error: 'Section not found' });
    return null;
  }
  if (section.guide_id !== guideId) {
    res.status(403).json({ error: 'Section does not belong to this guide' });
    return null;
  }
  return section;
}

/**
 * Generate a URL-safe slug from a title. Best-effort; uniqueness is
 * enforced at write time via DB UNIQUE constraint + retry.
 */
function slugify(text) {
  if (!text) return null;
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')           // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')                // trim leading/trailing dashes
    .slice(0, 60);                          // cap length
}

/**
 * Generate a unique slug for a guide. Tries the base slug, then
 * appends -2, -3, etc. until DB accepts. Returns the unique slug.
 */
async function generateUniqueSlug(baseSlug, excludeId) {
  let candidate = baseSlug || 'untitled';
  let attempt = 1;
  while (true) {
    const result = await pool.query(
      `SELECT id FROM guides WHERE slug = $1 AND id <> $2`,
      [candidate, excludeId || 0]
    );
    if (!result.rows.length) return candidate;
    attempt += 1;
    candidate = `${baseSlug || 'untitled'}-${attempt}`;
    if (attempt > 100) {
      // Pathological case — give up with a random suffix
      candidate = `${baseSlug || 'untitled'}-${Date.now()}`;
      return candidate;
    }
  }
}

// =====================================================================
// GUIDES — top-level CRUD
// =====================================================================

// GET /api/guides — list current user's guides, newest first
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.id, g.title, g.subtitle, g.status, g.slug, g.city_id,
              g.created_at, g.updated_at, g.published_at,
              c.name AS city_name,
              (SELECT COUNT(*) FROM guide_section_items gsi
                  JOIN guide_sections gs ON gs.id = gsi.section_id
                 WHERE gs.guide_id = g.id) AS spot_count,
              (SELECT COUNT(*) FROM guide_sections gs WHERE gs.guide_id = g.id) AS section_count
         FROM guides g
         LEFT JOIN cities c ON c.id = g.city_id
        WHERE g.user_id = $1
          AND g.status <> 'archived'
        ORDER BY g.updated_at DESC`,
      [req.user.id]
    );
    res.json({ guides: result.rows });
  } catch (err) {
    console.error('GET /api/guides', err);
    res.status(500).json({ error: 'Failed to load guides' });
  }
});

// POST /api/guides — create a new guide.
// Body: { title?, subtitle?, intro?, city_id? }. All optional — empty draft is fine.
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, subtitle, intro, city_id } = req.body || {};
    const result = await pool.query(
      `INSERT INTO guides (user_id, title, subtitle, intro, city_id, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING *`,
      [req.user.id, title || null, subtitle || null, intro || null, city_id || null]
    );
    res.status(201).json({ guide: result.rows[0] });
  } catch (err) {
    console.error('POST /api/guides', err);
    res.status(500).json({ error: 'Failed to create guide' });
  }
});

// GET /api/guides/:id — full guide with sections + items expanded.
// Single round trip: returns the guide, its sections in order, and each
// section's items with the underlying save data hydrated.
router.get('/:id', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;

    // Section list (ordered)
    const sectionsResult = await pool.query(
      `SELECT * FROM guide_sections
        WHERE guide_id = $1
        ORDER BY position ASC, created_at ASC`,
      [guide.id]
    );
    const sections = sectionsResult.rows;

    // Items for all sections in one query, hydrated with save data
    const sectionIds = sections.map(s => s.id);
    let itemsBySection = {};
    if (sectionIds.length) {
      const itemsResult = await pool.query(
        `SELECT gsi.id, gsi.section_id, gsi.save_id, gsi.note, gsi.position,
                s.place_name, s.tip AS save_tip, s.category, s.been, s.text AS save_text
           FROM guide_section_items gsi
           JOIN saves s ON s.id = gsi.save_id
          WHERE gsi.section_id = ANY($1::int[])
          ORDER BY gsi.section_id, gsi.position ASC, gsi.created_at ASC`,
        [sectionIds]
      );
      for (const row of itemsResult.rows) {
        if (!itemsBySection[row.section_id]) itemsBySection[row.section_id] = [];
        itemsBySection[row.section_id].push(row);
      }
    }
    const sectionsWithItems = sections.map(s => ({
      ...s,
      items: itemsBySection[s.id] || [],
    }));

    // City name (best-effort)
    let cityName = null;
    if (guide.city_id) {
      const cityRes = await pool.query('SELECT name FROM cities WHERE id = $1', [guide.city_id]);
      cityName = cityRes.rows[0] ? cityRes.rows[0].name : null;
    }

    res.json({
      guide: { ...guide, city_name: cityName },
      sections: sectionsWithItems,
    });
  } catch (err) {
    console.error('GET /api/guides/:id', err);
    res.status(500).json({ error: 'Failed to load guide' });
  }
});

// PATCH /api/guides/:id — update fields. Only the patched keys are touched.
// Status transitions:
//   draft → published    : generates slug if missing, sets published_at
//   published → draft    : keeps slug (so re-publishing keeps the URL)
//   any → archived       : soft-hides from index
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;

    const allowed = ['title', 'subtitle', 'intro', 'city_id', 'status'];
    const fields = [];
    const values = [];
    const updates = req.body || {};

    for (const key of allowed) {
      if (key in updates) {
        fields.push(key);
        values.push(updates[key]);
      }
    }

    if (!fields.length) {
      return res.json({ guide });
    }

    // Status validation
    if ('status' in updates) {
      const valid = ['draft', 'published', 'archived'];
      if (!valid.includes(updates.status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
      }
    }

    // If transitioning to published and no slug yet, generate one
    let extraSetClauses = [];
    if (updates.status === 'published' && !guide.slug) {
      const baseSlug = slugify(updates.title || guide.title);
      const uniqueSlug = await generateUniqueSlug(baseSlug, guide.id);
      fields.push('slug');
      values.push(uniqueSlug);
      extraSetClauses.push(`published_at = NOW()`);
    } else if (updates.status === 'published' && guide.slug && !guide.published_at) {
      // Re-publishing after archive/draft, keep slug, refresh published_at
      extraSetClauses.push(`published_at = NOW()`);
    }

    // Always touch updated_at
    extraSetClauses.push('updated_at = NOW()');

    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).concat(extraSetClauses);
    values.push(guide.id);

    const sql = `UPDATE guides SET ${setClauses.join(', ')}
                  WHERE id = $${values.length}
                  RETURNING *`;

    const result = await pool.query(sql, values);
    res.json({ guide: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/guides/:id', err);
    if (err.code === '23505') {
      // Unique violation (slug collision) — should be impossible given our slug generator
      return res.status(409).json({ error: 'Slug conflict, retry' });
    }
    res.status(500).json({ error: 'Failed to update guide' });
  }
});

// DELETE /api/guides/:id — hard delete (cascades to sections + items)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    await pool.query('DELETE FROM guides WHERE id = $1', [guide.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/guides/:id', err);
    res.status(500).json({ error: 'Failed to delete guide' });
  }
});

// =====================================================================
// SECTIONS — nested under a guide
// =====================================================================

// POST /api/guides/:id/sections — create a new section
// Body: { title?, intro?, position? }
router.post('/:id/sections', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;

    const { title, intro, position } = req.body || {};

    // If no position given, append to end
    let pos = position;
    if (typeof pos !== 'number') {
      const r = await pool.query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM guide_sections WHERE guide_id = $1',
        [guide.id]
      );
      pos = r.rows[0].next;
    }

    const result = await pool.query(
      `INSERT INTO guide_sections (guide_id, title, intro, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [guide.id, title || null, intro || null, pos]
    );
    // Touch guide's updated_at
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.status(201).json({ section: { ...result.rows[0], items: [] } });
  } catch (err) {
    console.error('POST /api/guides/:id/sections', err);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/guides/:id/sections/:sectionId — update title/intro/position
router.patch('/:id/sections/:sectionId', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    const section = await loadSection(res, req.params.sectionId, guide.id);
    if (!section) return;

    const allowed = ['title', 'intro', 'position'];
    const fields = [];
    const values = [];
    const updates = req.body || {};
    for (const key of allowed) {
      if (key in updates) {
        fields.push(key);
        values.push(updates[key]);
      }
    }
    if (!fields.length) return res.json({ section });

    values.push(section.id);
    const sql = `UPDATE guide_sections
                    SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}
                  WHERE id = $${values.length}
                  RETURNING *`;
    const result = await pool.query(sql, values);
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.json({ section: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/guides/:id/sections/:sectionId', err);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/guides/:id/sections/:sectionId — delete (cascades to items)
router.delete('/:id/sections/:sectionId', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    const section = await loadSection(res, req.params.sectionId, guide.id);
    if (!section) return;

    await pool.query('DELETE FROM guide_sections WHERE id = $1', [section.id]);
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/guides/:id/sections/:sectionId', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// =====================================================================
// SECTION ITEMS — nested under a section
// =====================================================================

// POST /api/guides/:id/sections/:sectionId/items — add a save to a section
// Body: { save_id, note?, position? }
// Validates save_id belongs to the same user.
router.post('/:id/sections/:sectionId/items', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    const section = await loadSection(res, req.params.sectionId, guide.id);
    if (!section) return;

    const { save_id, note, position } = req.body || {};
    const saveId = parseInt(save_id, 10);
    if (!saveId) return res.status(400).json({ error: 'save_id required' });

    // Verify save belongs to this user
    const saveCheck = await pool.query(
      'SELECT id, user_id FROM saves WHERE id = $1',
      [saveId]
    );
    if (!saveCheck.rows.length) return res.status(404).json({ error: 'Save not found' });
    if (saveCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Save belongs to another user' });
    }

    // Default position = end of section
    let pos = position;
    if (typeof pos !== 'number') {
      const r = await pool.query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM guide_section_items WHERE section_id = $1',
        [section.id]
      );
      pos = r.rows[0].next;
    }

    const result = await pool.query(
      `INSERT INTO guide_section_items (section_id, save_id, note, position)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [section.id, saveId, note || null, pos]
    );
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error('POST /api/guides/:id/sections/:sectionId/items', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// PATCH /api/guides/:id/sections/:sectionId/items/:itemId — update note/position
router.patch('/:id/sections/:sectionId/items/:itemId', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    const section = await loadSection(res, req.params.sectionId, guide.id);
    if (!section) return;

    const itemId = parseInt(req.params.itemId, 10);
    if (!itemId) return res.status(400).json({ error: 'Invalid item id' });

    // Verify item belongs to this section
    const itemCheck = await pool.query(
      'SELECT * FROM guide_section_items WHERE id = $1',
      [itemId]
    );
    if (!itemCheck.rows.length) return res.status(404).json({ error: 'Item not found' });
    if (itemCheck.rows[0].section_id !== section.id) {
      return res.status(403).json({ error: 'Item does not belong to this section' });
    }

    const allowed = ['note', 'position'];
    const fields = [];
    const values = [];
    const updates = req.body || {};
    for (const key of allowed) {
      if (key in updates) {
        fields.push(key);
        values.push(updates[key]);
      }
    }
    if (!fields.length) return res.json({ item: itemCheck.rows[0] });

    values.push(itemId);
    const sql = `UPDATE guide_section_items
                    SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}
                  WHERE id = $${values.length}
                  RETURNING *`;
    const result = await pool.query(sql, values);
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/guides/:id/sections/:sectionId/items/:itemId', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/guides/:id/sections/:sectionId/items/:itemId — remove from section
router.delete('/:id/sections/:sectionId/items/:itemId', authenticate, async (req, res) => {
  try {
    const guide = await loadOwnedGuide(req, res);
    if (!guide) return;
    const section = await loadSection(res, req.params.sectionId, guide.id);
    if (!section) return;

    const itemId = parseInt(req.params.itemId, 10);
    if (!itemId) return res.status(400).json({ error: 'Invalid item id' });

    // Verify item belongs to this section before deleting
    const itemCheck = await pool.query(
      'SELECT id, section_id FROM guide_section_items WHERE id = $1',
      [itemId]
    );
    if (!itemCheck.rows.length) return res.status(404).json({ error: 'Item not found' });
    if (itemCheck.rows[0].section_id !== section.id) {
      return res.status(403).json({ error: 'Item does not belong to this section' });
    }

    await pool.query('DELETE FROM guide_section_items WHERE id = $1', [itemId]);
    await pool.query('UPDATE guides SET updated_at = NOW() WHERE id = $1', [guide.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/guides/:id/sections/:sectionId/items/:itemId', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

module.exports = router;
