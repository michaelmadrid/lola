const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.json({ status: 'ok', db: 'error', error: err.message });
  }
});

module.exports = router;
