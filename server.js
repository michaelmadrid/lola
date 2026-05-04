require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// Database
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Anthropic
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Auth middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.json({ status: 'ok', db: 'error', error: err.message });
  }
});

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, name, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Get all trips for user
app.get('/api/trips', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.* FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ trips: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create trip
app.post('/api/trips', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO trips (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, req.user.id]
    );
    const trip = result.rows[0];
    await pool.query(
      'INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, $3)',
      [trip.id, req.user.id, 'owner']
    );
    res.json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single trip with days and legs
app.get('/api/trips/:id', authenticate, async (req, res) => {
  try {
    const trip = await pool.query(
      `SELECT t.* FROM trips t
       JOIN trip_members tm ON t.id = tm.trip_id
       WHERE t.id = $1 AND tm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

    const days = await pool.query(
      'SELECT * FROM trip_days WHERE trip_id = $1 ORDER BY date ASC',
      [req.params.id]
    );

    const legs = await pool.query(
      `SELECT tl.*, td.date FROM travel_legs tl
       JOIN trip_days td ON tl.day_id = td.id
       WHERE td.trip_id = $1
       ORDER BY td.date ASC, tl.sort_order ASC`,
      [req.params.id]
    );

    res.json({ trip: trip.rows[0], days: days.rows, legs: legs.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename trip
app.patch('/api/trips/:id', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });
    const result = await pool.query(
      'UPDATE trips SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), req.params.id]
    );
    res.json({ trip: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete trip
app.delete('/api/trips/:id', authenticate, async (req, res) => {
  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2 AND role = $3',
      [req.params.id, req.user.id, 'owner']
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });
    await pool.query('DELETE FROM trips WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import trip via Claude
app.post('/api/trips/import', authenticate, async (req, res) => {
  const { tripId, text, mode = 'replace' } = req.body;
  if (!tripId || !text) return res.status(400).json({ error: 'tripId and text required' });

  try {
    const member = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = $1 AND user_id = $2',
      [tripId, req.user.id]
    );
    if (!member.rows[0]) return res.status(403).json({ error: 'Not authorized' });

    // Check existing day count for confirmation
    const existing = await pool.query('SELECT COUNT(*) FROM trip_days WHERE trip_id = $1', [tripId]);
    const existingCount = parseInt(existing.rows[0].count);

    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Extract this travel itinerary into structured JSON. Return ONLY valid JSON, no explanation, no markdown.

Format:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "type": "travel|stay|arrive",
      "location": "City name or transit description e.g. Paris - Marseille",
      "stay": "Address or hotel name if staying",
      "alert": "Any important note for this day",
      "travel": [
        {
          "from": "departure city or airport code",
          "to": "arrival city or airport code",
          "dep": "departure time e.g. 4:30pm",
          "arr": "arrival time e.g. 10:00pm",
          "arrNote": "next day note if applicable e.g. May 13",
          "carrier": "airline or train operator",
          "ref": "flight/train number",
          "refCode": "booking reference code",
          "note": "any extra notes"
        }
      ]
    }
  ]
}

Rules:
- type is "travel" for transit days, "stay" for regular days, "arrive" for first day in a new city
- Include travel array only on transit days
- location for transit days should describe the journey e.g. "Bali - Taipei - Paris"
- Extract ALL days including stay days with no travel
- For stay days just include date, type, location, stay if known
- Today's date is ${today}
- If no year is specified, use ${nextYear} for future travel dates and ${currentYear} for past dates
- All dates must be full YYYY-MM-DD format

Itinerary:
${text}`
      }]
    });

    const raw = message.content[0].text.trim();
    const json = JSON.parse(raw.replace(/```json\n?|\n?```/g, ''));

    if (mode === 'update') {
      // Update mode — upsert each day, don't touch other days
      for (const day of json.days) {
        // Check if day exists
        const existing = await pool.query(
          'SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2',
          [tripId, day.date]
        );

        let dayId;
        if (existing.rows[0]) {
          // Update existing day
          await pool.query(
            `UPDATE trip_days SET type=$1, location=$2, stay=$3, alert=$4 WHERE id=$5`,
            [day.type || 'stay', day.location, day.stay || null, day.alert || null, existing.rows[0].id]
          );
          dayId = existing.rows[0].id;
          // Clear old legs for this day
          await pool.query('DELETE FROM travel_legs WHERE day_id = $1', [dayId]);
        } else {
          // Insert new day
          const result = await pool.query(
            `INSERT INTO trip_days (trip_id, date, type, location, stay, alert) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [tripId, day.date, day.type || 'stay', day.location, day.stay || null, day.alert || null]
          );
          dayId = result.rows[0].id;
        }

        if (day.travel && day.travel.length > 0) {
          for (let i = 0; i < day.travel.length; i++) {
            const leg = day.travel[i];
            await pool.query(
              `INSERT INTO travel_legs (day_id, from_city, to_city, dep_time, arr_time, arr_note, carrier, ref, ref_code, note, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [dayId, leg.from, leg.to, leg.dep, leg.arr, leg.arrNote || null,
               leg.carrier, leg.ref, leg.refCode || null, leg.note || null, i]
            );
          }
        }
      }
    } else {
      // Replace mode — clear and reimport
      await pool.query('DELETE FROM trip_days WHERE trip_id = $1', [tripId]);

    // Insert days and legs
    for (const day of json.days) {
      const dayResult = await pool.query(
        `INSERT INTO trip_days (trip_id, date, type, location, stay, alert)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tripId, day.date, day.type || 'stay', day.location, day.stay || null, day.alert || null]
      );
      const dayId = dayResult.rows[0].id;

      if (day.travel && day.travel.length > 0) {
        for (let i = 0; i < day.travel.length; i++) {
          const leg = day.travel[i];
          await pool.query(
            `INSERT INTO travel_legs (day_id, from_city, to_city, dep_time, arr_time, arr_note, carrier, ref, ref_code, note, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [dayId, leg.from, leg.to, leg.dep, leg.arr, leg.arrNote || null,
             leg.carrier, leg.ref, leg.refCode || null, leg.note || null, i]
          );
        }
      }
    }

    } // end replace mode

    res.json({ success: true, days: json.days.length, mode });

  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Journal
