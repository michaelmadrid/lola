/* includes.js — tiny client-side HTML partial loader for annex.site.
   No build step. Any page drops in:

     <div data-include="header"></div>
     ... page content ...
     <div data-include="footer"></div>

   and this fetches /partials/{name}.html and swaps it in. Edit a partial
   once and every page that includes it updates.

   Fires 'includes:loaded' on document when all partials are in. */
(function () {
  const nodes = Array.from(document.querySelectorAll('[data-include]'));
  if (!nodes.length) return;

  const jobs = nodes.map(node => {
    const name = node.getAttribute('data-include');
    return fetch('/partials/' + name + '.html?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.text() : '')
      .then(html => { node.outerHTML = html; })
      .catch(() => {});
  });

  Promise.all(jobs).then(() => {
    document.dispatchEvent(new CustomEvent('includes:loaded'));
  });
})();
