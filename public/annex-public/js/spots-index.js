/* spots-index.js — public browsable spots index at /spots
   URL-driven filters (no on-page controls yet):
     ?cat=bookstore         category
     ?city=paris            city name or slug (case-insensitive)
     ?tags=rare,vintage     any of these tags (comma-separated)
     ?q=natural wine        keyword in place name or tip
   Layout:
     ?layout=index          flowing alphabetical index (default when no filter)
     ?layout=list           simple vertical list (default when filtered)
     ?layout=wall           immersive kinetic marquee wall (full viewport)
   Combine: /spots?cat=bookstore&layout=wall
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
  const fLayout = (params.get('layout') || '').toLowerCase().trim();

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

  const hasFilter = !!(fCat || fCity || fTags.length || fQ);
  // Resolve which layout to use. Explicit ?layout= wins; otherwise default
  // to list when filtered, flowing index when not.
  const layout = fLayout || (hasFilter ? 'list' : 'index');

  fetch(API)
    .then(r => r.json())
    .then(data => {
      const all = data.spots || [];
      const rows = all.filter(matches);

      const title = buildTitle();
      document.title = title + ' — Annex';

      if (layout === 'wall') { renderWall(rows, title); return; }

      let html = '<h1 class="spots-index__title">' + esc(title) + '</h1>';
      html += '<p class="spots-index__count">' + rows.length + (rows.length === 1 ? ' place' : ' places') + '</p>';

      if (!rows.length) {
        html += '<p class="notice-caption">Nothing here.</p>';
        el.innerHTML = html;
        return;
      }

      if (layout === 'list') {
        el.classList.remove('spots-index--wide');
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
      } else {
        // index (flowing alphabetical)
        el.classList.add('spots-index--wide');
        const sorted = rows.slice().sort((a, b) =>
          (a.place_name || '').localeCompare(b.place_name || '', undefined, { sensitivity: 'base' }));

        html += '<div class="index-flow">';
        let currentLetter = '';
        sorted.forEach(s => {
          const first = (s.place_name || '#').trim().charAt(0).toUpperCase();
          const letter = /[A-Z]/.test(first) ? first : '#';
          if (letter !== currentLetter) {
            currentLetter = letter;
            html += '<div class="index-flow__letter">' + esc(letter) + '</div>';
          }
          const meta = [CAT_LABELS[s.category] || s.category, s.city].filter(Boolean).join(' · ');
          html += '<div class="index-flow__item"><a href="/spot/' + s.id + '">' +
            '<span class="index-flow__name">' + esc(s.place_name) + '</span>' +
            (meta ? '<span class="index-flow__meta">' + esc(meta) + '</span>' : '') +
            '</a></div>';
        });
        html += '</div>';
      }

      el.innerHTML = html;
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Could not load spots.</p>';
    });

  // ---- Wall layout: immersive kinetic marquee, one row per letter ----
  function renderWall(rows, title) {
    document.body.classList.add('wall-mode');

    if (!rows.length) {
      el.innerHTML = '<p class="notice-caption" style="padding:32px">Nothing here.</p>';
      return;
    }

    // Group by first letter (ignoring leading articles)
    const alpha = {};
    rows.forEach(s => {
      if (!s.place_name) return;
      const l = s.place_name.replace(/^(the |le |la |les )/i, '')[0].toUpperCase();
      (alpha[l] = alpha[l] || []).push(s);
    });
    const letters = Object.keys(alpha).sort();
    if (!letters.length) { el.innerHTML = ''; return; }
    const maxCount = Math.max(...letters.map(l => alpha[l].length));

    // Build stage: triple the letter-rows vertically for seamless vertical loop
    const stage = document.createElement('div');
    stage.id = 'wall-stage';
    const rowEls = [];
    const allLetters = [...letters, ...letters, ...letters];

    allLetters.forEach(letter => {
      const group = alpha[letter];
      const row = document.createElement('div');
      row.className = 'wall-row';
      const inner = document.createElement('div');
      inner.className = 'wall-row-inner';

      // Repeat the group enough times to fill very wide screens seamlessly
      const rep = [];
      for (let i = 0; i < 12; i++) rep.push(...group);
      rep.forEach(spot => {
        const a = document.createElement('a');
        a.className = 'wall-item';
        a.textContent = spot.place_name;
        a.href = '/spot/' + spot.id;
        inner.appendChild(a);
        const d = document.createElement('span');
        d.className = 'wall-dot';
        d.textContent = '·';
        inner.appendChild(d);
      });

      row.appendChild(inner);
      stage.appendChild(row);
      rowEls.push({ inner, count: group.length, hOff: 0 });
    });

    // Replace the whole page body content with the wall + a corner dot nav
    el.innerHTML = '';
    el.appendChild(stage);

    // Corner dot nav — quiet seed. For now links to the plain index; later
    // this expands into a city/category/search overlay.
    const nav = document.createElement('a');
    nav.className = 'wall-nav';
    nav.textContent = '\u00B7'; // ·
    nav.href = '/spots';
    nav.setAttribute('aria-label', 'Index');
    document.body.appendChild(nav);

    const ROW_H = 52;
    const BLOCK = letters.length * ROW_H;

    const isTouch = window.matchMedia('(hover: none)').matches ||
                    ('ontouchstart' in window);

    if (isTouch) {
      // Mobile: autonomous drift. Rows move on their own via rAF; the stage
      // never hijacks touch scroll, so nothing fights the browser.
      stage.style.overflow = 'hidden';

      // Wrap all rows so we can translateY the whole column for vertical drift.
      const track = document.createElement('div');
      track.className = 'wall-track';
      while (stage.firstChild) track.appendChild(stage.firstChild);
      stage.appendChild(track);

      rowEls.forEach(r => { r.w = r.inner.scrollWidth / 12; });

      let vOff = -BLOCK;           // start mid-block for seamless vertical loop
      const vSpeed = 0.18;         // gentle px/frame

      function tick() {
        vOff -= vSpeed;
        if (vOff <= -BLOCK * 2) vOff += BLOCK;
        track.style.transform = 'translateY(' + vOff + 'px)';

        rowEls.forEach(r => {
          const speed = (r.count / maxCount) * 1.1 + 0.25;
          r.hOff -= speed;
          if (r.hOff < -r.w) r.hOff += r.w;
          r.inner.style.transform = 'translateX(' + r.hOff + 'px)';
        });
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      return;
    }

    // Desktop: scroll-driven (vertical scroll powers horizontal motion).
    let lastSy = 0;
    stage.addEventListener('scroll', () => {
      const sy = stage.scrollTop;
      const delta = sy - lastSy;
      lastSy = sy;
      if (sy < BLOCK * 0.4) stage.scrollTop = sy + BLOCK;
      if (sy > BLOCK * 1.6) stage.scrollTop = sy - BLOCK;
      rowEls.forEach(r => {
        const speed = (r.count / maxCount) * 0.55 + 0.08;
        r.hOff -= delta * speed;
        const w = r.inner.scrollWidth / 12;
        if (r.hOff < -w) r.hOff += w;
        if (r.hOff > 0) r.hOff -= w;
        r.inner.style.transform = 'translateX(' + r.hOff + 'px)';
      });
    }, { passive: true });

    stage.scrollTop = BLOCK;
  }
})();
