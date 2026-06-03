'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   TAB MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */
let currentTab = 'overview';

function switchTab(name) {
  currentTab = name;
  S.activeTab = name;
  save('activeTab');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  ({ overview: renderOverview, biweekly: renderBiweekly, banks: renderBanks, transfer: renderTransfer })[name]?.();
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Apply theme instantly from localStorage before any async work
  const cachedTheme = (() => {
    try { return JSON.parse(localStorage.getItem('bb_theme')) || 'light'; } catch { return 'light'; }
  })();
  applyTheme(cachedTheme);

  // Wire up all event listeners first so screens are interactive immediately
  ri('setup-form').addEventListener('submit', handleSetup);
  ri('login-form').addEventListener('submit', handleLogin);
  ri('forgot-form').addEventListener('submit', handleForgot);
  ri('reset-form').addEventListener('submit', handleReset);
  ri('forgot-link').addEventListener('click', e => { e.preventDefault(); showScreen('forgot'); });
  ri('signup-link').addEventListener('click', e => { e.preventDefault(); showScreen('setup'); });
  ri('setup-goto-login').addEventListener('click', e => { e.preventDefault(); showScreen('login'); });
  ri('back-to-login').addEventListener('click', e => { e.preventDefault(); showScreen('login'); });
  ri('logout-btn').addEventListener('click', logout);
  ri('theme-toggle').addEventListener('click', toggleTheme);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Listen for PASSWORD_RECOVERY event (user clicked the reset link in their email)
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showScreen('reset');
  });

  // Check for an existing valid Supabase session (signed JWT — cannot be faked via DevTools)
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    await loadState();
    applyTheme(S.theme || 'light');
    showScreen('dashboard');
    switchTab(S.activeTab || 'overview');
  } else {
    showScreen('login');
  }

  feather.replace();
});
