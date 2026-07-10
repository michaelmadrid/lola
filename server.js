require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  console.log('hostname:', req.hostname, 'path:', req.path);
  next();
});

// ============ LEGACY URL REDIRECTS ============
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
app.get('/atlas/phrasebook.json', (req, res) => res.redirect(301, '/travel/phrasebook.json'));

app.use(express.static('public'));

// ============ ROUTES ============
app.use('/api/health',  require('./api/routes/health'));
app.use('/api/auth',    require('./api/routes/auth'));
app.use('/api/cities',  require('./api/routes/cities'));
app.use('/api/places',  require('./api/routes/places'));
app.use('/api/trips',   require('./api/routes/trips'));
app.use('/api/notes',   require('./api/routes/notes'));
app.use('/api/spots',   require('./api/routes/spots'));
app.use('/api/todos',   require('./api/routes/todos'));
app.use('/api/guides',  require('./api/routes/guides'));
app.use('/api/upload',  require('./api/routes/upload'));

// ============ PUBLIC GUIDE VIEW ============
app.get('/guide/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'g.html'));
});

// ============ SUMMER HOLIDAY INDEX ============
// Serves on index.summer-holiday.com subdomain OR /index-sh path
app.use((req, res, next) => {
  if (req.hostname === 'index.summer-holiday.com') {
    return res.sendFile(path.join(__dirname, 'public', 'index-sh', 'index.html'));
  }
  next();
});
app.get('/index-sh', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index-sh', 'index.html'));
});

// ============ FALLBACK ============
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`lola running on port ${port}`);
});
