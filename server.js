require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
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

// ============ FALLBACK ============
// If a request hits /something but no static file exists,
// fall through to index.html (so client-side links still work)
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`lola running on port ${port}`);
});
