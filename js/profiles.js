'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   PROFILES
   Alternative budgets under one account — exactly one is active, and amounts are
   never summed across them. See CONTEXT.md and docs/adr/0003-*.
═══════════════════════════════════════════════════════════════════════════ */
function activeProfileName() {
  return S.profiles.find(p => p.id === S.activeProfile)?.name || '';
}

function renderProfileSwitcher() {
  const el = ri('profile-switcher');
  if (!el) return;

  const opts = S.profiles.map(p =>
    `<option value="${p.id}" ${p.id === S.activeProfile ? 'selected' : ''}>${esc(p.name)}</option>`
  ).join('');
  const onlyOne = S.profiles.length <= 1;

  el.innerHTML = `
    <select id="profile-select" class="profile-select" title="Active profile">${opts}</select>
    <button id="profile-new" class="btn-icon-round" title="New profile"><i data-feather="plus"></i></button>
    <button id="profile-rename" class="btn-icon-round" title="Rename profile"><i data-feather="edit-2"></i></button>
    <button id="profile-delete" class="btn-icon-round" ${onlyOne ? 'disabled' : ''}
      title="${onlyOne ? 'An account needs at least one profile' : 'Delete profile'}">
      <i data-feather="trash-2"></i>
    </button>`;

  feather.replace();

  ri('profile-select').addEventListener('change', e => switchProfile(e.target.value));
  ri('profile-new').addEventListener('click', newProfile);
  ri('profile-rename').addEventListener('click', renameActiveProfile);
  if (!onlyOne) ri('profile-delete').addEventListener('click', deleteActiveProfile);
}

/* Only the tab on screen needs redrawing — the other panels rebuild from scratch when
   switchTab reaches them, so their stale DOM is never visible. */
function refreshAfterProfileChange() {
  renderProfileSwitcher();
  switchTab(currentTab);
}

function switchProfile(id) {
  if (id === S.activeProfile) return;
  profileStore.activate(id);
  save('activeProfile');
  refreshAfterProfileChange();
}

function newProfile() {
  const current = activeProfileName();
  const name = (prompt('Name for the new profile:', 'Copy of ' + current) || '').trim();
  if (!name) return;
  const copy = confirm(
    `Start "${name}" as a copy of "${current}"?\n\n` +
    `OK — copy its net pay, items and assignments.\n` +
    `Cancel — start empty.`
  );
  createProfile(name, copy ? S.activeProfile : null);
}

function createProfile(name, copyFromId) {
  profileStore.create(name, copyFromId);
  refreshAfterProfileChange();
}

function renameActiveProfile() {
  const p = S.profiles.find(x => x.id === S.activeProfile);
  if (!p) return;
  const name = (prompt('Rename profile:', p.name) || '').trim();
  if (!name || name === p.name) return;
  profileStore.rename(p.id, name);
  renderProfileSwitcher();
}

/* The only confirm() in the app. Deleting a profile destroys a whole budget with no undo,
   on a write path that will not tell you if it half-succeeded. */
function deleteActiveProfile() {
  if (S.profiles.length <= 1) return;
  const p = S.profiles.find(x => x.id === S.activeProfile);
  if (!p) return;

  const ok = confirm(
    `Delete "${p.name}"?\n\n` +
    `Its net pay, items, cutoff assignments and bank assignments are removed permanently.\n` +
    `Your banks and transfer fees are shared across profiles and are not affected.`
  );
  if (!ok) return;

  profileStore.remove(p.id);
  refreshAfterProfileChange();
}
