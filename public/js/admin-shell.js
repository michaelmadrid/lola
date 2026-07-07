/* admin-shell.js — reusable left-nav shell for admin pages.
   Usage: AdminShell.render('spots');  // pass active section key
   Renders a fixed left rail. Page content sits in .admin-main. */
(function () {
  const NAV = [
    {
      key: 'spots', label: 'Spots', href: '/admin/spots.html',
      sub: [
        { key: 'spots-all',      label: 'All',      href: '/admin/spots.html' },
        { key: 'spots-curated',  label: 'Curated',  href: '/admin/spots.html?view=curated' },
        { key: 'spots-standard', label: 'Standard', href: '/admin/spots.html?view=standard' },
        { key: 'spots-trash',    label: 'Trash',    href: '/admin/spots.html?view=trash' },
      ],
    },
    { key: 'cities', label: 'Cities', href: '/admin/cities.html' },
    { key: 'import', label: 'Import / Export', href: '/admin/import.html' },
  ];

  function render(activeKey) {
    const rail = document.createElement('nav');
    rail.className = 'admin-rail';
    rail.innerHTML =
      '<a class="admin-rail__logo" href="/admin/">kit admin</a>' +
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
      '<a class="admin-rail__back" href="/">← Back to kit</a>';

    document.body.insertBefore(rail, document.body.firstChild);
    document.body.classList.add('has-admin-rail');
  }

  window.AdminShell = { render };
})();
