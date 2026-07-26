/* =========================================================
   notes-index.js
   Public notes grid for /notes (posto-public). Mirrors the
   shape of spots-index.js: reads ?layout=, fetches the public
   grid endpoint, renders into #notes-index.

   Layouts:
     ?layout=grid   clean bordered-less card grid (default) — image,
                    headline, reference_title as sub. Cards with a
                    reference_url link out (target=_blank for http/s).
   More layouts can be added to LAYOUTS later without touching the
   page shell.
   ========================================================= */
(function () {
  const API = 'https://studio.posto.world/api/board-notes/public/grid';

  const params = new URLSearchParams(location.search);
  const layout = (params.get('layout') || 'grid').toLowerCase().trim();
  // Category comes from ?cat=slug OR from a masked pretty path like
  // /shelf (nginx serves notes.html but the query string is empty).
  // Map known pretty paths to their category slug here.
  const PATH_CATS = { '/shelf': 'shelf' };
  const pathKey = location.pathname.replace(/\/+$/, ''); // strip trailing slash
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

  // ── Grid layout — the only one for now ─────────────────────
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

      const sub = n.reference_title
        ? `<div class="note-card__sub">${esc(n.reference_title)}</div>`
        : '';

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

  // ── Finds layout ───────────────────────────────────────────
  // Chronological, newest first, with a provenance line under each
  // item: the linked spot if there is one, otherwise the note's own
  // reference_title. Pinned notes are NOT floated to the top here —
  // this view is about recency, so pins would undercut it.
  // ── Shelf view config ───────────────────────────────────────
  // Ported from shelf-crop-tester-2. JS masonry: frame heights are
  // computed from measured column width × ratio, then each cell's
  // gridRowEnd is set so tiles pack tight (grid-auto-rows:1px).
  const SHELF = {
    ratio: 1.25,     // 4:5 (height/width). 1=1:1, 1.3333=3:4, 1.5=2:3, 0.6667=3:2
    cols: 7,         // columns
    gutter: 10,      // px
    heroSpan: 2,     // span for the hero tile in hero/rhythm patterns
    pattern: 'rhythm', // 'none' | 'hero' | 'rhythm' | 'chaos'
  };

  // ── Colour grade (ported from bill-tool-color) ──────────────
  // Runs once per image on a canvas so disparate photos read as one
  // roll. Pipeline: desaturate → normalize → contrast/bright → matte
  // → split-tone → grain. Edit these freely; they're the only knobs.
  const GRADE = {
    on:      true,
    sat:     0.8,               // 0 = greyscale, 1 = full colour
    norm:    true,              // normalize luminance (stretch levels)
    con:     1.0,               // contrast
    bri:     -0.02,             // brightness
    matte:   16,                // 0–44 — lifts blacks / caps whites
    split:   0.07,              // split-tone strength (0–0.25)
    warm:    [255, 238, 214],   // highlight tint (cream) — #ffeed6
    cool:    [46, 58, 86],      // shadow tint (navy)    — #2e3a56
    grain:   6,                 // 0–24
  };

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }

  function renderFinds(notes) {
    const withImages = notes.filter(n => !!n.image_url);
    if (!withImages.length) {
      mount.innerHTML = '<div class="notes-index__empty">Nothing here yet.</div>';
      return;
    }

    const sorted = withImages.slice().sort(
      (a, b) => new Date(b.publish_date) - new Date(a.publish_date)
    );

    const cards = sorted.map(n => {
      const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;
      const imgLink = n.reference_url && /^https?:\/\//i.test(n.reference_url)
        ? n.reference_url : null;
      const sourceName = spot ? spot.name : (n.reference_title || '');
      const cityName = spot ? spot.city : null;

      // Single graded image. A <canvas> holds the graded pixels; the
      // <img> is the source (hidden). On hover the canvas just switches
      // object-fit cover→contain over white — same grade, no swap.
      const src = imgSrc(n.image_url);
      const media =
        `<img class="find-src" src="${src}" alt="${esc(n.headline || '')}" ` +
        `crossorigin="anonymous" loading="lazy" hidden>` +
        `<canvas class="find-canvas"></canvas>`;
      const frame = imgLink
        ? `<a class="find-frame" href="${esc(imgLink)}" target="_blank" rel="noopener">${media}</a>`
        : `<div class="find-frame">${media}</div>`;

      const parts = [];
      if (sourceName) parts.push(`From <a class="find-source" href="#">${esc(sourceName)}</a>`);
      if (cityName)   parts.push(`<a class="find-city" href="#">${esc(cityName)}</a>`);
      const sub = parts.length ? `<div class="find-sub">${parts.join(', ')}</div>` : '';

      return `<div class="find-cell">
        ${frame}
        <div class="find-t">${esc(n.headline || 'Untitled')}</div>
        ${sub}
      </div>`;
    }).join('');

    mount.innerHTML =
      `<div class="finds-grid" id="findsGrid" ` +
      `style="--sat:${SHELF.sat};--con:${SHELF.con}">${cards}</div>`;

    const grid = document.getElementById('findsGrid');
    const cells = Array.prototype.slice.call(grid.children);

    function spanFor(i, C) {
      const H = Math.min(SHELF.heroSpan, C);
      if (SHELF.pattern === 'none')   return 1;
      if (SHELF.pattern === 'hero')   return i === 0 ? H : 1;
      if (SHELF.pattern === 'rhythm') return i === 0 ? H : (i % 7 === 0 ? 2 : 1);
      if (SHELF.pattern === 'chaos') {
        const r = hashStr(sorted[i].headline || String(i));
        return r > 0.88 ? Math.min(3, C) : r > 0.68 ? 2 : 1;
      }
      return 1;
    }

    function layout() {
      const C = SHELF.cols, G = SHELF.gutter;
      const W = grid.clientWidth;
      const colW = (W - G * (C - 1)) / C;

      grid.style.gridTemplateColumns = 'repeat(' + C + ',1fr)';
      grid.style.columnGap = G + 'px';
      grid.style.gridAutoFlow = 'dense';

      // Pass 1: set each frame's height and column span.
      cells.forEach(function (cell, i) {
        const s = Math.min(spanFor(i, C), C);
        const w = s * colW + (s - 1) * G;
        const h = Math.round(w * SHELF.ratio);
        cell.style.gridColumn = 'span ' + s;
        cell.querySelector('.find-frame').style.height = h + 'px';
        cell.dataset.frameH = h;
      });

      // Pass 2: measure the actual text block height per cell (frame
      // height is known) and set the row span from their sum. Measuring
      // the cell box directly is unreliable here because grid-auto-rows
      // constrains it — so we sum the known frame + the real text height.
      cells.forEach(function (cell) {
        const frameH = parseFloat(cell.dataset.frameH) || 0;
        let textH = 0;
        Array.prototype.forEach.call(cell.children, function (child) {
          if (!child.classList.contains('find-frame')) {
            textH += child.getBoundingClientRect().height;
          }
        });
        cell.style.gridRowEnd = 'span ' + Math.round(frameH + textH + G);
        cell.style.marginBottom = G + 'px';
      });
    }

    layout();
    gradeAll(grid);   // paint the graded canvases once images load
    let rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt); rt = setTimeout(layout, 120);
    });
  }

  // ── Grade engine (ported from bill-tool-color) ───────────────
  // Draws each card's source image into its canvas with the GRADE
  // pipeline applied. Runs once per image (on load). Square-ish sample
  // buffer keeps it cheap; CSS object-fit does the final framing.
  const GRADE_RES = 320;
  const LUM = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function gradeCanvas(img, canvas) {
    // Canvas matches the image's TRUE aspect ratio (longest side capped at
    // GRADE_RES). object-fit:cover crops it into the 4:5 frame at rest,
    // contain shows true proportions on hover.
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = GRADE_RES / Math.max(iw, ih);
    const cw = Math.max(1, Math.round(iw * scale));
    const ch = Math.max(1, Math.round(ih * scale));
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, cw, ch);

    if (!GRADE.on) return;

    // getImageData throws if the canvas is CORS-tainted. If so, we keep the
    // ungraded drawImage result above (still visible) rather than blanking.
    let id;
    try { id = ctx.getImageData(0, 0, cw, ch); }
    catch (e) { return; }
    const d = id.data, n = cw * ch;
    const R = new Float32Array(n), Gc = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let r = d[i*4]/255, g = d[i*4+1]/255, b = d[i*4+2]/255;
      const l = LUM(r, g, b);
      r = l + (r - l) * GRADE.sat; g = l + (g - l) * GRADE.sat; b = l + (b - l) * GRADE.sat;
      R[i] = r; Gc[i] = g; B[i] = b; L[i] = LUM(r, g, b);
    }
    let lo = 0, rng = 1;
    if (GRADE.norm) {
      const s = []; for (let i = 0; i < n; i += 13) s.push(L[i]); s.sort((a, b) => a - b);
      lo = s[Math.floor(s.length * 0.02)];
      const hi = s[Math.floor(s.length * 0.98)]; rng = Math.max(1e-3, hi - lo);
    }
    const mlo = GRADE.matte/255, mhi = 1 - GRADE.matte/255, w0 = GRADE.warm, c0 = GRADE.cool;
    for (let i = 0; i < n; i++) {
      let r = R[i], g = Gc[i], b = B[i];
      if (GRADE.norm) { const Ln = (L[i]-lo)/rng, sc = L[i] > 1e-4 ? Ln/L[i] : 0; r*=sc; g*=sc; b*=sc; }
      r = (r-0.5)*GRADE.con+0.5+GRADE.bri; g = (g-0.5)*GRADE.con+0.5+GRADE.bri; b = (b-0.5)*GRADE.con+0.5+GRADE.bri;
      r = mlo+(mhi-mlo)*r; g = mlo+(mhi-mlo)*g; b = mlo+(mhi-mlo)*b;
      const l2 = LUM(r,g,b);
      const tr = (w0[0]*l2 + c0[0]*(1-l2))/255, tg = (w0[1]*l2 + c0[1]*(1-l2))/255, tb = (w0[2]*l2 + c0[2]*(1-l2))/255;
      r = r*(1-GRADE.split)+tr*GRADE.split; g = g*(1-GRADE.split)+tg*GRADE.split; b = b*(1-GRADE.split)+tb*GRADE.split;
      if (GRADE.grain) { const gn = (Math.random()-0.5)*GRADE.grain/255*2; r+=gn; g+=gn; b+=gn; }
      const o = i*4;
      d[o]   = Math.max(0, Math.min(1, r))*255;
      d[o+1] = Math.max(0, Math.min(1, g))*255;
      d[o+2] = Math.max(0, Math.min(1, b))*255;
    }
    ctx.putImageData(id, 0, 0);
  }

  function gradeAll(grid) {
    grid.querySelectorAll('.find-cell').forEach(function (cell) {
      const img = cell.querySelector('.find-src');
      const canvas = cell.querySelector('.find-canvas');
      if (!img || !canvas) return;
      function run() {
        try { gradeCanvas(img, canvas); }
        catch (e) { /* CORS-tainted — canvas stays blank; see fallback note */ }
      }
      if (img.complete && img.naturalWidth) run();
      else img.addEventListener('load', run, { once: true });
    });
  }



  const LAYOUTS = {
    grid: renderGrid,
    finds: renderFinds,
    // future: list, wall, etc.
  };

  fetch(API)
    .then(r => r.json())
    .then(data => {
      let notes = data.notes || [];
      // ?cat=slug — filter to one category (client-side; the grid
      // endpoint returns category per note).
      if (cat) notes = notes.filter(n => (n.category || '').toLowerCase() === cat);
      const render = LAYOUTS[layout] || renderGrid;
      render(notes);
    })
    .catch(err => {
      console.error('[notes] Could not load notes', err);
      mount.innerHTML = '<div class="notes-index__empty">Could not load notes.</div>';
    });
})();
