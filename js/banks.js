'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   BANKS
═══════════════════════════════════════════════════════════════════════════ */
function bankTotal(bid) {
  return S.overview.subitems.filter(i => S.bankAssign[i.id]===bid).reduce((s,i)=>s+Number(i.amount||0),0);
}

function renderBanks() {
  const { banks, bankAssign } = S;
  const { subitems } = S.overview;

  const cards = banks.length
    ? banks.map(b => `
      <div class="bank-card card">
        <div class="bank-card-top">
          <div>
            <div class="bank-name">${esc(b.name)}</div>
            ${b.nick?`<div class="bank-nick">${esc(b.nick)}</div>`:''}
          </div>
          <span class="type-badge ${b.type}">${b.type}</span>
        </div>
        <div class="bank-total">${fmt(bankTotal(b.id))}</div>
        <div class="bank-actions">
          <button class="btn-icon del-bank" data-id="${b.id}" title="Remove"><i data-feather="trash-2"></i> Remove</button>
        </div>
      </div>`).join('')
    : '<p class="muted" style="font-size:.875rem">No banks added yet.</p>';

  const subRows = subitems.map(it => {
    const a = bankAssign[it.id] || '';
    const opts = banks.map(b=>`<option value="${b.id}" ${a===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
    return `<tr>
      <td>${esc(it.name||'(unnamed)')}</td>
      <td><span class="cat-badge cat-${it.category}">${it.category}</span></td>
      <td>${fmt(it.amount)}</td>
      <td><select class="tbl-select bank-asgn" data-id="${it.id}">
        <option value="">— Unassigned —</option>
        <option value="cash" ${a==='cash'?'selected':''}>Cash</option>
        ${opts}
      </select></td>
    </tr>`;
  }).join('');

  ri('tab-banks').innerHTML = `
    <div class="card add-bank-form">
      <h4>Add Bank / E-wallet</h4>
      <div class="form-row">
        <input id="inp-bname" type="text" placeholder="Name (e.g. BPI, GCash)" style="flex:2;min-width:140px">
        <input id="inp-bnick" type="text" placeholder="Nickname (optional)" style="flex:1;min-width:110px">
        <select id="inp-btype" style="min-width:110px">
          <option value="bank">Bank</option>
          <option value="ewallet">E-wallet</option>
        </select>
        <button class="btn btn-primary" id="btn-addbank"><i data-feather="plus"></i> Add</button>
      </div>
    </div>

    <div class="bank-cards-grid" style="margin-bottom:1rem">${cards}</div>

    ${subitems.length ? `
    <div class="card">
      <h4>Assign Subitems to Bank / E-wallet</h4>
      <table class="data-table">
        <thead><tr><th>Item</th><th>Category</th><th>Amount</th><th>Assigned To</th></tr></thead>
        <tbody>${subRows}</tbody>
      </table>
    </div>` : `<div class="empty-state card"><i data-feather="credit-card"></i><p>Add items in the Overview tab first.</p></div>`}`;

  feather.replace();

  ri('btn-addbank').addEventListener('click', () => {
    const name = ri('inp-bname').value.trim();
    if (!name) return;
    S.banks.push({ id: genId(), name, nick: ri('inp-bnick').value.trim(), type: ri('inp-btype').value });
    save('banks'); ri('inp-bname').value=''; ri('inp-bnick').value=''; renderBanks();
  });
  ri('tab-banks').querySelectorAll('.del-bank').forEach(btn => {
    btn.addEventListener('click', () => deleteBank(btn.dataset.id));
  });
  ri('tab-banks').querySelectorAll('.bank-asgn').forEach(sel => {
    sel.addEventListener('change', e => {
      if (e.target.value) S.bankAssign[e.target.dataset.id] = e.target.value;
      else delete S.bankAssign[e.target.dataset.id];
      save('bankAssign'); renderBanks();
    });
  });
}

function deleteBank(id) {
  S.banks = S.banks.filter(b => b.id !== id);
  for (const k in S.bankAssign) if (S.bankAssign[k]===id) delete S.bankAssign[k];
  for (const k in S.fees) if (k.startsWith(id+'_')||k.endsWith('_'+id)) delete S.fees[k];
  save('banks','bankAssign','fees'); renderBanks();
}
