/* includes.js — tiny client-side HTML partial loader for posto.world.
   No build step. Any page drops in:

     <div data-include="header"></div>
     ... page content ...
     <div data-include="footer"></div>

   and this fetches /partials/{name}.html and swaps it in. Edit a partial
   once and every page that includes it updates.

   IMPORTANT: <script> tags inserted via innerHTML/outerHTML do NOT execute
   (browser security spec). So this parses the partial, inserts the markup,
   then RECREATES each <script> as a fresh element so it actually runs. This
   is what lets analytics (Plausible) live in footer.html and still fire —
   including on the wall, where the footer is injected but visually hidden.

   Fires 'includes:loaded' on document when all partials are in. */
(function () {
  const nodes = Array.from(document.querySelectorAll('[data-include]'));
  if (!nodes.length) return;

  function injectPartial(placeholder, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const frag = tpl.content;

    // Separate scripts — they won't run if inserted via innerHTML.
    const scripts = Array.from(frag.querySelectorAll('script'));
    scripts.forEach(s => s.remove());

    // Insert the script-free markup where the placeholder was.
    const parent = placeholder.parentNode;
    parent.insertBefore(frag, placeholder);
    parent.removeChild(placeholder);

    // Recreate each script as a fresh element so the browser executes it.
    scripts.forEach(old => {
      const s = document.createElement('script');
      for (const attr of old.attributes) s.setAttribute(attr.name, attr.value);
      if (old.textContent) s.textContent = old.textContent;
      document.body.appendChild(s);
    });
  }

  const jobs = nodes.map(node => {
    const name = node.getAttribute('data-include');
    return fetch('/partials/' + name + '.html?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.text() : '')
      .then(html => { if (html) injectPartial(node, html); })
      .catch(() => {});
  });

  Promise.all(jobs).then(() => {
    document.dispatchEvent(new CustomEvent('includes:loaded'));
  });
})();
