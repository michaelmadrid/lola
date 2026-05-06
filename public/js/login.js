/* =========================================================
   login.js
   Sign in / register toggle. Redirect on success.
   ========================================================= */

(function () {
  // If already signed in, bounce home
  if (api.isSignedIn()) {
    location.href = util.query('next') || '/';
    return;
  }

  const loginForm     = document.getElementById('login-form');
  const registerForm  = document.getElementById('register-form');
  const registerToggle = document.getElementById('register-toggle');
  const signinToggle  = document.getElementById('signin-toggle');
  const loginError    = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  registerToggle.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = '';
    registerError.textContent = '';
  });
  signinToggle.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = '';
    loginError.textContent = '';
  });

  function onSuccess(data) {
    api.token.set(data.token);
    api.user.set(data.user);
    location.href = util.query('next') || '/';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
      const data = await api.post('/api/auth/login', { email, password });
      onSuccess(data);
    } catch (err) {
      loginError.textContent = err.message || 'Sign-in failed';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const name = document.getElementById('r-name').value.trim();
    const email = document.getElementById('r-email').value.trim();
    const password = document.getElementById('r-password').value;
    try {
      const data = await api.post('/api/auth/register', { name, email, password });
      onSuccess(data);
    } catch (err) {
      registerError.textContent = err.message || 'Registration failed';
    }
  });
})();
