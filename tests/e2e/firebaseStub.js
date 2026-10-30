/**
 * Sustituto mínimo de firebase-app-compat + firebase-auth-compat para
 * las pruebas end-to-end. El "usuario" es el correo guardado en
 * localStorage['e2e-user'] y su ID token es ese mismo correo (el
 * servidor de tests/e2e/server.mjs lo acepta así).
 */
(function() {
  if (window.firebase && window.firebase.__e2e) return;

  const listeners = [];
  let currentUser = null;

  function makeUser(email) {
    return {
      uid: 'uid-' + email,
      email: email,
      displayName: email,
      getIdToken: async function() { return email; }
    };
  }

  function emit() {
    listeners.forEach(function(cb) { cb(currentUser); });
  }

  const stored = localStorage.getItem('e2e-user');
  if (stored) currentUser = makeUser(stored);

  const authInstance = {
    get currentUser() { return currentUser; },
    onAuthStateChanged: function(cb) {
      listeners.push(cb);
      setTimeout(function() { cb(currentUser); }, 0);
      return function() {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    signInWithPopup: async function() {
      const email = localStorage.getItem('e2e-login-as') || 'super@kreadu.com';
      localStorage.setItem('e2e-user', email);
      currentUser = makeUser(email);
      emit();
      return { user: currentUser };
    },
    signOut: async function() {
      localStorage.removeItem('e2e-user');
      currentUser = null;
      emit();
    }
  };

  function auth() { return authInstance; }
  auth.GoogleAuthProvider = function() {};

  window.firebase = {
    __e2e: true,
    initializeApp: function() { return {}; },
    apps: [],
    auth: auth
  };
})();
