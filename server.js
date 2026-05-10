require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ============ LEGACY URL REDIRECTS ============
// Run BEFORE static so old paths redirect even if files still exist.
// 301 (permanent) so browsers update bookmarks.
app.get('/trips.html', (req, res) => res.redirect(301, '/travel/trips/'));
app.get('/trips-graveyard.html', (req, res) => res.redirect(301, '/travel/graveyard/'));
app.get('/atlas', (req, res) => res.redirect(301, '/travel/'));
app.get('/atlas/', (req, res) => res.redirect(301, '/travel/'));
app.get('/atlas/time', (req, res) => res.redirect(301, '/clocks/'));
app.get('/atlas/time/', (req, res) => res.redirect(301, '/clocks/'));
app.get('/travel/time', (req, res) => res.redirect(301, '/clocks/'));
app.get('/travel/time/', (req, res) => res.redirect(301, '/clocks/'));
app.get('/atlas/phrasebook', (req, res) => res.redirect(301, '/travel/phrasebook/'));
app.get('/atlas/phrasebook/', (req, res) => res.redirect(301, '/travel/phrasebook/'));
app.get('/atlas/extras', (req, res) => res.redirect(301, '/travel/extras/'));
app.get('/atlas/extras/', (req, res) => res.redirect(301, '/travel/extras/'));
// Old phrasebook JSON path (cached old pages may still hit it)
app.get('/atlas/phrasebook.json', (req, res) => res.redirect(301, '/travel/phrasebook.json'));

app.use(express.static('public'));

// ============ ROUTES ============
app.use('/api/health',  require('./api/routes/health'));
app.use('/api/auth',    require('./api/routes/auth'));
app.use('/api/cities',  require('./api/routes/cities'));
app.use('/api/places',  require('./api/routes/places'));
app.use('/api/trips',   require('./api/routes/trips'));
app.use('/api/notes',   require('./api/routes/notes'));
app.use('/api/saves',   require('./api/routes/saves'));
app.use('/api/todos',   require('./api/routes/todos'));
app.use('/api/guides',  require('./api/routes/guides'));
app.use('/api/phrases', require('./api/routes/phrases'));

// ============ PUBLIC GUIDE VIEW ============
// /guide/:slug is the canonical public URL — editorial, readable.
// The page (g.html) fetches the guide data via /api/guides/_public/:slug.
// No auth required for either the page or the API endpoint.
app.get('/guide/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'g.html'));
});

// ============ FALLBACK ============
// If a request hits /something but no static file exists,
// fall through to index.html (so client-side links still work)
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`lola running on port ${port}`);
});
