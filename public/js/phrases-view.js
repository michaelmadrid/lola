/* =====================================================================
   phrases-view.js — /phrases/

   Loads:
     - /data/phrases-curated.json (shipped, no auth needed)
     - GET /api/phrases (custom user phrases)

   Render flow:
     - Category chips at top — primary filter, used most
     - Language picker BELOW chips — quieter dropdown, used less often
     - Below: pills, custom on top, curated below.
     - When a non-empty language is selected, each pill shows a 2nd row
       with the translation. Curated phrases have translations baked into
       the JSON. Custom phrases are translated lazily — on first view of
       a language we hit POST /api/phrases/translate which fills in the
       JSONB column.
     - Tap × on a custom pill to delete.

   State (persisted in localStorage):
     - activeLang: '' (English) | 'fr' | 'es' | 'it' | 'pt' | 'de'
     - activeCat: 'all' | category-key
   ===================================================================== */

(function () {
  const langSelectEl  = document.getElementById('ph-lang-select');
  const catsEl        = document.getElementById('ph-cats');
  const groupsEl      = document.getElementById('ph-groups');
  const loadingEl     = document.getElementById('ph-loading');
  const translatingEl = document.getElementById('ph-translating');

  // State
  let curated = null;
  let custom = [];
  let activeLang = localStorage.getItem('kit.phrases.lang') || '';
  let activeCat  = localStorage.getItem('kit.phrases.cat')  || 'all';

  // Track in-flight translation requests so we don't double-fire
  const translatingLangs = new Set();

  init();

  async function init() {
    try {
      const [curatedRes, customRes] = await Promise.all([
        fetch('/data/phrases-curated.json').then(r => r.json()),
        api.get('/api/phrases').catch(err => {
          console.warn('Could not load custom phrases', err);
          return { phrases: [] };
        }),
      ]);
      curated = curatedRes;
      custom = customRes.phrases || [];

      renderLangPicker();
      renderCatPicker();
      renderGroups();

      // If a saved lang preference exists and there are custom phrases,
      // ensure their translations are filled in (background fill).
      if (activeLang && custom.length) {
        ensureCustomTranslations(activeLang);
      }
    } catch (err) {
      console.error('phrases init', err);
      loadingEl.textContent = 'Could not load phrases.';
    }
  }

  // --------------- Language picker (native select dropdown) ---------------
  function renderLangPicker() {
    const langs = curated._meta.languages;
    const names = curated._meta.language_names;

    // First option is "Original (English)" — already in HTML, keep it.
    // Append one option per language with full name.
    // Clear existing dynamically-added options first to avoid dupes on re-render.
    [...langSelectEl.querySelectorAll('option[data-dynamic]')].forEach(o => o.remove());

    for (const code of langs) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = names[code] || code.toUpperCase();
      opt.dataset.dynamic = '1';
      langSelectEl.appendChild(opt);
    }
    langSelectEl.value = activeLang;

    // Wire change handler once
    if (!langSelectEl.dataset.wired) {
      langSelectEl.addEventListener('change', () => {
        activeLang = langSelectEl.value;
        localStorage.setItem('kit.phrases.lang', activeLang);
        renderGroups();
        if (activeLang && custom.length) {
          ensureCustomTranslations(activeLang);
        }
      });
      langSelectEl.dataset.wired = '1';
    }
  }

  // --------------- Category picker (chip row) ---------------
  function renderCatPicker() {
    const cats = curated._meta.categories;
    const buttons = [
      `<button class="ph-cat ${activeCat === 'all' ? 'is-active' : ''}" data-cat="all">All</button>`,
      ...cats.map(c => `<button class="ph-cat ${activeCat === c.key ? 'is-active' : ''}" data-cat="${c.key}">${util.escapeHtml(c.label)}</button>`),
    ];
    catsEl.innerHTML = buttons.join('');
    catsEl.querySelectorAll('.ph-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        if (cat === activeCat) return;
        activeCat = cat;
        localStorage.setItem('kit.phrases.cat', activeCat);
        renderCatPicker();
        renderGroups();
      });
    });
  }

  // --------------- Pills ---------------
  function renderGroups() {
    loadingEl.hidden = true;
    const cats = curated._meta.categories;
    const showCats = activeCat === 'all' ? cats : cats.filter(c => c.key === activeCat);

    const html = showCats.map(c => {
      const userPhrases = custom.filter(p => p.category === c.key);
      const curatedPhrases = (curated[c.key] || []);

      // When filter is 'all', skip empty categories. When a specific category
      // is filtered, always show the section (even if empty — clearer UX).
      const total = userPhrases.length + curatedPhrases.length;
      if (activeCat === 'all' && total === 0) return '';

      const customHtml = userPhrases.map(p => renderPhrasePill(p, true)).join('');
      const curatedHtml = curatedPhrases.map(p => renderPhrasePill(p, false)).join('');

      return `
        <section class="ph-group" data-cat="${c.key}">
          <h3 class="ph-group__head">${util.escapeHtml(c.label)}</h3>
          <div class="ph-group__list">
            ${customHtml}
            ${curatedHtml}
          </div>
        </section>
      `;
    }).join('');

    groupsEl.innerHTML = html || '<div class="ph-loading">No phrases here yet.</div>';

    // Wire delete buttons on custom pills
    groupsEl.querySelectorAll('.ph-pill__delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = parseInt(btn.dataset.id, 10);
        if (!id) return;
        if (!confirm('Delete this phrase? Cannot be undone.')) return;
        // Optimistic
        const removed = custom.find(p => p.id === id);
        custom = custom.filter(p => p.id !== id);
        renderGroups();
        try {
          await api.delete('/api/phrases/' + id);
        } catch (err) {
          // Rollback
          if (removed) custom.push(removed);
          renderGroups();
          alert('Could not delete: ' + (err.message || 'unknown error'));
        }
      });
    });
  }

  function renderPhrasePill(p, isCustom) {
    const txt = util.escapeHtml(p.text);
    let trans = '';
    if (activeLang) {
      if (p.translations && p.translations[activeLang]) {
        trans = `<p class="ph-pill__translation">${util.escapeHtml(p.translations[activeLang])}</p>`;
      } else if (translatingLangs.has(activeLang)) {
        trans = `<p class="ph-pill__translation ph-pill__translation--pending">translating…</p>`;
      } else {
        trans = `<p class="ph-pill__translation ph-pill__translation--pending">—</p>`;
      }
    }
    const del = isCustom
      ? `<button class="ph-pill__delete" data-id="${p.id}" aria-label="Delete">×</button>`
      : '';
    return `
      <div class="ph-pill ${isCustom ? 'ph-pill--custom' : ''}">
        <div class="ph-pill__main">
          <p class="ph-pill__text">${txt}</p>
          ${trans}
        </div>
        ${del}
      </div>
    `;
  }

  // --------------- Translation fill for custom phrases ---------------
  async function ensureCustomTranslations(lang) {
    if (!lang) return;
    const missing = custom.filter(p => !(p.translations && p.translations[lang]));
    if (!missing.length) return;
    if (translatingLangs.has(lang)) return;

    translatingLangs.add(lang);
    if (translatingEl) translatingEl.classList.add('is-visible');
    renderGroups();

    try {
      const data = await api.post('/api/phrases/translate', { target_lang: lang });
      if (data.phrases) custom = data.phrases;
    } catch (err) {
      console.error('ensureCustomTranslations', err);
    } finally {
      translatingLangs.delete(lang);
      if (translatingEl) translatingEl.classList.remove('is-visible');
      renderGroups();
    }
  }
})();
