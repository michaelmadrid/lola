// API.JS — Summer Holiday / Lola v0.3

const API_TOKEN = () => localStorage.getItem('lola_token');

// ─────────────────────────────────────────
// API HELPER
// ─────────────────────────────────────────
export async function api(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_TOKEN()}` },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.json();
  } catch(e) {
    console.warn('API error:', path, e);
    return null;
  }
}
