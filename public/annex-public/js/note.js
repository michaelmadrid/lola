/* note.js — renders a single note permalink at /notes/:id
   Reads the id from the path, fetches the published note, renders it.
   body is rendered as HTML (trusted — only editors publish notes). */
(function () {
  const API = 'https://studio.annex.site/api/board-notes/public/';
  const el = document.getElementById('note-permalink');
  if (!el) return;

  // /notes/42  ->  "42"
  const parts = location.pathname.split('/').filter(Boolean);
  const id = parts[parts.length - 1];
  if (!id || isNaN(parseInt(id, 10))) {
    el.innerHTML = '<p class="notice-caption">Note not found.</p>';
    document.title = 'Not found — Annex';
    return;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : 'https://studio.annex.site' + url;
  }

  fetch(API + encodeURIComponent(id))
    .then(r => {
      if (!r.ok) throw new Error('not found');
      return r.json();
    })
    .then(data => {
      const n = data.note;
      document.title = (n.headline || 'Note') + ' — Annex';

      const parts = [];
      parts.push('<article class="note-detail" data-type="' + esc(n.type) + '">');

      if (n.type === 'announcement') {
        parts.push('<div class="notice-caption">Announcement</div>');
      }

      if (n.headline) {
        if (n.type === 'link' && n.reference_url) {
          parts.push('<h1 class="note-detail__headline"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(n.headline) + ' ↗</a></h1>');
        } else {
          parts.push('<h1 class="note-detail__headline">' + esc(n.headline) + '</h1>');
        }
      }

      if (n.image_url) {
        parts.push('<div class="note-detail__image"><img src="' + esc(imgSrc(n.image_url)) + '" alt="' + esc(n.headline) + '"></div>');
      }

      if (n.body) {
        // Trusted HTML — only editors publish. Enables rich one-off pages.
        parts.push('<div class="note-detail__body">' + n.body + '</div>');
      }

      if (n.reference_url && n.type !== 'link') {
        const label = n.reference_title || n.reference_url;
        parts.push('<div class="note-detail__ref"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(label) + ' ↗</a></div>');
      } else if (n.reference_title) {
        parts.push('<div class="note-detail__caption">' + esc(n.reference_title) + '</div>');
      }

      parts.push('</article>');
      el.innerHTML = parts.join('\n');
    })
    .catch(() => {
      el.innerHTML = '<p class="notice-caption">Note not found.</p>';
      document.title = 'Not found — Annex';
    });
})();
