'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
═══════════════════════════════════════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = ri('screen-' + name);
  if (el) el.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — REGISTER
═══════════════════════════════════════════════════════════════════════════ */
async function handleSetup(e) {
  e.preventDefault();
  const email = ri('setup-email').value.trim();
  const pass  = ri('setup-pass').value;
  const pass2 = ri('setup-pass2').value;
  const err   = ri('setup-error');
  const btn   = e.submitter;
  err.textContent = '';

  if (!email)           { err.textContent = 'Email is required.'; return; }
  if (pass.length < 8)  { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (pass !== pass2)   { err.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  const { data, error } = await sb.auth.signUp({ email, password: pass });

  btn.disabled = false;
  btn.textContent = 'Create Account';

  if (error) { err.textContent = error.message; return; }

  if (data.session) {
    // Email confirmations disabled in Supabase — signed in immediately
    await loadState();
    resetTransferState();
    showScreen('dashboard');
    switchTab(S.activeTab || 'overview');
  } else {
    // Email confirmation required — tell the user to check their inbox
    err.style.color = 'var(--success, #059669)';
    err.textContent = 'Account created! Check your email to confirm, then sign in.';
    setTimeout(() => {
      err.textContent = '';
      err.style.color = '';
      showScreen('login');
    }, 4000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — LOGIN
═══════════════════════════════════════════════════════════════════════════ */
async function handleLogin(e) {
  e.preventDefault();
  const email = ri('login-email').value.trim();
  const pass  = ri('login-pass').value;
  const err   = ri('login-error');
  const btn   = e.submitter;
  err.textContent = '';

  if (!email) { err.textContent = 'Email is required.'; return; }
  if (!pass)  { err.textContent = 'Password is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });

  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (error) { err.textContent = error.message; return; }

  await loadState();
  resetTransferState();
  showScreen('dashboard');
  switchTab(S.activeTab || 'overview');
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — FORGOT PASSWORD
   Supabase emails the user a reset link. No code entry needed.
═══════════════════════════════════════════════════════════════════════════ */
async function handleForgot(e) {
  e.preventDefault();
  const email = ri('forgot-email').value.trim();
  const err   = ri('forgot-error');
  const succ  = ri('forgot-success');
  const btn   = e.submitter;
  err.textContent = ''; succ.textContent = '';

  if (!email) { err.textContent = 'Email is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Sending…';

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  btn.disabled = false;
  btn.textContent = 'Send Reset Email';

  if (error) { err.textContent = error.message; return; }

  succ.textContent = 'Reset email sent! Check your inbox and click the link.';
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — PASSWORD RESET (after user clicks the email link)
═══════════════════════════════════════════════════════════════════════════ */
async function handleReset(e) {
  e.preventDefault();
  const newPass  = ri('reset-pass').value;
  const newPass2 = ri('reset-pass2').value;
  const err      = ri('reset-error');
  const btn      = e.submitter;
  err.textContent = '';

  if (newPass.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (newPass !== newPass2) { err.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { error } = await sb.auth.updateUser({ password: newPass });

  btn.disabled = false;
  btn.textContent = 'Set New Password';

  if (error) { err.textContent = error.message; return; }

  // Password updated — user is now signed in, load their data
  await loadState();
  resetTransferState();
  showScreen('dashboard');
  switchTab(S.activeTab || 'overview');
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — LOGOUT
═══════════════════════════════════════════════════════════════════════════ */
async function logout() {
  await sb.auth.signOut();
  showScreen('login');
}
