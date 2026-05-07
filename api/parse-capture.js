// =============================================================
// parse-capture.js
// Parses a raw capture text into structured fields using Claude Haiku.
//
// Input:  "Della Terra Bali sit at the bar, cocktails are insane"
// Output: {
//   place_name: "Della Terra",
//   city: "Bali",
//   country: "Indonesia",
//   category: "drink",
//   tip: "sit at the bar, cocktails are insane"
// }
//
// Conservative — leaves any uncertain field null instead of guessing.
// Returns { error: '...' } on parse failure (network, JSON parse, etc.)
// =============================================================

const anthropic = require('./claude');

const CATEGORIES = ['eat', 'drink', 'coffee', 'stay', 'shop', 'see', 'other'];

const SYSTEM_PROMPT = `You extract structured fields from short travel notes a user has captured.

Return JSON only, no preamble or commentary. Schema:
{
  "place_name": string | null,   // the venue or business name
  "city": string | null,         // just the city or neighborhood — see rules
  "country": string | null,      // ISO English country name
  "category": string | null,     // one of: eat, drink, coffee, stay, shop, see, other
  "tip": string | null           // remaining advice/context
}

Rules:
- Try hard to extract a place_name. Even unusual or generic-sounding names like "Neighbourhood" can be real businesses.
- Leave fields null only if truly uncertain. Don't punish weird names.
- Normalize spelling for known cities (e.g., "Bandng" → "Bandung").
- DO NOT infer city from cuisine. "Italian restaurant" does not mean Italy. The COUNTRY follows the actual location, not the food.
- DO NOT infer city from country alone. "Indonesia" alone leaves city null.
- city can be a neighborhood (e.g., "Pererenan", "Marais", "Canggu") or a city proper. Use whichever the user wrote.
- Order doesn't matter — "Pererenan, Della Terra" and "Della Terra Pererenan" both have place=Della Terra, city=Pererenan.
- Categories:
    eat = restaurants, food spots, bakeries
    drink = bars, cocktail places, wine bars
    coffee = coffee shops, cafes
    stay = hotels, accommodations, airbnbs
    shop = stores, boutiques, bookshops
    see = galleries, museums, parks, sights
    other = anything else
- If input is not a place at all (e.g. "tape your mouth"), return all null.

Examples:

Input: Mosto Bali natural wine, Italian
Output: {"place_name": "Mosto", "city": "Bali", "country": "Indonesia", "category": "drink", "tip": "natural wine, Italian"}

Input: Della Terra Pererenan, sit at the bar
Output: {"place_name": "Della Terra", "city": "Pererenan", "country": "Indonesia", "category": "eat", "tip": "sit at the bar"}

Input: Pererenan, Della Terra - so good, grab a bar seat
Output: {"place_name": "Della Terra", "city": "Pererenan", "country": "Indonesia", "category": "eat", "tip": "so good, grab a bar seat"}

Input: Neighbourhood — best breakfast, Vegemite
Output: {"place_name": "Neighbourhood", "city": null, "country": null, "category": "eat", "tip": "best breakfast, Vegemite"}

Input: Joes Coffee Paris, cash only
Output: {"place_name": "Joes Coffee", "city": "Paris", "country": "France", "category": "coffee", "tip": "cash only"}

Input: Hatchards London bookshop, oldest in UK
Output: {"place_name": "Hatchards", "city": "London", "country": "United Kingdom", "category": "shop", "tip": "oldest in UK"}

Input: tape your mouth (Ritva Saarikko)
Output: {"place_name": null, "city": null, "country": null, "category": null, "tip": null}`;

/**
 * Parse a single capture text. Returns parsed object or { error }.
 * Never throws — always resolves.
 */
async function parseCapture(text) {
  if (!text || !text.trim()) {
    return { place_name: null, city: null, country: null, category: null, tip: null };
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: text.trim() }
      ],
    });

    // Extract text content from response
    const block = (response.content || []).find(b => b.type === 'text');
    if (!block) return { error: 'no text content in response' };
    const raw = block.text.trim();

    // Strip markdown code fences if Claude added them
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      return { error: 'invalid JSON: ' + e.message + ' | got: ' + raw.slice(0, 200) };
    }

    // Validate category against whitelist
    if (parsed.category && !CATEGORIES.includes(parsed.category.toLowerCase())) {
      parsed.category = null;
    } else if (parsed.category) {
      parsed.category = parsed.category.toLowerCase();
    }

    // Normalize empty strings to null
    for (const k of ['place_name', 'city', 'country', 'tip', 'category']) {
      if (parsed[k] === '' || parsed[k] === undefined) parsed[k] = null;
      if (typeof parsed[k] === 'string') parsed[k] = parsed[k].trim() || null;
    }

    return parsed;
  } catch (err) {
    return { error: (err.message || String(err)).slice(0, 500) };
  }
}

module.exports = { parseCapture, CATEGORIES };
