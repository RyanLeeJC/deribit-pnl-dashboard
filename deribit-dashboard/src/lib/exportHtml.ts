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
      .grid3 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
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
        <div class="card">
          <p class="label">PERIOD</p>
          <p class="value" id="period">-</p>
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
              <span class="muted" id="volNotionalLabel">Trade Volume (BTC Notional)</span><span id="volSummary" style="font-weight:700;">-</span>
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
            <div style="display:flex; justify-content:space-between; gap:12px; font-size: 13px;">
              <span class="muted">Net Transfers</span><span id="netXferSummary" style="font-weight:700;">-</span>
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
      const DU = model.meta && model.meta.displayUnit ? model.meta.displayUnit : 'BTC';
      const fmtInt = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
      const fmtAmt = (n, min=2, max=8) => new Intl.NumberFormat(undefined, { maximumFractionDigits: max, minimumFractionDigits: min }).format(n) + ' ' + DU;
      const fmtAmt4 = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 }).format(n) + ' ' + DU;
      const fmtQty = (n) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 10, minimumFractionDigits: 0, useGrouping: false }).format(n);
      const fmtDate = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: SGT, day:'2-digit', month:'2-digit', year:'2-digit' }).format(new Date(ms));
      const fmtDateTime = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: SGT, year:'2-digit', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date(ms));
      const sgtDateKey = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: SGT });
      const periodYmd = (fromMs, toMs) => {
        if (fromMs == null || toMs == null) return '-';
        const a = Math.min(fromMs, toMs);
        const b = Math.max(fromMs, toMs);
        const sgtYmd = (ms) => {
          const d = new Date(ms + 8 * 60 * 60 * 1000);
          return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
        };
        const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
        const unit = (n, singular, plural) => (n === 1 ? singular : plural);
        const start = sgtYmd(a);
        const end = sgtYmd(b);
        let y = end.y - start.y;
        let m = end.m - start.m;
        let d = end.d - start.d;
        if (d < 0) {
          m -= 1;
          const prevMonth = end.m - 1 <= 0 ? 12 : end.m - 1;
          const prevYear = end.m - 1 <= 0 ? end.y - 1 : end.y;
          d += daysInMonth(prevYear, prevMonth);
        }
        if (m < 0) { y -= 1; m += 12; }
        const parts = [];
        if (y > 0) parts.push(y + ' ' + unit(y, 'Year', 'Years'));
        if (y > 0) {
          if (!(m === 0 && d !== 0)) parts.push(m + ' ' + unit(m, 'Month', 'Months'));
        } else if (m > 0) {
          parts.push(m + ' ' + unit(m, 'Month', 'Months'));
        }
        parts.push(d + ' ' + unit(d, 'Day', 'Days'));
        return parts.join(' ');
      };

      document.getElementById('srcName').textContent = srcName;
      document.getElementById('csvName').textContent = srcName;
      document.getElementById('genAt').textContent = fmtDateTime(model.meta.generatedAt);
      const volLab = document.getElementById('volNotionalLabel');
      if (volLab) volLab.textContent = 'Trade Volume (' + DU + ' Notional)';

      document.getElementById('pnlCurrent').textContent =
        model.totals.pnlCurrent == null ? '-' : fmtAmt4(model.totals.pnlCurrent);
      document.getElementById('realisedTotal').textContent = fmtAmt4(model.totals.realisedPnl);
      document.getElementById('feesTotal').textContent = fmtAmt(model.totals.feeCharged);
      document.getElementById('period').textContent = periodYmd(model.meta.from, model.meta.to);
      const setTone = (id, n) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) { el.style.color = ''; return; }
        el.style.color = n > 0 ? '#21AC77' : '#E34951';
      };
      setTone('pnlCurrent', model.totals.pnlCurrent);
      setTone('realisedTotal', model.totals.realisedPnl);

      document.getElementById('eqSummary').textContent =
        model.totals.equityCurrent == null ? '-' : fmtAmt4(model.totals.equityCurrent);
      document.getElementById('volSummary').textContent = fmtAmt(model.totals.tradeVolumeBtcNotional, 2, 2);
      document.getElementById('netDepSummary').textContent = fmtAmt(model.totals.netDeposit);
      // Back-compat: older exports won't have this field.
      if (document.getElementById('netXferSummary')) {
        const nx = (model.totals && typeof model.totals.netTransfers === 'number') ? model.totals.netTransfers : 0;
        document.getElementById('netXferSummary').textContent = fmtAmt(nx);
      }
      document.getElementById('depSummary').textContent = fmtAmt(model.totals.deposits);
      document.getElementById('wdSummary').textContent = fmtAmt(model.totals.withdrawals);

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
          tr.appendChild(td(r.cashFlow == null ? '-' : fmtAmt(r.cashFlow), 'right'));
          tr.appendChild(td(r.feeCharged == null ? '-' : fmtAmt(r.feeCharged), 'right'));
          body.appendChild(tr);
        }
      }

      function renderTransfers() {
        setHead(\`<tr>
          <th>Date</th>
          <th>IN/OUT</th><th class="right">Change</th>
          <th class="right">Resulting Equity</th>
          <th>Info</th>
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
          tr.appendChild(
            td(typeof r.change === 'number' && Number.isFinite(r.change) && r.change > 0 ? 'IN' : 'OUT'),
          );
          tr.appendChild(td(r.change == null ? '-' : fmtAmt(r.change), 'right'));
          tr.appendChild(td(r.equity == null ? '-' : fmtAmt(r.equity), 'right'));
          const info = document.createElement('td');
          info.className = 'truncate';
          {
            const s = String(r.info ?? '').trim();
            const idx = s.indexOf('.');
            info.textContent = s ? (idx >= 0 ? s.slice(0, idx) : s).trim() : '-';
          }
          tr.appendChild(info);
          body.appendChild(tr);
        }
      }

      function renderRealised() {
        setHead(\`<tr>
          <th>Date</th><th>Side</th><th>Instrument</th><th class="right">Amount</th>
          <th class="right">Realised PnL</th><th class="right">ROI%</th><th class="right">Closing Index Price</th><th class="right">Fee</th>
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
          {
            const sideTd = td(r.side || '-');
            if (r.side === 'BUY') sideTd.style.color = '#21AC77';
            else if (r.side === 'SELL') sideTd.style.color = '#E34951';
            tr.appendChild(sideTd);
          }
          tr.appendChild(td(r.instrument));
          tr.appendChild(td(fmtQty(r.amount), 'right'));
          {
            const pnlTd = td(fmtAmt(r.realisedPnl), 'right');
            if (typeof r.realisedPnl === 'number' && Number.isFinite(r.realisedPnl) && r.realisedPnl !== 0) {
              pnlTd.style.color = r.realisedPnl > 0 ? '#21AC77' : '#E34951';
            }
            tr.appendChild(pnlTd);
          }
          {
            const roiTd = td(
              r.roi == null || !Number.isFinite(r.roi) ? '-' : String((r.roi * 100).toFixed(2)) + '%',
              'right',
            );
            if (typeof r.roi === 'number' && Number.isFinite(r.roi) && r.roi !== 0) {
              roiTd.style.color = r.roi > 0 ? '#21AC77' : '#E34951';
            }
            tr.appendChild(roiTd);
          }
          tr.appendChild(
            td(
              r.closingIndexPrice == null || !Number.isFinite(r.closingIndexPrice)
                ? '-'
                : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(
                    r.closingIndexPrice,
                  ),
              'right',
            ),
          );
          tr.appendChild(td(fmtAmt(r.fee), 'right'));
          body.appendChild(tr);
        }
      }

      function renderNegBalFees() {
        setHead(\`<tr>
          <th>Date</th><th class="right">Fee Charged</th>
        </tr>\`);
        clearBody();
        for (const r of (model.tables.negativeBalanceFees || []).slice(0, 50)) {
          const tr = document.createElement('tr');
          const td = (t, cls) => {
            const el = document.createElement('td');
            if (cls) el.className = cls;
            el.textContent = t;
            return el;
          };
          tr.appendChild(td(fmtDateTime(r.t)));
          const txt = (r.feeChargedText || '').trim();
          tr.appendChild(td(txt ? (txt + ' ' + DU) : (r.feeCharged == null ? '-' : (String(r.feeCharged) + ' ' + DU)), 'right'));
          body.appendChild(tr);
        }
      }

      function renderTable() {
        if (activeTable === 'trades') renderTrades();
        else if (activeTable === 'transfers') renderTransfers();
        else if (activeTable === 'realisedPnl') renderRealised();
        else renderNegBalFees();
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
        mk('realisedPnl', 'Realised PnL');
        mk('negativeBalanceFees', 'Negative Balance Fees');
        mk('trades', 'Recent Trades');
        mk('transfers', 'Transfers');
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
              y == null || !Number.isFinite(y) ? '-' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6, minimumFractionDigits: 2 }).format(y) + ' ' + DU;
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