app.get('/api/journal/:tripId/:date', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM journal WHERE trip_id = $1 AND user_id = $2 AND date = $3',
      [req.params.tripId, req.user.id, req.params.date]
    );
    res.json({ entry: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/journal/:tripId/:date', authenticate, async (req, res) => {
  const { content } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO journal (trip_id, user_id, date, content, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (trip_id, user_id, date)
       DO UPDATE SET content = $4, updated_at = NOW()
       RETURNING *`,
      [req.params.tripId, req.user.id, req.params.date, content]
    );
    res.json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// City notes
app.get('/api/notes/:tripId/:city', authenticate, async (req, res) => {
  const city = decodeURIComponent(req.params.city);
  try {
    const result = await pool.query(
      'SELECT * FROM city_notes WHERE trip_id = $1 AND user_id = $2 AND city = $3',
      [req.params.tripId, req.user.id, city]
    );
    res.json({ note: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes/:tripId/:city', authenticate, async (req, res) => {
  const city = decodeURIComponent(req.params.city);
  const { content } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO city_notes (trip_id, user_id, city, content, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (trip_id, user_id, city)
       DO UPDATE SET content = $4, updated_at = NOW()
       RETURNING *`,
      [req.params.tripId, req.user.id, city, content]
    );
    res.json({ note: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// City links
app.get('/api/links/:tripId/:city', authenticate, async (req, res) => {
  const city = decodeURIComponent(req.params.city);
  try {
    const result = await pool.query(
      'SELECT * FROM city_links WHERE trip_id = $1 AND user_id = $2 AND city = $3 ORDER BY created_at ASC',
      [req.params.tripId, req.user.id, city]
    );
    res.json({ links: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/links/:tripId/:city', authenticate, async (req, res) => {
  const city = decodeURIComponent(req.params.city);
  const { title, url } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO city_links (trip_id, user_id, city, title, url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.tripId, req.user.id, city, title, url]
    );
    res.json({ link: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/links/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM city_links WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Lola running on port ${port}`);
});
