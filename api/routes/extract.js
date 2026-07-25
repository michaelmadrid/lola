// api/routes/extract.js
//
// Paste-a-URL capture helper. Fetches a page, reads its Open Graph /
// meta tags, and tries to match the URL's domain to an existing spot
// so the note can be pre-linked. Returns everything as a suggestion —
// the studio pre-fills the editor, the human confirms. Nothing is saved
// here.
//
// Coverage is good for product/shop/gallery pages (they almost all ship
// og:title/og:image/og:description). Instagram and screenshot-style
// sources won't have much — the editor just stays manual for those, so
// this never makes capture worse, only faster when it can.
//
// Mounted at /api/extract in server.js.

const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../auth');

// Pull a handful of meta values out of raw HTML without a DOM library.
// We only need a few tags, so targeted regexes beat pulling in cheerio.
function metaFromHtml(html) {
  const grab = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return decodeEntities(m[1].trim());
    }
    return null;
  };
  const prop = (name) => grab([
    new RegExp('<meta[^>]+property=["\']' + name + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + name + '["\']', 'i'),
  ]);
  const named = (name) => grab([
    new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]+content=["\']([^"\']+)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']' + name + '["\']', 'i'),
  ]);
  const titleTag = grab([/<title[^>]*>([^<]+)<\/title>/i]);

  return {
    title:       prop('og:title') || named('twitter:title') || titleTag,
    image:       prop('og:image') || named('twitter:image'),
    description: prop('og:description') || named('twitter:description') || named('description'),
    site_name:   prop('og:site_name'),
  };
}

// Minimal HTML entity decode for the few that show up in meta content.
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Registrable-ish domain: strip protocol, www, and path. Not a full PSL
// parse, but enough to match "www.ebay.com/itm/123" ↔ a spot whose
// website is "https://ebay.com".
function baseDomain(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const parts = h.split('.');
    // keep last two labels (ebay.com), or three for known 2-part TLDs
    if (parts.length > 2 && /\.(co|com|org|net|gov|ac)\.\w{2}$/.test(h)) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  } catch { return null; }
}

// POST /api/extract  { url }
router.post('/', authenticate, async (req, res) => {
  const url = (req.body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'A full http(s) URL is required' });
  }

  let meta = { title: null, image: null, description: null, site_name: null };
  let fetchError = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some sites serve thin/blocked HTML to non-browser agents.
        'User-Agent': 'Mozilla/5.0 (compatible; POSTO/1.0; +https://posto.world)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (resp.ok) {
      const html = (await resp.text()).slice(0, 400000); // cap: meta lives in <head>
      meta = metaFromHtml(html);
      // Resolve a relative og:image against the page URL.
      if (meta.image && !/^https?:\/\//i.test(meta.image)) {
        try { meta.image = new URL(meta.image, url).href; } catch {}
      }
    } else {
      fetchError = 'Page returned ' + resp.status;
    }
  } catch (err) {
    fetchError = err.name === 'AbortError' ? 'Timed out fetching the page' : err.message;
  }

  // Domain → spot match. Compares the URL's base domain against the base
  // domain of each spot's website/url. Best-effort; returns the first hit.
  let spot = null;
  const domain = baseDomain(url);
  if (domain) {
    try {
      const { rows } = await pool.query(
        `SELECT s.id, s.place_name, s.website, s.url, c.name AS city
           FROM spots s
           LEFT JOIN cities c ON c.id = s.city_id
          WHERE s.deleted_at IS NULL
            AND (s.website IS NOT NULL OR s.url IS NOT NULL)`
      );
      spot = rows.find(r => {
        const d = baseDomain(r.website || r.url || '');
        return d && d === domain;
      }) || null;
    } catch (err) {
      // matching is a nicety — never fail the whole request over it
      console.error('[extract] spot match failed:', err.message);
    }
  }

  res.json({
    url,
    domain,
    suggestion: {
      headline: meta.title || '',
      image_url: meta.image || '',       // a remote URL — see note in the client
      reference_title: meta.site_name || (spot ? spot.place_name : ''),
      description: meta.description || '',
    },
    matched_spot: spot ? { id: spot.id, place_name: spot.place_name, city: spot.city } : null,
    fetch_error: fetchError, // non-fatal; client can still use domain match + manual entry
  });
});

module.exports = router;
