/* =====================================================================
   SUPABASE CONFIG  (Phase 0)
   ---------------------------------------------------------------------
   These two values are PUBLIC and safe to commit / ship to the browser:
     - the project URL
     - the "anon" (public) key
   Your data is protected by Row Level Security in Postgres, not by hiding
   this key. NEVER put the `service_role` key here — that one is secret.

   Where to find them:
     Supabase Dashboard → Project Settings → API
       Project URL      →  url
       Project API keys → anon public  →  anonKey

   Until you paste real values, the site keeps working on the old
   localStorage mock (demo accounts still work). The moment both fields
   are filled in, login / register / recover switch to real Supabase Auth.
   ===================================================================== */
window.SUPA_CONFIG = {
  url:     'YOUR_SUPABASE_URL',       // e.g. https://abcdefgh.supabase.co
  anonKey: 'YOUR_SUPABASE_ANON_KEY'   // long "anon public" JWT
};
