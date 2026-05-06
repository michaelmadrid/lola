/* =========================================================
   api.js
   Lightweight fetch wrapper for /api/* calls.
   Auto-attaches JWT from localStorage. Throws on non-2xx.
   ========================================================= */

const TOKEN_KEY = 'lola.token';
const USER_KEY  = 'lola.user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(path, opts);
  } catch (networkErr) {
    throw new Error('Network error — check your connection');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    // 401 = expired/invalid token. Clear and bounce to login (except on login page).
    if (res.status === 401 && !location.pathname.includes('login')) {
      clearToken();
      // soft redirect — preserve where we came from
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = '/login.html?next=' + next;
    }
    throw err;
  }
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body || {}),
  patch: (path, body) => request('PATCH', path, body || {}),
  delete: (path) => request('DELETE', path),

  // Auth helpers
  token: { get: getToken, set: setToken, clear: clearToken },
  user: { get: getUser, set: setUser },

  isSignedIn() { return !!getToken(); },

  signOut() {
    clearToken();
    location.href = '/login.html';
  }
};

window.api = api;
