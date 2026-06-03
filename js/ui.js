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
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  applyTheme(S.theme || 'light');

  const hasCreds = !!localStorage.getItem('bb_credentials');
  const hasSession = !!sessionStorage.getItem('bb_session');

  if (!hasCreds)       showScreen('setup');
  else if (hasSession) { showScreen('dashboard'); switchTab(S.activeTab||'overview'); }
  else                 showScreen('login');

  ri('setup-form').addEventListener('submit', handleSetup);
  ri('login-form').addEventListener('submit', handleLogin);
  ri('forgot-form').addEventListener('submit', handleForgot);
  ri('totp-confirm-btn').addEventListener('click', closeTotpModal);
  ri('forgot-link').addEventListener('click', e => { e.preventDefault(); showScreen('forgot'); });
  ri('back-to-login').addEventListener('click', e => { e.preventDefault(); showScreen('login'); });
  ri('logout-btn').addEventListener('click', logout);
  ri('theme-toggle').addEventListener('click', toggleTheme);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  feather.replace();
});
