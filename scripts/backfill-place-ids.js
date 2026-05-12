// =============================================================
// backfill-place-ids.js
//
// Resolves existing saves with null place_id to canonical places
// rows via the Google Places resolver. Run from droplet:
//
//   cd /var/www/kit.summer-holiday.com
//   node scripts/backfill-place-ids.js
//
// Idempotent: only operates on saves where place_id IS NULL.
// Re-running after Ctrl+C picks up where it stopped. Live captures
// happening during a run are also safe — the live pipeline writes
// place_id directly, and this script won't touch already-resolved rows.
//
// Selection criteria:
//   - place_id IS NULL              (not yet resolved)
//   - place_name IS NOT NULL        (AI extracted a name to look up)
//   - has city attached via save_cities (kit's strict cities rule —
//     no point sending Google a query without a city anchor)
//
// Rate: 300ms between calls (~3 req/sec, well under any Google limit).
// =============================================================

require('dotenv').config();
const pool = require('../api/db');
const { resolveOrCreatePlace } = require('../api/places-resolver');

const DELAY_MS = 300;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  // Gather eligible saves with their attached city (first one if multiple)
  const eligibleQuery = `
    SELECT s.id,
           s.place_name,
           c.id   AS city_id,
           c.name AS city_name
      FROM saves s
      JOIN save_cities sc ON sc.save_id = s.id
      JOIN cities c       ON sc.city_id = c.id
     WHERE s.place_id IS NULL
       AND s.place_name IS NOT NULL
       AND s.place_name <> ''
     ORDER BY s.id ASC
  `;
  const { rows } = await pool.query(eligibleQuery);

  // Also count saves we'll SKIP for visibility
  const skipQuery = `
    SELECT COUNT(*) AS n
      FROM saves s
     WHERE s.place_id IS NULL
       AND (s.place_name IS NULL OR s.place_name = '' OR NOT EXISTS (
           SELECT 1 FROM save_cities sc WHERE sc.save_id = s.id
       ))
  `;
  const skipResult = await pool.query(skipQuery);
  const skippedCount = parseInt(skipResult.rows[0].n, 10);

  if (!rows.length) {
    console.log('No eligible saves to backfill. Done.');
    if (skippedCount > 0) {
      console.log(`(${skippedCount} saves skipped: no place_name or no attached city.)`);
    }
    process.exit(0);
  }

  console.log(`Backfilling ${rows.length} saves...`);
  if (skippedCount > 0) {
    console.log(`(${skippedCount} additional saves skipped: no place_name or no attached city.)`);
  }
  console.log('');

  const stats = { resolved: 0, noMatch: 0, errors: 0 };
  const startedAt = Date.now();

  // Deduplicate: same save id can appear multiple times if multiple cities
  // attached. Take the first city only.
  const seen = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const label = `[${i + 1}/${rows.length}] save#${row.id} "${row.place_name}" (${row.city_name})`;

    try {
      const placeId = await resolveOrCreatePlace({
        name: row.place_name,
        cityId: row.city_id,
        cityName: row.city_name,
      });

      if (placeId) {
        await pool.query(
          `UPDATE saves SET place_id = $1 WHERE id = $2`,
          [placeId, row.id]
        );
        console.log(`${label} → places.id=${placeId} ✓`);
        stats.resolved++;
      } else {
        console.log(`${label} → no Google match ✗`);
        stats.noMatch++;
      }
    } catch (err) {
      console.log(`${label} → ERROR: ${err.message}`);
      stats.errors++;
    }

    // Be polite to Google; also lets you Ctrl+C cleanly
    if (i < rows.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log('');
  console.log(`Done in ${elapsed}s.`);
  console.log(`  Resolved: ${stats.resolved}`);
  console.log(`  No match: ${stats.noMatch}`);
  console.log(`  Errors:   ${stats.errors}`);
  if (skippedCount > 0) {
    console.log(`  Skipped:  ${skippedCount} (no place_name or no attached city)`);
  }

  // Force exit — pg pool keeps process alive otherwise
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
