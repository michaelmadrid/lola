/* notes-feed.js — pulls published Notes into the annex.site center column.
   Talks to studio.annex.site since annex.site is a static-only domain
   (no Node backend on this side). Public, unauthenticated endpoint. */
(function () {
  const API = 'https://studio.annex.site/api/board-notes/public';
  const feed = document.getElementById('notes-feed');
  if (!feed) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderNote(n) {
    const parts = [];

    if (n.type === 'announcement') {
      parts.push('<div class="notice-caption">Announcement</div>');
    }

    if (n.headline) {
      parts.push('<div class="notice-text">' + esc(n.headline) + '</div>');
    }

    if (n.type === 'photograph' && n.image_url) {
      parts.push('<div class="notice-image"><img src="' + esc(n.image_url) + '" alt="' + esc(n.headline) + '"></div>');
    } else if (n.image_url) {
      // Note/link/announcement with an attached image still gets shown, half width.
      parts.push('<div class="notice-image notice-image--half"><img src="' + esc(n.image_url) + '" alt=""></div>');
    }

    if (n.body) {
      parts.push('<div class="notice-body" style="font-family:var(--serif);font-size:var(--text-body);line-height:1.5;color:var(--ink-2);margin-bottom:var(--space-5)">' + esc(n.body) + '</div>');
    }

    if (n.reference_url) {
      const label = n.reference_title || n.reference_url;
      parts.push('<div class="col-label"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(label) + ' ↗</a></div>');
    }

    parts.push('<hr class="divider">');

    return '<div class="notice-item' + (n.pin ? ' is-pinned' : '') + '" data-type="' + esc(n.type) + '">' + parts.join('\n') + '</div>';
  }

  fetch(API)
    .then(r => r.json())
    .then(data => {
      const notes = data.notes || [];
      if (!notes.length) {
        feed.innerHTML = '<p class="notice-caption">Nothing here yet.</p>';
        return;
      }
      feed.innerHTML = notes.map(renderNote).join('\n');
    })
    .catch(() => {
      feed.innerHTML = '<p class="notice-caption">Could not load notes.</p>';
    });
})();
