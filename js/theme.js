'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════════════════ */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = ri('theme-toggle');
  if (btn) { btn.innerHTML = t === 'dark' ? '<i data-feather="sun"></i>' : '<i data-feather="moon"></i>'; feather.replace(); }
}

function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  save('theme');
  applyTheme(S.theme);
  if (currentTab === 'overview') renderCharts();
}
