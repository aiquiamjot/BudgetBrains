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
   AUTH — SETUP
═══════════════════════════════════════════════════════════════════════════ */
async function handleSetup(e) {
  e.preventDefault();
  const user = ri('setup-user').value.trim();
  const pass = ri('setup-pass').value;
  const pass2 = ri('setup-pass2').value;
  const err = ri('setup-error');
  err.textContent = '';

  if (!user)           { err.textContent = 'Username is required.'; return; }
  if (pass.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (pass !== pass2)  { err.textContent = 'Passwords do not match.'; return; }

  const passwordHash = await sha256(pass);
  const totpSecret   = genBase32(20);
  localStorage.setItem('bb_credentials', JSON.stringify({ username: user, passwordHash, totpSecret }));

  showTotpModal(user, totpSecret);
}

function showTotpModal(username, secret) {
  const formatted = (secret.match(/.{1,4}/g) || []).join(' ');
  ri('totp-secret-display').textContent = formatted;

  const totp = new OTPAuth.TOTP({
    issuer: 'BudgetBrains', label: username,
    algorithm: 'SHA1', digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const canvas = ri('totp-qr-canvas');
  if (typeof QRCode !== 'undefined') {
    QRCode.toCanvas(canvas, totp.toString(), { width: 180, margin: 2 }, err => {
      if (err) canvas.style.display = 'none';
    });
  } else {
    canvas.style.display = 'none';
  }

  ri('modal-totp').classList.add('active');
}

function closeTotpModal() {
  ri('modal-totp').classList.remove('active');
  ['setup-user','setup-pass','setup-pass2'].forEach(id => { const el = ri(id); if (el) el.value = ''; });
  showScreen('login');
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — LOGIN
═══════════════════════════════════════════════════════════════════════════ */
async function handleLogin(e) {
  e.preventDefault();
  const user = ri('login-user').value.trim();
  const pass = ri('login-pass').value;
  const code = ri('login-totp').value.trim().replace(/\s/g,'');
  const err  = ri('login-error');
  err.textContent = '';

  const raw = localStorage.getItem('bb_credentials');
  if (!raw) { err.textContent = 'No account found. Please set up first.'; return; }
  const creds = JSON.parse(raw);

  const hash = await sha256(pass);
  if (user !== creds.username || hash !== creds.passwordHash) {
    err.textContent = 'Invalid username or password.'; return;
  }

  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(creds.totpSecret), digits: 6, period: 30,
  });
  if (totp.validate({ token: code, window: 1 }) === null) {
    err.textContent = 'Invalid authenticator code.'; return;
  }

  sessionStorage.setItem('bb_session', '1');
  showScreen('dashboard');
  switchTab(S.activeTab || 'overview');
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — FORGOT PASSWORD
═══════════════════════════════════════════════════════════════════════════ */
async function handleForgot(e) {
  e.preventDefault();
  const user     = ri('forgot-user').value.trim();
  const code     = ri('forgot-totp').value.trim().replace(/\s/g,'');
  const newPass  = ri('forgot-newpass').value;
  const newPass2 = ri('forgot-newpass2').value;
  const err      = ri('forgot-error');
  const succ     = ri('forgot-success');
  err.textContent = ''; succ.textContent = '';

  const raw = localStorage.getItem('bb_credentials');
  if (!raw) { err.textContent = 'No account found.'; return; }
  const creds = JSON.parse(raw);

  if (user !== creds.username) { err.textContent = 'Username not found.'; return; }

  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(creds.totpSecret), digits: 6, period: 30,
  });
  if (totp.validate({ token: code, window: 1 }) === null) {
    err.textContent = 'Invalid authenticator code.'; return;
  }

  if (newPass.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (newPass !== newPass2) { err.textContent = 'Passwords do not match.'; return; }

  creds.passwordHash = await sha256(newPass);
  localStorage.setItem('bb_credentials', JSON.stringify(creds));

  succ.textContent = 'Password reset successfully! Redirecting to login…';
  setTimeout(() => {
    succ.textContent = '';
    ['forgot-user','forgot-totp','forgot-newpass','forgot-newpass2'].forEach(id => { const el = ri(id); if(el) el.value=''; });
    showScreen('login');
  }, 2000);
}

function logout() {
  sessionStorage.removeItem('bb_session');
  showScreen('login');
}
