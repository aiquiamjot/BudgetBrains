'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   TRANSFER
═══════════════════════════════════════════════════════════════════════════ */
let routesCollapsed = false;

function renderTransfer() {
  const { banks, fees, manual } = S;

  if (banks.length < 2) {
    ri('tab-transfer').innerHTML = `<div class="empty-state card"><i data-feather="shuffle"></i><p>Add at least 2 banks in the Banks tab to configure transfers.</p></div>`;
    feather.replace(); return;
  }

  const routeCards = banks.map(from => {
    const fl = Number(from.freeLimit) || 0;
    const fp = from.resetPeriod || 'monthly';
    const PERIOD = { daily:'Day', weekly:'Week', monthly:'Month' };

    const rows = banks.filter(b => b.id !== from.id).map(to => {
      const key = `${from.id}_${to.id}`;
      const on  = !!fees[key];
      const fee = fees[key] ? Number(fees[key].fee) || 0 : 0;
      const uid = `chk_${from.id}_${to.id}`;
      return `
        <div class="fee-route-row">
          <div class="fee-route-check">
            <input type="checkbox" id="${uid}" class="fee-chk" ${on?'checked':''}
              data-from="${from.id}" data-to="${to.id}">
            <label for="${uid}">
              <i data-feather="arrow-right" style="width:12px;height:12px;opacity:.4;flex-shrink:0"></i>
              ${esc(to.name)}
            </label>
          </div>
          <div class="fee-route-fields" data-from="${from.id}" data-to="${to.id}" ${on?'':'style="display:none"'}>
            <span class="fee-field-lbl">Fee per transfer</span>
            <input class="fee-inp" type="number" value="${fee}" min="0" placeholder="0"
              data-from="${from.id}" data-to="${to.id}" data-field="fee">
            <span class="fee-field-lbl">₱</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card fee-routes-card">
        <div class="card-title"><span class="type-badge ${from.type}">${from.type}</span>${esc(from.name)}</div>
        <div class="bank-free-row">
          <span class="fee-field-lbl" style="font-weight:500;color:var(--text)">Free transfers:</span>
          <input class="free-inp bank-free-inp" type="number" value="${fl}" min="0" placeholder="0"
            data-bank="${from.id}" data-field="freeLimit">
          <span class="fee-field-lbl">per</span>
          <select class="bank-period-sel" data-bank="${from.id}" data-field="resetPeriod">
            <option value="daily"   ${fp==='daily'?'selected':''}>Day</option>
            <option value="weekly"  ${fp==='weekly'?'selected':''}>Week</option>
            <option value="monthly" ${fp==='monthly'?'selected':''}>Month</option>
          </select>
          ${fl>0?`<span class="alloc-badge" style="font-size:.75rem">${fl} free/${PERIOD[fp].toLowerCase()}</span>`:''}
        </div>
        ${rows}
      </div>`;
  }).join('');

  const mRows = manual.map((step, idx) => {
    const bOpts = sel => banks.map(b=>`<option value="${b.id}" ${sel===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
    return `<tr>
      <td><select class="tbl-select m-from" data-idx="${idx}"><option value="">From…</option>${bOpts(step.from)}</select></td>
      <td><select class="tbl-select m-to"   data-idx="${idx}"><option value="">To…</option>${bOpts(step.to)}</select></td>
      <td><input class="tbl-input m-amt" type="number" value="${step.amount||''}" placeholder="0" data-idx="${idx}" min="0"></td>
      <td><input class="tbl-input m-note" type="text" value="${esc(step.note||'')}" placeholder="Note" data-idx="${idx}"></td>
      <td><button class="btn-icon del-manual" data-idx="${idx}"><i data-feather="trash-2"></i></button></td>
    </tr>`;
  }).join('');

  ri('tab-transfer').innerHTML = `
    <div class="card">
      <div class="routes-card-header">
        <h4>Transfer Routes &amp; Fees</h4>
        <button class="btn-collapse" id="btn-toggle-routes">
          <i data-feather="${routesCollapsed ? 'chevron-down' : 'chevron-up'}" style="width:13px;height:13px"></i>
          ${routesCollapsed ? 'Show' : 'Hide'}
        </button>
      </div>
      <div class="routes-collapsible${routesCollapsed ? ' collapsed' : ''}">
        <p class="muted" style="margin-bottom:.85rem;font-size:.83rem">
          For each bank, set its total free transfer quota (applies to all outgoing transfers combined). Then check each destination it can send to and set the fee for that route.
        </p>
        <div class="fee-routes-grid">${routeCards}</div>
      </div>
    </div>

    <div class="card">
      <div class="transfer-calc-header">
        <h4>Optimal Transfer Sequence</h4>
      </div>
      <p class="source-note">Salary is assumed to land in <strong>${esc(banks[0].name)}</strong> (first bank). Only checked routes are used.</p>
      <div id="calc-result"></div>
    </div>

    <div class="card">
      <div class="manual-header">
        <h4>Manual Transfer Steps</h4>
        <button class="btn btn-ghost btn-sm" id="btn-add-manual"><i data-feather="plus"></i> Add Step</button>
      </div>
      <table class="data-table">
        <thead><tr><th>From</th><th>To</th><th>Amount (₱)</th><th>Note</th><th></th></tr></thead>
        <tbody id="manual-tbody">${mRows}</tbody>
      </table>
    </div>`;

  feather.replace();
  bindTransfer();
  calcSequence();
}

function bindTransfer() {
  const panel = ri('tab-transfer');

  ri('btn-toggle-routes').addEventListener('click', () => {
    routesCollapsed = !routesCollapsed;
    const body = panel.querySelector('.routes-collapsible');
    const btn  = ri('btn-toggle-routes');
    body.classList.toggle('collapsed', routesCollapsed);
    btn.innerHTML = `<i data-feather="${routesCollapsed ? 'chevron-down' : 'chevron-up'}" style="width:13px;height:13px"></i> ${routesCollapsed ? 'Show' : 'Hide'}`;
    feather.replace();
  });

  // Bank-level free transfer quota
  panel.querySelectorAll('.bank-free-inp, .bank-period-sel').forEach(el => {
    el.addEventListener('change', e => {
      const { bank, field } = e.target.dataset;
      const b = S.banks.find(x => x.id === bank);
      if (!b) return;
      b[field] = field === 'resetPeriod' ? e.target.value : Number(e.target.value) || 0;
      save('banks');
    });
  });

  // Checkbox: enable / disable a route
  panel.querySelectorAll('.fee-chk').forEach(chk => {
    chk.addEventListener('change', e => {
      const { from, to } = e.target.dataset;
      const key = `${from}_${to}`;
      const fieldsEl = panel.querySelector(`.fee-route-fields[data-from="${from}"][data-to="${to}"]`);
      if (e.target.checked) {
        if (!S.fees[key]) S.fees[key] = { fee: 0 };
        if (fieldsEl) fieldsEl.style.display = '';
      } else {
        delete S.fees[key];
        if (fieldsEl) fieldsEl.style.display = 'none';
      }
      save('fees');
    });
  });

  // Per-route fee field
  panel.querySelectorAll('.fee-route-fields input').forEach(inp => {
    inp.addEventListener('change', e => {
      const { from, to, field } = e.target.dataset;
      if (!from || !to || !field) return;
      const key = `${from}_${to}`;
      if (!S.fees[key]) return;
      S.fees[key][field] = Number(e.target.value) || 0;
      save('fees');
    });
  });


  ri('btn-add-manual').addEventListener('click', () => {
    S.manual.push({ from:'', to:'', amount:0, note:'' });
    save('manual'); renderTransfer();
  });

  panel.querySelectorAll('.del-manual').forEach(btn => {
    btn.addEventListener('click', () => { S.manual.splice(Number(btn.dataset.idx),1); save('manual'); renderTransfer(); });
  });
  panel.querySelectorAll('.m-from,.m-to').forEach(sel => {
    sel.addEventListener('change', e => {
      const idx=Number(e.target.dataset.idx), f=e.target.classList.contains('m-from')?'from':'to';
      S.manual[idx][f]=e.target.value; save('manual');
    });
  });
  panel.querySelectorAll('.m-amt').forEach(inp => {
    inp.addEventListener('change', e => { S.manual[Number(e.target.dataset.idx)].amount=Number(e.target.value)||0; save('manual'); });
  });
  panel.querySelectorAll('.m-note').forEach(inp => {
    inp.addEventListener('input', e => { S.manual[Number(e.target.dataset.idx)].note=e.target.value; save('manual'); });
  });
}

function calcSequence() {
  const { banks, fees, biweekly } = S;
  const { subitems } = S.overview;
  if (!banks.length) return;

  const bankById = id => banks.find(b => b.id === id);
  const getFee = (fromId, toId) => {
    const f = fees[`${fromId}_${toId}`];
    if (!f) return Infinity;
    const fromBank = bankById(fromId);
    if (fromBank && Number(fromBank.freeLimit) > 0) return 0;
    return Number(f.fee) || 0;
  };
  const PERIOD = { daily:'day', weekly:'week', monthly:'month' };
  const freeNote = fromId => {
    const b = bankById(fromId);
    const fl = Number(b?.freeLimit) || 0;
    return fl ? ` (${fl} free/${PERIOD[b.resetPeriod||'monthly']})` : '';
  };

  // Build bank totals for one cutoff ('cutoff1' or 'cutoff2').
  // Items assigned 'both' contribute half their amount to each cutoff.
  // Unassigned items are treated the same as 'both'.
  function buildTotals(cutoff) {
    const totals = {};
    banks.forEach(b => { totals[b.id] = 0; });
    subitems.forEach(it => {
      const bid = S.bankAssign[it.id];
      if (!bid || totals[bid] === undefined) return;
      const assign = biweekly.assignments?.[it.id];
      const amt = Number(it.amount || 0);
      if (assign === cutoff) totals[bid] += amt;
      else if (assign === 'both' || !assign) totals[bid] += amt / 2;
    });
    return totals;
  }

  function computeSteps(totals) {
    const src = banks[0];
    const raw = [];
    banks.slice(1).forEach(dest => {
      const amt = totals[dest.id];
      if (!amt) return;
      const direct = getFee(src.id, dest.id);
      let bestHub = null, bestHubFee = Infinity;
      banks.forEach(hub => {
        if (hub.id === src.id || hub.id === dest.id) return;
        const hf = getFee(src.id, hub.id) + getFee(hub.id, dest.id);
        if (hf < bestHubFee) { bestHubFee = hf; bestHub = hub; }
      });
      if (bestHub && bestHubFee < direct) {
        raw.push({ fromId:src.id, toId:bestHub.id, from:src.name, to:bestHub.name, amt, fee:getFee(src.id,bestHub.id), routingFor:[dest.name], fn:freeNote(src.id) });
        raw.push({ fromId:bestHub.id, toId:dest.id, from:bestHub.name, to:dest.name, amt, fee:getFee(bestHub.id,dest.id), routingFor:[], fn:freeNote(bestHub.id) });
      } else {
        raw.push({ fromId:src.id, toId:dest.id, from:src.name, to:dest.name, amt, fee:direct, routingFor:[], fn:freeNote(src.id) });
      }
    });

    // Consolidate steps that share the same from→to into one transaction
    const mergeMap = new Map();
    raw.forEach(step => {
      const key = `${step.fromId}_${step.toId}`;
      if (mergeMap.has(key)) {
        const m = mergeMap.get(key);
        m.amt += step.amt;
        step.routingFor.forEach(d => { if (!m.routingFor.includes(d)) m.routingFor.push(d); });
      } else {
        mergeMap.set(key, { ...step, routingFor: [...step.routingFor] });
      }
    });

    const merged = Array.from(mergeMap.values());
    merged.forEach(st => {
      const parts = [];
      if (st.routingFor.length) parts.push(`Routing for ${st.routingFor.join(', ')}`);
      if (st.fn) parts.push(st.fn.trim());
      st.note = parts.join(' ');
    });

    merged.sort((a, b) => a.fee - b.fee);
    return merged;
  }

  function stepsHTML(steps) {
    if (!steps.length) return '<p class="muted" style="margin:.25rem 0">No transfers needed for this cutoff.</p>';
    const totalFee = steps.filter(st => st.fee !== Infinity).reduce((s, st) => s + st.fee, 0);
    return `
      <div class="transfer-steps">
        ${steps.map((st, i) => `
          <div class="transfer-step">
            <div class="step-num">Step ${i+1}</div>
            <div class="step-detail">
              <span class="step-bank">${esc(st.from)}</span>
              <i data-feather="arrow-right" style="width:14px;height:14px;opacity:.5"></i>
              <span class="step-bank">${esc(st.to)}</span>
              <span class="step-amount">${fmt(st.amt)}</span>
              <span class="fee-badge ${st.fee===Infinity?'warn':st.fee===0?'free':'paid'}">${st.fee===Infinity?'⚠ No route':st.fee===0?'Free':'Fee: '+fmt(st.fee)}</span>
              ${st.note?`<span class="step-note">${esc(st.note)}</span>`:''}
            </div>
          </div>`).join('')}
      </div>
      <div class="total-fees-bar">Transfer Fees: <strong>${fmt(totalFee)}</strong></div>`;
  }

  const steps1 = computeSteps(buildTotals('cutoff1'));
  const steps2 = computeSteps(buildTotals('cutoff2'));
  const res = ri('calc-result');

  if (!steps1.length && !steps2.length) {
    res.innerHTML = '<p class="muted">No transfers needed — assign subitems to banks in the Banks tab first.</p>';
    return;
  }

  res.innerHTML = `
    <div class="cutoff-section">
      <div class="cutoff-section-title">Cutoff 1</div>
      ${stepsHTML(steps1)}
    </div>
    <div class="cutoff-section">
      <div class="cutoff-section-title">Cutoff 2</div>
      ${stepsHTML(steps2)}
    </div>`;
  feather.replace();
}
