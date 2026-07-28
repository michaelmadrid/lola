/* spot.js — single spot permalink at /spot/:slug (also accepts /spot/:id).

   Layout: name, city caption, hero image (if one exists), meta row
   (site + IG left, map right), then the spot's finds in two CSS
   columns. No JS masonry — images keep their own ratio and the
   browser balances the columns.

   With no hero the meta row simply moves up under the caption; no
   separate branch needed. */
(function () {
  const API = 'https://studio.posto.world/api/spots/public/';
  const el = document.getElementById('spot-detail');
  if (!el) return;

  // Last path segment is the id or slug: /spot/ao-hata-bookstore or /spot/488
  const parts = location.pathname.split('/').filter(Boolean);
  const key = parts[parts.length - 1];
  if (!key || key === 'spot') {
    el.innerHTML = '<p class="notice-caption">Spot not found.</p>';
    document.title = 'Not found — POSTO';
    return;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : 'https://studio.posto.world' + url;
  }
  function igUrl(v) {
    v = String(v || '').trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://instagram.com/' + v.replace(/^@/, '');
  }
  // Display form for a website: strip scheme, www and trailing slash so
  // it reads as a printed address rather than a URL.
  function domain(url) {
    return String(url || '')
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '');
  }
  function igHandle(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) {
      const m = v.replace(/\/+$/, '').split('/');
      return '@' + m[m.length - 1];
    }
    return v.startsWith('@') ? v : '@' + v;
  }

  // Google Maps URL — documented Maps URLs API form. `query` is required
  // even when a place id is supplied; it's what the mobile apps parse to
  // deep-link. The older /maps/place/?q=place_id:… form resolves in a
  // desktop browser but the iOS/Android handoff drops it.
  function mapsUrl(s) {
    const label = [s.place_name, s.city].filter(Boolean).join(', ');
    if (!label && !s.google_place_id) return null;
    let u = 'https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(label || s.place_name || '');
    if (s.google_place_id) u += '&query_place_id=' + encodeURIComponent(s.google_place_id);
    return u;
  }

  fetch(API + encodeURIComponent(key))
    .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then(data => {
      const s = data.spot;
      const notes = Array.isArray(data.notes) ? data.notes : [];
      document.title = (s.place_name || 'Spot') + ' — POSTO';

      const out = [];
      out.push('<article class="spot-detail__inner">');

      out.push('<h1 class="spot-detail__name">' + esc(s.place_name) + '</h1>');

      // City caption — city links to /city/:slug, neighborhood sits in
      // front of it as plain text.
      if (s.city) {
        const cityLink = s.city_slug
          ? '<a href="/city/' + encodeURIComponent(s.city_slug) + '">' + esc(s.city) + '</a>'
          : esc(s.city);
        const line = s.neighborhood ? esc(s.neighborhood) + ', ' + cityLink : cityLink;
        out.push('<p class="spot-detail__city">' + line + '</p>');
      }

      // Hero. Bounded on both axes by CSS, so nothing to constrain here.
      if (s.image_url) {
        out.push('<div class="spot-detail__hero"><img src="' +
          esc(imgSrc(s.image_url)) + '" alt="' + esc(s.place_name) + '"></div>');
      }

      // Meta row — site/IG left, map right.
      const left = [];
      if (s.website) {
        left.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener">' +
          esc(domain(s.website)) + '</a>');
      }
      const ig = igUrl(s.instagram);
      if (ig) {
        left.push('<a href="' + esc(ig) + '" target="_blank" rel="noopener">' +
          esc(igHandle(s.instagram)) + '</a>');
      }
      const maps = mapsUrl(s);
      const right = maps
        ? '<a href="' + esc(maps) + '" target="_blank" rel="noopener">maps</a>'
        : '';
      if (left.length || right) {
        out.push('<div class="spot-detail__meta">' +
          '<div class="spot-detail__meta-left">' + left.join('') + '</div>' +
          '<div class="spot-detail__meta-right">' + right + '</div>' +
          '</div>');
      }

      if (s.tip) out.push('<p class="spot-detail__tip">' + esc(s.tip) + '</p>');

      // Finds — a receipt, not a grid. Numbered rows, tiny thumbs.
      // See "Finds" in shell.css for why this isn't a gallery.
      if (notes.length) {
        out.push('<div class="spot-detail__finds">');
        out.push('<div class="spot-detail__finds-label">Finds</div>');

        notes.forEach(function (n) {
          const noteSpot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;

          // Provenance is suppressed when the find belongs to THIS spot —
          // otherwise every row repeats the same "Casa Bosques, Mexico
          // City" line. Still renders for a find whose primary spot is
          // somewhere else. Match on stored slug, fall back to name.
          let sub = '';
          const isSelf = noteSpot && (
            (noteSpot.slug && s.slug && noteSpot.slug === s.slug) ||
            (noteSpot.name && s.place_name && noteSpot.name === s.place_name)
          );
          if (noteSpot && !isSelf) {
            const bits = [];
            if (noteSpot.name) bits.push(esc(noteSpot.name));
            if (noteSpot.city) bits.push(esc(noteSpot.city));
            if (bits.length) sub = '<div class="spot-find__sub">' + bits.join(', ') + '</div>';
          } else if (!noteSpot && n.reference_title) {
            sub = '<div class="spot-find__sub">' + esc(n.reference_title) + '</div>';
          }

          const href = n.reference_url && /^https?:\/\//i.test(n.reference_url)
            ? esc(n.reference_url) : null;
          const tag = href ? 'a' : 'div';
          const attrs = href ? ' href="' + href + '" target="_blank" rel="noopener"' : '';

          out.push('<' + tag + ' class="spot-find"' + attrs + '>');
          out.push('<div class="spot-find__thumb">' +
            (n.image_url
              ? '<img src="' + esc(imgSrc(n.image_url)) + '" alt="" loading="lazy">'
              : '') +
            '</div>');
          out.push('<div class="spot-find__body">' +
            '<div class="spot-find__title">' + esc(n.headline || 'Untitled') + '</div>' +
            sub +
            '</div>');
          out.push('</' + tag + '>');
        });
        out.push('</div>');
      }

      out.push('</article>');
      el.innerHTML = out.join('\n');
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Spot not found.</p>';
      document.title = 'Not found — POSTO';
    });
})();
