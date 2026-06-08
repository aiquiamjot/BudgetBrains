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
      <td style="width:90px"><input class="tbl-input" type="number" value="${item.amount||''}"
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

function buildPersonalityPanelHTML() {
  const header = `
    <div class="pp-header">
      <h4>Spending Personality</h4>
      <span class="pp-subtitle">Powered by Groq AI</span>
    </div>`;

  if (!S.groqKey) {
    return header + `
      <div class="pp-no-key">
        <p class="pp-hint">Enter your free <a href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq API key</a> to get a personalized spending profile.</p>
        <div class="pp-key-form">
          <input id="pp-key-input" type="password" placeholder="gsk_…" class="pp-key-inp" autocomplete="off">
          <button id="pp-key-save" class="btn btn-primary btn-sm">Save</button>
        </div>
      </div>`;
  }

  if (!S.groqProfile) {
    return header + `
      <div class="pp-empty">
        <p class="pp-hint">API key saved. Click below to analyze your budget and get your spending personality.</p>
        <button id="pp-analyze-btn" class="btn btn-primary btn-sm">Analyze Budget</button>
        <button id="pp-clear-key" class="btn btn-ghost btn-sm">Clear API Key</button>
      </div>`;
  }

  const isStale = S.groqProfile.budgetHash !== buildBudgetHash();
  const staleHtml = isStale
    ? `<div class="pp-stale">Budget changed — results may be outdated</div>` : '';

  const { type, emoji, description, tips, score } = S.groqProfile.result;
  const scoreClass = score >= 90 ? 'pp-score-excellent'
                   : score >= 70 ? 'pp-score-good'
                   : score >= 50 ? 'pp-score-fair'
                   :               'pp-score-poor';
  const tipsHtml = (tips || []).map(t => `<li>${esc(t)}</li>`).join('');
  const savedDate = new Date(S.groqProfile.savedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  return header + staleHtml + `
    <div class="pp-result">
      <div class="pp-type-row">
        <span class="pp-emoji">${emoji || ''}</span>
        <span class="pp-type-badge">${esc(type || '')}</span>
      </div>
      <div class="pp-score-section">
        <div class="pp-score-label">Budget Health Score</div>
        <div class="pp-score-bar-wrap">
          <div class="pp-score-bar ${scoreClass}" style="width:${score}%"></div>
        </div>
        <div class="pp-score-value">${score}/100</div>
      </div>
      <p class="pp-description">${esc(description || '')}</p>
      <div class="pp-tips-label">Tips</div>
      <ul class="pp-tips">${tipsHtml}</ul>
      <div class="pp-footer">
        <span class="pp-saved-date">Analyzed ${savedDate}</span>
        <div class="pp-footer-btns">
          <button id="pp-analyze-btn" class="btn btn-primary btn-sm">Re-analyze</button>
          <button id="pp-clear-key" class="btn btn-ghost btn-sm">Clear Key</button>
        </div>
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
    <div class="overview-layout">
      <div class="overview-main">
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
        </div>
      </div>

      <aside class="personality-panel card" id="personality-panel">
        ${buildPersonalityPanelHTML()}
      </aside>
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
  bindPersonalityPanel();
}

function renderPersonalityPanel() {
  const panel = ri('personality-panel');
  if (!panel) return;
  panel.innerHTML = buildPersonalityPanelHTML();
  bindPersonalityPanel();
}

function renderPersonalityLoading() {
  const panel = ri('personality-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="pp-header">
      <h4>Spending Personality</h4>
      <span class="pp-subtitle">Powered by Groq AI</span>
    </div>
    <div class="pp-loading">
      <div class="pp-spinner"></div>
      <p class="pp-hint">Analyzing your budget…</p>
    </div>`;
}

function renderPersonalityResult() {
  renderPersonalityPanel();
}

function renderPersonalityError(message) {
  const panel = ri('personality-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="pp-header">
      <h4>Spending Personality</h4>
      <span class="pp-subtitle">Powered by Groq AI</span>
    </div>
    <div class="pp-error">
      <p class="pp-error-msg">${esc(message)}</p>
      <button id="pp-analyze-btn" class="btn btn-primary btn-sm">Try Again</button>
      <button id="pp-clear-key" class="btn btn-ghost btn-sm">Clear Key</button>
    </div>`;
  bindPersonalityPanel();
}

function bindPersonalityPanel() {
  const analyzeBtn = ri('pp-analyze-btn');
  const keySaveBtn = ri('pp-key-save');
  const clearKeyBtn = ri('pp-clear-key');
  const keyInput = ri('pp-key-input');

  if (analyzeBtn) analyzeBtn.addEventListener('click', () => analyzePersonality());

  if (keySaveBtn) {
    keySaveBtn.addEventListener('click', () => {
      const val = (keyInput?.value || '').trim();
      if (!val) return;
      S.groqKey = val;
      save('groqKey');
      renderPersonalityPanel();
    });
  }

  if (keyInput) {
    keyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') ri('pp-key-save')?.click();
    });
  }

  if (clearKeyBtn) {
    clearKeyBtn.addEventListener('click', () => {
      S.groqKey = '';
      S.groqProfile = null;
      save('groqKey');
      save('groqProfile');
      renderPersonalityPanel();
    });
  }
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
