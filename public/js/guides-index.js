/* =========================================================
   guides-index.js
   The /guides/ page — list user's guides + "+ New guide" button.
   ========================================================= */

(function () {
  const listEl = document.getElementById('guides-list');
  const newBtn = document.getElementById('new-guide-btn');

  function fmtCount(n, singular, plural) {
    if (n == null) return '';
    return `${n} ${n === 1 ? singular : plural}`;
  }

  function renderCard(g) {
    const cityLine = g.city_name ? util.escapeHtml(g.city_name) : 'No city yet';
    const spotCount = parseInt(g.spot_count, 10) || 0;
    const sectionCount = parseInt(g.section_count, 10) || 0;
    const meta = [
      cityLine,
      sectionCount ? fmtCount(sectionCount, 'section', 'sections') : null,
      spotCount ? fmtCount(spotCount, 'spot', 'spots') : null,
    ].filter(Boolean).join(' · ');

    const status = g.status === 'published' ? 'published' : 'draft';
    const title = g.title ? util.escapeHtml(g.title) : '<span class="guide-card__untitled">Untitled guide</span>';
    const subtitle = g.subtitle ? `<p class="guide-card__subtitle">${util.escapeHtml(g.subtitle)}</p>` : '';

    return `
      <a class="guide-card" href="/guides/edit.html?id=${g.id}">
        <div class="guide-card__head">
          <h2 class="guide-card__title">${title}</h2>
          <span class="guide-card__status guide-card__status--${status}">${status}</span>
        </div>
        ${subtitle}
        <p class="guide-card__meta">${util.escapeHtml(meta)}</p>
      </a>
    `;
  }

  function renderEmpty() {
    return `
      <div class="guides-list__empty">
        <p class="guides-list__empty-line">No guides yet.</p>
        <p class="guides-list__empty-sub">Start one for a city you know — pick spots, organize them by section, share what you love.</p>
        <button class="btn" id="new-guide-empty" type="button">+ Start your first guide</button>
      </div>
    `;
  }

  async function loadGuides() {
    try {
      const data = await api.get('/api/guides');
      const guides = data.guides || [];
      if (!guides.length) {
        listEl.innerHTML = renderEmpty();
        const emptyBtn = document.getElementById('new-guide-empty');
        if (emptyBtn) emptyBtn.addEventListener('click', createNewGuide);
        return;
      }
      listEl.innerHTML = guides.map(renderCard).join('');
    } catch (err) {
      console.error('loadGuides', err);
      listEl.innerHTML = '<div class="guides-list__empty"><p class="guides-list__empty-line">Could not load guides.</p></div>';
    }
  }

  async function createNewGuide() {
    try {
      const data = await api.post('/api/guides', {});
      if (data && data.guide && data.guide.id) {
        location.href = '/guides/edit.html?id=' + data.guide.id;
      }
    } catch (err) {
      console.error('createNewGuide', err);
      alert(err.message || 'Could not create guide');
    }
  }

  if (newBtn) newBtn.addEventListener('click', createNewGuide);

  loadGuides();
})();
