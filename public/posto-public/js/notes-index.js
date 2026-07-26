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
  // Tunable inline. Rhythm is POSITION-keyed: every Nth slot spans,
  // so heroes shift as new items are added (fine for now).
  const SHELF = {
    ratio: '4 / 5',   // crop frame — object-fit:cover kills the product-shot feel
    cols: 6,          // grid columns
    heroEvery: 7,     // every Nth position...
    heroSpan: 2,      // ...spans this many columns
  };

  function renderFinds(notes) {
    const withImages = notes.filter(n => !!n.image_url);
    if (!withImages.length) {
      mount.innerHTML = '<div class="notes-index__empty">Nothing here yet.</div>';
      return;
    }

    const sorted = withImages.slice().sort(
      (a, b) => new Date(b.publish_date) - new Date(a.publish_date)
    );

    const cards = sorted.map((n, i) => {
      const spot = Array.isArray(n.spots) && n.spots.length ? n.spots[0] : null;

      // ── Three independent link targets (unwrapped card) ──
      // Image points at the real shop link; source + city are stubbed
      // to "#" for now (real routes come later, no slugs needed yet).
      const imgLink = n.reference_url && /^https?:\/\//i.test(n.reference_url)
        ? n.reference_url : null;
      const sourceName = spot ? spot.name : (n.reference_title || '');
      const cityName = spot ? spot.city : null;

      const img = `<img src="${imgSrc(n.image_url)}" alt="${esc(n.headline || '')}" loading="lazy">`;
      const imageEl = imgLink
        ? `<a class="find-card__img" href="${esc(imgLink)}" target="_blank" rel="noopener">${img}</a>`
        : `<span class="find-card__img">${img}</span>`;

      // Provenance: "From <source>, <city>" — source + city each a stub link.
      const parts = [];
      if (sourceName) {
        parts.push(`From <a class="find-card__source" href="#">${esc(sourceName)}</a>`);
      }
      if (cityName) {
        parts.push(`<a class="find-card__city" href="#">${esc(cityName)}</a>`);
      }
      const from = parts.length ? `<div class="find-card__from">${parts.join(', ')}</div>` : '';

      // Position-keyed hero: every heroEvery-th slot spans heroSpan cols.
      const isHero = ((i + 1) % SHELF.heroEvery === 0);
      const spanStyle = isHero ? ` style="grid-column: span ${SHELF.heroSpan}"` : '';

      return `
        <div class="find-card${isHero ? ' find-card--hero' : ''}"${spanStyle}>
          <div class="find-card__frame">${imageEl}</div>
          <div class="find-card__title">${esc(n.headline || 'Untitled')}</div>
          ${from}
        </div>`;
    }).join('');

    // Config drives the grid via CSS custom properties.
    mount.innerHTML =
      `<div class="finds-grid" style="` +
      `--shelf-cols:${SHELF.cols};` +
      `--shelf-ratio:${SHELF.ratio}">${cards}</div>`;
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
