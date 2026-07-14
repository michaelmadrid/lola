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

    const isTouch = window.matchMedia('(hover: none)').matches || ('ontouchstart' in window);
    const ROW_H = isTouch ? 34 : 52;   // must match .wall-row height in CSS

    // Build a vertically-tripled stack of rows for seamless vertical looping.
    const stage = document.createElement('div');
    stage.id = 'wall-stage';
    const track = document.createElement('div');
    track.className = 'wall-track';
    stage.appendChild(track);

    const rowEls = [];
    const allLetters = [...letters, ...letters, ...letters];

    allLetters.forEach(letter => {
      const group = alpha[letter];
      const row = document.createElement('div');
      row.className = 'wall-row';
      const inner = document.createElement('div');
      inner.className = 'wall-row-inner';

      const rep = [];
      for (let i = 0; i < 12; i++) rep.push(...group);
      rep.forEach(spot => {
        const a = document.createElement('a');
        a.className = 'wall-item';
        a.textContent = spot.place_name;
        // The wall is an overture: a name drops you into that spot's city,
        // filtered to the wall's category — the useful browsing view.
        const citySlug = (spot.city_slug || spot.city || '').toLowerCase();
        if (citySlug && fCat) {
          a.href = '/spots?city=' + encodeURIComponent(citySlug) + '&cat=' + encodeURIComponent(fCat);
        } else if (citySlug) {
          a.href = '/spots?city=' + encodeURIComponent(citySlug);
        } else {
          a.href = '/spot/' + spot.id;
        }
        inner.appendChild(a);
        const d = document.createElement('span');
        d.className = 'wall-dot';
        d.textContent = '\u00B7';
        inner.appendChild(d);
      });

      row.appendChild(inner);
      track.appendChild(row);
      rowEls.push({ inner, count: group.length, hOff: 0, w: 0 });
    });

    el.innerHTML = '';
    el.appendChild(stage);

    // Persistent ANNEX wordmark — brand + way out (present on all screens).
    const mark = document.createElement('a');
    mark.className = 'wall-mark';
    mark.textContent = 'ANNEX';
    mark.href = '/';
    mark.setAttribute('aria-label', 'Annex home');
    document.body.appendChild(mark);

    // Measure a single group's width per row (for horizontal wrap).
    rowEls.forEach(r => { r.w = r.inner.scrollWidth / 12; });

    const BLOCK = letters.length * ROW_H;   // one alphabet's vertical height
    let vOff = -BLOCK;                       // start in the middle copy

    // --- Drag-to-pan (Google-Maps style) with per-row horizontal parallax ---
    let dragging = false, lastX = 0, lastY = 0;
    let velX = 0, velY = 0;                  // for fling inertia
    let idle = true, idleTimer = null;

    function applyHorizontal(dx) {
      rowEls.forEach(r => {
        // Per-row parallax: denser letters drift faster, creating depth.
        const mult = (r.count / maxCount) * 0.9 + 0.35;
        r.hOff += dx * mult;
        if (r.w > 0) {
          r.hOff = ((r.hOff % r.w) + r.w) % r.w - r.w; // keep in (-w, 0]
        }
        r.inner.style.transform = 'translateX(' + r.hOff + 'px)';
      });
    }
    function applyVertical(dy) {
      vOff += dy;
      // Seamless vertical loop across the 3 stacked copies.
      if (vOff <= -BLOCK * 2) vOff += BLOCK;
      if (vOff > -1) vOff -= BLOCK;
      track.style.transform = 'translateY(' + vOff + 'px)';
    }

    applyVertical(0);
    applyHorizontal(0);

    function onDown(x, y) {
      dragging = true; idle = false;
      lastX = x; lastY = y; velX = 0; velY = 0;
      stage.classList.add('is-dragging');
    }
    function onMove(x, y) {
      if (!dragging) return;
      const dx = x - lastX, dy = y - lastY;
      lastX = x; lastY = y;
      velX = dx; velY = dy;
      applyHorizontal(dx);
      applyVertical(dy);
    }
    function onUp() {
      dragging = false;
      stage.classList.remove('is-dragging');
      scheduleIdle();
    }

    // Pointer events cover mouse + touch + pen uniformly.
    stage.addEventListener('pointerdown', e => { onDown(e.clientX, e.clientY); });
    window.addEventListener('pointermove', e => { onMove(e.clientX, e.clientY); });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Suppress click navigation if the pointer actually dragged (so a fling
    // doesn't accidentally open a spot). Small threshold.
    let downX = 0, downY = 0;
    stage.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
    stage.addEventListener('click', e => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) { e.preventDefault(); }
    }, true);

    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { idle = true; }, 2600);
    }
    scheduleIdle();

    // Animation loop: fling inertia after release, then gentle idle drift.
    function tick() {
      if (!dragging) {
        // Inertia decay from the last drag velocity.
        if (Math.abs(velX) > 0.05 || Math.abs(velY) > 0.05) {
          applyHorizontal(velX);
          applyVertical(velY);
          velX *= 0.94; velY *= 0.94;
        } else if (idle) {
          // Ambient resting drift — slow, leftward + gently up.
          applyHorizontal(-0.4);
          applyVertical(-0.15);
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
