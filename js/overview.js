'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   OVERVIEW
═══════════════════════════════════════════════════════════════════════════ */
let donutChart = null, barChart = null;

function catItems(cat) { return S.overview.subitems.filter(i => i.category === cat); }
function catTotal(cat) { return catItems(cat).reduce((s,i) => s + Number(i.amount||0), 0); }
function catAlloc(cat) { return (S.overview.splits[cat] / 100) * S.overview.netPay; }

function renderSection(cat) {
  const LABEL = { needs:'Needs', wants:'Wants', savings:'Savings' };
  const alloc = catAlloc(cat), tot = catTotal(cat), variance = alloc - tot;
  const rows = catItems(cat).map(item => `
    <tr>
      <td><input class="tbl-input" type="text" value="${esc(item.name)}" placeholder="Item name"
          data-id="${item.id}" data-field="name"></td>
      <td style="width:120px"><input class="tbl-input" type="number" value="${item.amount||''}"
          placeholder="0" min="0" data-id="${item.id}" data-field="amount"></td>
      <td style="width:36px"><button class="btn-icon del-item" data-id="${item.id}" title="Delete"><i data-feather="trash-2"></i></button></td>
    </tr>`).join('');
  return `
    <div class="card section-card" data-cat="${cat}">
      <div class="section-header">
        <h3 class="section-title">${LABEL[cat]}</h3>
        <div style="display:flex;align-items:center;gap:.5rem">
          <button class="btn btn-ghost btn-sm add-item" data-cat="${cat}">
            <i data-feather="plus"></i> Add Item
          </button>
          <span class="alloc-badge">${fmt(alloc)}</span>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Item</th><th>Amount (₱)</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="section-footer">
        <span class="muted" style="font-size:.83rem">Subitem total: <strong style="color:var(--text)">${fmt(tot)}</strong></span>
        <span class="variance ${variance>=0?'color-success':'color-danger'}" style="font-size:.83rem">
          Variance: ${variance>=0?'+':''}${fmt(variance)}
        </span>
      </div>
    </div>`;
}

function renderOverview() {
  const { netPay, splits } = S.overview;
  const { needs:np, wants:wp, savings:sp } = splits;
  const splitSum = np + wp + sp;
  const splitWarn = splitSum !== 100
    ? `<span class="warn-text" style="font-size:.82rem;display:block;margin-top:.4rem">⚠ Splits must total 100 (currently ${splitSum})</span>` : '';

  const totalAllocated = ['needs','wants','savings'].reduce((s,c) => s+catTotal(c), 0);
  const remaining = netPay - totalAllocated;

  ri('tab-overview').innerHTML = `
    <div class="overview-controls card">
      <div class="controls-row">
        <div class="control-group">
          <label>Net Monthly Pay</label>
          <div class="input-group" style="min-width:180px">
            <span>₱</span>
            <input id="inp-netpay" type="number" value="${netPay||''}" placeholder="0" min="0">
          </div>
        </div>
        <div class="control-group">
          <label>Allocation Split (%)</label>
          <div class="splits-row">
            <div class="split-item"><span>Needs</span><input id="spl-needs" type="number" value="${np}" min="0" max="100"></div>
            <div class="split-item"><span>Wants</span><input id="spl-wants" type="number" value="${wp}" min="0" max="100"></div>
            <div class="split-item"><span>Savings</span><input id="spl-savings" type="number" value="${sp}" min="0" max="100"></div>
          </div>
          ${splitWarn}
        </div>
      </div>
    </div>

    <div class="sections-grid">
      ${['needs','wants','savings'].map(renderSection).join('')}
    </div>

    <div class="summary-section">
      <div class="summary-cards">
        <div class="summary-card"><div class="sc-label">Net Pay</div><div class="sc-value">${fmt(netPay)}</div></div>
        <div class="summary-card sc-needs"><div class="sc-label">Needs Budget</div><div class="sc-value">${fmt(catAlloc('needs'))}</div></div>
        <div class="summary-card sc-wants"><div class="sc-label">Wants Budget</div><div class="sc-value">${fmt(catAlloc('wants'))}</div></div>
        <div class="summary-card sc-savings"><div class="sc-label">Savings Budget</div><div class="sc-value">${fmt(catAlloc('savings'))}</div></div>
        <div class="summary-card"><div class="sc-label">Total Allocated</div><div class="sc-value">${fmt(totalAllocated)}</div></div>
        <div class="summary-card ${remaining>=0?'sc-success':'sc-danger'}">
          <div class="sc-label">${remaining>=0?'Remaining':'Overage'}</div>
          <div class="sc-value ${remaining>=0?'color-success':'color-danger'}">${fmt(Math.abs(remaining))}</div>
        </div>
      </div>
      <div class="charts-row">
        <div class="card chart-card"><h4>Allocation Split</h4><canvas id="ch-donut"></canvas></div>
        <div class="card chart-card"><h4>Budget vs. Subitem Total</h4><canvas id="ch-bar"></canvas></div>
      </div>
    </div>`;

  feather.replace();
  bindOverview();
  renderCharts();
}

