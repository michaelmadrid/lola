/* =========================================================
   admin-saves.js — review captures
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl = document.getElementById('saves-list');

  async function load() {
    try {
      const data = await api.get('/api/saves?limit=200');
      render(data.saves || []);
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function render(saves) {
    if (!saves.length) {
      listEl.innerHTML = '<div class="list-empty">No saves yet.</div>';
      return;
    }
    listEl.innerHTML = saves.map(s => `
      <div class="admin-table__row" style="grid-template-columns: minmax(0,4fr) minmax(0,2fr) 90px 130px">
        <span style="word-break:break-word">${util.escapeHtml(s.text)}</span>
        <span style="font-size:13px;color:var(--ink-3)">${(s.tags || []).map(t => '#' + util.escapeHtml(t)).join(' · ')}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${util.timeAgo(s.created_at)}</span>
        <span class="admin-actions">
          <button data-id="${s.id}" class="del-btn is-danger">Delete</button>
        </span>
      </div>
    `).join('');
    listEl.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this save?')) return;
        try {
          await api.delete('/api/saves/' + btn.dataset.id);
          await load();
        } catch (err) {
          toast(err.message || 'Delete failed');
        }
      });
    });
  }

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  load();
})();
