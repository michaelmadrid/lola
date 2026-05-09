/* =====================================================================
   phrases-capture.js — /phrases/capture/

   Simple capture form. User picks a hardcoded category and types a phrase.
   On save, POST /api/phrases. Last-used category is sticky via localStorage.
   After save: input clears, focus stays on input, status pings "Saved" —
   so you can rapid-fire add multiple phrases.
   ===================================================================== */

(function () {
  // Hardcoded categories — must match phrases-curated.json _meta.categories
  // and the API's allow-list. Single source of truth ideally lives in the
  // JSON, but for capture we don't want to fetch it just to render a chip row.
  const CATEGORIES = [
    { key: 'coffee',    label: 'Coffee' },
    { key: 'food',      label: 'Food' },
    { key: 'friends',   label: 'Friends' },
    { key: 'movement',  label: 'Movement' },
    { key: 'shopping',  label: 'Shopping' },
    { key: 'stay',      label: 'Apartment / Hotel' },
    { key: 'going_out', label: 'Going out' },
    { key: 'trouble',   label: 'Emergencies / Health' },
    { key: 'mood',      label: 'Mood words' },
    { key: 'wifi',      label: 'Internet / Phone / Payment' },
  ];

  const catsEl  = document.getElementById('pc-cats');
  const textEl  = document.getElementById('pc-text');
  const formEl  = document.getElementById('pc-form');
  const saveBtn = document.getElementById('pc-save');
  const stateEl = document.getElementById('pc-state');

  // Restore last-used category, default to 'coffee' if none
  let activeCat = localStorage.getItem('kit.phrases.captureCat') || 'coffee';
  if (!CATEGORIES.find(c => c.key === activeCat)) activeCat = 'coffee';

  renderCats();
  // Focus the input on load — fastest path to typing
  setTimeout(() => textEl.focus(), 50);

  function renderCats() {
    catsEl.innerHTML = CATEGORIES.map(c => `
      <button type="button"
              class="pc-cat ${activeCat === c.key ? 'is-active' : ''}"
              data-cat="${c.key}">${c.label}</button>
    `).join('');
    catsEl.querySelectorAll('.pc-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat;
        localStorage.setItem('kit.phrases.captureCat', activeCat);
        renderCats();
        // Return focus to input after picking a category
        setTimeout(() => textEl.focus(), 0);
      });
    });
  }

  let stateTimer = null;
  function showState(text, persistent) {
    stateEl.textContent = text;
    stateEl.classList.add('is-visible');
    clearTimeout(stateTimer);
    if (!persistent) {
      stateTimer = setTimeout(() => stateEl.classList.remove('is-visible'), 1800);
    }
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    showState('Saving…', true);
    try {
      await api.post('/api/phrases', { category: activeCat, text });
      showState('Saved');
      textEl.value = '';
      textEl.focus();
    } catch (err) {
      console.error('save phrase', err);
      showState(err.message || 'Failed', true);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Cmd/Ctrl + Enter saves (matches behaviour of capture flows elsewhere)
  textEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      formEl.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
})();
