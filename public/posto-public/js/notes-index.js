/* =========================================================
   notes-index.js
   Public notes grid for /notes (posto-public). Reads ?layout=,
   fetches the public grid endpoint, renders into #notes-index.

   Layouts:
     (default)      shelf — masonry with authored span patterns + ghost
                    breaths (empty cells). True-ratio images, no grade.
                    Provenance line links to /spot/:slug and /city/:slug.
     ?layout=grid   plain bordered-less card grid — image, headline, and
                    the same From <spot>, <city> meta line.

   All tuning lives in the SHELF config block below: per-breakpoint
   column counts AND span patterns, gutter, ghost height. A `0` in a
   pattern = a one-column ghost (intentional empty breath).
   ========================================================= */
(function () {
  const API = 'https://studio.posto.world/api/board-notes/public/grid';

  const params = new URLSearchParams(location.search);
  // Default layout is the shelf (was findsv2). ?layout=grid for the plain one.
  const layout = (params.get('layout') || 'shelf').toLowerCase().trim();
  const PATH_CATS = { '/shelf': 'shelf' };
  const pathKey = location.pathname.replace(/\/+$/, '');
  const cat = ((params.get('cat') || PATH_CATS[pathKey] || '')).toLowerCase().trim();

  const mount = document.getElementById('notes-index');
  if (!mount) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }
  function imgSrc(url) {
    if (!url) return '';
    return url.indexOf('http') === 0 ? url : 'https://studio.posto.world' + url;
  }
  // Slugify a source/city name for /spot/ and /city/ links. Matches the
  // server's slug rule closely enough for the common cases; real linked
  // spots resolve by slug, and the API accepts id-or-slug as a fallback.
  function slug(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // Plain-text provenance (no inner links) — for the grid layout, whose
  // whole card is a single outward <a>; nested anchors wouldn't fire.
  function provenanceText(n) {
    const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;
    if (spot) return esc(spot.name) + (spot.city ? ', ' + esc(spot.city) : '');
    if (n.reference_title) return esc(n.reference_title);
    return '';
  }

  // Linked provenance: "From <spot>, <city>" each linking to its page.
  // Used by the shelf, where the cell is not wrapped in an outer anchor.
  function provenanceHtml(n) {
    const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;
    if (spot) {
      // Use the REAL stored slug from the API. Only derive as a last resort
      // (old rows without a slug), since deriving can't know how the server
      // handled '&', accents, or collision suffixes — that was the bug.
      const spotSlug = spot.slug || slug(spot.name);
      const spotLink = '<a href="/spot/' + spotSlug + '">' + esc(spot.name) + '</a>';
      const citySlug = spot.city_slug || (spot.city ? slug(spot.city) : '');
      const cityLink = spot.city
        ? ', <a href="/city/' + citySlug + '">' + esc(spot.city) + '</a>'
        : '';
      return spotLink + cityLink;
    }
    if (n.reference_title) return esc(n.reference_title);
    return '';
  }

  // =========================================================
  // SHELF CONFIG — all tuning lives here.
  // =========================================================
  const SHELF = {
    ratio: 1.25,      // fallback image ratio (h/w) if a real one can't be read
    gutter: 12,       // px between cells
    ghostHeight: 0.9, // ghost cell height as a ratio of one column's width
    fixedRatio: false,// true = force every frame to `ratio` (uniform crop)

    // Per-breakpoint column counts AND span patterns. Widest first.
    // maxWidth: applies at viewport <= this width. The last entry is the
    // desktop default (no maxWidth). Patterns repeat across the item stream;
    // a `0` is a one-column ghost (empty breath). Patterns are authored per
    // column count because a 2-span means something different at 2 vs 7 cols.
    breakpoints: [
      { maxWidth: 460,  cols: 2, pattern: [0,1,1,1,2,1,1,1,0,1] },
      { maxWidth: 640,  cols: 3, pattern: [1,1,2,0,1,1,1,2,0,1] },
      { maxWidth: 820,  cols: 4, pattern: [1,2,1,1,0,1,2,1,1,0,1] },
      { maxWidth: 1100, cols: 5, pattern: [1,0,2,0,1,1,0,1,2,1,0,1,1] },
      { maxWidth: null, cols: 6, pattern: [1,2,0,1,1,2,1,1,0,2,1,1,0,1,1] }, // desktop
    ],
  };

  // Resolve the active breakpoint for the current viewport width.
  function activeBP() {
    const w = window.innerWidth;
    const bps = SHELF.breakpoints;
    for (let i = 0; i < bps.length; i++) {
      if (bps[i].maxWidth == null || w <= bps[i].maxWidth) return bps[i];
    }
    return bps[bps.length - 1];
  }

  // =========================================================
  // GRID — plain card grid (?layout=grid). Now carries the same
  // provenance meta line as the shelf.
  // =========================================================
  function renderGrid(notes) {
    const withImages = notes.filter(n => !!n.image_url);
    if (!withImages.length) {
      mount.innerHTML = '<div class="notes-index__empty">Nothing here yet.</div>';
      return;
    }
    const cards = withImages.map(n => {
      const hasLink = !!n.reference_url;
      const abs = hasLink && /^https?:\/\//i.test(n.reference_url);
      const openAttrs = abs ? ' target="_blank" rel="noopener"' : '';
      const tag = hasLink ? 'a' : 'div';
      const hrefAttr = hasLink ? ` href="${esc(n.reference_url)}"${openAttrs}` : '';
      const prov = provenanceText(n);
      const sub = prov ? `<div class="note-card__sub">${prov}</div>` : '';
      return `
        <${tag} class="note-card${hasLink ? ' note-card--linked' : ''}"${hrefAttr}>
          <div class="note-card__thumb">
            <img src="${imgSrc(n.image_url)}" alt="${esc(n.headline || '')}" loading="lazy">
          </div>
          <div class="note-card__title">${esc(n.headline || 'Untitled')}</div>
          ${sub}
        </${tag}>`;
    }).join('');
    mount.innerHTML = `<div class="notes-grid">${cards}</div>`;
  }

  // =========================================================
  // SHELF — masonry with authored patterns + ghost breaths.
  // =========================================================
  function renderShelf(notes) {
    const items = notes.filter(n => !!n.image_url);
    if (!items.length) {
      mount.innerHTML = '<div class="notes-index__empty">Nothing here yet.</div>';
      return;
    }
    const sorted = items.slice().sort(
      (a, b) => new Date(b.publish_date) - new Date(a.publish_date)
    );

    // Cache real image ratios (h/w) so heights are true to the upload.
    const ratios = {};

    // Build the display list by walking the active pattern across the item
    // stream. Ghost slots (0) emit an empty cell and consume NO item.
    //
    // Featured behaviour (i, with fallback): as we walk chronologically, a
    // hero slot (span > 1) is filled by the NEXT FEATURED item still waiting,
    // if one exists; otherwise it falls back to the next item in order.
    // Single slots take the next non-hero item. Overflow featured items
    // (more featured than hero slots) just flow as normal singles. Nothing
    // reorders — featured only changes which existing item lands in a big
    // slot, so recency (newest-first) is preserved.
    let cells = []; // [{ghost:true} | {item, span}]
    function buildCells() {
      const bp = activeBP();
      const p = bp.pattern && bp.pattern.length ? bp.pattern : [1];
      cells = [];

      // A single ordered queue; we pull from the front for normal slots, but
      // for hero slots we pull the earliest FEATURED item still in the queue.
      const queue = sorted.slice();

      function takeNext() {
        // Prefer the next NON-featured item, so a single slot doesn't eat a
        // featured item that a coming hero slot wants. Only fall back to a
        // featured item if that's all that's left.
        const ni = queue.findIndex(function (n) { return !n.featured; });
        if (ni === -1) return queue.shift();
        return queue.splice(ni, 1)[0];
      }
      function takeFeaturedOrNext() {
        const fi = queue.findIndex(function (n) { return !!n.featured; });
        if (fi === -1) return queue.shift();      // fallback: next in order
        return queue.splice(fi, 1)[0];            // the earliest featured
      }

      let pi = 0;
      while (queue.length) {
        const s = p[pi % p.length];
        pi++;
        if (s === 0) { cells.push({ ghost: true }); continue; }
        const span = Math.min(s, bp.cols);
        const item = span > 1 ? takeFeaturedOrNext() : takeNext();
        if (!item) break;
        cells.push({ item: item, span: span });
      }
    }

    function draw() {
      buildCells();
      mount.innerHTML = '<div class="shelf-grid" id="shelfGrid">' + cells.map(function (c) {
        if (c.ghost) return '<div class="shelf-cell shelf-cell--ghost" data-ghost="1"></div>';
        const n = c.item;
        const imgLink = n.reference_url && /^https?:\/\//i.test(n.reference_url)
          ? n.reference_url : null;
        const img = '<img src="' + imgSrc(n.image_url) + '" alt="' + esc(n.headline || '') + '" loading="lazy">';
        const frame = imgLink
          ? '<a class="shelf-frame" href="' + esc(imgLink) + '" target="_blank" rel="noopener">' + img + '</a>'
          : '<div class="shelf-frame">' + img + '</div>';
        const prov = provenanceHtml(n);
        const sub = prov ? '<div class="shelf-sub">' + prov + '</div>' : '';
        return '<div class="shelf-cell">' + frame +
          '<div class="shelf-t">' + esc(n.headline || 'Untitled') + '</div>' + sub + '</div>';
      }).join('') + '</div>';

      const grid = document.getElementById('shelfGrid');
      const nodes = Array.prototype.slice.call(grid.children);
      layout(grid, nodes);
    }

    function layout(grid, nodes) {
      const bp = activeBP();
      const C = bp.cols, G = SHELF.gutter;
      const W = grid.clientWidth;
      const colW = (W - G * (C - 1)) / C;

      grid.style.gridTemplateColumns = 'repeat(' + C + ',1fr)';
      grid.style.columnGap = G + 'px';
      grid.style.gridAutoFlow = 'dense';

      // Pass 1: sizes.
      nodes.forEach(function (cell, i) {
        const c = cells[i];
        if (!c) return;
        if (c.ghost) {
          const h = Math.round(colW * SHELF.ghostHeight);
          cell.style.gridColumn = 'span 1';
          cell.style.gridRowEnd = 'span ' + Math.round(h + G);
          cell.style.marginBottom = G + 'px';
          return;
        }
        const s = c.span;
        const w = s * colW + (s - 1) * G;
        const file = c.item.image_url;
        const r = SHELF.fixedRatio ? SHELF.ratio : (ratios[file] || SHELF.ratio);
        const h = Math.round(w * r);
        cell.style.gridColumn = 'span ' + s;
        const frame = cell.querySelector('.shelf-frame');
        if (frame) frame.style.height = h + 'px';
        cell.dataset.frameH = h;
      });

      // Pass 2: row spans from real (frame + measured text) height.
      nodes.forEach(function (cell) {
        if (cell.classList.contains('shelf-cell--ghost')) return;
        const frameH = parseFloat(cell.dataset.frameH) || 0;
        let textH = 0;
        Array.prototype.forEach.call(cell.children, function (child) {
          if (!child.classList.contains('shelf-frame')) {
            textH += child.getBoundingClientRect().height;
          }
        });
        cell.style.gridRowEnd = 'span ' + Math.round(frameH + textH + G);
        cell.style.marginBottom = G + 'px';
      });
    }

    // Read true image ratios first (so heights match uploads), then draw.
    // We null the Image handlers + src after reading so the browser can
    // garbage-collect the full-res decode — otherwise every shelf image
    // stays decoded in memory for the life of the page, which adds up over
    // a long session (especially alongside other heavy tabs).
    let pending = sorted.length;
    if (!pending) { draw(); return; }
    sorted.forEach(function (n) {
      let im = new Image();
      const key = n.image_url;
      const done = function () {
        if (im) { im.onload = im.onerror = null; im = null; }
        if (!--pending) draw();
      };
      im.onload = function () { ratios[key] = im.naturalHeight / im.naturalWidth; done(); };
      im.onerror = function () { ratios[key] = SHELF.ratio; done(); };
      im.src = imgSrc(key);
    });

    // Re-layout only when the WIDTH changes. On mobile, scrolling shows/
    // hides the address bar, which fires resize with a new HEIGHT — if we
    // rebuilt on that, every scroll would jump back to top. Track width and
    // bail when only height changed.
    //
    // Live-tuning handle for the console. Lets you experiment without a
    // redeploy, e.g.:
    //   POSTO_SHELF.setCols(6)                 // desktop breakpoint cols
    //   POSTO_SHELF.setCols(6, 1100)           // cols for a given breakpoint
    //   POSTO_SHELF.setPattern([0,1,1,2,1,1])  // desktop pattern
    //   POSTO_SHELF.config                      // inspect current SHELF
    //   POSTO_SHELF.relayout()                  // force a redraw
    // These are session-only — edit the SHELF config in the source to persist.
    window.POSTO_SHELF = {
      config: SHELF,
      relayout: function () { if (window.__shelfRelayout) window.__shelfRelayout(); },
      setCols: function (n, maxWidth) {
        const bp = maxWidth == null
          ? SHELF.breakpoints[SHELF.breakpoints.length - 1]   // desktop default
          : SHELF.breakpoints.find(function (b) { return b.maxWidth === maxWidth; });
        if (!bp) { console.warn('no breakpoint with maxWidth', maxWidth); return; }
        bp.cols = n;
        this.relayout();
      },
      setPattern: function (arr, maxWidth) {
        const bp = maxWidth == null
          ? SHELF.breakpoints[SHELF.breakpoints.length - 1]
          : SHELF.breakpoints.find(function (b) { return b.maxWidth === maxWidth; });
        if (!bp) { console.warn('no breakpoint with maxWidth', maxWidth); return; }
        bp.pattern = arr;
        this.relayout();
      },
    };

    // Always keep the global re-layout hook pointing at THIS render's draw,
    // so a listener bound on the first render still calls the current draw.
    window.__shelfRelayout = function () {
      const grid = document.getElementById('shelfGrid');
      if (grid) draw();
    };

    // Registered ONCE per page via a global guard: if renderShelf ever runs
    // again (re-fetch, soft nav), we don't stack a second listener — each
    // stacked listener would trigger another full grid rebuild on resize.
    if (!window.__shelfResizeBound) {
      window.__shelfResizeBound = true;
      let rt;
      let lastW = window.innerWidth;
      window.addEventListener('resize', function () {
        const w = window.innerWidth;
        if (w === lastW) return;   // height-only change (address bar) — ignore
        lastW = w;
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (window.__shelfRelayout) window.__shelfRelayout();
        }, 140);
      });
    }
  }

  const LAYOUTS = {
    shelf: renderShelf,
    grid: renderGrid,
  };

  fetch(API)
    .then(r => r.json())
    .then(data => {
      let notes = data.notes || [];
      if (cat) notes = notes.filter(n => (n.category || '').toLowerCase() === cat);
      const render = LAYOUTS[layout] || renderShelf;
      render(notes);
    })
    .catch(err => {
      console.error('[notes] Could not load notes', err);
      mount.innerHTML = '<div class="notes-index__empty">Could not load notes.</div>';
    });
})();
