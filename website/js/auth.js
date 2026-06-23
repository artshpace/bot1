/* =====================================================================
   ROUTE GUARD + SESSION HELPERS — cabinet & admin (v0.3)
   ---------------------------------------------------------------------
   Include on every /account/ page AFTER api.js but BEFORE account.js:
       <script src="../js/api.js"></script>
       <script src="../js/auth.js"></script>
       <script src="../js/account.js"></script>

   Runs immediately (not on DOMContentLoaded) so protected pages redirect
   before any private content is painted.
   ===================================================================== */
(function () {
  'use strict';

  // Auth pages a signed-OUT visitor is allowed to see.
  var PUBLIC_PAGES = ['login.html', 'register.html', 'recover.html'];
  // Pages that require the Admin role.
  var ADMIN_PAGES = ['admin.html', 'admin-subscriptions.html', 'admin-courses.html', 'admin-payments.html'];

  var file = (location.pathname.split('/').pop() || 'dashboard.html');
  var isPublic = PUBLIC_PAGES.indexOf(file) !== -1;
  var isAdminPage = ADMIN_PAGES.indexOf(file) !== -1;
  var user = (window.API && API.auth) ? API.auth.current() : null;

  function home(u) { return (u && u.role === 'admin') ? 'admin.html' : 'dashboard.html'; }

  if (!isPublic && !user) {
    // Protected route, not signed in → bounce to login, remember target.
    location.replace('login.html?next=' + encodeURIComponent(file));
    return;
  }
  if (isPublic && user) {
    // Already signed in → no need for the auth pages.
    location.replace(home(user));
    return;
  }
  if (isAdminPage && (!user || user.role !== 'admin')) {
    // Student trying to reach an admin page → send to their cabinet.
    location.replace('dashboard.html');
    return;
  }

  // Expose a global sign-out used by the sidebar button.
  window.signOut = function () {
    API.auth.logout().then(function () { location.replace('login.html'); });
  };
})();
