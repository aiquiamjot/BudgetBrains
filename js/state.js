'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE CLIENT
   Replace the two placeholder strings below with your project's values.
   Find them in: Supabase Dashboard → Project Settings → API
═══════════════════════════════════════════════════════════════════════════ */
const SUPABASE_URL      = 'https://ijymyyqkaqzbmljbfnwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqeW15eXFrYXF6Ym1samJmbnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NTUxNTMsImV4cCI6MjA5NjAzMTE1M30.xtrg8B77SayAlDHD8HdysV00FuIv40hzBsBNhASRgpQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function ri(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genId() { return crypto.randomUUID().slice(0, 8); }

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
   ACCOUNT_KEYS       → Supabase, shared by every profile (profile_id = 'account')
   PROFILE_KEYS       → Supabase, scoped to one profile
   LOCAL_KEYS         → localStorage, per-device
   LOCAL_PROFILE_KEYS → localStorage, one entry per profile

   S is flat: S.overview always means the ACTIVE profile's overview, so the feature
   modules read state exactly as they did before profiles existed. Everything else
   sits in S._profileData.
═══════════════════════════════════════════════════════════════════════════ */
const ACCOUNT_SCOPE = 'account';

const ACCOUNT_KEYS = {
  profiles:   'bb_profiles',
  banks:      'bb_banks',
  fees:       'bb_fees',
};

const PROFILE_KEYS = {
  overview:   'bb_overview',
  biweekly:   'bb_biweekly',
  bankAssign: 'bb_bankAssign',
  manual:     'bb_manual',
};

const DB_KEYS = { ...ACCOUNT_KEYS, ...PROFILE_KEYS };

const LOCAL_KEYS = {
  theme:         'bb_theme',
  activeTab:     'bb_activeTab',
  activeProfile: 'bb_activeProfile',
  groqKey:       'bb_groq_key',
};

// Stored as `${prefix}:${profileId}` — the personality describes one profile's budget.
const LOCAL_PROFILE_KEYS = {
  groqProfile: 'bb_groq_profile',
};

const DEFAULTS = {
  profiles:   [],
  banks:      [],
  fees:       {},
  overview:   { netPay: 0, splits: { needs: 50, wants: 30, savings: 20 }, subitems: [] },
  biweekly:   { assignments: {} },
  bankAssign: {},
  manual:     [],
  theme:         'light',
  activeTab:     'overview',
  activeProfile: null,
  groqKey:       '',
  groqProfile:   null,
};

const S = {};

/* ═══════════════════════════════════════════════════════════════════════════
   LOCALSTORAGE
═══════════════════════════════════════════════════════════════════════════ */
function profileLocalKey(k, profileId) { return LOCAL_PROFILE_KEYS[k] + ':' + profileId; }

function readLocal(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw !== null ? JSON.parse(raw) : clone(fallback);
  } catch { return clone(fallback); }
}

function writeLocal(storageKey, value) {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
}

