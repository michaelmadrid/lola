/* =========================================================
   admin-spots.js — review captures with bulk delete (spots table)
   ========================================================= */

(async function () {
  if (!api.isSignedIn()) {
    location.href = '/login.html?next=' + encodeURIComponent(location.pathname);
    return;
  }

  const listEl     = document.getElementById('spots-list');
  const checkAll   = document.getElementById('check-all');
  const bulkBar    = document.getElementById('bulk-bar');
  const bulkCount  = document.getElementById('bulk-count');
  const bulkDelete = document.getElementById('bulk-delete');
  const bulkCancel = document.getElementById('bulk-cancel');

  let spots = [];
  // Set of selected spot ids (numbers)
  const selected = new Set();

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-visible'), 10);
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 2400);
  }

  async function load() {
    try {
      const data = await api.get('/api/spots?limit=200');
      spots = data.spots || [];
      // Cleanse selection of any ids that no longer exist
      const idsNow = new Set(spots.map(s => s.id));
      for (const id of selected) if (!idsNow.has(id)) selected.delete(id);
      render();
      updateBulkBar();
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Failed to load.</div>';
    }
  }

  function render() {
    if (!spots.length) {
      listEl.innerHTML = '<div class="list-empty">No spots yet.</div>';
      return;
    }
    listEl.innerHTML = spots.map(s => `
      <div class="admin-table__row spots-row" data-id="${s.id}">
        <span class="col-check">
          <input type="checkbox" class="row-check" data-id="${s.id}"${selected.has(s.id) ? ' checked' : ''} aria-label="Select spot">
        </span>
        <span style="word-break:break-word">${util.escapeHtml(s.text)}</span>
        <span style="font-size:13px;color:var(--ink-3)">${(s.tags || []).map(t => '#' + util.escapeHtml(t)).join(' · ')}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">${util.timeAgo(s.created_at)}</span>
        <span class="admin-actions">
          <button data-id="${s.id}" class="del-btn is-danger">Delete</button>
        </span>
      </div>
    `).join('');

    // Per-row checkbox change
    listEl.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = parseInt(cb.dataset.id, 10);
        if (cb.checked) selected.add(id);
        else selected.delete(id);
        updateBulkBar();
        syncCheckAllState();
      });
    });

    // Single-row delete (kept for one-off deletes)
    listEl.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this spot?')) return;
        try {
          await api.delete('/api/spots/' + btn.dataset.id);
          selected.delete(parseInt(btn.dataset.id, 10));
          await load();
        } catch (err) {
          toast(err.message || 'Delete failed');
        }
      });
    });

    syncCheckAllState();
  }

  function updateBulkBar() {
    const n = selected.size;
    if (n === 0) {
      bulkBar.hidden = true;
      return;
    }
    bulkBar.hidden = false;
    bulkCount.textContent = n === 1 ? '1 selected' : `${n} selected`;
  }

  function syncCheckAllState() {
    if (!checkAll) return;
    const total = spots.length;
    const sel = selected.size;
    if (sel === 0) {
      checkAll.checked = false;
      checkAll.indeterminate = false;
    } else if (sel === total) {
      checkAll.checked = true;
      checkAll.indeterminate = false;
    } else {
      checkAll.checked = false;
      checkAll.indeterminate = true;
    }
  }

  if (checkAll) {
    checkAll.addEventListener('change', () => {
      if (checkAll.checked) {
        spots.forEach(s => selected.add(s.id));
      } else {
        selected.clear();
      }
      // Re-render to update each row's checkbox
      render();
      updateBulkBar();
    });
  }

  if (bulkCancel) {
    bulkCancel.addEventListener('click', () => {
      selected.clear();
      render();
      updateBulkBar();
    });
  }

  if (bulkDelete) {
    bulkDelete.addEventListener('click', async () => {
      const ids = Array.from(selected);
      if (!ids.length) return;
      const word = ids.length === 1 ? 'spot' : 'spots';
      if (!confirm(`Delete ${ids.length} ${word}? This cannot be undone.`)) return;

      // Disable button while deleting
      bulkDelete.disabled = true;
      bulkDelete.textContent = 'Deleting…';

      // Fire deletes in parallel; keep track of failures
      const failures = [];
      await Promise.all(ids.map(async (id) => {
        try {
          await api.delete('/api/spots/' + id);
        } catch (err) {
          failures.push(id);
        }
      }));

      bulkDelete.disabled = false;
      bulkDelete.textContent = 'Delete selected';

      if (failures.length === 0) {
        selected.clear();
        toast(`Deleted ${ids.length} ${word}`);
      } else if (failures.length === ids.length) {
        toast('Delete failed');
      } else {
        // Keep failed ones selected
        selected.clear();
        failures.forEach(id => selected.add(id));
        toast(`Deleted ${ids.length - failures.length}, ${failures.length} failed`);
      }
      await load();
    });
  }

  const signOutFoot = document.getElementById('signout-link-foot');
  if (signOutFoot) signOutFoot.addEventListener('click', (e) => { e.preventDefault(); api.signOut(); });

  load();
})();