function bindOverview() {
  ri('inp-netpay').addEventListener('change', e => {
    S.overview.netPay = Number(e.target.value) || 0; save('overview'); renderOverview();
  });
  ['needs','wants','savings'].forEach(c => {
    ri('spl-'+c).addEventListener('change', e => {
      S.overview.splits[c] = Number(e.target.value) || 0; save('overview'); renderOverview();
    });
  });
  document.querySelectorAll('#tab-overview .tbl-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const item = S.overview.subitems.find(i => i.id === e.target.dataset.id);
      if (!item) return;
      if (e.target.dataset.field === 'amount') item.amount = Number(e.target.value) || 0;
      else item[e.target.dataset.field] = e.target.value;
      save('overview'); renderOverview();
    });
  });
  document.querySelectorAll('#tab-overview .add-item').forEach(btn => {
    btn.addEventListener('click', () => {
      S.overview.subitems.push({ id: genId(), name: '', category: btn.dataset.cat, amount: 0 });
      save('overview'); renderOverview();
    });
  });
  document.querySelectorAll('#tab-overview .del-item').forEach(btn => {
    btn.addEventListener('click', () => {
      S.overview.subitems = S.overview.subitems.filter(i => i.id !== btn.dataset.id);
      delete S.biweekly.assignments[btn.dataset.id];
      delete S.bankAssign[btn.dataset.id];
      save('overview','biweekly','bankAssign'); renderOverview();
    });
  });
}

function renderCharts() {
  if (donutChart) { donutChart.destroy(); donutChart = null; }
  if (barChart)   { barChart.destroy();   barChart = null;   }
  const dCtx = ri('ch-donut'), bCtx = ri('ch-bar');
  if (!dCtx || !bCtx) return;

  const dark = S.theme === 'dark';
  const textClr = dark ? '#e8e8f2' : '#111827';
  const gridClr = dark ? '#2a2a42' : '#e2e6ec';
  const na = catAlloc('needs'), wa = catAlloc('wants'), sa = catAlloc('savings');
  const nt = catTotal('needs'), wt = catTotal('wants'), st = catTotal('savings');

  donutChart = new Chart(dCtx, {
    type: 'doughnut',
    data: {
      labels: ['Needs','Wants','Savings'],
      datasets: [{ data: [na,wa,sa], backgroundColor: ['#e07430','#7c3aed','#059669'], borderColor: dark?'#161625':'#fff', borderWidth: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: textClr, font: { family: 'DM Sans', size: 12 } } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } }
      }
    }
  });

  barChart = new Chart(bCtx, {
    type: 'bar',
    data: {
      labels: ['Needs','Wants','Savings'],
      datasets: [
        { label: 'Allocated',    data: [na,wa,sa], backgroundColor: ['rgba(224,116,48,.85)','rgba(124,58,237,.85)','rgba(5,150,105,.85)'], borderRadius: 4 },
        { label: 'Subitem Total', data: [nt,wt,st], backgroundColor: ['rgba(224,116,48,.4)','rgba(124,58,237,.4)','rgba(5,150,105,.4)'],  borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: textClr, font: { family: 'DM Sans', size: 12 } } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } }
      },
      scales: {
        x: { ticks: { color: textClr }, grid: { color: gridClr } },
        y: { ticks: { color: textClr, callback: v => '₱'+v.toLocaleString() }, grid: { color: gridClr } }
      }
    }
  });
}
