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

  function imgSrc(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : 'https://studio.annex.site' + url;
  }

  function renderNote(n) {
    const parts = [];
    const isPhoto = n.type === 'photograph';
    const isAnnouncement = n.type === 'announcement';
    // Headline links out only for non-photo, non-announcement notes with a URL.
    const headlineLinks = n.reference_url && !isPhoto && !isAnnouncement;

    if (isAnnouncement) {
      parts.push('<div class="notice-caption">Announcement</div>');
    }

    if (n.headline) {
      if (headlineLinks) {
        parts.push('<div class="notice-text"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(n.headline) + '</a></div>');
      } else {
        parts.push('<div class="notice-text">' + esc(n.headline) + '</div>');
      }
    }

    if (isPhoto && n.image_url) {
      parts.push('<div class="notice-image"><img src="' + esc(imgSrc(n.image_url)) + '" alt="' + esc(n.headline) + '"></div>');
    } else if (n.image_url) {
      parts.push('<div class="notice-image notice-image--half"><img src="' + esc(imgSrc(n.image_url)) + '" alt=""></div>');
    }

    // Photograph: caption under the image. Clickable if a URL is given
    // (credit/source), otherwise plain text.
    if (isPhoto && (n.reference_title || n.reference_url)) {
      const capLabel = n.reference_title || n.reference_url;
      if (n.reference_url) {
        parts.push('<div class="notice-caption"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(capLabel) + '</a></div>');
      } else {
        parts.push('<div class="notice-caption">' + esc(capLabel) + '</div>');
      }
    }

    if (n.body) {
      // All note bodies are rich HTML (from Quill) now — render as-is.
      // Styling lives in shell.css (.notice-body), not inline.
      parts.push('<div class="notice-body">' + n.body + '</div>');
    }

    // Non-photo, non-announcement: show a separate reference line only when
    // there's a distinct title AND the headline didn't already carry the link.
    if (!isPhoto && !isAnnouncement && n.reference_url && n.reference_title && !headlineLinks) {
      parts.push('<div class="col-label"><a href="' + esc(n.reference_url) + '" target="_blank" rel="noopener">' + esc(n.reference_title) + ' ↗</a></div>');
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
