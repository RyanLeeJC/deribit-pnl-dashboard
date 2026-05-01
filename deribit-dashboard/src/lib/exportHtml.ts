import type { DashboardModel } from './dashboardModel'

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function jsonForInlineScriptTag(value: unknown): string {
  // IMPORTANT: do NOT HTML-escape quotes inside JSON for <script type="application/json">,
  // otherwise JSON.parse will see &quot; and fail.
  //
  // We only need to prevent closing the surrounding </script> tag if the JSON contains "</script>".
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

export function generateStandaloneHtml(args: {
  title: string
  sourceFileName: string
  model: DashboardModel
}): string {
  const modelJson = jsonForInlineScriptTag(args.model)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(args.title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #09090b;
        color: #f4f4f5;
      }
      .container { max-width: 1120px; margin: 0 auto; padding: 22px 16px 28px; }
      .title { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; margin: 0; }
      .subtitle { margin: 8px 0 0; color: #a1a1aa; font-size: 13px; }
      .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
      .card {
        border: 1px solid #27272a;
        background: #18181b;
        border-radius: 14px;
        padding: 14px;
      }
      .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa; margin: 0 0 6px; }
      .value { font-size: 18px; font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }
      .layout2 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 12px; align-items: stretch; }
      @media (max-width: 980px) {
        .layout2 { grid-template-columns: 1fr; }
        .grid3 { grid-template-columns: 1fr; }
      }
      .tabs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .tab {
        border: 1px solid #27272a;
        background: #0b0b0f;
        color: #e4e4e7;
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
      }
      .tab.active { background: #f4f4f5; color: #111827; border-color: #f4f4f5; }
      .muted { color: #a1a1aa; font-size: 12px; }
      .chart { height: 320px; margin-top: 12px; }
      .tableWrap { overflow-x: auto; border-top: 1px solid #27272a; }
      table { border-collapse: collapse; width: 100%; font-size: 13px; }
      th, td { padding: 10px 12px; border-bottom: 1px solid #27272a; white-space: nowrap; }
      th { text-align: left; font-size: 12px; color: #a1a1aa; background: rgba(255,255,255,0.03); }
      .right { text-align: right; }
      .truncate { max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
    </style>
  </head>
  <body>
    <div class="container">
      <div>
        <h1 class="title">${escapeHtml(args.title)}</h1>
        <p class="subtitle">
          Source CSV: <span id="srcName"></span> • Generated: <span id="genAt"></span>
        </p>
      </div>

      <div class="grid3">
        <div class="card">
          <p class="label">PNL (CURRENT)</p>
          <p class="value" id="pnlCurrent">-</p>
        </div>
        <div class="card">
          <p class="label">REALISED PNL (TOTAL)</p>
          <p class="value" id="realisedTotal">-</p>
        </div>
        <div class="card">
          <p class="label">FEES (TOTAL)</p>
          <p class="value" id="feesTotal">-</p>
        </div>
      </div>

      <div class="layout2">
        <div class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div class="tabs" id="chartTabs"></div>
            <div class="muted" id="csvName"></div>
          </div>
          <div class="chart"><canvas id="mainChart"></canvas></div>
        </div>

        <div class="card" style="display:flex; flex-direction:column;">
          <div style="font-weight:700; font-size: 14px;">Account summary</div>
          <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px; flex:1;">
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Equity</span><span id="eqSummary" style="font-weight:700;">-</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Trade Volume (BTC Notional)</span><span id="volSummary" style="font-weight:700;">-</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Net Deposit</span><span id="netDepSummary" style="font-weight:700;">-</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Deposits</span><span id="depSummary" style="font-weight:700;">-</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Withdrawals</span><span id="wdSummary" style="font-weight:700;">-</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div class="tabs" id="tableTabs"></div>
          <div class="muted">Showing up to 50 rows</div>
        </div>
        <div class="tableWrap">
          <table>
            <thead id="tableHead"></thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <script id="dashboardModel" type="application/json">${modelJson}</script>
    <script>
      const model = JSON.parse(document.getElementById('dashboardModel').textContent);
      const srcName = ${JSON.stringify(args.sourceFileName)};

      const SGT = 'Asia/Singapore';
      const fmtInt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
      const fmtBtc = (n, min=2, max=8) => new Intl.NumberFormat(undefined, { maximumFractionDigits: max, minimumFractionDigits: min }).format(n) + ' BTC';
      const fmtBtc4 = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 }).format(n) + ' BTC';
      const fmtDate = (ms) => new Intl.DateTimeFormat(undefined, { timeZone: SGT, year:'2-digit', month:'2-digit', day:'2-digit' }).format(new Date(ms));
      const fmtDateTime = (ms) => new Intl.DateTimeFormat(undefined, { timeZone: SGT, year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(ms));
      const sgtDateKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: SGT });

      document.getElementById('srcName').textContent = srcName;
      document.getElementById('csvName').textContent = srcName;
      document.getElementById('genAt').textContent = fmtDateTime(model.meta.generatedAt);

      document.getElementById('pnlCurrent').textContent =
        model.totals.pnlCurrent == null ? '-' : fmtBtc4(model.totals.pnlCurrent);
      document.getElementById('realisedTotal').textContent = fmtBtc4(model.totals.realisedPnl);
      document.getElementById('feesTotal').textContent = fmtBtc(model.totals.feeCharged);

      document.getElementById('eqSummary').textContent =
        model.totals.equityCurrent == null ? '-' : fmtBtc4(model.totals.equityCurrent);
      document.getElementById('volSummary').textContent = fmtBtc(model.totals.tradeVolumeBtcNotional, 2, 2);
      document.getElementById('netDepSummary').textContent = fmtBtc(model.totals.netDeposit);
      document.getElementById('depSummary').textContent = fmtBtc(model.totals.deposits);
      document.getElementById('wdSummary').textContent = fmtBtc(model.totals.withdrawals);

      // Tables
      let activeTable = 'trades';
      const head = document.getElementById('tableHead');
      const body = document.getElementById('tableBody');

      function setHead(html) { head.innerHTML = html; }
      function clearBody() { body.innerHTML = ''; }

      function renderTrades() {
        setHead(\`<tr>
          <th>Date</th><th>Instrument</th><th>Side</th>
          <th class="right">Amount</th><th class="right">Price</th>
          <th class="right">Cash flow</th><th class="right">Fee</th>
        </tr>\`);
        clearBody();
        for (const r of (model.tables.recentTrades || []).slice(0, 50)) {
          const tr = document.createElement('tr');
          const td = (t, cls) => {
            const el = document.createElement('td');
            if (cls) el.className = cls;
            el.textContent = t;
            return el;
          };
          tr.appendChild(td(fmtDateTime(r.t)));
          tr.appendChild(td(r.instrument ?? '-'));
          tr.appendChild(td(r.side ?? '-'));
          tr.appendChild(td(r.amount == null ? '-' : String(r.amount), 'right'));
          tr.appendChild(td(r.price == null ? '-' : String(r.price), 'right'));
          tr.appendChild(td(r.cashFlow == null ? '-' : fmtBtc(r.cashFlow), 'right'));
          tr.appendChild(td(r.feeCharged == null ? '-' : fmtBtc(r.feeCharged), 'right'));
          body.appendChild(tr);
        }
      }

      function renderTransfers() {
        setHead(\`<tr>
          <th>Date</th><th>Type</th>
          <th class="right">Cash flow</th><th class="right">Change</th>
          <th class="right">Balance</th><th class="right">Equity</th>
          <th>Note</th>
        </tr>\`);
        clearBody();
        for (const r of (model.tables.transfers || []).slice(0, 50)) {
          const tr = document.createElement('tr');
          const td = (t, cls) => {
            const el = document.createElement('td');
            if (cls) el.className = cls;
            el.textContent = t;
            return el;
          };
          tr.appendChild(td(fmtDateTime(r.t)));
          tr.appendChild(td(r.type));
          tr.appendChild(td(r.cashFlow == null ? '-' : fmtBtc(r.cashFlow), 'right'));
          tr.appendChild(td(r.change == null ? '-' : fmtBtc(r.change), 'right'));
          tr.appendChild(td(r.balance == null ? '-' : fmtBtc(r.balance), 'right'));
          tr.appendChild(td(r.equity == null ? '-' : fmtBtc(r.equity), 'right'));
          const n = document.createElement('td');
          n.className = 'truncate';
          n.textContent = r.note ?? r.info ?? '-';
          tr.appendChild(n);
          body.appendChild(tr);
        }
      }

      function renderRealised() {
        setHead(\`<tr>
          <th>Date</th><th>Instrument</th><th class="right">Amount</th>
          <th class="right">Realised PnL</th><th class="right">Fee</th>
        </tr>\`);
        clearBody();
        for (const r of (model.tables.realisedPnl || []).slice(0, 50)) {
          const tr = document.createElement('tr');
          const td = (t, cls) => {
            const el = document.createElement('td');
            if (cls) el.className = cls;
            el.textContent = t;
            return el;
          };
          tr.appendChild(td(fmtDateTime(r.t)));
          tr.appendChild(td(r.instrument));
          tr.appendChild(td(String(r.amount), 'right'));
          tr.appendChild(td(fmtBtc(r.realisedPnl), 'right'));
          tr.appendChild(td(fmtBtc(r.fee), 'right'));
          body.appendChild(tr);
        }
      }

      function renderTable() {
        if (activeTable === 'trades') renderTrades();
        else if (activeTable === 'transfers') renderTransfers();
        else renderRealised();
      }

      function renderTableTabs() {
        const root = document.getElementById('tableTabs');
        const mk = (id, label) => {
          const b = document.createElement('button');
          b.className = 'tab' + (id === activeTable ? ' active' : '');
          b.type = 'button';
          b.textContent = label;
          b.onclick = () => {
            activeTable = id;
            Array.from(root.querySelectorAll('button')).forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            renderTable();
          };
          root.appendChild(b);
        };
        mk('trades', 'Recent trades');
        mk('transfers', 'Transfers');
        mk('realisedPnl', 'Realised PnL');
      }

      renderTableTabs();
      renderTable();
    </script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script>
      const equityPoints = (model.series.equity || []).map(p => ({ x: p.t, y: p.equity }));
      const pnlPoints = (model.series.pnl || []).map(p => ({ x: p.t, y: p.pnl }));

      function buildRealisedStepSeries() {
        const dailyDelta = new Map();
        for (const row of (model.tables.realisedPnl || [])) {
          const key = sgtDateKey(row.t);
          dailyDelta.set(key, (dailyDelta.get(key) || 0) + row.realisedPnl);
        }

        const equitySeries = model.series.equity || [];
        if (!equitySeries.length) return [];

        const minT = Math.min(...equitySeries.map(p => p.t));
        const maxT = Math.max(...equitySeries.map(p => p.t));
        const startKey = sgtDateKey(minT);
        const endKey = sgtDateKey(maxT);

        const parseDayKeyToUtcMs = (dayKey) => {
          const [y,m,d] = dayKey.split('-').map(Number);
          return Date.UTC(y, m - 1, d, 12, 0, 0);
        };
        const addOneDayKey = (dayKey) => {
          const ms = parseDayKeyToUtcMs(dayKey);
          const next = new Date(ms + 24 * 60 * 60 * 1000);
          return next.toLocaleDateString('en-CA', { timeZone: SGT });
        };

        const dayKeys = [];
        for (let k = startKey; k.localeCompare(endKey) <= 0; k = addOneDayKey(k)) dayKeys.push(k);

        let cumulative = 0;
        return dayKeys.map((dayKey) => {
          cumulative += dailyDelta.get(dayKey) || 0;
          return { x: parseDayKeyToUtcMs(dayKey), y: cumulative };
        });
      }

      const realisedPoints = buildRealisedStepSeries();

      let chart;
      let activeChart = 'equity';

      const commonTicks = {
        color: '#a1a1aa',
        font: { size: 11 },
      };

      /** Lock linear time axis to actual data (Chart.js otherwise pads the domain). */
      function xExtentsMs(points) {
        const xs = points.map((p) => p.x).filter((x) => typeof x === 'number' && Number.isFinite(x));
        if (!xs.length) return null;
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        if (min === max) {
          const pad = 24 * 60 * 60 * 1000;
          return { min: min - pad, max: max + pad };
        }
        return { min, max };
      }

      const tooltipPlugin = {
        callbacks: {
          title(items) {
            const x = items[0]?.parsed?.x;
            return typeof x === 'number' && Number.isFinite(x) ? fmtDate(x) : '';
          },
          label(ctx) {
            const name = ctx.dataset.label || '';
            const y = ctx.parsed.y;
            const yStr =
              y == null || !Number.isFinite(y) ? '-' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 2 }).format(y) + ' BTC';
            return name ? name + ': ' + yStr : yStr;
          },
        },
      };

      function showChartLoadError(msg) {
        const root = document.getElementById('chartTabs');
        if (root) root.innerHTML = '';
        const canvas = document.getElementById('mainChart');
        if (!canvas) return;
        const p = document.createElement('p');
        p.className = 'muted';
        p.style.margin = '10px 0 0';
        p.textContent = msg;
        canvas.insertAdjacentElement('afterend', p);
      }

      function makeChart(mode) {
        if (typeof Chart === 'undefined') {
          showChartLoadError('Charts could not load (Chart.js missing). KPIs and tables above should still be populated.');
          return;
        }
        const ctx = document.getElementById('mainChart').getContext('2d');
        if (chart) chart.destroy();

        const equityX = xExtentsMs(equityPoints);
        const pnlX = xExtentsMs(pnlPoints);
        const realisedX = xExtentsMs(realisedPoints);

        if (mode === 'equity') {
          chart = new Chart(ctx, {
            type: 'line',
            data: {
              datasets: [{
                label: 'Equity',
                data: equityPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.12)',
                tension: 0.25,
                pointRadius: 0,
                spanGaps: true,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: false }, tooltip: tooltipPlugin },
              scales: {
                x: {
                  type: 'linear',
                  min: equityX?.min,
                  max: equityX?.max,
                  ticks: {
                    ...commonTicks,
                    maxTicksLimit: 8,
                    callback: (v) => fmtDate(Number(v)),
                  },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
                y: {
                  ticks: { ...commonTicks, callback: (v) => Number(v).toFixed(4) },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
              },
            },
          });
        } else if (mode === 'pnl') {
          chart = new Chart(ctx, {
            type: 'line',
            data: {
              datasets: [{
                label: 'PNL',
                data: pnlPoints,
                borderColor: '#eab308',
                backgroundColor: 'rgba(234,179,8,0.12)',
                tension: 0.25,
                pointRadius: 0,
                spanGaps: true,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: false }, tooltip: tooltipPlugin },
              scales: {
                x: {
                  type: 'linear',
                  min: pnlX?.min,
                  max: pnlX?.max,
                  ticks: { ...commonTicks, maxTicksLimit: 8, callback: (v) => fmtDate(Number(v)) },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
                y: {
                  ticks: { ...commonTicks, callback: (v) => Number(v).toFixed(4) },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
              },
            },
          });
        } else {
          chart = new Chart(ctx, {
            type: 'line',
            data: {
              datasets: [{
                label: 'Realised PnL (cumulative)',
                data: realisedPoints,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.10)',
                stepped: 'after',
                tension: 0,
                pointRadius: 0,
                spanGaps: true,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: false }, tooltip: tooltipPlugin },
              scales: {
                x: {
                  type: 'linear',
                  min: realisedX?.min,
                  max: realisedX?.max,
                  ticks: { ...commonTicks, maxTicksLimit: 8, callback: (v) => fmtDate(Number(v)) },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
                y: {
                  ticks: { ...commonTicks, callback: (v) => Number(v).toFixed(4) },
                  grid: { color: 'rgba(120,120,120,0.18)' },
                },
              },
            },
          });
        }
      }

      function renderChartTabs() {
        const root = document.getElementById('chartTabs');
        const mk = (id, label) => {
          const b = document.createElement('button');
          b.className = 'tab' + (id === activeChart ? ' active' : '');
          b.type = 'button';
          b.textContent = label;
          b.onclick = () => {
            activeChart = id;
            Array.from(root.querySelectorAll('button')).forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            makeChart(activeChart);
          };
          root.appendChild(b);
        };
        mk('equity', 'Equity');
        mk('pnl', 'PNL');
        mk('realisedPnl', 'Realised PnL');
      }

      renderChartTabs();
      makeChart(activeChart);
    </script>
  </body>
</html>`
}
