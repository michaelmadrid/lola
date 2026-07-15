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
    let t = bits.length ? bits.join(' ') : (fLayout === 'gazette' ? 'Gazette' : (fLayout === 'catalogue' ? 'Catalogue' : 'Spots'));
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
      } else if (layout === 'catalogue') {
        // Catalogue — clone of gazette (grouped by city) with its own class
        // names + a running index number per entry. Own CSS canvas.
        el.classList.add('spots-index--wide');
        const sorted = rows.slice().sort((a, b) => {
          const ca = (a.city || 'zzz').toLowerCase(), cb = (b.city || 'zzz').toLowerCase();
          if (ca !== cb) return ca.localeCompare(cb);
          return (a.place_name || '').localeCompare(b.place_name || '', undefined, { sensitivity: 'base' });
        });
        html += '<div class="catalogue">';
        let currentCity = null;
        let n = 0;
        let groupOpen = false;
        sorted.forEach(s => {
          const city = s.city || 'Elsewhere';
          if (city !== currentCity) {
            if (groupOpen) html += '</div>';   // close previous group
            currentCity = city;
            html += '<div class="catalogue__group">';
            html += '<div class="catalogue__city">' + esc(city) + '</div>';
            groupOpen = true;
          }
          n++;
          const num = 'S.' + String(n).padStart(2, '0');
          const meta = CAT_LABELS[s.category] || s.category || '';
          html += '<div class="catalogue__item"><a href="/spot/' + s.id + '">' +
            '<span class="catalogue__num">' + num + '</span>' +
            '<span class="catalogue__name">' + esc(s.place_name) + '</span>' +
            (meta ? '<span class="catalogue__meta">' + esc(meta) + '</span>' : '') +
            '</a></div>';
        });
        if (groupOpen) html += '</div>';        // close final group
        html += '</div>';
      } else if (layout === 'gazette') {
        // Flowing index grouped by CITY. City names are the big headers
        // (like the letters in the alpha index); spots flow beneath each,
        // alphabetical by name, spilling across the columns.
        el.classList.add('spots-index--wide');
        const sorted = rows.slice().sort((a, b) => {
          const ca = (a.city || 'zzz').toLowerCase(), cb = (b.city || 'zzz').toLowerCase();
          if (ca !== cb) return ca.localeCompare(cb);
          return (a.place_name || '').localeCompare(b.place_name || '', undefined, { sensitivity: 'base' });
        });
        html += '<div class="index-flow">';
        let currentCity = null;
        sorted.forEach(s => {
          const city = s.city || 'Elsewhere';
          if (city !== currentCity) {
            currentCity = city;
            html += '<div class="index-flow__letter index-flow__city">' + esc(city) + '</div>';
          }
          const meta = CAT_LABELS[s.category] || s.category || '';
          html += '<div class="index-flow__item"><a href="/spot/' + s.id + '">' +
            '<span class="index-flow__name">' + esc(s.place_name) + '</span>' +
            (meta ? '<span class="index-flow__meta">' + esc(meta) + '</span>' : '') +
            '</a></div>';
        });
        html += '</div>';
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

    // Subtle affordance so desktop users know it's explorable.
    const hint = document.createElement('div');
    hint.className = 'wall-hint';
    hint.textContent = isTouch ? 'Drag to explore' : 'Scroll or drag to explore';
    document.body.appendChild(hint);
    const killHint = () => { hint.classList.add('is-gone'); };
    stage.addEventListener('pointerdown', killHint, { once: true });
    stage.addEventListener('wheel', killHint, { once: true });
    setTimeout(killHint, 4000);

    // Measure a single group's width per row (for horizontal wrap).
    rowEls.forEach(r => { r.w = r.inner.scrollWidth / 12; });

    const BLOCK = letters.length * ROW_H;   // one alphabet's vertical height
    let vOff = -BLOCK;                       // start in the middle copy

    // --- Drag-to-pan (Google-Maps style) with per-row horizontal parallax ---
    let dragging = false, lastX = 0, lastY = 0;
    let velX = 0, velY = 0;                  // for fling inertia
    const SPEED = isTouch ? 1.2 : 1;         // mobile ~20% faster

    // Idle drift only briefly settles the wall into motion on load, then stops.
    // Eased envelope: ramps up, holds, then decays — not a flat linear cut.
    const SETTLE_TOTAL = Math.round(1.8 * 60);   // ~1.8s at 60fps, snappier
    let settleFrames = SETTLE_TOTAL;

    function applyHorizontal(dx) {
      rowEls.forEach(r => {
        const mult = (r.count / maxCount) * 0.9 + 0.35;
        r.hOff += dx * mult;
        if (r.w > 0) {
          r.hOff = ((r.hOff % r.w) + r.w) % r.w - r.w;
        }
        r.inner.style.transform = 'translateX(' + r.hOff + 'px)';
      });
    }
    function applyVertical(dy) {
      vOff += dy;
      if (vOff <= -BLOCK * 2) vOff += BLOCK;
      if (vOff > -1) vOff -= BLOCK;
      track.style.transform = 'translateY(' + vOff + 'px)';
    }

    applyVertical(0);
    applyHorizontal(0);

    function onDown(x, y) {
      dragging = true; settleFrames = 0;
      lastX = x; lastY = y; velX = 0; velY = 0;
      stage.classList.add('is-dragging');
    }
    function onMove(x, y) {
      if (!dragging) return;
      const dx = (x - lastX) * SPEED, dy = (y - lastY) * SPEED;
      lastX = x; lastY = y;
      velX = dx; velY = dy;
      applyHorizontal(dx);
      applyVertical(dy);
    }
    function onUp() {
      dragging = false;
      stage.classList.remove('is-dragging');
    }

    stage.addEventListener('pointerdown', e => { onDown(e.clientX, e.clientY); });
    window.addEventListener('pointermove', e => { onMove(e.clientX, e.clientY); });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Desktop: wheel / trackpad scroll pans the wall (the instinctive gesture).
    // Horizontal intent (shift+wheel or trackpad deltaX) pans sideways too.
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      settleFrames = 0;
      const dy = -e.deltaY;
      const dx = -e.deltaX;
      applyVertical(dy);
      if (Math.abs(dx) > 0.5) applyHorizontal(dx);
      else applyHorizontal(dy * 0.4); // vertical wheel also nudges horizontal drift
    }, { passive: false });

    // Suppress click navigation if the pointer actually dragged.
    let downX = 0, downY = 0;
    stage.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
    stage.addEventListener('click', e => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) { e.preventDefault(); }
    }, true);

    // Animation loop: fling inertia after release, eased settle drift on load.
    function tick() {
      if (!dragging) {
        if (Math.abs(velX) > 0.03 || Math.abs(velY) > 0.03) {
          // Fling: ease-out decay (feels like a real toss losing energy).
          applyHorizontal(velX);
          applyVertical(velY);
          velX *= 0.955; velY *= 0.955;
        } else if (settleFrames > 0) {
          // Eased envelope over the settle window: sin() ramps up from 0,
          // peaks mid-way, and eases back to 0 — no abrupt start or stop.
          const t = 1 - (settleFrames / SETTLE_TOTAL);   // 0 → 1 over the window
          const env = Math.sin(t * Math.PI);             // 0 → 1 → 0, smooth
          const base = 3.2 * SPEED;                      // peak drift speed
          applyHorizontal(-base * env);
          applyVertical(-0.35 * SPEED * env);
          settleFrames--;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();
