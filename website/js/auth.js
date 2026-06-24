/* =====================================================================
   ROUTE GUARD + SESSION HELPERS — cabinet & admin (v0.7)
   ---------------------------------------------------------------------
   Include on every /account/ page AFTER api.js but BEFORE account.js:
       <script src="../js/api.js"></script>
       <script src="../js/auth.js"></script>
       <script src="../js/account.js"></script>

   Runs immediately (not on DOMContentLoaded) so protected pages redirect
   before any private content is painted.

   Roles: student → dashboard.html · parent → parent.html
          teacher → teacher.html  · admin → admin.html
   Admin is a superuser and may view student/parent/teacher pages too.
   Shared pages (settings, notifications, portfolio, achievements, cart)
   are open to every signed-in role.
   ===================================================================== */
(function () {
  'use strict';

  // Auth pages a signed-OUT visitor is allowed to see.
  var PUBLIC_PAGES = ['login.html', 'register.html', 'recover.html'];
  // Pages that require the Admin role.
  var ADMIN_PAGES = ['admin.html', 'admin-subscriptions.html', 'admin-courses.html',
    'admin-payments.html', 'admin-parents.html', 'admin-attendance.html',
    'admin-homework.html', 'admin-certificates.html', 'admin-achievements.html',
    'admin-events.html', 'admin-portfolio.html'];
  // Pages that belong to the Parent cabinet.
  var PARENT_PAGES = ['parent.html'];
  // Pages that belong to the Teacher cabinet.
  var TEACHER_PAGES = ['teacher.html'];
  // Pages any signed-in user may open (role-aware content inside).  [v0.7]
  var SHARED_PAGES = ['settings.html', 'notifications.html', 'portfolio.html',
    'achievements.html', 'cart.html', 'shop.html'];

  var file = (location.pathname.split('/').pop() || 'dashboard.html');
  var isPublic = PUBLIC_PAGES.indexOf(file) !== -1;
  var isAdminPage = ADMIN_PAGES.indexOf(file) !== -1;
  var isParentPage = PARENT_PAGES.indexOf(file) !== -1;
  var isTeacherPage = TEACHER_PAGES.indexOf(file) !== -1;
  var isSharedPage = SHARED_PAGES.indexOf(file) !== -1;
  // Anything left over (and not public/shared) is a student cabinet page.
  var isStudentPage = !isPublic && !isAdminPage && !isParentPage && !isTeacherPage && !isSharedPage;
  var user = (window.API && API.auth) ? API.auth.current() : null;
  var role = user ? user.role : null;

  function home(u) {
    if (!u) return 'login.html';
    if (u.role === 'admin') return 'admin.html';
    if (u.role === 'parent') return 'parent.html';
    if (u.role === 'teacher') return 'teacher.html';
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
  if (isTeacherPage && role !== 'teacher' && role !== 'admin') {
    location.replace(home(user));
    return;
  }
  if (isStudentPage && role !== 'student' && role !== 'admin') {
    // e.g. a parent or teacher trying to open a student cabinet page.
    location.replace(home(user));
    return;
  }

  // Expose a global sign-out used by the sidebar button.
  window.signOut = function () {
    API.auth.logout().then(function () { location.replace('login.html'); });
  };
})();
