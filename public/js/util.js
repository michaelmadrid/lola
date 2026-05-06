/* =========================================================
   util.js — small helpers used across pages.
   ========================================================= */

window.util = {
  // "now", "5m", "3h", "2d", "12 May"
  timeAgo(iso) {
    if (!iso) return '';
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = Math.max(0, now - then);
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    if (h < 24) return h + 'h';
    if (d < 7) return d + 'd';
    return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  },

  // safe HTML
  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Tiny markdown: **bold**, `code`, [text](url). Safe — escapes HTML first.
  // Whitelisted URL schemes only (http, https, mailto). Anything else falls back
  // to plain text. Newlines preserved by parent CSS (white-space: pre-wrap).
  safeMarkdown(s) {
    if (!s) return '';
    let out = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // [text](url) — links. Apply BEFORE bold/code to avoid * collisions inside text.
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      // Validate URL scheme — http(s), mailto, or relative path starting with /
      const safe = /^(https?:\/\/|mailto:|\/)/i.test(url);
      if (!safe) return m; // leave unchanged so user sees the typo
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // `code` — inline monospace
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    return out;
  },

  // "Tuesday, May 12"
  formatLongDate(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  },

  // "Tue 12 May"
  formatShortDate(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  },

  // "12 May 2026"
  formatNumericDate(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  // simple debounce
  debounce(fn, ms = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  // get URL query param
  query(name) {
    return new URLSearchParams(location.search).get(name);
  },
};
