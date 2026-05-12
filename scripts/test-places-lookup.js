// =============================================================
// test-places-lookup.js
//
// Smoke test for api/places-lookup.js. Hardcoded list of real
// kit-style queries. No DB writes. Run from the droplet:
//
//   cd /var/www/kit.summer-holiday.com
//   node scripts/test-places-lookup.js
//
// Burns one Google Places call per item in the TESTS array.
// Free tier is 10,000/month — running this a handful of times
// for QA purposes is fine. To test more names, edit the array.
// =============================================================

require('dotenv').config();
const { lookupPlace } = require('../api/places-lookup');

// Add/remove entries here to test different shapes.
// Keep the list small (5–10 items) so a run stays quota-cheap.
const TESTS = [
  { name: 'Della Terra',     city: 'Bali' },
  { name: 'Mosto',           city: 'Bali' },
  { name: 'Comptoir de la Gastronomie', city: 'Paris' },
  { name: 'Hatchards',       city: 'London' },
  { name: 'Yvon Lambert',    city: 'Paris' },
  { name: 'asdf qwerty zzz', city: 'Bali' },   // expected: no match (null return)
];

(async () => {
  console.log('Running %d test lookups...\n', TESTS.length);

  for (const t of TESTS) {
    const label = `${t.name}${t.city ? ' (' + t.city + ')' : ''}`;
    try {
      const result = await lookupPlace(t);
      if (!result) {
        console.log(`✗ NO MATCH    ${label}`);
        continue;
      }
      console.log(`✓ MATCH       ${label}`);
      console.log(`  name:       ${result.name}`);
      console.log(`  address:    ${result.address}`);
      console.log(`  coords:     ${result.lat}, ${result.lng}`);
      console.log(`  type:       ${result.primary_type} → ${result.primary_type_label}`);
      console.log(`  place_id:   ${result.google_place_id}`);
      console.log('');
    } catch (err) {
      console.log(`! ERROR       ${label}`);
      console.log(`  ${err.message}\n`);
    }
  }

  console.log('Done. Spot-check the matches: are they the places you meant?');
})();
