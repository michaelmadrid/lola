/* =====================================================================
   phrases-capture.js — /phrases/capture/

   Overlay-style capture mirroring the main /capture/ page, but with:
     - a CATEGORY picker (hardcoded list) instead of a city picker
     - no been/want toggle
     - a single Save button (no continue/close split — phrases are single-line
       and rapid-fire by design; after save the input clears and refocuses)

   Behavior:
   - Last-used category sticks in localStorage
   - ⌘+Enter / Ctrl+Enter saves
   - After save: input clears, focus stays on input, status pings "Saved"
   - Tap × in top-left to return to /phrases/
   ===================================================================== */

(function () {
  // Hardcoded categories — must match phrases-curated.json _meta.categories
  // and the API's allow-list. Update all three when adding categories.
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

  const catBtn      = document.getElementById('pf-cat-btn');
  const catName     = document.getElementById('pf-cat-name');
  const catPopover  = document.getElementById('pf-cat-popover');
  const catList     = document.getElementById('pf-cat-list');
  const textareaEl  = document.getElementById('pf-textarea');
  const saveBtn     = document.getElementById('pf-save');
  const stateEl     = document.getElementById('pf-state');

  // Restore last-used category, default to 'coffee'
  let activeCat = localStorage.getItem('kit.phrases.captureCat') || 'coffee';
  if (!CATEGORIES.find(c => c.key === activeCat)) activeCat = 'coffee';

  updateCatLabel();
  renderCatList();

  // Focus input on load — fastest path to typing
  setTimeout(() => textareaEl.focus(), 50);

  function updateCatLabel() {
    const cat = CATEGORIES.find(c => c.key === activeCat);
    catName.textContent = cat ? cat.label : 'Pick';
  }

  function renderCatList() {
    catList.innerHTML = CATEGORIES.map(c => `
      <button class="capture-fs__city-item ${activeCat === c.key ? 'is-current' : ''}"
              data-cat="${c.key}" type="button">
        ${c.label}
      </button>
    `).join('');
    catList.querySelectorAll('.capture-fs__city-item').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCat = btn.dataset.cat;
        localStorage.setItem('kit.phrases.captureCat', activeCat);
        updateCatLabel();
        renderCatList();
        closePopover();
        setTimeout(() => textareaEl.focus(), 0);
      });
    });
  }

  function openPopover() {
    catPopover.classList.add('is-open');
  }
  function closePopover() {
    catPopover.classList.remove('is-open');
  }
  function togglePopover() {
    if (catPopover.classList.contains('is-open')) closePopover();
    else openPopover();
  }

  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover();
  });
  document.addEventListener('click', (e) => {
    if (catPopover.classList.contains('is-open')
        && !catPopover.contains(e.target)
        && !catBtn.contains(e.target)) {
      closePopover();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && catPopover.classList.contains('is-open')) {
      closePopover();
    }
  });

  // ---------- Save ----------
  let stateTimer = null;
  function showState(text, persistent) {
    stateEl.textContent = text;
    stateEl.classList.add('is-visible');
    clearTimeout(stateTimer);
    if (!persistent) {
      stateTimer = setTimeout(() => stateEl.classList.remove('is-visible'), 1800);
    }
  }

  async function savePhrase() {
    const text = textareaEl.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    showState('Saving…', true);
    try {
      await api.post('/api/phrases', { category: activeCat, text });
      showState('Saved');
      textareaEl.value = '';
      // Auto-grow the textarea would shrink back here; with rows=1 + auto behavior
      // it resets on .value = '' naturally
      textareaEl.style.height = '';
      textareaEl.focus();
    } catch (err) {
      console.error('save phrase', err);
      showState(err.message || 'Failed', true);
    } finally {
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', savePhrase);

  // ⌘+Enter / Ctrl+Enter to save (matches /capture/ shortcut)
  textareaEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      savePhrase();
    }
  });

  // Auto-grow the textarea as the user types (matches capture-overlay.js feel)
  textareaEl.addEventListener('input', () => {
    textareaEl.style.height = 'auto';
    textareaEl.style.height = textareaEl.scrollHeight + 'px';
  });
})();
