/* =========================================================
   notes-index.js
   Public notes grid for /notes (annex-public). Mirrors the
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
  const API = 'https://studio.annex.site/api/board-notes/public/grid';

  const params = new URLSearchParams(location.search);
  const layout = (params.get('layout') || 'grid').toLowerCase().trim();

  const mount = document.getElementById('notes-index');
  if (!mount) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function imgSrc(url) {
    if (!url) return '';
    return url.indexOf('http') === 0 ? url : 'https://studio.annex.site' + url;
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
      const render = LAYOUTS[layout] || renderGrid;
      render(data.notes || []);
    })
    .catch(err => {
      console.error('[notes] Could not load notes', err);
      mount.innerHTML = '<div class="notes-index__empty">Could not load notes.</div>';
    });
})();
