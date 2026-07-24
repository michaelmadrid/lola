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

  const LAYOUTS = {
    grid: renderGrid,
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
