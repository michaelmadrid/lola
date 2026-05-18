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
- Try hard to extract a place_name. Even unusual or generic-sounding names like "Neighbourhood", "March", "Early June", "Tuesday" can be real businesses. Restaurants and bars often have names that look like months, days, or common words.
- When the user has bound this capture to a city (provided as context), they have explicitly told you they're saving a venue. Lean toward interpreting the input as a venue, not as a fragment, date, or descriptor. Only return null place_name if the input is clearly NOT a venue at all (pure descriptors like "great coffee", or random text like "tape your mouth").
- Recognize the dash convention: when a user writes "X - Y" or "X — Y" or "X, Y", they usually mean X is the place name and Y is the tip. This holds even when X looks unusual ("Early June - great wine" → place_name "Early June", tip "great wine").
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

Input (with bound city Paris): Early June - great natural wine and food
Output: {"place_name": "Early June", "city": "Paris", "neighborhood": null, "country": "France", "timezone": "Europe/Paris", "category": "drink", "tip": "great natural wine and food"}

Input (with bound city Paris): March, classic bistro
Output: {"place_name": "March", "city": "Paris", "neighborhood": null, "country": "France", "timezone": "Europe/Paris", "category": "eat", "tip": "classic bistro"}

Input (with bound city Berlin): Tuesday — coffee
Output: {"place_name": "Tuesday", "city": "Berlin", "neighborhood": null, "country": "Germany", "timezone": "Europe/Berlin", "category": "coffee", "tip": "coffee"}

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

  // If user pre-bound this capture to a city, the bound city is authoritative
  // unless the text clearly and unambiguously names a different city. This handles:
  //   - "Copenhagen" captured while bound to Bali → place_name "Copenhagen" in Bali
  //     (a bakery), NOT the city Copenhagen.
  //   - "Della Terra" captured while bound to Bali → city Bali (the bound city wins
  //     when the text doesn't specify a city).
  //   - "Comptoir Paris" captured while bound to Bali → city Paris (the text
  //     explicitly names Paris, overriding the bound default).
  //   - "Early June" captured while bound to Paris → place_name "Early June",
  //     not interpreted as a date (the bound city signals the user IS saving a venue).
  let userMessage = text.trim();
  if (opts.boundCityName) {
    userMessage = `[Context: the user has bound this capture to "${opts.boundCityName}". Treat "${opts.boundCityName}" as the default city — return it unless the text explicitly and unambiguously names a different city. Names that are ALSO cities elsewhere (like "Copenhagen" or "Mosto") should be treated as place_names in ${opts.boundCityName}, not as different cities, unless the text gives a clear locational signal otherwise. The user has chosen to bind this capture to a city — they are saving a venue. Treat ambiguous-looking input (date-like names, single common words) as venue names rather than fragments unless the text is clearly NOT about a place.]\n\n${userMessage}`;
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

// =============================================================
// parseCaptureStructured — for the two-field UX (v0.6).
// The user has already drawn the boundary between place_name and tip,
// so AI doesn't need to infer it. AI only needs to:
//   - Pick a category (eat/drink/coffee/stay/shop/see/other)
//   - Detect if place_name contains a neighborhood (e.g. "Della Terra Pererenan")
//
// Country and timezone are derived from the bound city by the caller,
// not by AI — AI never sees them in this path.
//
// Smaller prompt = cheaper API call + more reliable output. Place_name
// and tip are passed through unchanged.
//
// Returns: { place_name, tip, category, neighborhood, error? }
// =============================================================
const STRUCTURED_SYSTEM_PROMPT = `You analyze a structured travel-spot capture and return ONLY two fields: category and an optional neighborhood.

Input format: the user has already separated the place name from the tip text. You receive both fields plus the bound city. Your only job:
1. Pick the best category from: eat, drink, coffee, stay, shop, see, other
2. If the place_name contains a known neighborhood for the bound city (e.g. "Della Terra Pererenan" in Bali → neighborhood is "Pererenan"), extract it. Otherwise null.

Return JSON only, no preamble:
{
  "category": string | null,
  "neighborhood": string | null
}

Rules:
- category whitelist: eat, drink, coffee, stay, shop, see, other. Use null only if truly uncertain.
- For Bali: known neighborhoods include Canggu, Pererenan, Seseh, Berawa, Ubud, Seminyak, Kuta, Sanur, Uluwatu, Jimbaran.
- For Paris: Marais, Belleville, Pigalle, Montmartre, etc.
- Other cities: only extract a neighborhood if it's clearly part of the place_name and matches a recognized area in the bound city.
- Don't infer category from the place name alone — use the tip if it gives a stronger signal. Example: place_name "Standing Room" + tip "best espresso" → category "coffee".
- If no tip and place_name is ambiguous → return your best guess based on the name (e.g. "Galerie Sultana" → "see"), or null if truly unclear.

Examples:

Input: {place_name: "Della Terra Pererenan", tip: "sit at the bar", bound_city: "Bali"}
Output: {"category": "eat", "neighborhood": "Pererenan"}

Input: {place_name: "Mosto", tip: "natural wine, Italian", bound_city: "Bali"}
Output: {"category": "drink", "neighborhood": null}

Input: {place_name: "Early June", tip: "great natural wine and food", bound_city: "Paris"}
Output: {"category": "drink", "neighborhood": null}

Input: {place_name: "Bonjour Jacob", tip: "coffee and magazines", bound_city: "Paris"}
Output: {"category": "shop", "neighborhood": null}

Input: {place_name: "Hatchards", tip: null, bound_city: "London"}
Output: {"category": "shop", "neighborhood": null}

Input: {place_name: "Saint Sulpice", tip: "sunday afternoon organ recital", bound_city: "Paris"}
Output: {"category": "see", "neighborhood": null}`;

async function parseCaptureStructured({ place_name, tip, boundCityName }) {
  if (!place_name || !place_name.trim()) {
    return { error: 'place_name required' };
  }
  const userInput = JSON.stringify({
    place_name: place_name.trim(),
    tip: tip ? tip.trim() : null,
    bound_city: boundCityName || null,
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: STRUCTURED_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userInput }
      ],
    });

    const block = (response.content || []).find(b => b.type === 'text');
    if (!block) return { error: 'no text content in response' };
    const raw = block.text.trim();
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(stripped);
    } catch (e) {
      return { error: 'invalid JSON: ' + e.message };
    }

    // Validate category
    if (parsed.category && !CATEGORIES.includes(parsed.category.toLowerCase())) {
      parsed.category = null;
    } else if (parsed.category) {
      parsed.category = parsed.category.toLowerCase();
    }
    // Normalize empty strings to null
    for (const k of ['category', 'neighborhood']) {
      if (parsed[k] === '' || parsed[k] === undefined) parsed[k] = null;
      if (typeof parsed[k] === 'string') parsed[k] = parsed[k].trim() || null;
    }
    return parsed;
  } catch (err) {
    return { error: (err.message || String(err)).slice(0, 500) };
  }
}

module.exports = { parseCapture, parseCaptureStructured, CATEGORIES };
