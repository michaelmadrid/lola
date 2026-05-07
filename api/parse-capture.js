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
  "place_name": string | null,    // the venue or business name
  "city": string | null,          // the recognizable city/island/region (the broader bucket)
  "neighborhood": string | null,  // a known sub-area inside that city, if any
  "country": string | null,       // ISO English country name
  "timezone": string | null,      // IANA timezone for the city, e.g. "Europe/Paris", "Asia/Makassar". Null if uncertain.
  "category": string | null,      // one of: eat, drink, coffee, stay, shop, see, other
  "tip": string | null            // remaining advice/context
}

Rules:
- Try hard to extract a place_name. Even unusual or generic-sounding names like "Neighbourhood" can be real businesses.
- Leave fields null only if truly uncertain. Don't punish weird names.
- DO NOT fabricate a place_name. If the input is purely descriptors (e.g. "great bakery & coffee" with no business name), set place_name to null and put the descriptors in tip.
- DO NOT treat a city or country name as a place_name. "Copenhagen" by itself is not a venue.
- The tip field is the FULL remaining text after place_name and city are extracted. Do NOT shorten or paraphrase it. Do NOT drop words just because they overlap with the category (e.g. if category is "coffee", still keep "coffee" in the tip if the user wrote it).
- Normalize spelling for known cities (e.g., "Bandng" → "Bandung").
- DO NOT infer city from cuisine. "Italian restaurant" does not mean Italy. The COUNTRY follows the actual location, not the food.
- DO NOT infer city from country alone. "Indonesia" alone leaves city null.
- For timezone: when city is set, return its standard IANA timezone (e.g., "Europe/Paris", "Asia/Tokyo", "America/New_York", "Asia/Makassar" for Bali). Only return a timezone you're highly confident in. If unsure, leave timezone null — better null than wrong.
- Only ONE level of neighborhood. If a sub-region exists inside a recognizable city/island, use city + neighborhood. Otherwise just city.
- For Bali: city is always "Bali". Villages/areas like Canggu, Pererenan, Seseh, Berawa, Ubud, Seminyak, Kuta, Sanur, Uluwatu, Jimbaran are neighborhoods.
- For Paris: city is "Paris". Marais, Belleville, Pigalle, Montmartre, etc. are neighborhoods.
- For most cities (small or medium ones): no neighborhood needed. Just city.
- If user wrote a hood without an explicit city, you can still infer the city if you're confident (e.g., "Canggu" → city: Bali, neighborhood: Canggu).
- Order doesn't matter — "Pererenan, Della Terra" and "Della Terra Pererenan" both have place=Della Terra, city=Bali, neighborhood=Pererenan.
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

Input: Mosto Canggu natural wine, Italian
Output: {"place_name": "Mosto", "city": "Bali", "neighborhood": "Canggu", "country": "Indonesia", "timezone": "Asia/Makassar", "category": "drink", "tip": "natural wine, Italian"}

Input: Della Terra Pererenan, sit at the bar
Output: {"place_name": "Della Terra", "city": "Bali", "neighborhood": "Pererenan", "country": "Indonesia", "timezone": "Asia/Makassar", "category": "eat", "tip": "sit at the bar"}

Input: Pererenan, Della Terra - so good, grab a bar seat
Output: {"place_name": "Della Terra", "city": "Bali", "neighborhood": "Pererenan", "country": "Indonesia", "timezone": "Asia/Makassar", "category": "eat", "tip": "so good, grab a bar seat"}

Input: Neighbourhood — best breakfast, Vegemite
Output: {"place_name": "Neighbourhood", "city": null, "neighborhood": null, "country": null, "timezone": null, "category": "eat", "tip": "best breakfast, Vegemite"}

Input: great bakery & coffee
Output: {"place_name": null, "city": null, "neighborhood": null, "country": null, "timezone": null, "category": "coffee", "tip": "great bakery & coffee"}

Input: great coffee & pastries
Output: {"place_name": null, "city": null, "neighborhood": null, "country": null, "timezone": null, "category": "coffee", "tip": "great coffee & pastries"}

Input: Copenhagen
Output: {"place_name": null, "city": "Copenhagen", "neighborhood": null, "country": "Denmark", "timezone": "Europe/Copenhagen", "category": null, "tip": null}

Input: Joes Coffee Marais, cash only
Output: {"place_name": "Joes Coffee", "city": "Paris", "neighborhood": "Marais", "country": "France", "timezone": "Europe/Paris", "category": "coffee", "tip": "cash only"}

Input: Comptoir de la Gastronomie Paris, classic French
Output: {"place_name": "Comptoir de la Gastronomie", "city": "Paris", "neighborhood": null, "country": "France", "timezone": "Europe/Paris", "category": "eat", "tip": "classic French"}

Input: Hatchards London bookshop, oldest in UK
Output: {"place_name": "Hatchards", "city": "London", "neighborhood": null, "country": "United Kingdom", "timezone": "Europe/London", "category": "shop", "tip": "oldest in UK"}

Input: tape your mouth (Ritva Saarikko)
Output: {"place_name": null, "city": null, "neighborhood": null, "country": null, "timezone": null, "category": null, "tip": null}`;

/**
 * Parse a single capture text. Returns parsed object or { error }.
 * Never throws — always resolves.
 *
 * @param {string} text - the raw capture
 * @param {object} [opts] - optional context
 * @param {string} [opts.boundCityName] - if user explicitly bound this batch to a city, helps AI disambiguate
 */
async function parseCapture(text, opts = {}) {
  if (!text || !text.trim()) {
    return { place_name: null, city: null, neighborhood: null, country: null, timezone: null, category: null, tip: null };
  }

  // If user pre-bound this capture to a city, give AI that context.
  // Helps with cases like "Copenhagen" being the name of a place IN Bali (a bakery),
  // not the city Copenhagen.
  let userMessage = text.trim();
  if (opts.boundCityName) {
    userMessage = `[Context: the user has bound this capture to the city "${opts.boundCityName}". When a line begins with a name that is also a city elsewhere, default to interpreting it as a place name in ${opts.boundCityName}, not as a different city. The bound city is the default location.]\n\n${userMessage}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage }
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
    for (const k of ['place_name', 'city', 'neighborhood', 'country', 'timezone', 'tip', 'category']) {
      if (parsed[k] === '' || parsed[k] === undefined) parsed[k] = null;
      if (typeof parsed[k] === 'string') parsed[k] = parsed[k].trim() || null;
    }

    // Sanity check timezone shape: must look like "Region/City" or be null.
    // Rejects garbage like "GMT+8" or "Asia" alone.
    if (parsed.timezone && !/^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_/]+$/.test(parsed.timezone)) {
      parsed.timezone = null;
    }

    return parsed;
  } catch (err) {
    return { error: (err.message || String(err)).slice(0, 500) };
  }
}

module.exports = { parseCapture, CATEGORIES };
