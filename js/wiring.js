'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   WIRING
   Loaded right after js/state.js. Builds the Supabase client and adapter, creates
   the Profile store over the global S, and defines the global save / loadState
   every feature module and the auth flow call. Everything Supabase-specific about
   persistence lives here; the store itself never sees Supabase.

   Find the two values in: Supabase Dashboard → Project Settings → API
═══════════════════════════════════════════════════════════════════════════ */
const SUPABASE_URL      = 'https://ijymyyqkaqzbmljbfnwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqeW15eXFrYXF6Ym1samJmbnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTUxNTMsImV4cCI6MjA5NjAzMTE1M30.xtrg8B77SayAlDHD8HdysV00FuIv40hzBsBNhASRgpQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* The remote adapter. Owns the signed-in user and the (user_id, profile_id, key)
   conflict target — get that target wrong and a write lands on the wrong row with
   no error (docs/adr/0001-*). Signed out, writes are silently skipped, as before. */
const supabaseRemote = {
  async loadRows() {
    const { data, error } = await sb.from('user_data').select('profile_id, key, value');
    return { rows: data || [], error };
  },

  async upsert(rows) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: null };
    return sb.from('user_data').upsert(
      rows.map(r => ({ user_id: user.id, ...r })),
      { onConflict: 'user_id,profile_id,key' }
    );
  },

  async deleteScope(profileId) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: null };
    return sb.from('user_data').delete()
      .eq('user_id', user.id)
      .eq('profile_id', profileId);
  },
};

const profileStore = ProfileStore.create({ state: S, remote: supabaseRemote, local: localStorage });

function save(...keys) { profileStore.save(...keys); }

async function loadState() {
  const { error } = await profileStore.load();
  if (!error) return;
  console.error('Load failed:', error.message);
  alert(
    'Could not load your data.\n\n' + error.message +
    (/profile_id/.test(error.message)
      ? '\n\nThe database migration has not been run yet — see docs/migrations/001-add-profile-id.sql.'
      : '') +
    '\n\nNothing has been changed. Reload once the problem is fixed.'
  );
}

// Profile-lifecycle leftover — moves into the Profile store with delete.
function deleteProfileRows(profileId) {
  supabaseRemote.deleteScope(profileId)
    .then(res => { if (res?.error) console.error('Delete failed for profile', profileId, res.error.message); })
    .catch(e => console.error('Delete failed for profile', profileId, e?.message ?? e));
}
