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
    sat: 0.8,        // grade — saturation
    con: 1,          // grade — contrast
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

    // Grade lives on the container as CSS vars (cleared on hover in CSS).
    const cards = sorted.map(n => {
      const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;
      const imgLink = n.reference_url && /^https?:\/\//i.test(n.reference_url)
        ? n.reference_url : null;
      const sourceName = spot ? spot.name : (n.reference_title || '');
      const cityName = spot ? spot.city : null;

      const img = `<img src="${imgSrc(n.image_url)}" alt="" loading="lazy">`;
      const frame = imgLink
        ? `<a class="find-frame" href="${esc(imgLink)}" target="_blank" rel="noopener">${img}</a>`
        : `<div class="find-frame">${img}</div>`;

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
      const titleH = 40;

      grid.style.gridTemplateColumns = 'repeat(' + C + ',1fr)';
      grid.style.columnGap = G + 'px';
      grid.style.gridAutoFlow = 'dense';

      cells.forEach(function (cell, i) {
        const s = Math.min(spanFor(i, C), C);
        const w = s * colW + (s - 1) * G;
        const h = Math.round(w * SHELF.ratio);
        cell.style.gridColumn = 'span ' + s;
        cell.querySelector('.find-frame').style.height = h + 'px';
        cell.style.gridRowEnd = 'span ' + Math.round(h + titleH + G);
        cell.style.marginBottom = G + 'px';
      });
    }

    layout();
    let rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt); rt = setTimeout(layout, 120);
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
