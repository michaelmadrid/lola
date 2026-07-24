/* spot.js — renders a single spot permalink at /spot/:id
   Shows: place name (headline), city, website + Google Maps as underlined
   text links (not icons), and an image if one exists. */
(function () {
  const API = 'https://studio.posto.world/api/spots/public/';
  const el = document.getElementById('spot-detail');
  if (!el) return;

  const parts = location.pathname.split('/').filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || isNaN(parseInt(id, 10))) {
    el.innerHTML = '<p class="notice-caption">Spot not found.</p>';
    document.title = 'Not found — Annex';
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

  fetch(API + encodeURIComponent(id))
    .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then(data => {
      const s = data.spot;
      document.title = (s.place_name || 'Spot') + ' — Annex';

      const out = [];
      out.push('<article class="spot-detail__inner">');

      // Headline — place name
      out.push('<h1 class="spot-detail__name">' + esc(s.place_name) + '</h1>');

      // City (+ neighborhood if present)
      const place = [s.neighborhood, s.city].filter(Boolean).join(', ');
      if (place) out.push('<p class="spot-detail__city">' + esc(place) + '</p>');

      // Image
      if (s.image_url) {
        out.push('<div class="spot-detail__image"><img src="' + esc(imgSrc(s.image_url)) + '" alt="' + esc(s.place_name) + '"></div>');
      }

      // Tip / description
      if (s.tip) out.push('<p class="spot-detail__tip">' + esc(s.tip) + '</p>');

      // Links — website + Google Maps, underlined text (not icons)
      const links = [];
      if (s.website) {
        links.push('<a href="' + esc(s.website) + '" target="_blank" rel="noopener">Website</a>');
      }
      if (s.google_place_id) {
        const maps = 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(s.google_place_id);
        links.push('<a href="' + maps + '" target="_blank" rel="noopener">Google Maps</a>');
      }
      if (links.length) {
        out.push('<p class="spot-detail__links">' + links.join('<span class="spot-detail__sep">·</span>') + '</p>');
      }

      out.push('</article>');
      el.innerHTML = out.join('\n');
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Spot not found.</p>';
      document.title = 'Not found — Annex';
    });
})();
