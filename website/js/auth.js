/* =====================================================================
   ROUTE GUARD + SESSION HELPERS — cabinet & admin (v0.5)
   ---------------------------------------------------------------------
   Include on every /account/ page AFTER api.js but BEFORE account.js:
       <script src="../js/api.js"></script>
       <script src="../js/auth.js"></script>
       <script src="../js/account.js"></script>

   Runs immediately (not on DOMContentLoaded) so protected pages redirect
   before any private content is painted.

   Roles: student → dashboard.html · parent → parent.html · admin → admin.html
   Admin is a superuser and may view student/parent pages too.
   ===================================================================== */
(function () {
  'use strict';

  // Auth pages a signed-OUT visitor is allowed to see.
  var PUBLIC_PAGES = ['login.html', 'register.html', 'recover.html'];
  // Pages that require the Admin role.
  var ADMIN_PAGES = ['admin.html', 'admin-subscriptions.html', 'admin-courses.html',
    'admin-payments.html', 'admin-parents.html', 'admin-attendance.html',
    'admin-homework.html', 'admin-certificates.html', 'admin-achievements.html'];
  // Pages that belong to the Parent cabinet.
  var PARENT_PAGES = ['parent.html'];

  var file = (location.pathname.split('/').pop() || 'dashboard.html');
  var isPublic = PUBLIC_PAGES.indexOf(file) !== -1;
  var isAdminPage = ADMIN_PAGES.indexOf(file) !== -1;
  var isParentPage = PARENT_PAGES.indexOf(file) !== -1;
  // Anything left over (and not public) is a student cabinet page.
  var isStudentPage = !isPublic && !isAdminPage && !isParentPage;
  var user = (window.API && API.auth) ? API.auth.current() : null;
  var role = user ? user.role : null;

  function home(u) {
    if (!u) return 'login.html';
    if (u.role === 'admin') return 'admin.html';
    if (u.role === 'parent') return 'parent.html';
    return 'dashboard.html';
  }

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
  if (isAdminPage && role !== 'admin') {
    location.replace(home(user));
    return;
  }
  if (isParentPage && role !== 'parent' && role !== 'admin') {
    location.replace(home(user));
    return;
  }
  if (isStudentPage && role !== 'student' && role !== 'admin') {
    // e.g. a parent trying to open a student cabinet page.
    location.replace(home(user));
    return;
  }

  // Expose a global sign-out used by the sidebar button.
  window.signOut = function () {
    API.auth.logout().then(function () { location.replace('login.html'); });
  };
})();
