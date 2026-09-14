'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   BIWEEKLY
   Cutoff logic (amounts, totals, assignment, Force Assign, Auto-Suggest)
   lives in js/cutoffPlan.js — this module renders from it and keeps the
   display copy.
═══════════════════════════════════════════════════════════════════════════ */
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
    const items = CutoffPlan.itemsIn(S.biweekly, subitems, key);
    const total = items.reduce((s,i) => s + CutoffPlan.amountIn(S.biweekly, i, key), 0);
    const rem   = half - total;
    const list  = items.length
      ? items.map(i => `<div class="cutoff-item">
          <span>${esc(i.name||'(unnamed)')}${forced[i.id]
            ? ' <i data-feather="lock" class="force-lock" title="Force Assigned"></i>' : ''}</span>
          <span>${fmt(CutoffPlan.amountIn(S.biweekly, i, key))}</span>
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
        CutoffPlan.assign(S.biweekly, id, e.target.value);
      } else {
        // Unassigned releases it, since the checkbox is about to be disabled.
        CutoffPlan.unassign(S.biweekly, id);
      }
      save('biweekly'); renderBiweekly();
    });
  });
  ri('tab-biweekly').querySelectorAll('.bw-force').forEach(box => {
    box.addEventListener('change', e => {
      const id = e.target.dataset.id;
      CutoffPlan.setForced(S.biweekly, id, e.target.checked);
      save('biweekly'); renderBiweekly();
    });
  });
}

function autoSuggest() {
  CutoffPlan.autoSuggest(S.biweekly, S.overview.subitems);
  save('biweekly'); renderBiweekly();
}
