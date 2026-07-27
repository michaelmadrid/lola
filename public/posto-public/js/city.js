/* city.js — single city page at /city/:slug (also accepts /city/:id).
   Bare-bones wireframe: recent finds in this city as small thumbnails,
   then an "Also" list of the city's spots grouped by category. */
(function () {
  const API = 'https://studio.posto.world/api/cities/public/';
  const el = document.getElementById('city-detail');
  if (!el) return;

  const parts = location.pathname.split('/').filter(Boolean);
  const key = parts[parts.length - 1];
  if (!key || key === 'city') {
    el.innerHTML = '<p class="notice-caption">City not found.</p>';
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
  // Title-case a category slug for display: "record_store" → "Record store"
  function catLabel(c) {
    if (!c) return 'Other';
    const s = String(c).replace(/[_-]+/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  fetch(API + encodeURIComponent(key))
    .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
    .then(data => {
      const city = data.city;
      const finds = Array.isArray(data.finds) ? data.finds : [];
      const spots = Array.isArray(data.spots) ? data.spots : [];
      document.title = (city.name || 'City') + ' — POSTO';

      const out = [];
      out.push('<article class="city-detail__inner">');
      out.push('<h1 class="city-detail__name">' + esc(city.name) + '</h1>');
      if (city.country) out.push('<p class="city-detail__country">' + esc(city.country) + '</p>');

      // ── Recent finds — small thumbnails ──
      if (finds.length) {
        out.push('<h2 class="city-detail__label">Recently found</h2>');
        out.push('<div class="city-finds">');
        finds.forEach(function (n) {
          const href = n.reference_url && /^https?:\/\//i.test(n.reference_url) ? n.reference_url : null;
          const thumb = n.image_url
            ? '<div class="city-find__thumb"><img src="' + esc(imgSrc(n.image_url)) + '" alt="' + esc(n.headline || '') + '"></div>'
            : '';
          const title = '<div class="city-find__t">' + esc(n.headline || 'Untitled') + '</div>';
          const inner = thumb + title;
          out.push(href
            ? '<a class="city-find" href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + inner + '</a>'
            : '<div class="city-find">' + inner + '</div>');
        });
        out.push('</div>');
      }

      // ── Also — spots grouped by category ──
      if (spots.length) {
        const groups = {};
        spots.forEach(function (s) {
          const k = s.category || 'other';
          (groups[k] = groups[k] || []).push(s);
        });
        out.push('<h2 class="city-detail__label">Also</h2>');
        out.push('<div class="city-spots">');
        Object.keys(groups).forEach(function (cat) {
          out.push('<div class="city-spots__group">');
          out.push('<div class="city-spots__cat">' + esc(catLabel(cat)) + '</div>');
          out.push('<ul class="city-spots__list">');
          groups[cat].forEach(function (s) {
            const href = '/spot/' + encodeURIComponent(s.slug || s.id);
            out.push('<li class="city-spots__item"><a href="' + href + '">' + esc(s.place_name) + '</a></li>');
          });
          out.push('</ul></div>');
        });
        out.push('</div>');
      }

      if (!finds.length && !spots.length) {
        out.push('<p class="notice-caption">Nothing here yet.</p>');
      }

      out.push('</article>');
      el.innerHTML = out.join('\n');
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">City not found.</p>';
      document.title = 'Not found — POSTO';
    });
})();
