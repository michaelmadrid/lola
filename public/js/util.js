// UTIL.JS — Summer Holiday / Lola v0.3

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
export function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function formatDate(key) {
  const [y,m,d] = key.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}

export function calcDuration(dep, arr) {
  const d = parseTime(dep), a = parseTime(arr);
  if (d === null || a === null) return null;
  const diff = (a - d + 1440) % 1440;
  const h = Math.floor(diff / 60), m = diff % 60;
  return m > 0 ? `${h}h${String(m).padStart(2,'0')}m` : `${h}h`;
}

export function parseTime(str) {
  if (!str) return null;
  const m = str.match(/(\d+):(\d+)(am|pm)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3].toLowerCase() === 'pm' && h < 12) h += 12;
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

export function normalizeUrl(val) {
  val = val.trim();
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  if (val.includes('.') && !val.includes(' ')) return 'https://' + val;
  return val;
}

export function getDomain(url) {
  try { return new URL(url).hostname.replace('www.',''); }
  catch { return url; }
}

export function ck(city) { return city.toLowerCase().replace(/\s+/g,'_'); }

export function cacheKey(tripId, city) { return `${tripId}-${ck(city)}`; }

export function moonSVG(key, size = 16) {
  const moon = getMoonPhase(key);
  const pct = moon.pct;
  const r = size / 2;
  const ri = r - 1.5;
  let fill;
  if (pct === 0) {
    fill = '<circle cx="' + r + '" cy="' + r + '" r="' + ri + '" fill="none" stroke="var(--gray-light)" stroke-width="1.5"/>';
  } else if (pct >= 0.475 && pct <= 0.525) {
    fill = '<circle cx="' + r + '" cy="' + r + '" r="' + ri + '" fill="var(--accent)" opacity="0.7"/>';
  } else {
    const lit = pct < 0.5 ? pct * 2 : (1 - pct) * 2;
    const dx = (1 - lit) * ri;
    const waxing = pct < 0.5;
    fill = '<circle cx="' + r + '" cy="' + r + '" r="' + ri + '" fill="' + (waxing ? 'none' : 'var(--accent)') + '" stroke="var(--gray-light)" stroke-width="1.5" opacity="0.7"/>';
    fill += '<ellipse cx="' + (r + (waxing ? dx : -dx)) + '" cy="' + r + '" rx="' + Math.max(0.5, Math.abs(dx)) + '" ry="' + ri + '" fill="' + (waxing ? 'var(--accent)' : 'var(--bg)') + '" opacity="0.7"/>';
  }
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;margin-left:4px;" title="' + moon.name + '">' + fill + '</svg>';
}

// ─────────────────────────────────────────
// MOON PHASE
// ─────────────────────────────────────────
export function getMoonPhase(key) {
  const [y,m,d] = key.split('-').map(Number);
  const date = new Date(y,m-1,d);
  const ref = new Date(2026,3,16);
  const diff = (date - ref)/(1000*60*60*24);
  const cycle = 29.53058867;
  const phase = ((diff % cycle) + cycle) % cycle;
  const pct = phase / cycle;
  if (pct < 0.025 || pct >= 0.975) return { name: 'New Moon', pct: 0 };
  if (pct < 0.25) return { name: 'Waxing Crescent', pct };
  if (pct < 0.275) return { name: 'First Quarter', pct: 0.25 };
  if (pct < 0.475) return { name: 'Waxing Gibbous', pct };
  if (pct < 0.525) return { name: 'Full Moon', pct: 0.5 };
  if (pct < 0.725) return { name: 'Waning Gibbous', pct };
  if (pct < 0.775) return { name: 'Last Quarter', pct: 0.75 };
  return { name: 'Waning Crescent', pct };
}
