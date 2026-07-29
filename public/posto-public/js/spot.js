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

  // Street portion of the address.
  //
  // We can't strip the city by name: the DB holds POSTO's curated name
  // ("Mexico City") while Google's formatted_address uses the local one
  // ("Ciudad de México"), so they don't match. But the FIRST comma
  // segment is reliably the street line across locales —
  //   Córdoba 25, Roma Nte., Cuauhtémoc, 06700 Ciudad de México, ...
  //   2 Chome-10-3 Daimyo, Chuo Ward, Fukuoka, Japan
  //   13 Rue de l'Abbaye, 75006 Paris
  // — so take segment one and get the neighbourhood from our own
  // curated column rather than guessing at segment two (which is a
  // neighbourhood in Mexico City and the city itself in Paris).
  function streetLine(s) {
    const first = String(s.address || '').split(',')[0].trim();
    if (!first) return '';
    return s.neighborhood ? first + ', ' + s.neighborhood : first;
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

      // Where-line: street · CITY, each linking somewhere different.
      // The street goes to the map, the city goes to /city/:slug. This
      // replaces a separate city caption — that caption and the address
      // were both naming the city, and stating it twice was most of why
      // the page read flat.
      const street = streetLine(s);
      const mapsHref = mapsUrl(s);
      const where = [];
      if (street) {
        where.push(mapsHref
          ? '<a class="spot-detail__street" href="' + esc(mapsHref) +
            '" target="_blank" rel="noopener">' + esc(street) + '</a>'
          : '<span class="spot-detail__street">' + esc(street) + '</span>');
      }
      if (s.city) {
        where.push(s.city_slug
          ? '<a class="spot-detail__citylink" href="/city/' +
            encodeURIComponent(s.city_slug) + '">' + esc(s.city) + '</a>'
          : '<span class="spot-detail__citylink">' + esc(s.city) + '</span>');
      }
      if (where.length) {
        out.push('<p class="spot-detail__where">' +
          where.join('<span class="spot-detail__dot">\u00b7</span>') + '</p>');
      }

      // Hero. Bounded on both axes by CSS, so nothing to constrain here.
      if (s.image_url) {
        out.push('<div class="spot-detail__hero"><img src="' +
          esc(imgSrc(s.image_url)) + '" alt="' + esc(s.place_name) + '"></div>');
      }

      // Meta — site, then IG. The map link lives in the where-line above
      // as the street address; it only reappears here when there's no
      // address to hang it on.
      const links = [];
      if (mapsHref && !street) {
        links.push('<a href="' + esc(mapsHref) + '" target="_blank" rel="noopener">maps</a>');
      }
      if (s.website) {
        links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener">' +
          esc(domain(s.website)) + '</a>');
      }
      const ig = igUrl(s.instagram);
      if (ig) {
        links.push('<a href="' + esc(ig) + '" target="_blank" rel="noopener">' +
          esc(igHandle(s.instagram)) + '</a>');
      }
      if (links.length) {
        out.push('<div class="spot-detail__meta">' + links.join('') + '</div>');
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
