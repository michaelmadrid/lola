const jwt = require('jsonwebtoken');

// Hard auth — 401 if no token or invalid
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

// Soft auth — attaches req.user if token is valid, but doesn't fail if missing.
// Use for endpoints that work without auth but offer more when signed in
// (e.g. public Index page can still mark items you've visited).
function softAuthenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // ignore — treat as anonymous
    }
  }
  next();
}

module.exports = { authenticate, softAuthenticate };
