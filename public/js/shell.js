/* =========================================================
   shell.js
   Header/footer behavior shared by every page.
   Wires: theme, live time, mobile menu, auth state, toast helper.
   ========================================================= */

(function () {
  // ----- Theme (dark mode) ----- runs FIRST to avoid flash
  // The ultra-early <script> in <head> already applies the class;
  // this just keeps in sync if settings change in another tab.
  try {
    if (localStorage.getItem('lola.theme') === 'dark') {
      document.body.classList.add('dark');
    }
  } catch (e) {}

  // ----- Apply header label: greeting if signed in, location if not -----
  // TODO: switch greeting word based on user's home language.
  // For now always "Ciao, [name]" when signed in.
  try {
    const user = window.api && window.api.user.get();
    const homeLoc = localStorage.getItem('lola.home_location') || 'Bali';
    const whereEls = document.querySelectorAll('.head__right .where');
    if (user && user.name) {
      whereEls.forEach(el => { el.textContent = 'Ciao, ' + user.name; });
    } else {
      whereEls.forEach(el => { el.textContent = homeLoc; });
    }
  } catch (e) {}

  // ----- Live time in header -----
  const timeEl = document.getElementById('hdr-time');
  if (timeEl) {
    const updateTime = () => {
      try {
        timeEl.textContent = new Date().toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          // TODO: read user's home base TZ from settings later
          timeZone: 'Asia/Makassar'
        });
      } catch (e) {}
    };
    updateTime();
    setInterval(updateTime, 30 * 1000);
  }

  // ----- Mobile menu toggle -----
  const menuBtn = document.getElementById('menu-btn');
  const menuOverlay = document.getElementById('menu-overlay');
  if (menuBtn && menuOverlay) {
    const toggleMenu = () => {
      const open = menuOverlay.classList.toggle('is-open');
      menuBtn.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    const closeMenu = () => {
      menuOverlay.classList.remove('is-open');
      menuBtn.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    menuBtn.addEventListener('click', toggleMenu);
    menuOverlay.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOverlay.classList.contains('is-open')) toggleMenu();
    });
  }

  // ----- Sign-out link in mobile menu -----
  const signOutLink = document.getElementById('signout-link');
  if (signOutLink) {
    signOutLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.api && window.api.signOut();
    });
  }

  // ----- Auth-state visibility (for any element with data-auth) -----
  // Elements with data-auth="in" only show when signed in
  // Elements with data-auth="out" only show when signed out
  const isSignedIn = window.api && window.api.isSignedIn();
  document.querySelectorAll('[data-auth="in"]').forEach(el => {
    el.style.display = isSignedIn ? '' : 'none';
  });
  document.querySelectorAll('[data-auth="out"]').forEach(el => {
    el.style.display = isSignedIn ? 'none' : '';
  });

  // ----- Toast helper -----
  let toastEl = null;
  let toastTimeout = null;
  window.toast = function (message, ms = 1800) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  };

  // ----- Global Cmd/Ctrl+Enter → save in any open modal -----
  // Finds the first .modal.is-open in DOM order, then clicks its first
  // non-disabled .save-btn. Works in textarea/input contexts where Enter
  // alone shouldn't submit.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!(e.metaKey || e.ctrlKey)) return;
    const openModal = document.querySelector('.modal.is-open');
    if (!openModal) return;
    const saveBtn = openModal.querySelector('.save-btn:not(:disabled)');
    if (!saveBtn) return;
    e.preventDefault();
    saveBtn.click();
  });
})();
