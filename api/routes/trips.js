const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

// Helper: get array of user IDs in same household as me (always includes me)
async function householdMemberIds(userId) {
  const r = await pool.query(
    `SELECT id FROM users
      WHERE id = $1
         OR (household_id IS NOT NULL
             AND household_id = (SELECT household_id FROM users WHERE id = $1))`,
    [userId]
  );
  return r.rows.map(row => row.id);
}

// Helper: am I owner of this trip? (created_by check)
async function isOwner(tripId, userId) {
  const r = await pool.query(
    `SELECT 1 FROM trips WHERE id = $1 AND created_by = $2`,
    [tripId, userId]
  );
  return r.rows.length > 0;
}

// Helper: can I read/edit this trip? (anyone in my household)
async function canRead(tripId, userId) {
  const ids = await householdMemberIds(userId);
  const r = await pool.query(
    `SELECT 1 FROM trips
      WHERE id = $1
        AND deleted_at IS NULL
        AND created_by = ANY($2::int[])`,
    [tripId, ids]
  );
  return r.rows.length > 0;
}
async function canEdit(tripId, userId) {
  return canRead(tripId, userId);
}

// ===========================================================
// TRIPS
// ===========================================================

// GET /api/trips — list active trips visible to me (mine + household)
router.get('/', authenticate, async (req, res) => {
  try {
    const ids = await householdMemberIds(req.user.id);
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name, (t.created_by = $1) AS is_owner
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = ANY($2::int[])
         AND t.deleted_at IS NULL
       ORDER BY COALESCE(t.date_start, t.created_at) DESC`,
      [req.user.id, ids]
    );
    res.json({ trips: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/graveyard — soft-deleted trips owned by me
router.get('/graveyard', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name, true AS is_owner
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = $1
         AND t.deleted_at IS NOT NULL
       ORDER BY t.deleted_at DESC`,
      [req.user.id]
    );
    res.json({ trips: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/active — what trip (if any) covers today's date for my household
router.get('/active', authenticate, async (req, res) => {
  try {
    const ids = await householdMemberIds(req.user.id);
    const result = await pool.query(
      `SELECT t.*, u.name AS owner_name, (t.created_by = $1) AS is_owner
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = ANY($2::int[])
         AND t.deleted_at IS NULL
         AND t.date_start IS NOT NULL
         AND t.date_end IS NOT NULL
         AND CURRENT_DATE BETWEEN t.date_start AND t.date_end
       ORDER BY t.date_start
       LIMIT 1`,
      [req.user.id, ids]
    );
    res.json({ trip: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/next — active trip if any, else next upcoming, else null
router.get('/next', authenticate, async (req, res) => {
  try {
    const ids = await householdMemberIds(req.user.id);
    // First try active
    const active = await pool.query(
      `SELECT t.*, u.name AS owner_name, (t.created_by = $1) AS is_owner,
              'active' AS phase
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = ANY($2::int[])
         AND t.deleted_at IS NULL
         AND t.date_start IS NOT NULL
         AND t.date_end IS NOT NULL
         AND CURRENT_DATE BETWEEN t.date_start AND t.date_end
       ORDER BY t.date_start
       LIMIT 1`,
      [req.user.id, ids]
    );
    if (active.rows[0]) return res.json({ trip: active.rows[0] });

    // Else next upcoming
    const upcoming = await pool.query(
      `SELECT t.*, u.name AS owner_name, (t.created_by = $1) AS is_owner,
              'upcoming' AS phase
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = ANY($2::int[])
         AND t.deleted_at IS NULL
         AND t.date_start IS NOT NULL
         AND t.date_start > CURRENT_DATE
       ORDER BY t.date_start
       LIMIT 1`,
      [req.user.id, ids]
    );
    res.json({ trip: upcoming.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:id — single trip with segments
router.get('/:id', authenticate, async (req, res) => {
  try {
    const ids = await householdMemberIds(req.user.id);
    const trip = await pool.query(
      `SELECT t.*, u.name AS owner_name, (t.created_by = $1) AS is_owner
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $2
         AND t.deleted_at IS NULL
         AND t.created_by = ANY($3::int[])`,
      [req.user.id, req.params.id, ids]
    );
    if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

    const segments = await pool.query(
      `SELECT s.*,
              c.name AS city_name,
              c.country AS city_country,
              c.slug AS city_slug,
              c.timezone AS city_timezone
       FROM trip_segments s
       LEFT JOIN cities c ON s.city_id = c.id
       WHERE s.trip_id = $1
       ORDER BY s.sort_order ASC, s.date_start ASC NULLS LAST`,
      [req.params.id]
    );

    res.json({ trip: trip.rows[0], segments: segments.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips — create
router.post('/', authenticate, async (req, res) => {
  const { name, date_start, date_end, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const slug = slugify(name);
    const tripResult = await pool.query(
      `INSERT INTO trips (name, slug, date_start, date_end, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, slug, date_start || null, date_end || null, notes || null, req.user.id]
    );
    const trip = tripResult.rows[0];
    // Maintain trip_members for backward compat
    try {
      await pool.query(
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [trip.id, req.user.id, 'owner']
      );
    } catch (e) {}
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Slugify trip name for public URL
function slugifyTripName(text) {
  if (!text) return 'untitled';
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

// Generate a unique slug for a trip — handles collisions with -2, -3, ...
async function generateUniqueTripSlug(baseSlug, excludeId) {
  let candidate = baseSlug;
  let attempt = 1;
  while (true) {
    const r = await pool.query(
      `SELECT id FROM trips WHERE slug = $1 AND id <> $2`,
      [candidate, excludeId || 0]
    );
    if (!r.rows.length) return candidate;
    attempt += 1;
    candidate = `${baseSlug}-${attempt}`;
    if (attempt > 100) return `${baseSlug}-${Date.now()}`;
  }
}

// PATCH /api/trips/:id — edit (anyone in household)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    if (!(await canEdit(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Load current trip — we may need its name/slug for publish logic
    const cur = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Trip not found' });
    const trip = cur.rows[0];

    const allowed = ['name', 'date_start', 'date_end', 'notes', 'slug', 'status'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        updates.push(`${key} = $${params.length}`);
      }
    }

    // Status validation
    if ('status' in req.body) {
      const valid = ['draft', 'published', 'archived'];
      if (!valid.includes(req.body.status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
      }
    }

    // Auto-slug + published_at on first publish
    const extraSet = [];
    if (req.body.status === 'published' && !trip.slug) {
      const newName = (req.body.name !== undefined) ? req.body.name : trip.name;
      const baseSlug = slugifyTripName(newName);
      const uniqueSlug = await generateUniqueTripSlug(baseSlug, trip.id);
      params.push(uniqueSlug);
      updates.push(`slug = $${params.length}`);
      extraSet.push('published_at = NOW()');
    } else if (req.body.status === 'published' && trip.slug && !trip.published_at) {
      extraSet.push('published_at = NOW()');
    }

    if (!updates.length && !extraSet.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const setClauses = updates.concat(extraSet).concat(['updated_at = NOW()']);
    const result = await pool.query(
      `UPDATE trips SET ${setClauses.join(', ')}
        WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ trip: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Slug conflict, retry' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id — owner-only, soft delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!(await isOwner(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Only the owner can delete a trip' });
    }
    await pool.query(
      `UPDATE trips SET deleted_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/restore — owner-only
router.post('/:id/restore', authenticate, async (req, res) => {
  try {
    if (!(await isOwner(req.params.id, req.user.id))) {
      return res.status(403).json({ error: 'Only the owner can restore' });
    }
    const r = await pool.query(
      `UPDATE trips SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Trip not found in graveyard' });
    res.json({ trip: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================
// SEGMENTS — household members can manage
// ===========================================================

router.post('/:tripId/segments', authenticate, async (req, res) => {
  const { tripId } = req.params;
  const { city_id, region_label, date_start, date_end, sort_order, notes } = req.body;
  if (!city_id && !region_label) {
    return res.status(400).json({ error: 'Either city_id or region_label required' });
  }
  try {
    if (!(await canEdit(tripId, req.user.id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await pool.query(
      `INSERT INTO trip_segments (trip_id, city_id, region_label, date_start, date_end, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tripId, city_id || null, region_label || null,
       date_start || null, date_end || null, sort_order || 0, notes || null]
    );
    res.json({ segment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:tripId/segments/:segmentId', authenticate, async (req, res) => {
  const { tripId, segmentId } = req.params;
  try {
    if (!(await canEdit(tripId, req.user.id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const allowed = ['city_id', 'region_label', 'date_start', 'date_end', 'sort_order', 'notes'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        params.push(req.body[key]);
        updates.push(`${key} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(segmentId);
    params.push(tripId);
    const result = await pool.query(
      `UPDATE trip_segments SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND trip_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Segment not found' });
    res.json({ segment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:tripId/segments/:segmentId', authenticate, async (req, res) => {
  const { tripId, segmentId } = req.params;
  try {
    if (!(await canEdit(tripId, req.user.id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM trip_segments WHERE id = $1 AND trip_id = $2', [segmentId, tripId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================================
// PUBLIC — accessing published trips by slug (no auth required)
// =====================================================================
const { softAuthenticate } = require('../auth');

router.get('/_public/:slug', softAuthenticate, async (req, res) => {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Slug required' });

    const tripRes = await pool.query(
      `SELECT t.*, u.name AS owner_name
         FROM trips t
         LEFT JOIN users u ON t.created_by = u.id
        WHERE t.slug = $1
          AND t.status = 'published'
          AND t.deleted_at IS NULL
        LIMIT 1`,
      [slug]
    );
    if (!tripRes.rows.length) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const trip = tripRes.rows[0];

    const segmentsRes = await pool.query(
      `SELECT s.id, s.region_label, s.date_start, s.date_end, s.sort_order, s.notes,
              c.name AS city_name, c.country AS city_country, c.slug AS city_slug
         FROM trip_segments s
         LEFT JOIN cities c ON s.city_id = c.id
        WHERE s.trip_id = $1
        ORDER BY s.sort_order ASC, s.date_start ASC NULLS LAST`,
      [trip.id]
    );

    // Strip identifying data — only return what's needed for public render
    const publicTrip = {
      name: trip.name,
      date_start: trip.date_start,
      date_end: trip.date_end,
      notes: trip.notes,
      slug: trip.slug,
      owner_name: trip.owner_name,
      published_at: trip.published_at,
    };

    res.json({ trip: publicTrip, segments: segmentsRes.rows });
  } catch (err) {
    console.error('GET /api/trips/_public/:slug', err);
    res.status(500).json({ error: 'Failed to load trip' });
  }
});

module.exports = router;
