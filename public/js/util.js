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

  // Tiny markdown: **bold**, `code`, [text](url), ## heading, --- horizontal rule.
  // Safe — escapes HTML first. Whitelisted URL schemes only (http, https, mailto,
  // relative /). Anything else falls back to plain text. Newlines preserved by
  // parent CSS (white-space: pre-wrap), except inside generated headings/rules
  // which are full block elements.
  safeMarkdown(s) {
    if (!s) return '';
    // Escape first
    let out = String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // [text](url) — links. Apply BEFORE bold/code to avoid * collisions inside text.
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      const safe = /^(https?:\/\/|mailto:|\/)/i.test(url);
      if (!safe) return m;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // `code` — inline monospace
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // ===== Block elements (line-by-line) =====
    // Process per-line so ## and --- only match at line starts.
    // Headings and rules become full <h4> / <hr> elements which break out of
    // the surrounding white-space: pre-wrap line flow naturally.
    //
    // We also strip blank lines IMMEDIATELY ADJACENT to block elements so
    // pre-wrap doesn't render those empty lines as visible whitespace gaps.
    // The block element's own margin handles spacing.
    const lines = out.split('\n');
    const blocks = [];
    let buf = [];
    let lastWasBlock = false;
    const flush = () => {
      if (buf.length) {
        // Trim leading blank lines if this buffer follows a block element
        while (lastWasBlock && buf.length && buf[0].trim() === '') buf.shift();
        if (buf.length) {
          blocks.push(buf.join('\n'));
          lastWasBlock = false;
        }
        buf = [];
      }
    };
    for (const line of lines) {
      const hMatch = /^##\s+(.+?)\s*$/.exec(line);
      if (hMatch) {
        // Trim trailing blank lines from buf before emitting block
        while (buf.length && buf[buf.length - 1].trim() === '') buf.pop();
        flush();
        blocks.push(`<h4 class="md-h">${hMatch[1]}</h4>`);
        lastWasBlock = true;
        continue;
      }
      if (/^---+\s*$/.test(line)) {
        while (buf.length && buf[buf.length - 1].trim() === '') buf.pop();
        flush();
        blocks.push('<hr class="md-hr">');
        lastWasBlock = true;
        continue;
      }
      buf.push(line);
    }
    flush();
    return blocks.join('\n');
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

  // ----- Time formatting (respects user's global time format preference) -----

  // Returns '24h' or '12h'. Defaults to '24h' if not set.
  getTimeFormat() {
    try {
      const v = localStorage.getItem('kit.time_format');
      return v === '12h' ? '12h' : '24h';
    } catch {
      return '24h';
    }
  },

  // Format a Date in a given timezone, respecting user's time format preference.
  // Returns "13:49" or "1:49 PM".
  fmtTime(date, opts = {}) {
    const d = (date instanceof Date) ? date : new Date(date);
    const fmt = this.getTimeFormat();
    const config = {
      hour: fmt === '24h' ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: fmt === '12h',
    };
    if (opts.timeZone) config.timeZone = opts.timeZone;
    return new Intl.DateTimeFormat('en-US', config).format(d);
  },

  // Format an hour-float (e.g., 13.5 = 13:30) respecting user's time format.
  // Used by the timeline / call windows. Handles overflow (25 → 1am next day).
  fmtTimeFloat(h) {
    const fmt = this.getTimeFormat();
    // Normalize to [0, 24) — handles overflow like 25 → 1
    let normalized = ((h % 24) + 24) % 24;
    const whole = Math.floor(normalized);
    const minutes = Math.round((normalized - whole) * 60);
    if (fmt === '24h') {
      return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    // 12h with AM/PM
    const period = whole >= 12 ? 'pm' : 'am';
    let display = whole % 12;
    if (display === 0) display = 12;
    return `${display}:${String(minutes).padStart(2, '0')} ${period}`;
  },
};
