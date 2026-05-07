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
  "place_name": string | null,   // the venue or business name (e.g. "Della Terra")
  "city": string | null,         // just the city name, no country, no neighborhood
  "country": string | null,      // ISO English country name (e.g. "France", "Indonesia")
  "category": string | null,     // one of: eat, drink, coffee, stay, shop, see, other
  "tip": string | null,          // any practical note: hours, what to order, what to avoid
  "address": string | null       // street address ONLY if you are highly confident
}

Rules:
- Leave fields null if you are uncertain. Do not guess.
- Normalize spelling for known cities (e.g., "Bandng" → "Bandung").
- Do NOT infer city from country alone. If only "Indonesia" is mentioned, leave city null.
- Strip the city name out of place_name (e.g., "Joes Coffee Paris" → place_name: "Joes Coffee", city: "Paris").
- The tip field is the remaining advice/context after place_name and city are extracted.
- Address: ONLY return if you are highly confident this is the actual street address of this specific place. Better to leave null than to guess. Format: full street address as commonly written.
- Categories:
    eat = restaurants, food spots
    drink = bars, cocktail places
    coffee = coffee shops, cafes
    stay = hotels, accommodations
    shop = stores, boutiques, bookshops, galleries-as-shop
    see = galleries, museums, parks, neighborhoods, sights
    other = anything else (or unclear)
- If the input does not describe a place at all (e.g. "tape your mouth" — pure note), return all null.`;

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
    for (const k of ['place_name', 'city', 'country', 'tip', 'category', 'address']) {
      if (parsed[k] === '' || parsed[k] === undefined) parsed[k] = null;
      if (typeof parsed[k] === 'string') parsed[k] = parsed[k].trim() || null;
    }

    return parsed;
  } catch (err) {
    return { error: (err.message || String(err)).slice(0, 500) };
  }
}

module.exports = { parseCapture, CATEGORIES };
