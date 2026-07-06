/* =========================================================
   uploader.js — reusable single-image upload widget
   =========================================================

   Drop this markup anywhere:

     <div class="uploader" id="my-uploader">
       <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden>
       <div class="uploader__preview"></div>
       <button type="button" class="uploader__btn">Upload image</button>
     </div>

   Then call:

     window.Uploader.attach('#my-uploader', {
       onUploaded: (result) => { ... } // { url, thumb_url }
     });

   Multiple independent uploaders can exist on one page — each
   call to attach() is scoped to its own container.
   ========================================================= */
(function () {
  function attach(selector, opts) {
    const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!container) return;
    opts = opts || {};

    // Clear any previously-bound listeners by cloning the interactive nodes.
    // openSpotEditor calls attach() every time a spot is opened; without this
    // the change/click handlers stack and fire against stale closures.
    let input   = container.querySelector('input[type="file"]');
    let preview = container.querySelector('.uploader__preview');
    let btn     = container.querySelector('.uploader__btn:not(.uploader__btn--remove)');

    if (input) { const n = input.cloneNode(true); input.replaceWith(n); input = n; }
    if (preview) { const n = preview.cloneNode(true); preview.replaceWith(n); preview = n; }
    if (btn) { const n = btn.cloneNode(true); btn.replaceWith(n); btn = n; }

    if (!input) return;

    function setPreview(url) {
      if (!preview) return;
      preview.innerHTML = url
        ? `<img src="${url}" alt="" class="uploader__img">`
        : '';
    }

    if (opts.initialUrl) setPreview(opts.initialUrl);

    if (btn) btn.addEventListener('click', () => input.click());
    if (preview) {
      preview.addEventListener('click', () => input.click());
      preview.addEventListener('dragover', (e) => { e.preventDefault(); preview.classList.add('is-dragover'); });
      preview.addEventListener('dragleave', () => preview.classList.remove('is-dragover'));
      preview.addEventListener('drop', (e) => {
        e.preventDefault();
        preview.classList.remove('is-dragover');
        if (e.dataTransfer.files[0]) {
          input.files = e.dataTransfer.files;
          input.dispatchEvent(new Event('change'));
        }
      });
    }

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      // Instant local preview while uploading
      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

      const formData = new FormData();
      formData.append('image', file);

      try {
        const token = localStorage.getItem('lola.token') || localStorage.getItem('lola_token');
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Upload failed');
        }
        const result = await res.json();
        setPreview(result.url);
        if (typeof opts.onUploaded === 'function') opts.onUploaded(result);
      } catch (err) {
        console.error('Uploader error', err);
        if (typeof window.toast === 'function') window.toast(err.message || 'Upload failed');
        setPreview(opts.initialUrl || null);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Upload image'; }
        input.value = '';
      }
    });
  }

  window.Uploader = { attach };
})();
