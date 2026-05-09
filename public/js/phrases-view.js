/* =====================================================================
   phrases-view.js — /phrases/

   Loads:
     - /data/phrases-curated.json (shipped, no auth needed)
     - GET /api/phrases (custom user phrases)

   Render flow:
     - Language picker tabs at top: "" (no translation) / fr / es / it / pt / de / ja
     - Category chips: "all" + per-category
     - Below: pills, custom on top, curated below.
     - When a non-empty language is selected, each pill shows a 2nd row
       with the translation. Curated phrases have all 6 languages baked
       into the JSON. Custom phrases are translated lazily — on first
       view of a language we hit POST /api/phrases/translate which
       fills in the JSONB column.
     - Tap × on a custom pill to delete.

   State:
     - activeLang: '' | 'fr' | 'es' | 'it' | 'pt' | 'de' | 'ja'
     - activeCat: 'all' | category-key
     - curated: { coffee: [...], food: [...], ... }
     - custom: array of { id, category, text, translations, created_at }
   ===================================================================== */

(function () {
  const langsEl = document.getElementById('ph-langs');
  const catsEl  = document.getElementById('ph-cats');
  const groupsEl = document.getElementById('ph-groups');
  const loadingEl = document.getElementById('ph-loading');
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

      // If we have a saved language preference and any custom phrases,
      // ensure their translations are filled in (background fill, no UI block).
      if (activeLang && custom.length) {
        ensureCustomTranslations(activeLang);
      }
    } catch (err) {
      console.error('phrases init', err);
      loadingEl.textContent = 'Could not load phrases.';
    }
  }

  // --------------- Language picker ---------------
  function renderLangPicker() {
    const langs = curated._meta.languages;
    const flags = curated._meta.language_flags;

    const buttons = [
      `<button class="ph-lang ${activeLang === '' ? 'is-active' : ''}" data-lang="">EN</button>`,
      ...langs.map(l => `<button class="ph-lang ${activeLang === l ? 'is-active' : ''}" data-lang="${l}">${flags[l]}</button>`),
    ];
    langsEl.innerHTML = buttons.join('');
    langsEl.querySelectorAll('.ph-lang').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (lang === activeLang) return;
        activeLang = lang;
        localStorage.setItem('kit.phrases.lang', activeLang);
        renderLangPicker();
        renderGroups();
        if (activeLang && custom.length) {
          ensureCustomTranslations(activeLang);
        }
      });
    });
  }

  // --------------- Category picker ---------------
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

      // Skip rendering empty categories ONLY when filter is 'all' AND there's nothing in any list.
      // If user clicks a specific category, show it even if empty (clearer UX).
      const total = userPhrases.length + curatedPhrases.length;
      if (activeCat === 'all' && total === 0) return '';

      const customHtml = userPhrases.map(p => renderPhrasePill(p, true)).join('');
      const curatedHtml = curatedPhrases.map(p => renderCuratedPill(p, c.key)).join('');

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

  function renderCuratedPill(p, catKey) {
    return renderPhrasePill(p, false);
  }

  // --------------- Translation fill for custom phrases ---------------
  async function ensureCustomTranslations(lang) {
    if (!lang) return;
    // Skip if all custom phrases already have this lang
    const missing = custom.filter(p => !(p.translations && p.translations[lang]));
    if (!missing.length) return;
    if (translatingLangs.has(lang)) return; // already in flight

    translatingLangs.add(lang);
    translatingEl.classList.add('is-visible');
    renderGroups(); // shows "translating…" state on pending pills

    try {
      const data = await api.post('/api/phrases/translate', { target_lang: lang });
      if (data.phrases) custom = data.phrases;
    } catch (err) {
      console.error('ensureCustomTranslations', err);
    } finally {
      translatingLangs.delete(lang);
      translatingEl.classList.remove('is-visible');
      renderGroups();
    }
  }
})();
