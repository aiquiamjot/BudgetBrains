'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   BIWEEKLY
═══════════════════════════════════════════════════════════════════════════ */
function normaliseBiweekly(plan) {
  if (!plan.forced) plan.forced = {};
}

const BW_BALANCE_HINT = 'Balance subitems as evenly as possible between both cutoffs';

/* The count appears only once something is Force Assigned — "0 of 8" on a first visit
   would advertise a feature the person has not used. */
function forceHelperText(subitems, forced) {
  const n = subitems.filter(i => forced[i.id]).length;
  if (!n) return BW_BALANCE_HINT;
  return `${n} of ${subitems.length} items are Force Assigned; the rest will be balanced`;
}

function renderBiweekly() {
  const { subitems, netPay } = S.overview;
  const asgn   = S.biweekly.assignments;
  const forced = S.biweekly.forced;
  const half   = netPay / 2;

  if (!subitems.length) {
    ri('tab-biweekly').innerHTML = `<div class="empty-state card"><i data-feather="calendar"></i><p>Add items in the Overview tab first.</p></div>`;
    feather.replace(); return;
  }

  const rows = subitems.map(it => {
    const a = asgn[it.id] || '';
    const forceTip = a
      ? 'Keep this item in its cutoff when Auto-Suggest runs'
      : 'Assign this item to a cutoff before keeping it there';
    return `<tr>
      <td>${esc(it.name||'(unnamed)')}</td>
      <td><span class="cat-badge cat-${it.category}">${it.category}</span></td>
      <td>${fmt(it.amount)}</td>
      <td><select class="tbl-select bw-asgn" data-id="${it.id}">
        <option value="" ${!a?'selected':''}>— Unassigned —</option>
        <option value="cutoff1" ${a==='cutoff1'?'selected':''}>Cutoff 1 (1–15)</option>
        <option value="cutoff2" ${a==='cutoff2'?'selected':''}>Cutoff 2 (16–30)</option>
        <option value="both"    ${a==='both'?'selected':''}>Both (split evenly)</option>
      </select></td>
      <td class="bw-force-cell">
        <input type="checkbox" class="bw-force" data-id="${it.id}"
          ${forced[it.id] ? 'checked' : ''} ${!a ? 'disabled' : ''} title="${forceTip}">
      </td>
    </tr>`;
  }).join('');

  function panel(label, key) {
    const items = subitems.filter(i => { const a = asgn[i.id]; return a===key||a==='both'; });
    const total = items.reduce((s,i) => s+(asgn[i.id]==='both'?Number(i.amount)/2:Number(i.amount)), 0);
    const rem   = half - total;
    const list  = items.length
      ? items.map(i => `<div class="cutoff-item">
          <span>${esc(i.name||'(unnamed)')}${forced[i.id]
            ? ' <i data-feather="lock" class="force-lock" title="Force Assigned"></i>' : ''}</span>
          <span>${fmt(asgn[i.id]==='both'?Number(i.amount)/2:Number(i.amount))}</span>
        </div>`).join('')
      : '<div class="cutoff-empty">No items assigned</div>';
    return `<div class="card cutoff-card">
      <h4>${label}</h4>${list}
      <div class="cutoff-footer">
        <div><span class="muted">Total</span><strong>${fmt(total)}</strong></div>
        <div><span class="muted">Half Pay</span><strong>${fmt(half)}</strong></div>
        <div><span class="muted">Remaining</span><strong class="${rem>=0?'color-success':'color-danger'}">${fmt(rem)}</strong></div>
      </div>
    </div>`;
  }

  ri('tab-biweekly').innerHTML = `
    <div class="bw-topbar">
      <button class="btn btn-primary" id="btn-autosuggest"><i data-feather="zap"></i> Auto-Suggest</button>
      <span class="muted">${esc(forceHelperText(subitems, forced))}</span>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <table class="data-table">
        <thead><tr>
          <th>Item</th><th>Category</th><th>Amount</th><th>Assign to Cutoff</th>
          <th class="bw-force-cell" title="Force Assign"><i data-feather="lock"></i> Force</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cutoffs-grid">${panel('Cutoff 1 (1st–15th)','cutoff1')} ${panel('Cutoff 2 (16th–30th)','cutoff2')}</div>`;

  feather.replace();

  ri('btn-autosuggest').addEventListener('click', autoSuggest);
  ri('tab-biweekly').querySelectorAll('.bw-asgn').forEach(sel => {
    sel.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.value) {
        // Moving between cutoffs keeps the Force Assignment — the mark means "Auto-Suggest
        // keeps its hands off this", an intent that does not lapse on a change of placement.
        S.biweekly.assignments[id] = e.target.value;
      } else {
        // Unassigned releases it, since the checkbox is about to be disabled.
        delete S.biweekly.assignments[id];
        delete S.biweekly.forced[id];
      }
      save('biweekly'); renderBiweekly();
    });
  });
  ri('tab-biweekly').querySelectorAll('.bw-force').forEach(box => {
    box.addEventListener('change', e => {
      const id = e.target.dataset.id;
      // Only ids present in the map are Force Assigned — unticking deletes rather than
      // storing false, so the saved plan never accumulates dead entries.
      if (e.target.checked) S.biweekly.forced[id] = true;
      else delete S.biweekly.forced[id];
      save('biweekly'); renderBiweekly();
    });
  });
}

/* The packing seam: the balancing rules with no state, no save and no DOM, so they can
   be reasoned about on their own. Takes the Subitems, the current Cutoff assignments and
   the Force Assigned ids, and returns a new assignments map.

   Force Assigned Subitems keep their placement verbatim and seed their cutoff's running
   total, so the free Subitems flow toward whichever side actually has room. They are
   honoured even when they overrun Half Pay — nothing is clamped or dropped, and the red
   Remaining figure on the panel is how that gets reported. Free Subitems are still never
   placed in Both; Both is a choice only a person makes, and Force Assign is what carries
   it through a press. See docs/specs/0001-force-assign.md and docs/adr/0005-*. */
function balanceCutoffs(subitems, assignments, forced = {}) {
  const asgn = {};
  let t1 = 0, t2 = 0;
  const free = [];
  for (const it of subitems) {
    const a = assignments[it.id];
    if (forced[it.id] && a) {
      asgn[it.id] = a;
      // Both contributes half to each side, matching how the Cutoff panels total it.
      if      (a === 'both')    { t1 += Number(it.amount) / 2; t2 += Number(it.amount) / 2; }
      else if (a === 'cutoff1')   t1 += Number(it.amount);
      else                        t2 += Number(it.amount);
    } else free.push(it);
  }
  // Copied before sorting — the caller's subitems array is not ours to reorder.
  for (const it of [...free].sort((a, b) => Number(b.amount) - Number(a.amount))) {
    if (t1 <= t2) { asgn[it.id] = 'cutoff1'; t1 += Number(it.amount); }
    else          { asgn[it.id] = 'cutoff2'; t2 += Number(it.amount); }
  }
  return asgn;
}

function autoSuggest() {
  S.biweekly.assignments = balanceCutoffs(
    S.overview.subitems, S.biweekly.assignments, S.biweekly.forced);
  save('biweekly'); renderBiweekly();
}
