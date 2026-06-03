'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   BIWEEKLY
═══════════════════════════════════════════════════════════════════════════ */
function renderBiweekly() {
  const { subitems, netPay } = S.overview;
  const asgn = S.biweekly.assignments;
  const half = netPay / 2;

  if (!subitems.length) {
    ri('tab-biweekly').innerHTML = `<div class="empty-state card"><i data-feather="calendar"></i><p>Add items in the Overview tab first.</p></div>`;
    feather.replace(); return;
  }

  const rows = subitems.map(it => {
    const a = asgn[it.id] || '';
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
    </tr>`;
  }).join('');

  function panel(label, key) {
    const items = subitems.filter(i => { const a = asgn[i.id]; return a===key||a==='both'; });
    const total = items.reduce((s,i) => s+(asgn[i.id]==='both'?Number(i.amount)/2:Number(i.amount)), 0);
    const rem   = half - total;
    const list  = items.length
      ? items.map(i => `<div class="cutoff-item">
          <span>${esc(i.name||'(unnamed)')}</span>
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
      <span class="muted">Balance subitems as evenly as possible between both cutoffs</span>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <table class="data-table">
        <thead><tr><th>Item</th><th>Category</th><th>Amount</th><th>Assign to Cutoff</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="cutoffs-grid">${panel('Cutoff 1 (1st–15th)','cutoff1')} ${panel('Cutoff 2 (16th–30th)','cutoff2')}</div>`;

  feather.replace();

  ri('btn-autosuggest').addEventListener('click', autoSuggest);
  ri('tab-biweekly').querySelectorAll('.bw-asgn').forEach(sel => {
    sel.addEventListener('change', e => {
      if (e.target.value) S.biweekly.assignments[e.target.dataset.id] = e.target.value;
      else delete S.biweekly.assignments[e.target.dataset.id];
      save('biweekly'); renderBiweekly();
    });
  });
}

function autoSuggest() {
  const items = [...S.overview.subitems].sort((a,b) => Number(b.amount)-Number(a.amount));
  let t1=0, t2=0;
  const asgn = {};
  for (const it of items) {
    if (t1 <= t2) { asgn[it.id]='cutoff1'; t1+=Number(it.amount); }
    else          { asgn[it.id]='cutoff2'; t2+=Number(it.amount); }
  }
  S.biweekly.assignments = asgn;
  save('biweekly'); renderBiweekly();
}
