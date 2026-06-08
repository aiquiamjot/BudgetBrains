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

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
   DB_KEYS  → synced to Supabase (budget data, accessible from any device)
   LOCAL_KEYS → stored in localStorage (UI preferences, per-device)
═══════════════════════════════════════════════════════════════════════════ */
const DB_KEYS = {
  overview:   'bb_overview',
  biweekly:   'bb_biweekly',
  banks:      'bb_banks',
  bankAssign: 'bb_bankAssign',
  fees:       'bb_fees',
  manual:     'bb_manual',
};

const LOCAL_KEYS = {
  theme:       'bb_theme',
  activeTab:   'bb_activeTab',
  groqKey:     'bb_groq_key',
  groqProfile: 'bb_groq_profile',
};

const DEFAULTS = {
  overview:  { netPay: 0, splits: { needs: 50, wants: 30, savings: 20 }, subitems: [] },
  biweekly:  { assignments: {} },
  banks:     [],
  bankAssign:{},
  fees:      {},
  manual:    [],
  theme:       'light',
  activeTab:   'overview',
  groqKey:     '',
  groqProfile: null,
};

const S = {};

async function loadState() {
  // Local preferences load instantly (no network)
  for (const k in LOCAL_KEYS) {
    try {
      const raw = localStorage.getItem(LOCAL_KEYS[k]);
      S[k] = raw !== null ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULTS[k]));
    } catch { S[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); }
  }

  // Budget data comes from Supabase
  const { data } = await sb.from('user_data').select('key, value');
  for (const k in DB_KEYS) {
    const row = data?.find(r => r.key === DB_KEYS[k]);
    S[k] = row ? row.value : JSON.parse(JSON.stringify(DEFAULTS[k]));
  }
}

function save(...keys) {
  const toSave = keys.length ? keys : [...Object.keys(DB_KEYS), ...Object.keys(LOCAL_KEYS)];

  // Local preferences — synchronous, instant
  toSave.filter(k => k in LOCAL_KEYS).forEach(k => {
    try { localStorage.setItem(LOCAL_KEYS[k], JSON.stringify(S[k])); } catch {}
  });

  // Budget data — fire-and-forget write to Supabase
  const dbKeys = toSave.filter(k => k in DB_KEYS);
  if (!dbKeys.length) return;

  sb.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    dbKeys.forEach(k => {
      sb.from('user_data').upsert(
        { user_id: user.id, key: DB_KEYS[k], value: S[k] },
        { onConflict: 'user_id,key' }
      ).then(({ error }) => {
        if (error) console.error('Save failed for', k, error.message);
      });
    });
  });
}
