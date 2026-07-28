/* archive.js — /archive/

   A second view of the same shelf data. The list is the primary
   surface: titles set large, scrolled vertically. The objects live on
   a track fixed to the bottom edge of the screen that pans
   horizontally as you scroll, so the whole collection is always
   present in peripheral vision.

   Same endpoint as the shelf. No masonry, no patterns, no spans.
   Tuning lives in the CSS vars at the top of the archive block in
   shell.css, and in TRACK below. */
(function () {
  const API = 'https://studio.posto.world/api/board-notes/public/grid';

  const listEl    = document.getElementById('archive-list');
  const trackEl   = document.getElementById('archive-track');
  const readoutEl = document.getElementById('archive-readout');
  if (!listEl || !trackEl) return;

  /* ── Tuning ────────────────────────────────────────────
     smooth  — how hard the track lags the scroll. Lower is laggier.
               This is the whole feel of the thing; 0.0012 is a slow
               drift, 0.02 is nearly locked to the scrollbar.
     Set live: POSTO_ARCHIVE.smooth = 0.01 */
  const TRACK = { smooth: 0.0015 };

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : 'https://studio.posto.world' + url;
  }
  const pad = n => String(n).padStart(3, '0');

  // Provenance — same shape as the shelf: spot, city.
  function provenance(n) {
    const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;
    if (!spot) return n.reference_title ? esc(n.reference_title) : '';
    const bits = [];
    if (spot.name) {
      bits.push(spot.slug
        ? '<a href="/spot/' + encodeURIComponent(spot.slug) + '">' + esc(spot.name) + '</a>'
        : esc(spot.name));
    }
    if (spot.city) {
      bits.push(spot.city_slug
        ? '<a href="/city/' + encodeURIComponent(spot.city_slug) + '">' + esc(spot.city) + '</a>'
        : esc(spot.city));
    }
    return bits.join(', ');
  }

  /* The fetch catch is scoped to the FETCH only. Chaining render()
     inside it meant any render-time exception got reported as a
     network failure and wiped the list — while the thumbs, appended
     to a different node, survived. Images but no text. */
  fetch(API)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch(function (err) {
      console.error('[archive] Could not load notes', err);
      listEl.innerHTML = '<div class="archive__empty">Could not load the archive.</div>';
      return null;
    })
    .then(function (data) {
      if (!data) return;
      try {
        render(data.notes || []);
      } catch (err) {
        // Real stack, clearly labelled, and the DOM is left alone.
        console.error('[archive] Render failed', err);
      }
    });

  function render(notes) {
    if (!notes.length) {
      listEl.innerHTML = '<div class="archive__empty">Nothing here yet.</div>';
      return;
    }

    const rows = [], thumbs = [];

    notes.forEach(function (n, i) {
      const href = n.reference_url && /^https?:\/\//i.test(n.reference_url)
        ? esc(n.reference_url) : null;
      const title = esc(n.headline || 'Untitled');
      const src = provenance(n);

      /* Row */
      const row = document.createElement('div');
      row.className = 'archive-row';
      row.innerHTML =
        '<span class="archive-row__title">' +
          (href ? '<a href="' + href + '" target="_blank" rel="noopener">' + title + '</a>' : title) +
        '</span>' +
        (src ? '<span class="archive-row__src">' + src + '</span>' : '');
      listEl.appendChild(row);
      rows.push(row);

      /* Thumb. No lazy loading — the track needs every width to know
         how far it can pan. Instead each image reserves a 3:4 box
         until it loads (see [data-ready] in shell.css), then snaps to
         its true ratio and the track re-measures. */
      const thumb = document.createElement('div');
      thumb.className = 'archive-thumb';
      if (n.image_url) {
        thumb.innerHTML = '<img src="' + esc(imgSrc(n.image_url)) + '" alt="">';
        const img = thumb.firstChild;
        img.addEventListener('load', function () {
          img.setAttribute('data-ready', '');
          measure();
        });
        img.addEventListener('error', function () { thumb.style.display = 'none'; measure(); });
      } else {
        thumb.classList.add('archive-thumb--blank');
      }
      trackEl.appendChild(thumb);
      thumbs.push(thumb);
    });

    /* ── Pairing state ────────────────────────────────────
       Hover lights both halves. On touch there is no hover, so the
       item nearest the scroll position carries .is-current instead —
       otherwise the track would be inert on a phone.

       Declared UP HERE deliberately: onScroll() below calls
       setCurrent() during setup, and a `let` read before its
       declaration throws (temporal dead zone). */
    let currentIdx = -1;
    function setCurrent(i) {
      if (i === currentIdx) return;
      if (thumbs[currentIdx]) thumbs[currentIdx].classList.remove('is-current');
      if (rows[currentIdx])   rows[currentIdx].classList.remove('is-current');
      currentIdx = i;
      if (thumbs[i]) thumbs[i].classList.add('is-current');
      if (rows[i])   rows[i].classList.add('is-current');
    }

    /* ── Pan the track from the list's scroll position ──── */
    let target = 0, current = 0, maxX = 0, last = performance.now();

    function measure() {
      maxX = Math.max(0, trackEl.scrollWidth - window.innerWidth);
    }
    measure();
    window.addEventListener('resize', measure);

    function onScroll() {
      const max = listEl.scrollHeight - listEl.clientHeight;
      target = max > 0 ? listEl.scrollTop / max : 0;

      const idx = Math.min(notes.length - 1, Math.round(target * (notes.length - 1)));
      if (readoutEl) readoutEl.textContent = pad(idx + 1) + ' / ' + pad(notes.length);
      setCurrent(idx);
    }
    listEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function frame(now) {
      const dt = Math.min(64, now - last); last = now;
      current += (target - current) * (1 - Math.pow(TRACK.smooth, dt / 1000));
      trackEl.style.transform = 'translate3d(' + (-current * maxX) + 'px,0,0)';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function setActive(i, on) {
      if (thumbs[i]) thumbs[i].classList.toggle('is-active', on);
      if (rows[i])   rows[i].classList.toggle('is-active', on);
    }
    rows.forEach(function (r, i) {
      r.addEventListener('mouseenter', function () { setActive(i, true); });
      r.addEventListener('mouseleave', function () { setActive(i, false); });
    });
    thumbs.forEach(function (t, i) {
      t.addEventListener('mouseenter', function () { setActive(i, true); });
      t.addEventListener('mouseleave', function () { setActive(i, false); });
      // Tapping an object walks the list to it rather than opening it —
      // the track is a map, the list is the destination.
      t.addEventListener('click', function () {
        rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    /* Late webfont swap changes row heights, which changes scroll
       height, which changes the mapping. Re-read once fonts land. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { measure(); onScroll(); });
    }

    /* Console handle, same spirit as POSTO_SHELF. */
    window.POSTO_ARCHIVE = {
      get smooth() { return TRACK.smooth; },
      set smooth(v) { TRACK.smooth = v; },
      count: notes.length,
      remeasure: function () { measure(); onScroll(); }
    };
  }
})();
