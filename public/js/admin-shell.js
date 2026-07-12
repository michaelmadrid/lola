/* admin-shell.js — reusable left-nav shell for admin pages.
   Usage: AdminShell.render('spots');  // pass active section key
   Renders a fixed left rail. Page content sits in .admin-main. */
(function () {
  const NAV = [
    {
      key: 'spots', label: 'Spots', href: '/spots/',
      sub: [
        { key: 'import',         label: 'Import', href: '/admin/import.html' },
        { key: 'dupes',          label: 'Duplicates', href: '/admin/dupes.html' },
      ],
    },
    { key: 'cities', label: 'Cities', href: '/admin/cities.html' },
  ];

  function render(activeKey) {
    const rail = document.createElement('nav');
    rail.className = 'admin-rail';
    rail.innerHTML =
      '<a class="admin-rail__logo" href="/admin/">annex studio</a>' +
      NAV.map(item => {
        const isActive = activeKey === item.key || (item.sub && item.sub.some(s => s.key === activeKey));
        let html = '<div class="admin-rail__group">';
        html += '<a class="admin-rail__link' + (isActive ? ' is-active' : '') + '" href="' + item.href + '">' + item.label + '</a>';
        if (item.sub) {
          html += '<div class="admin-rail__sub">' +
            item.sub.map(s =>
              '<a class="admin-rail__sublink' + (activeKey === s.key ? ' is-active' : '') + '" href="' + s.href + '">' + s.label + '</a>'
            ).join('') + '</div>';
        }
        html += '</div>';
        return html;
      }).join('') +
      '<a class="admin-rail__back" href="/">← Back to annex</a>';

    document.body.insertBefore(rail, document.body.firstChild);
    document.body.classList.add('has-admin-rail');

    const toggle = document.createElement('button');
    toggle.className = 'admin-rail-toggle';
    toggle.setAttribute('aria-label', 'Menu');
    toggle.innerHTML = '☰';
    const scrim = document.createElement('div');
    scrim.className = 'admin-rail-scrim';
    document.body.appendChild(toggle);
    document.body.appendChild(scrim);
    const openRail = () => { rail.classList.add('is-open'); scrim.classList.add('is-open'); };
    const closeRail = () => { rail.classList.remove('is-open'); scrim.classList.remove('is-open'); };
    toggle.addEventListener('click', openRail);
    scrim.addEventListener('click', closeRail);
  }

  window.AdminShell = { render };
})();
