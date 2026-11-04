'use strict';
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
   ACCOUNT_KEYS       → remote, shared by every profile (profile_id = 'account')
   PROFILE_KEYS       → remote, scoped to one profile
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
  biweekly:   { assignments: {}, forced: {} },
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
   PROFILE STORE
   Loads, activates and saves the flat state object behind two adapters, so it
   runs in the test runner with no database and no browser:

   remote — row-level persistence:
     loadRows()            → { rows: [{ profile_id, key, value }], error }
     upsert(rows)          → { error }   (rows of { profile_id, key, value })
     deleteScope(profileId)
   local  — anything shaped like localStorage (getItem / setItem / removeItem)

   The store owns the domain storage facts: the 'account' sentinel, which state
   key maps to which row name, and which scope each key writes to. The adapter
   owns everything backend-specific (the user id, the conflict target).
   js/wiring.js builds the real adapters and the global save / loadState.
═══════════════════════════════════════════════════════════════════════════ */
// Stored as `${prefix}:${profileId}` in the local adapter.
function profileLocalKey(k, profileId) { return LOCAL_PROFILE_KEYS[k] + ':' + profileId; }

const ProfileStore = {
  create({ state: S, remote, local }) {
    function readLocal(storageKey, fallback) {
      try {
        const raw = local.getItem(storageKey);
        return raw !== null ? JSON.parse(raw) : clone(fallback);
      } catch { return clone(fallback); }
    }

    function writeLocal(storageKey, value) {
      try { local.setItem(storageKey, JSON.stringify(value)); } catch {}
    }

    /* Resolves once the write completes; a failure is logged, never thrown, so the
       app can keep ignoring the promise exactly as it ignored the old upserts. */
    function write(rows, label) {
      if (!rows.length) return Promise.resolve();
      return new Promise(resolve => resolve(remote.upsert(rows)))
        .then(res => { if (res?.error) console.error('Save failed for', label, res.error.message); })
        .catch(e => console.error('Save failed for', label, e?.message ?? e));
    }

    async function load() {
      // Local preferences load instantly (no network)
      for (const k in LOCAL_KEYS) S[k] = readLocal(LOCAL_KEYS[k], DEFAULTS[k]);

      // One query brings back every profile's rows, so switching later is in-memory only
      let rows = [], error = null;
      try {
        const res = await remote.loadRows();
        rows = res?.rows || [];
        error = res?.error || null;
      } catch (e) { error = { message: e?.message ?? String(e) }; }
      if (error) rows = [];

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

      activate(S.activeProfile);
      return { error };
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

      activate(id);
      if (!persist) return;

      save('activeProfile');
      save('profiles', ...Object.keys(PROFILE_KEYS));

      // The stranded 'account' rows are deliberately left in place. Deleting them would make
      // the migration destructive on a fire-and-forget write path; nothing reads them once
      // bb_profiles exists, so they are harmless.
    }

    /* Makes `id` the Active Profile, in memory only — callers that want it remembered
       save('activeProfile') themselves.

       Points the four per-profile keys at the SAME objects the cache holds, so the in-place
       mutations the feature modules do (S.overview.netPay = x) land in both. Never reassign
       S.overview / S.biweekly / S.bankAssign / S.manual wholesale — mutate them. */
    function activate(id) {
      S.activeProfile = id;
      const d = (S._profileData[id] ??= {});
      for (const k in PROFILE_KEYS) {
        if (d[k] === undefined) d[k] = clone(DEFAULTS[k]);
        S[k] = d[k];
      }

      /* NOT redundant with DEFAULTS.biweekly, however much it looks it. A profile saved
         before Force Assign existed HAS a bb_biweekly row, so the default above is skipped
         entirely and the loaded plan arrives with no `forced` map at all. Runs here so it
         covers both the first load and every profile switch, and mutates in place because
         the line above just pointed S.biweekly at the cached object. */
      CutoffPlan.normalise(d.biweekly);
      for (const k in LOCAL_PROFILE_KEYS) S[k] = readLocal(profileLocalKey(k, id), DEFAULTS[k]);
    }

    function save(...keys) {
      const toSave = keys.length ? keys : [
        ...Object.keys(DB_KEYS), ...Object.keys(LOCAL_KEYS), ...Object.keys(LOCAL_PROFILE_KEYS)
      ];

      // Snapshot before anything asynchronous — the user may switch profiles mid-write
      const activeId = S.activeProfile;

      // Local preferences — synchronous, instant
      toSave.filter(k => k in LOCAL_KEYS).forEach(k => writeLocal(LOCAL_KEYS[k], S[k]));
      toSave.filter(k => k in LOCAL_PROFILE_KEYS)
            .forEach(k => writeLocal(profileLocalKey(k, activeId), S[k]));

      const dbKeys = toSave.filter(k => k in DB_KEYS);
      if (!dbKeys.length) return Promise.resolve();

      // Keep the cache in step with S, in case something reassigned rather than mutated
      const cache = S._profileData?.[activeId];
      if (cache) dbKeys.filter(k => k in PROFILE_KEYS).forEach(k => { cache[k] = S[k]; });

      return write(dbKeys.map(k => ({
        profile_id: k in ACCOUNT_KEYS ? ACCOUNT_SCOPE : activeId,
        key: DB_KEYS[k],
        value: S[k],
      })), dbKeys.join(', '));
    }

    /* Writes per-profile keys for a profile that is NOT the active one, straight from the
       cache. Needed when an account-level change has to cascade into every profile. */
    function saveProfile(profileId, ...keys) {
      const data = S._profileData?.[profileId];
      if (!data) return Promise.resolve();
      return write(
        keys.filter(k => k in PROFILE_KEYS)
            .map(k => ({ profile_id: profileId, key: PROFILE_KEYS[k], value: data[k] })),
        keys.join(', ') + ' on profile ' + profileId,
      );
    }

    /* Creates a Profile and makes it Active. With copyFromId every per-Profile key is
       deep-copied, Subitem ids verbatim (they are unique within a Profile, not across
       them, so Cutoff and Bank assignments carry over with no remapping). Returns the
       new id; persistence is fire-and-forget like save. */
    function create(name, copyFromId) {
      const id  = genId();
      const src = copyFromId ? S._profileData[copyFromId] : null;

      S._profileData[id] = {};
      for (const k in PROFILE_KEYS) S._profileData[id][k] = clone(src?.[k] ?? DEFAULTS[k]);

      S.profiles.push({ id, name });
      save('profiles');

      activate(id);
      save('activeProfile');
      save(...Object.keys(PROFILE_KEYS));
      return id;
    }

    function rename(profileId, name) {
      const p = S.profiles.find(x => x.id === profileId);
      if (!p) return Promise.resolve();
      p.name = name;
      return save('profiles');
    }

    /* Deletes a Profile's remote rows and device-local keys; Banks, Routes and Fees are
       Account-level and untouched. Throws on the last Profile. */
    function remove(profileId) {
      if (S.profiles.length <= 1) throw new Error('An account needs at least one profile');

      S.profiles = S.profiles.filter(x => x.id !== profileId);
      delete S._profileData[profileId];
      const writes = [save('profiles')];

      writes.push(new Promise(resolve => resolve(remote.deleteScope(profileId)))
        .then(res => { if (res?.error) console.error('Delete failed for profile', profileId, res.error.message); })
        .catch(e => console.error('Delete failed for profile', profileId, e?.message ?? e)));
      for (const k in LOCAL_PROFILE_KEYS) {
        try { local.removeItem(profileLocalKey(k, profileId)); } catch {}
      }

      if (S.activeProfile === profileId) {
        activate(S.profiles[0].id);
        writes.push(save('activeProfile'));
      }
      return Promise.all(writes).then(() => {});
    }

    return { load, activate, save, saveProfile, create, rename, remove };
  },
};
