/* =========================================================
   shell.js
   Header/footer behavior shared by every page.
   Wires: live time, mobile menu, auth state, toast helper.
   ========================================================= */

(function () {
  // ----- Live time in header -----
  const timeEl = document.getElementById('hdr-time');
  if (timeEl) {
    const updateTime = () => {
      try {
        timeEl.textContent = new Date().toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          // TODO: replace with user's home base TZ from settings later
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
})();
