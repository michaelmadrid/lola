/* spots-index.js — public browsable spots index at /spots
   URL-driven filters (no on-page controls yet):
     ?cat=bookstore         category
     ?city=paris            city name or slug (case-insensitive)
     ?tags=rare,vintage     any of these tags (comma-separated)
     ?q=natural wine        keyword in place name or tip
   Combine freely: /spots?city=paris&cat=coffee
   Source: curated, non-trashed spots from studio. */
(function () {
  const API = 'https://studio.annex.site/api/spots/index';
  const el = document.getElementById('spots-index');
  if (!el) return;

  const params = new URLSearchParams(location.search);
  const fCat  = (params.get('cat')  || '').toLowerCase().trim();
  const fCity = (params.get('city') || '').toLowerCase().trim();
  const fTags = (params.get('tags') || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const fQ    = (params.get('q')    || '').toLowerCase().trim();

  const CAT_LABELS = {
    bookstore: 'Bookstore', film_lab: 'Film Lab', record_store: 'Record Store',
    cinema: 'Cinema', gallery: 'Gallery', coffee: 'Coffee', eat: 'Eat',
    drink: 'Drink', hotel: 'Hotel', shop: 'Shop', other: 'Other',
  };

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function matches(s) {
    if (fCat && (s.category || '').toLowerCase() !== fCat) return false;
    if (fCity) {
      const city = (s.city || '').toLowerCase();
      const slug = (s.city_slug || '').toLowerCase();
      if (city !== fCity && slug !== fCity) return false;
    }
    if (fTags.length) {
      const tags = (s.tags || []).map(t => String(t).toLowerCase());
      if (!fTags.some(t => tags.includes(t))) return false;
    }
    if (fQ) {
      const hay = ((s.place_name || '') + ' ' + (s.tip || '')).toLowerCase();
      if (!hay.includes(fQ)) return false;
    }
    return true;
  }

  // Build a human title from the active filters, e.g. "Bookstores in Paris"
  function buildTitle() {
    const bits = [];
    if (fCat) bits.push((CAT_LABELS[fCat] || fCat));
    let t = bits.length ? bits.join(' ') : 'Spots';
    if (fCity) t += ' in ' + fCity.charAt(0).toUpperCase() + fCity.slice(1);
    if (fTags.length) t += ' · ' + fTags.join(', ');
    return t;
  }

  fetch(API)
    .then(r => r.json())
    .then(data => {
      const all = data.spots || [];
      const rows = all.filter(matches);

      const title = buildTitle();
      document.title = title + ' — Annex';

      let html = '<h1 class="spots-index__title">' + esc(title) + '</h1>';
      html += '<p class="spots-index__count">' + rows.length + (rows.length === 1 ? ' place' : ' places') + '</p>';

      if (!rows.length) {
        html += '<p class="notice-caption">Nothing here.</p>';
        el.innerHTML = html;
        return;
      }

      html += '<ul class="spots-index__list">';
      rows.forEach(s => {
        const meta = [CAT_LABELS[s.category] || s.category, s.city].filter(Boolean).join(' · ');
        html += '<li class="spots-index__item">' +
          '<a href="/spot/' + s.id + '">' +
            '<span class="spots-index__name">' + esc(s.place_name) + '</span>' +
            (meta ? '<span class="spots-index__meta">' + esc(meta) + '</span>' : '') +
          '</a></li>';
      });
      html += '</ul>';
      el.innerHTML = html;
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Could not load spots.</p>';
    });
})();
