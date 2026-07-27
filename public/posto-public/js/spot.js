/* spot.js — single spot permalink at /spot/:slug (also accepts /spot/:id).
   Bare-bones: name, Site · Map · IG, small image if present, and the list
   of notes linked to this spot. A wireframe to prove the data flow; design
   comes later. */
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

  fetch(API + encodeURIComponent(key))
    .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then(data => {
      const s = data.spot;
      const notes = Array.isArray(data.notes) ? data.notes : [];
      document.title = (s.place_name || 'Spot') + ' — POSTO';

      const out = [];
      out.push('<article class="spot-detail__inner">');

      out.push('<h1 class="spot-detail__name">' + esc(s.place_name) + '</h1>');

      // City line — city name links to /city/:slug; neighborhood (if any)
      // stays plain text before it.
      if (s.city) {
        const cityLink = s.city_slug
          ? '<a href="/city/' + encodeURIComponent(s.city_slug) + '">' + esc(s.city) + '</a>'
          : esc(s.city);
        const line = s.neighborhood ? esc(s.neighborhood) + ', ' + cityLink : cityLink;
        out.push('<p class="spot-detail__city">' + line + '</p>');
      }

      const links = [];
      if (s.website) {
        links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener">Site</a>');
      }
      if (s.google_place_id) {
        const maps = 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(s.google_place_id);
        links.push('<a href="' + maps + '" target="_blank" rel="noopener">Map</a>');
      }
      const ig = igUrl(s.instagram);
      if (ig) links.push('<a href="' + esc(ig) + '" target="_blank" rel="noopener">IG</a>');
      if (links.length) {
        out.push('<p class="spot-detail__links">' + links.join('<span class="spot-detail__sep">·</span>') + '</p>');
      }

      if (s.image_url) {
        out.push('<div class="spot-detail__image spot-detail__image--small"><img src="' +
          esc(imgSrc(s.image_url)) + '" alt="' + esc(s.place_name) + '"></div>');
      }

      if (s.tip) out.push('<p class="spot-detail__tip">' + esc(s.tip) + '</p>');

      if (notes.length) {
        out.push('<div class="spot-detail__notes">');
        out.push('<h2 class="spot-detail__notes-label">Notes</h2>');
        out.push('<ul class="spot-detail__notes-list">');
        notes.forEach(function (n) {
          const href = n.reference_url && /^https?:\/\//i.test(n.reference_url) ? n.reference_url : null;
          const title = esc(n.headline || 'Untitled');
          const inner = href
            ? '<a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + title + '</a>'
            : title;
          out.push('<li class="spot-detail__note">' + inner + '</li>');
        });
        out.push('</ul></div>');
      }

      out.push('</article>');
      el.innerHTML = out.join('\n');
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Spot not found.</p>';
      document.title = 'Not found — POSTO';
    });
})();