function clearProfileLocal(profileId) {
  for (const k in LOCAL_PROFILE_KEYS) {
    try { localStorage.removeItem(profileLocalKey(k, profileId)); } catch {}
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOAD
═══════════════════════════════════════════════════════════════════════════ */
async function loadState() {
  // Local preferences load instantly (no network)
  for (const k in LOCAL_KEYS) S[k] = readLocal(LOCAL_KEYS[k], DEFAULTS[k]);

  // One query brings back every profile's rows, so switching later is in-memory only
  const { data, error } = await sb.from('user_data').select('profile_id, key, value');
  const rows = data || [];

  if (error) {
    console.error('Load failed:', error.message);
    alert(
      'Could not load your data.\n\n' + error.message +
      (/profile_id/.test(error.message)
        ? '\n\nThe database migration has not been run yet — see docs/migrations/001-add-profile-id.sql.'
        : '') +
      '\n\nNothing has been changed. Reload once the problem is fixed.'
    );
  }

  for (const k in ACCOUNT_KEYS) {
    const row = rows.find(r => r.profile_id === ACCOUNT_SCOPE && r.key === ACCOUNT_KEYS[k]);
    S[k] = row ? row.value : clone(DEFAULTS[k]);
  }

  S._profileData = {};
  for (const r of rows) {
    if (r.profile_id === ACCOUNT_SCOPE) continue;
    const k = Object.keys(PROFILE_KEYS).find(name => PROFILE_KEYS[name] === r.key);
    if (!k) continue;
    (S._profileData[r.profile_id] ??= {})[k] = r.value;
  }

  // On a failed load, still put a profile in memory so the UI has something to render —
  // but never write it, or an outage would look like a wipe and then become one.
  if (!S.profiles.length) bootstrapDefaultProfile(rows, !error);

  // A stale activeProfile (deleted elsewhere, or a fresh device) falls back to the first
  if (!S.profiles.some(p => p.id === S.activeProfile)) {
    S.activeProfile = S.profiles[0].id;
    save('activeProfile');
  }

  hydrateProfile(S.activeProfile);
}

/* No bb_profiles row means one of two things, and both are handled identically:
   a brand-new signup, or an account whose data predates profiles and is therefore
   stranded on the 'account' sentinel. Mint "Main" and adopt whatever is there.
   See docs/adr/0002-bootstrap-the-default-profile-in-the-client.md */
function bootstrapDefaultProfile(rows, persist) {
  const id = genId();
  S.profiles = [{ id, name: 'Main' }];

  const adopted = {};
  for (const k in PROFILE_KEYS) {
    const row = rows.find(r => r.profile_id === ACCOUNT_SCOPE && r.key === PROFILE_KEYS[k]);
    if (row) adopted[k] = row.value;
  }
  S._profileData[id] = adopted;

  S.activeProfile = id;
  hydrateProfile(id);
  if (!persist) return;

  save('activeProfile');
  save('profiles', ...Object.keys(PROFILE_KEYS));

  // The stranded 'account' rows are deliberately left in place. Deleting them would make
  // the migration destructive on a fire-and-forget write path; nothing reads them once
  // bb_profiles exists, so they are harmless.
}

/* Points the four per-profile keys at the SAME objects the cache holds, so the in-place
   mutations the feature modules do (S.overview.netPay = x) land in both. Never reassign
   S.overview / S.biweekly / S.bankAssign / S.manual wholesale — mutate them. */
function hydrateProfile(id) {
  const d = (S._profileData[id] ??= {});
  for (const k in PROFILE_KEYS) {
    if (d[k] === undefined) d[k] = clone(DEFAULTS[k]);
    S[k] = d[k];
  }
  for (const k in LOCAL_PROFILE_KEYS) S[k] = readLocal(profileLocalKey(k, id), DEFAULTS[k]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SAVE
═══════════════════════════════════════════════════════════════════════════ */
function save(...keys) {
  const toSave = keys.length ? keys : [
    ...Object.keys(DB_KEYS), ...Object.keys(LOCAL_KEYS), ...Object.keys(LOCAL_PROFILE_KEYS)
  ];

  // Local preferences — synchronous, instant
  toSave.filter(k => k in LOCAL_KEYS).forEach(k => writeLocal(LOCAL_KEYS[k], S[k]));
  toSave.filter(k => k in LOCAL_PROFILE_KEYS)
        .forEach(k => writeLocal(profileLocalKey(k, S.activeProfile), S[k]));

  const dbKeys = toSave.filter(k => k in DB_KEYS);
  if (!dbKeys.length) return;

  // Snapshot before the await — the user may switch profiles while it is in flight
  const activeId = S.activeProfile;
  const payload  = dbKeys.map(k => ({ k, value: S[k] }));

  // Keep the cache in step with S, in case something reassigned rather than mutated
  const cache = S._profileData?.[activeId];
  if (cache) dbKeys.filter(k => k in PROFILE_KEYS).forEach(k => { cache[k] = S[k]; });

  // Budget data — fire-and-forget write to Supabase
  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    payload.forEach(({ k, value }) => {
      sb.from('user_data').upsert(
        {
          user_id: user.id,
          profile_id: k in ACCOUNT_KEYS ? ACCOUNT_SCOPE : activeId,
          key: DB_KEYS[k],
          value,
        },
        { onConflict: 'user_id,profile_id,key' }
      ).then(({ error }) => {
        if (error) console.error('Save failed for', k, error.message);
      });
    });
  });
}

/* Writes per-profile keys for a profile that is NOT the active one, straight from the
   cache. Needed when an account-level change has to cascade into every profile. */
function saveForProfile(profileId, ...keys) {
  const data = S._profileData?.[profileId];
  if (!data) return;
  const payload = keys.filter(k => k in PROFILE_KEYS).map(k => ({ k, value: data[k] }));
  if (!payload.length) return;

  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    payload.forEach(({ k, value }) => {
      sb.from('user_data').upsert(
        { user_id: user.id, profile_id: profileId, key: PROFILE_KEYS[k], value },
        { onConflict: 'user_id,profile_id,key' }
      ).then(({ error }) => {
        if (error) console.error('Save failed for', k, 'on profile', profileId, error.message);
      });
    });
  });
}

function deleteProfileRows(profileId) {
  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    sb.from('user_data').delete()
      .eq('user_id', user.id)
      .eq('profile_id', profileId)
      .then(({ error }) => {
        if (error) console.error('Delete failed for profile', profileId, error.message);
      });
  });
}
