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

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function genBase32(len = 20) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes).map(b => alpha[b % 32]).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════════ */
const KEYS = {
  overview:    'bb_overview',
  biweekly:    'bb_biweekly',
  banks:       'bb_banks',
  bankAssign:  'bb_bankAssign',
  fees:        'bb_fees',
  manual:      'bb_manual',
  theme:       'bb_theme',
  activeTab:   'bb_activeTab',
};

const DEFAULTS = {
  overview:  { netPay: 0, splits: { needs: 50, wants: 30, savings: 20 }, subitems: [] },
  biweekly:  { assignments: {} },
  banks:     [],
  bankAssign:{},
  fees:      {},
  manual:    [],
  theme:     'light',
  activeTab: 'overview',
};

const S = {};

function loadState() {
  for (const k in KEYS) {
    try {
      const raw = localStorage.getItem(KEYS[k]);
      S[k] = raw !== null ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULTS[k]));
    } catch { S[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); }
  }
}

function save(...keys) {
  const all = Object.keys(KEYS);
  (keys.length ? keys : all).forEach(k => {
    try { localStorage.setItem(KEYS[k], JSON.stringify(S[k])); } catch {}
  });
}
