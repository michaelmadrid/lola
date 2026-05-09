/* =====================================================================
   /api/phrases — user custom phrases + on-demand translation

   Curated phrases live in /public/data/phrases-curated.json (shipped
   with the app, no DB rows). This module only handles user additions.

   Translation strategy:
   - Custom phrases store source text; translations are filled in lazily
     into the `translations` JSONB column.
   - On first view of a language, client calls POST /api/phrases/translate
     with target_lang. Server finds untranslated rows for that lang and
     batch-translates via Claude Haiku, then writes back to JSONB.
   - Subsequent views are instant (cache hit).
   ===================================================================== */

const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');
const anthropic = require('../claude');

// Hardcoded category allow-list. Mirrors the keys in phrases-curated.json
// (minus the _meta block). Update both together when adding categories.
const CATEGORIES = new Set([
  'coffee', 'food', 'friends', 'movement', 'shopping',
  'stay', 'going_out', 'trouble', 'mood', 'wifi',
]);

// Hardcoded language allow-list. Mirrors phrases-curated.json _meta.languages.
const LANGUAGES = new Set(['fr', 'es', 'it', 'pt', 'de', 'ja']);

const LANG_FULL_NAME = {
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  de: 'German',
  ja: 'Japanese',
};

// ---- GET /api/phrases — all custom phrases for current user ----
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, text, translations, created_at
         FROM phrases
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ phrases: result.rows });
  } catch (err) {
    console.error('GET /api/phrases', err);
    res.status(500).json({ error: 'Failed to load phrases' });
  }
});

// ---- POST /api/phrases — create one or more custom phrases ----
// Body: { category: 'coffee', text: 'A flat white' }
// (Future: batch via { category, texts: ['…', '…'] } — not in V1.)
router.post('/', authenticate, async (req, res) => {
  try {
    const { category, text } = req.body || {};
    if (!category || !CATEGORIES.has(category)) {
      return res.status(400).json({
        error: 'Invalid or missing category',
        valid: [...CATEGORIES],
      });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Phrase text required' });
    }

    const result = await pool.query(
      `INSERT INTO phrases (user_id, category, text)
       VALUES ($1, $2, $3)
       RETURNING id, category, text, translations, created_at`,
      [req.user.id, category, String(text).trim()]
    );
    res.status(201).json({ phrase: result.rows[0] });
  } catch (err) {
    console.error('POST /api/phrases', err);
    res.status(500).json({ error: 'Failed to create phrase' });
  }
});

// ---- DELETE /api/phrases/:id — remove a custom phrase ----
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await pool.query(
      `DELETE FROM phrases WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Phrase not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/phrases/:id', err);
    res.status(500).json({ error: 'Failed to delete phrase' });
  }
});

// ---- POST /api/phrases/translate — fill in translations for a target language ----
// Body: { target_lang: 'fr' }
// Finds all current user's phrases that lack target_lang in their translations
// JSONB, batch-translates via Claude Haiku, writes back.
//
// Returns the updated phrases (full list — easier for client to merge state).
router.post('/translate', authenticate, async (req, res) => {
  try {
    const { target_lang } = req.body || {};
    if (!target_lang || !LANGUAGES.has(target_lang)) {
      return res.status(400).json({
        error: 'Invalid or missing target_lang',
        valid: [...LANGUAGES],
      });
    }

    // Find phrases that don't have this lang yet
    const missing = await pool.query(
      `SELECT id, text
         FROM phrases
        WHERE user_id = $1
          AND NOT (translations ? $2)`,
      [req.user.id, target_lang]
    );

    if (missing.rows.length) {
      // Build a numbered list for Claude — output is parsed by the same numbers
      const numbered = missing.rows
        .map((row, i) => `${i + 1}. ${row.text}`)
        .join('\n');

      const langName = LANG_FULL_NAME[target_lang];
      const prompt = `Translate each of these short phrases to ${langName}. Output ONLY the translations as a numbered list with the same numbers, nothing else. No explanations, no quotes, no commentary. Use natural, polite, conversational register suitable for a traveler. For Japanese, use polite (です/ます) form.\n\n${numbered}`;

      let translated;
      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });
        translated = response.content[0].text;
      } catch (claudeErr) {
        console.error('Claude translate call failed', claudeErr);
        return res.status(502).json({ error: 'Translation service unavailable' });
      }

      // Parse the response — expect "1. xxx\n2. yyy\n…"
      const parsed = {};
      const lines = translated.split('\n');
      for (const line of lines) {
        const m = line.match(/^\s*(\d+)\.\s*(.+?)\s*$/);
        if (m) {
          const idx = parseInt(m[1], 10) - 1;
          if (idx >= 0 && idx < missing.rows.length) {
            parsed[missing.rows[idx].id] = m[2];
          }
        }
      }

      // Write each translation back via JSONB merge
      // Use a transaction so partial failures don't leave half-translated state
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const phrase of missing.rows) {
          const t = parsed[phrase.id];
          if (!t) continue;
          await client.query(
            `UPDATE phrases
                SET translations = translations || jsonb_build_object($1::text, $2::text),
                    updated_at = NOW()
              WHERE id = $3 AND user_id = $4`,
            [target_lang, t, phrase.id, req.user.id]
          );
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }

    // Return the user's full phrase list (with the new translations now populated)
    const result = await pool.query(
      `SELECT id, category, text, translations, created_at
         FROM phrases
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ phrases: result.rows, translated_count: missing.rows.length });
  } catch (err) {
    console.error('POST /api/phrases/translate', err);
    res.status(500).json({ error: 'Failed to translate' });
  }
});

module.exports = router;
