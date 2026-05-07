const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authenticate } = require('../auth');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, role`,
      [email, name, hash]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role || 'user' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.email, u.name, u.display_name, u.role, u.home_city_id, u.tracked_cities,
              c.name AS home_city_name, c.country AS home_city_country, c.timezone AS home_city_timezone
         FROM users u
         LEFT JOIN cities c ON u.home_city_id = c.id
        WHERE u.id = $1
        LIMIT 1`,
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = r.rows[0];

    // Hydrate tracked_cities with city info (name, country, timezone)
    let trackedHydrated = [];
    const tracked = Array.isArray(u.tracked_cities) ? u.tracked_cities : [];
    if (tracked.length) {
      const ids = tracked.map(t => t.city_id).filter(Boolean);
      if (ids.length) {
        const cityRes = await pool.query(
          `SELECT id, name, country, timezone FROM cities WHERE id = ANY($1::int[])`,
          [ids]
        );
        const cityMap = new Map(cityRes.rows.map(c => [c.id, c]));
        // Preserve user's tracked order
        trackedHydrated = tracked
          .map(t => {
            const c = cityMap.get(t.city_id);
            if (!c) return null;
            return {
              city_id: c.id,
              name: c.name,
              country: c.country,
              timezone: c.timezone,
              wake_start: typeof t.wake_start === 'number' ? t.wake_start : 9,
              wake_end: typeof t.wake_end === 'number' ? t.wake_end : 22,
            };
          })
          .filter(Boolean);
      }
    }

    res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        display_name: u.display_name,
        role: u.role,
        home_city_id: u.home_city_id,
        home_city: u.home_city_id ? {
          id: u.home_city_id,
          name: u.home_city_name,
          country: u.home_city_country,
          timezone: u.home_city_timezone,
        } : null,
        tracked_cities: trackedHydrated,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/me — update profile fields
router.patch('/me', authenticate, async (req, res) => {
  const { name, home_city_id, tracked_cities } = req.body;

  // Validate name if present
  let trimmedName = null;
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name required' });
    }
    if (name.trim().length > 80) {
      return res.status(400).json({ error: 'Name too long' });
    }
    trimmedName = name.trim();
  }

  // Validate home_city_id if present (allow null to clear)
  let cityIdToSet = undefined;
  if (home_city_id !== undefined) {
    if (home_city_id === null) {
      cityIdToSet = null;
    } else {
      const cid = parseInt(home_city_id, 10);
      if (Number.isNaN(cid)) return res.status(400).json({ error: 'Invalid home_city_id' });
      const exists = await pool.query(`SELECT 1 FROM cities WHERE id = $1`, [cid]);
      if (!exists.rows[0]) return res.status(400).json({ error: 'Unknown city' });
      cityIdToSet = cid;
    }
  }

  // Validate tracked_cities if present (array of {city_id, wake_start, wake_end})
  let trackedToSet = undefined;
  if (tracked_cities !== undefined) {
    if (!Array.isArray(tracked_cities)) {
      return res.status(400).json({ error: 'tracked_cities must be an array' });
    }
    if (tracked_cities.length > 10) {
      return res.status(400).json({ error: 'Too many tracked cities (max 10)' });
    }
    const cleaned = [];
    for (const t of tracked_cities) {
      if (!t || typeof t !== 'object') continue;
      const cid = parseInt(t.city_id, 10);
      if (Number.isNaN(cid)) continue;
      const ws = Number.isFinite(t.wake_start) ? Math.max(0, Math.min(23, t.wake_start)) : 9;
      const we = Number.isFinite(t.wake_end)   ? Math.max(0, Math.min(24, t.wake_end))   : 22;
      cleaned.push({ city_id: cid, wake_start: ws, wake_end: we });
    }
    // Verify all city ids exist
    if (cleaned.length) {
      const ids = cleaned.map(c => c.city_id);
      const r = await pool.query(`SELECT id FROM cities WHERE id = ANY($1::int[])`, [ids]);
      const valid = new Set(r.rows.map(x => x.id));
      trackedToSet = cleaned.filter(c => valid.has(c.city_id));
    } else {
      trackedToSet = [];
    }
  }

  if (trimmedName === null && cityIdToSet === undefined && trackedToSet === undefined) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Build dynamic update
  const sets = [];
  const params = [];
  if (trimmedName !== null) {
    params.push(trimmedName);
    sets.push(`name = $${params.length}`);
    params.push(trimmedName);
    sets.push(`display_name = $${params.length}`);
  }
  if (cityIdToSet !== undefined) {
    params.push(cityIdToSet);
    sets.push(`home_city_id = $${params.length}`);
  }
  if (trackedToSet !== undefined) {
    params.push(JSON.stringify(trackedToSet));
    sets.push(`tracked_cities = $${params.length}::jsonb`);
  }
  params.push(req.user.id);

  try {
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')}
        WHERE id = $${params.length}
        RETURNING id, email, name, display_name, role, home_city_id, tracked_cities`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    // Return a fresh token only when name actually changed (token is keyed on name+role)
    const token = trimmedName !== null ? signToken(user) : null;
    const payload = { user };
    if (token) payload.token = token;
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
