// Anthropic client — kept warm for future use.
// Currently not wired to any route. Will be used for:
//   - Capture parsing (extract structured fields from raw text)
//   - Itinerary import (re-enable v0.3 feature later)
//   - Trip summaries / journal generation
//   - Anything else
//
// Import this in any route that needs it:
//   const anthropic = require('../claude');

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

module.exports = anthropic;
