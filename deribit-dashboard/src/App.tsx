import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildDashboardModel } from './lib/dashboardModel'
import type { DashboardModel } from './lib/dashboardModel'
import { ACCOUNT_FIELD_INFO } from './lib/accountFieldInfo'
import { parseDeribitCsv, sortChronological } from './lib/deribitCsv'
import { generateStandaloneHtml } from './lib/exportHtml'
import { formatAsset, formatAssetFixed, formatDate, formatDateTime, formatPeriod, sgtDateKey } from './lib/format'

type LoadedState = {
  fileName: string
  model: DashboardModel
  warnings: string[]
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [homeConfirmOpen, setHomeConfirmOpen] = useState(false)
  const [tableTab, setTableTab] = useState<
    'trades' | 'transfers' | 'realisedPnl' | 'negativeBalanceFees'
  >('realisedPnl')
  const [chartTab, setChartTab] = useState<'equity' | 'realisedPnl' | 'pnl'>('equity')
  const [pnlCalOpen, setPnlCalOpen] = useState(false)
  const [pnlCalMonth, setPnlCalMonth] = useState<{ y: number; m: number } | null>(null)

  const goHome = () => {
    setPnlCalOpen(false)
    setPnlCalMonth(null)
    setLoaded(null)
    setError(null)
  }

  const equityData = useMemo(() => {
    if (!loaded) return []
    return loaded.model.series.equity.map((p) => ({
      t: p.t,
      equity: p.equity,
    }))
  }, [loaded])

  const realisedPnlChartData = useMemo(() => {
    if (!loaded) return []

    // Daily realised PnL deltas (SGT), summed if multiple closes happen same day.
    const dailyDelta = new Map<string, number>()
    for (const row of loaded.model.tables.realisedPnl) {
      const key = sgtDateKey(row.t)
      dailyDelta.set(key, (dailyDelta.get(key) ?? 0) + row.realisedPnl)
    }

    if (equityData.length === 0) return []

    // Same day granularity as Equity chart: one point per SGT calendar day from first equity point to last.
    const minT = Math.min(...equityData.map((p) => p.t))
    const maxT = Math.max(...equityData.map((p) => p.t))
    const startKey = sgtDateKey(minT)
    const endKey = sgtDateKey(maxT)

    const parseDayKeyToUtcMs = (dayKey: string): number => {
      const [y, m, d] = dayKey.split('-').map((x) => Number(x))
      return Date.UTC(y, m - 1, d, 12, 0, 0)
    }

    const addOneDayKey = (dayKey: string): string => {
      const ms = parseDayKeyToUtcMs(dayKey)
      const next = new Date(ms + 24 * 60 * 60 * 1000)
      return next.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
    }

    const dayKeys: string[] = []
    for (let k = startKey; k.localeCompare(endKey) <= 0; k = addOneDayKey(k)) {
      dayKeys.push(k)
    }

    let cumulative = 0
    return dayKeys.map((dayKey) => {
      cumulative += dailyDelta.get(dayKey) ?? 0
      return {
        t: parseDayKeyToUtcMs(dayKey),
        realisedPnl: cumulative,
      }
    })
  }, [loaded, equityData])

  const pnlChartData = useMemo(() => {
    if (!loaded) return []
    return loaded.model.series.pnl.map((p) => ({
      t: p.t,
      pnl: p.pnl,
    }))
  }, [loaded])

  const realisedByDayKey = useMemo(() => {
    if (!loaded) return { byDay: new Map<string, number>(), minT: null as number | null, maxT: null as number | null }
    const m = new Map<string, number>()
    let minT: number | null = null
    let maxT: number | null = null
    // Sum realised PnL per SGT day (not cumulative).
    for (const r of loaded.model.tables.realisedPnl) {
      const key = sgtDateKey(r.t)
      m.set(key, (m.get(key) ?? 0) + r.realisedPnl)
      minT = minT == null ? r.t : Math.min(minT, r.t)
      maxT = maxT == null ? r.t : Math.max(maxT, r.t)
    }
    return { byDay: m, minT, maxT }
  }, [loaded])

  useEffect(() => {
    if (!loaded) return
    const to = loaded.model.meta.to
    if (to == null) return
    const d = new Date(to)
    const sgt = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    setPnlCalMonth({ y: sgt.getUTCFullYear(), m: sgt.getUTCMonth() + 1 })
  }, [loaded])

  const displayUnit = loaded?.model.meta.displayUnit ?? 'BTC'

  async function onFileSelected(file: File) {
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseDeribitCsv(text)
      const rows = sortChronological(parsed.rows)
      const model = buildDashboardModel(rows)
      setTableTab('realisedPnl')
      setChartTab('equity')
      setLoaded({
        fileName: file.name,
        model,
        warnings: parsed.warnings.map((w) => `Row ${w.rowNumber}: ${w.message}`),
      })
    } catch (e) {
      setLoaded(null)
      setError(e instanceof Error ? e.message : 'Failed to parse file.')
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Deribit transaction log dashboard
            </div>
            <div className="truncate text-lg font-semibold tracking-tight">
              Options account stats (browser-only)
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              onClick={() => {
                if (loaded) setHomeConfirmOpen(true)
                else goHome()
              }}
              title="Home"
            >
              Home
            </button>
            <HoverPopover label="Definitions">
              <div className="space-y-3">
                {ACCOUNT_FIELD_INFO.map((x) => (
                  <div key={x.key}>
                    <div className="text-sm font-semibold text-white">{x.title}</div>
                    <div className="mt-1 text-sm text-zinc-100">{x.description}</div>
                  </div>
                ))}
              </div>
            </HoverPopover>

            {loaded ? (
              <button
                type="button"
                className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  const html = generateStandaloneHtml({
                    title: 'Deribit PnL Dashboard',
                    sourceFileName: loaded.fileName,
                    model: loaded.model,
                  })
                  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `deribit-dashboard-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.html`
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  URL.revokeObjectURL(url)
                }}
              >
                Download HTML
              </button>
            ) : null}

            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              title="Upload a new CSV"
            >
              <input
                className="hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onFileSelected(file)
                  e.currentTarget.value = ''
                }}
              />
              Upload CSV
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {homeConfirmOpen ? (
          <div className="fixed inset-0 z-[70]">
            <button
              type="button"
              className="absolute inset-0 cursor-pointer bg-black/60"
              onClick={() => setHomeConfirmOpen(false)}
              aria-label="Close confirmation"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="pointer-events-auto w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
                <div className="text-sm font-semibold text-zinc-100">This will clear the Dashboard.</div>
                <div className="mt-1 text-sm text-zinc-400">Confirm?</div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                    onClick={() => setHomeConfirmOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
                    onClick={() => {
                      setHomeConfirmOpen(false)
                      goHome()
                    }}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {!loaded ? (
          <label className="block cursor-pointer rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
            <input
              className="hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFileSelected(file)
                e.currentTarget.value = ''
              }}
            />
            <div className="mx-auto max-w-xl space-y-3">
              <div className="text-base font-semibold">Upload your Deribit Transaction Log CSV.</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Your file is processed entirely in the browser. Nothing is uploaded into any servers.
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Go to your{' '}
                <a
                  className="cursor-pointer underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                  href="https://www.deribit.com/account/ETH/transaction"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Transaction Log
                </a>
                , choose your Asset, Date Range, and click on Download Logs.
              </div>
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              ) : null}
              <div className="pt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Click here to upload your .csv log file for analysis.
              </div>
            </div>
          </label>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <StatCard
                label="PNL (CURRENT)"
                value={
                  loaded.model.totals.pnlCurrent == null
                    ? '-'
                    : formatAssetFixed(loaded.model.totals.pnlCurrent, 4, displayUnit)
                }
                valueNumber={loaded.model.totals.pnlCurrent}
                actionLabel="PNL Calendar"
                onAction={() => setPnlCalOpen(true)}
              />
              <StatCard
                label="REALISED PNL (TOTAL)"
                value={formatAssetFixed(loaded.model.totals.realisedPnl, 4, displayUnit)}
                valueNumber={loaded.model.totals.realisedPnl}
              />
              <StatCard
                label="FEES (TOTAL)"
                value={formatAsset(loaded.model.totals.feeCharged, displayUnit)}
              />
              <StatCard
                label="PERIOD"
                value={formatPeriod(loaded.model.meta.from, loaded.model.meta.to)}
              />
            </section>

            {pnlCalOpen && loaded && pnlCalMonth ? (
              <PnlCalendarModal
                displayUnit={displayUnit}
                month={pnlCalMonth}
                onChangeMonth={setPnlCalMonth}
                onClose={() => setPnlCalOpen(false)}
                valueByDayKey={realisedByDayKey.byDay}
                minT={realisedByDayKey.minT}
                maxT={realisedByDayKey.maxT}
              />
            ) : null}

            <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
              <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChartTab('equity')}
                      className={[
                        'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                        chartTab === 'equity'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                      ].join(' ')}
                    >
                      Equity
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartTab('pnl')}
                      className={[
                        'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                        chartTab === 'pnl'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                      ].join(' ')}
                    >
                      PNL
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartTab('realisedPnl')}
                      className={[
                        'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                        chartTab === 'realisedPnl'
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                      ].join(' ')}
                    >
                      Realised PnL
                    </button>
                  </div>
                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {loaded.fileName}
                  </div>
                </div>
                <div className="mt-3 h-72 min-h-[18rem] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartTab === 'equity' ? (
                      <LineChart data={equityData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.25)" />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(v) => formatDate(Number(v))}
                          minTickGap={24}
                        />
                        <YAxis tickFormatter={(v) => `${Number(v).toFixed(3)}`} width={56} />
                        <Tooltip
                          labelFormatter={(v) => formatDate(Number(v))}
                          formatter={(v) =>
                            typeof v === 'number'
                              ? `${v.toFixed(6)} ${displayUnit}`
                              : String(v)
                          }
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.12)',
                            borderRadius: 10,
                            color: '#000000',
                          }}
                          labelStyle={{
                            color: '#000000',
                            fontWeight: 600,
                          }}
                          itemStyle={{
                            color: '#000000',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          dot={false}
                          strokeWidth={2}
                          stroke="#3b82f6"
                        />
                      </LineChart>
                    ) : chartTab === 'realisedPnl' ? (
                      <LineChart data={realisedPnlChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.25)" />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(v) => formatDate(Number(v))}
                          minTickGap={24}
                        />
                        <YAxis tickFormatter={(v) => `${Number(v).toFixed(4)}`} width={56} />
                        <Tooltip
                          labelFormatter={(v) => formatDate(Number(v))}
                          formatter={(v) =>
                            typeof v === 'number'
                              ? `${v.toFixed(6)} ${displayUnit}`
                              : String(v)
                          }
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.12)',
                            borderRadius: 10,
                            color: '#000000',
                          }}
                          labelStyle={{
                            color: '#000000',
                            fontWeight: 600,
                          }}
                          itemStyle={{
                            color: '#000000',
                          }}
                        />
                        <Line
                          type="stepAfter"
                          dataKey="realisedPnl"
                          dot={false}
                          strokeWidth={2}
                          stroke="#f97316"
                        />
                      </LineChart>
                    ) : (
                      <LineChart data={pnlChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.25)" />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(v) => formatDate(Number(v))}
                          minTickGap={24}
                        />
                        <YAxis tickFormatter={(v) => `${Number(v).toFixed(4)}`} width={56} />
                        <Tooltip
                          labelFormatter={(v) => formatDate(Number(v))}
                          formatter={(v) =>
                            typeof v === 'number'
                              ? `${v.toFixed(6)} ${displayUnit}`
                              : String(v)
                          }
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid rgba(0,0,0,0.12)',
                            borderRadius: 10,
                            color: '#000000',
                          }}
                          labelStyle={{
                            color: '#000000',
                            fontWeight: 600,
                          }}
                          itemStyle={{
                            color: '#000000',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pnl"
                          dot={false}
                          strokeWidth={2}
                          stroke="#eab308"
                        />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="h-full">
                <Panel title="Account summary">
                  <ul className="space-y-2">
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Equity</span>
                      <span className="font-medium">
                        {loaded.model.totals.equityCurrent == null
                          ? '-'
                          : formatAssetFixed(loaded.model.totals.equityCurrent, 4, displayUnit)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">
                        Trade Volume ({displayUnit} Notional)
                      </span>
                      <span className="font-medium">
                        {formatAsset(loaded.model.totals.tradeVolumeBtcNotional, displayUnit)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Net Deposit</span>
                      <span className="font-medium">
                        {formatAsset(loaded.model.totals.netDeposit, displayUnit)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Deposits</span>
                      <span className="font-medium">
                        {formatAsset(loaded.model.totals.deposits, displayUnit)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Withdrawals</span>
                      <span className="font-medium">
                        {formatAsset(loaded.model.totals.withdrawals, displayUnit)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Net Transfers</span>
                      <span className="font-medium">
                        {formatAsset(loaded.model.totals.netTransfers, displayUnit)}
                      </span>
                    </li>
                  </ul>
                </Panel>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTableTab('realisedPnl')}
                    className={[
                      'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'realisedPnl'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Realised PnL
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableTab('trades')}
                    className={[
                      'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'trades'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Recent Trades
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableTab('negativeBalanceFees')}
                    className={[
                      'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'negativeBalanceFees'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Negative Balance Fees
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableTab('transfers')}
                    className={[
                      'cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'transfers'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Transfers
                  </button>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Showing up to 50 rows
                </div>
              </div>
              <div className="h-[420px] overflow-auto border-t border-zinc-200 dark:border-zinc-800">
                {tableTab === 'trades' ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <tr>
                        <Th>Date</Th>
                        <Th>Instrument</Th>
                        <Th>Side</Th>
                        <Th className="text-right">Amount</Th>
                        <Th className="text-right">Price</Th>
                        <Th className="text-right">Cash flow</Th>
                        <Th className="text-right">Fee</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.recentTrades.map((r) => (
                        <tr key={`${r.t}-${r.orderId ?? ''}-${r.tradeId ?? ''}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap">{r.instrument ?? '-'}</Td>
                          <Td className="whitespace-nowrap">{r.side ?? '-'}</Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.amount == null ? '-' : r.amount}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.price == null ? '-' : r.price}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.cashFlow == null ? '-' : formatAsset(r.cashFlow, displayUnit)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.feeCharged == null ? '-' : formatAsset(r.feeCharged, displayUnit)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : tableTab === 'transfers' ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <tr>
                        <Th>Date</Th>
                        <Th>IN/OUT</Th>
                        <Th className="text-right">Change</Th>
                        <Th className="text-right">Resulting Equity</Th>
                        <Th>Info</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.transfers.slice(0, 50).map((r) => (
                        <tr key={`${r.t}-${r.type}-${r.note ?? ''}-${r.info ?? ''}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap">
                            {typeof r.change === 'number' && Number.isFinite(r.change) && r.change > 0
                              ? 'IN'
                              : 'OUT'}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.change == null ? '-' : formatAsset(r.change, displayUnit)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.equity == null ? '-' : formatAsset(r.equity, displayUnit)}
                          </Td>
                          <Td className="max-w-[28rem] truncate">
                            {(() => {
                              const s = (r.info ?? '').trim()
                              if (!s) return '-'
                              const idx = s.indexOf('.')
                              return (idx >= 0 ? s.slice(0, idx) : s).trim()
                            })()}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : tableTab === 'realisedPnl' ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <tr>
                        <Th>Date</Th>
                        <Th>Side</Th>
                        <Th>Instrument</Th>
                        <Th className="text-right">Amount</Th>
                        <Th className="text-right">Realised PnL</Th>
                        <Th className="text-right">ROI%</Th>
                        <Th className="text-right">Closing Index Price</Th>
                        <Th className="text-right">Fee</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.realisedPnl.slice(0, 50).map((r) => (
                        <tr key={`${r.t}-${r.instrument}-${r.amount}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap">
                            <span
                              style={
                                r.side === 'BUY'
                                  ? { color: '#21AC77' }
                                  : r.side === 'SELL'
                                    ? { color: '#E34951' }
                                    : undefined
                              }
                            >
                              {r.side ?? '-'}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap">{r.instrument}</Td>
                          <Td className="whitespace-nowrap text-right">{formatQty(r.amount)}</Td>
                          <Td className="whitespace-nowrap text-right">
                            <span
                              style={
                                typeof r.realisedPnl === 'number' && Number.isFinite(r.realisedPnl) && r.realisedPnl !== 0
                                  ? { color: r.realisedPnl > 0 ? '#21AC77' : '#E34951' }
                                  : undefined
                              }
                            >
                              {formatAsset(r.realisedPnl, displayUnit)}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            <span
                              style={
                                r.roi == null || !Number.isFinite(r.roi) || r.roi === 0
                                  ? undefined
                                  : { color: r.roi > 0 ? '#21AC77' : '#E34951' }
                              }
                            >
                              {r.roi == null ? '-' : `${(r.roi * 100).toFixed(2)}%`}
                            </span>
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.closingIndexPrice == null
                              ? '-'
                              : new Intl.NumberFormat(undefined, {
                                  maximumFractionDigits: 2,
                                  minimumFractionDigits: 2,
                                }).format(r.closingIndexPrice)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {formatAsset(r.fee, displayUnit)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <tr>
                        <Th>Date</Th>
                        <Th className="text-right">Equity</Th>
                        <Th className="text-right">Fee Charged</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.negativeBalanceFees.slice(0, 50).map((r) => (
                        <tr key={`${r.t}-${r.feeCharged ?? ''}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.equity == null ? '-' : formatAsset(r.equity, displayUnit)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.feeChargedText != null
                              ? `${r.feeChargedText} ${displayUnit}`
                              : r.feeCharged == null
                                ? '-'
                                : `${String(r.feeCharged)} ${displayUnit}`}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {loaded.warnings.length > 0 ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                <div className="text-sm font-semibold">Parse warnings</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {loaded.warnings.slice(0, 20).map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
                {loaded.warnings.length > 20 ? (
                  <div className="mt-2 text-sm opacity-80">
                    Showing 20 of {loaded.warnings.length} warnings.
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  )
}

function Panel(props: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        'flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
        typeof props.className === 'string' ? props.className : '',
      ].join(' ')}
    >
      <div className="text-sm font-semibold">{props.title}</div>
      <div className="mt-3 flex-1">{props.children}</div>
    </div>
  )
}

function formatQty(n: number): string {
  // Avoid floating point artifacts like 0.30000000000000004 in table output.
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 10,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(n)
}

function StatCard(props: {
  label: string
  value: string
  valueNumber?: number | null
  actionLabel?: string
  onAction?: () => void
}) {
  const n = props.valueNumber
  const color =
    typeof n === 'number' && Number.isFinite(n) ? (n > 0 ? '#21AC77' : n < 0 ? '#E34951' : null) : null
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {props.label}
        </div>
        {props.onAction ? (
          <button
            type="button"
            className="flex h-6 items-center cursor-pointer rounded-md border border-zinc-800 bg-zinc-950/40 px-2 text-[11px] font-semibold leading-none text-zinc-100 hover:bg-zinc-800/40"
            onClick={props.onAction}
            title={props.actionLabel ?? 'Open'}
          >
            {props.actionLabel ?? 'Open'}
          </button>
        ) : null}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={color ? { color } : undefined}>
        {props.value}
      </div>
    </div>
  )
}

function monthName(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0))
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d)
}

function sgtDayKeyFromYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmtPnlCell(pnl: number): string {
  // Calendar spec: fixed 4 decimals.
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(pnl)
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim()
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function PnlCalendarModal(props: {
  displayUnit: string
  month: { y: number; m: number }
  onChangeMonth: (m: { y: number; m: number }) => void
  valueByDayKey: Map<string, number>
  minT: number | null
  maxT: number | null
  onClose: () => void
}) {
  const { y, m } = props.month
  const first = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0))
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12, 0, 0)).getUTCDate()
  // Week starts Monday (1) to Sunday (7).
  const firstDow = ((first.getUTCDay() + 6) % 7) + 1
  const padBefore = firstDow - 1
  const weekRows = Math.ceil((padBefore + daysInMonth) / 7)
  const cellW = 80

  const clampMonthFromT = (t: number | null): { y: number; m: number } | null => {
    if (t == null || !Number.isFinite(t)) return null
    const d = new Date(t + 8 * 60 * 60 * 1000) // SGT
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
  }
  const minMonth = clampMonthFromT(props.minT)
  const maxMonth = clampMonthFromT(props.maxT)
  const monthKey = (x: { y: number; m: number }) => x.y * 100 + x.m
  const curKey = monthKey({ y, m })
  const canPrev = minMonth ? curKey > monthKey(minMonth) : true
  const canNext = maxMonth ? curKey < monthKey(maxMonth) : true

  const [calMode, setCalMode] = useState<'month' | 'year'>('month')
  const [yearModeYear, setYearModeYear] = useState<number>(y)
  const [lastMonthInYearMode, setLastMonthInYearMode] = useState<number>(m)

  useEffect(() => {
    // Keep year picker aligned to current month view.
    if (calMode === 'month') {
      setYearModeYear(y)
      setLastMonthInYearMode(m)
    }
  }, [calMode, y, m])

  const clampMonthToBounds = (target: { y: number; m: number }): { y: number; m: number } => {
    let k = monthKey(target)
    if (minMonth) k = Math.max(k, monthKey(minMonth))
    if (maxMonth) k = Math.min(k, monthKey(maxMonth))
    return { y: Math.floor(k / 100), m: k % 100 }
  }

  const monthTotal = useMemo(() => {
    let s = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const key = sgtDayKeyFromYmd(y, m, d)
      s += props.valueByDayKey.get(key) ?? 0
    }
    return s
  }, [props.valueByDayKey, y, m, daysInMonth])

  const monthTotalText = useMemo(() => {
    const n = monthTotal
    if (!Number.isFinite(n)) return '-'
    const fmt = fmtPnlCell(n)
    const sign = n > 0 ? '+' : ''
    return `${sign}${fmt} ${props.displayUnit}`
  }, [monthTotal, props.displayUnit])

  const monthTotalTone =
    !Number.isFinite(monthTotal) || monthTotal === 0 ? undefined : monthTotal > 0 ? '#21AC77' : '#E34951'

  const yearTotals = useMemo(() => {
    const monthToTotal = new Map<number, number>()
    for (const [key, v] of props.valueByDayKey.entries()) {
      // key is YYYY-MM-DD in SGT
      if (key.length < 7) continue
      const yy = Number(key.slice(0, 4))
      const mm = Number(key.slice(5, 7))
      if (!Number.isFinite(yy) || !Number.isFinite(mm)) continue
      if (yy !== yearModeYear) continue
      monthToTotal.set(mm, (monthToTotal.get(mm) ?? 0) + v)
    }
    let yearTotal = 0
    for (const v of monthToTotal.values()) yearTotal += v
    return { monthToTotal, yearTotal }
  }, [props.valueByDayKey, yearModeYear])

  const yearTotalText = useMemo(() => {
    const n = yearTotals.yearTotal
    if (!Number.isFinite(n)) return '-'
    const fmt = fmtPnlCell(n)
    const sign = n > 0 ? '+' : ''
    return `${sign}${fmt} ${props.displayUnit}`
  }, [yearTotals.yearTotal, props.displayUnit])

  const yearTotalTone =
    !Number.isFinite(yearTotals.yearTotal) || yearTotals.yearTotal === 0
      ? undefined
      : yearTotals.yearTotal > 0
        ? '#21AC77'
        : '#E34951'

  const prev = () => {
    if (calMode === 'month') {
      if (!canPrev) return
      const nm = m - 1
      props.onChangeMonth(nm <= 0 ? { y: y - 1, m: 12 } : { y, m: nm })
    } else {
      const minY = minMonth?.y ?? -Infinity
      if (yearModeYear <= minY) return
      setYearModeYear((v) => v - 1)
    }
  }
  const next = () => {
    if (calMode === 'month') {
      if (!canNext) return
      const nm = m + 1
      props.onChangeMonth(nm >= 13 ? { y: y + 1, m: 1 } : { y, m: nm })
    } else {
      const maxY = maxMonth?.y ?? Infinity
      if (yearModeYear >= maxY) return
      setYearModeYear((v) => v + 1)
    }
  }

  const canPrevBtn =
    calMode === 'month' ? canPrev : yearModeYear > (minMonth?.y ?? -Infinity)
  const canNextBtn =
    calMode === 'month' ? canNext : yearModeYear < (maxMonth?.y ?? Infinity)

  const monthLabel = monthName(y, m)
  const yearLabel = String(yearModeYear)

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/60"
        onClick={props.onClose}
        aria-label="Close PNL calendar"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div className="pointer-events-auto h-[620px] w-[640px] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">Realised PnL Calendar</div>
              <div className="mt-0.5 text-xs text-zinc-400"> </div>
            </div>
            <div className="flex items-center gap-1">
              {calMode === 'month' ? (
                <div
                  className="mr-1 text-sm font-semibold tabular-nums"
                  style={monthTotalTone ? { color: monthTotalTone } : undefined}
                  title="Total realised PnL for displayed month"
                >
                  {monthTotalText}
                </div>
              ) : (
                <div
                  className="mr-1 text-sm font-semibold tabular-nums"
                  style={yearTotalTone ? { color: yearTotalTone } : undefined}
                  title="Total realised PnL for displayed year"
                >
                  {yearTotalText}
                </div>
              )}
              <button
                type="button"
                disabled={!canPrevBtn}
                className={[
                  'rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm font-semibold text-zinc-100',
                  canPrevBtn ? 'cursor-pointer hover:bg-zinc-800' : 'cursor-default opacity-50',
                ].join(' ')}
                onClick={prev}
                title={calMode === 'month' ? 'Previous month' : 'Previous year'}
              >
                ‹
              </button>
              {calMode === 'month' ? (
                <button
                  type="button"
                  className="min-w-[100px] cursor-pointer text-center text-xs font-semibold text-zinc-300 hover:text-zinc-100"
                  title="Switch to year view"
                  onClick={() => {
                    setYearModeYear(y)
                    setLastMonthInYearMode(m)
                    setCalMode('year')
                  }}
                >
                  {monthLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="min-w-[100px] cursor-pointer text-center text-xs font-semibold text-zinc-300 hover:text-zinc-100"
                  title="Back to month view"
                  onClick={() => {
                    const target = clampMonthToBounds({ y: yearModeYear, m: lastMonthInYearMode })
                    props.onChangeMonth(target)
                    setCalMode('month')
                  }}
                >
                  {yearLabel}
                </button>
              )}
              <button
                type="button"
                disabled={!canNextBtn}
                className={[
                  'rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm font-semibold text-zinc-100',
                  canNextBtn ? 'cursor-pointer hover:bg-zinc-800' : 'cursor-default opacity-50',
                ].join(' ')}
                onClick={next}
                title={calMode === 'month' ? 'Next month' : 'Next year'}
              >
                ›
              </button>
              <button
                type="button"
                className="ml-2 cursor-pointer rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
                onClick={props.onClose}
              >
                Close
              </button>
            </div>
          </div>

          {calMode === 'month' ? (
            <div className="mt-4 flex h-[calc(100%-56px)] flex-col">
              <div className="grid grid-cols-7 gap-2 text-xs">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="px-2 py-1 text-zinc-400">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-2 flex-1">
                <div
                  className="grid h-full gap-2 text-xs"
                  style={{
                    gridTemplateColumns: `repeat(7, ${cellW}px)`,
                    gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: padBefore }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const day = idx + 1
                    const key = sgtDayKeyFromYmd(y, m, day)
                    const pnl = props.valueByDayKey.get(key) ?? null
                    const tone =
                      pnl == null || !Number.isFinite(pnl)
                        ? null
                        : pnl > 0
                          ? '#21AC77'
                          : pnl < 0
                            ? '#E34951'
                            : null

                    return (
                      <div
                        key={key}
                        className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"
                        style={{
                          width: `${cellW}px`,
                          backgroundImage: tone
                            ? `linear-gradient(${hexToRgba(tone, 0.1)}, ${hexToRgba(tone, 0.1)})`
                            : undefined,
                        }}
                      >
                        <div className="absolute left-2 top-2 text-[11px] font-semibold text-zinc-300">
                          {day}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="text-sm font-semibold tabular-nums"
                            style={
                              tone
                                ? { color: tone }
                                : pnl == null || !Number.isFinite(pnl)
                                  ? { color: '#a1a1aa' }
                                  : undefined
                            }
                          >
                            {pnl == null || !Number.isFinite(pnl) ? '-' : fmtPnlCell(pnl)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex h-[calc(100%-56px)] flex-col">
              <div
                className="grid grid-cols-4 gap-2"
              >
                {[
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec',
                ].map((label, idx) => {
                  const mm = idx + 1
                  const k = monthKey({ y: yearModeYear, m: mm })
                  const enabled =
                    (!minMonth || k >= monthKey(minMonth)) && (!maxMonth || k <= monthKey(maxMonth))
                  const total = yearTotals.monthToTotal.get(mm) ?? 0
                  const has = enabled && Math.abs(total) > 1e-15 && Number.isFinite(total)
                  const tone = !has ? undefined : total > 0 ? '#21AC77' : '#E34951'
                  const totalText = has ? fmtPnlCell(total) : '-'
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!enabled}
                      className={[
                        'relative aspect-square w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 text-left text-xs font-semibold text-zinc-200',
                        enabled ? 'cursor-pointer hover:bg-zinc-800/60' : 'cursor-default opacity-40',
                      ].join(' ')}
                      style={{
                        backgroundImage: tone
                          ? `linear-gradient(${hexToRgba(tone, 0.1)}, ${hexToRgba(tone, 0.1)})`
                          : undefined,
                      }}
                      onClick={() => {
                        if (!enabled) return
                        props.onChangeMonth({ y: yearModeYear, m: mm })
                        setCalMode('month')
                      }}
                    >
                      <div className="absolute left-2 top-2">{label}</div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="text-sm font-semibold tabular-nums"
                          style={tone ? { color: tone } : totalText === '-' ? { color: '#a1a1aa' } : undefined}
                        >
                          {totalText}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Th(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={[
        'px-4 py-2 font-medium',
        typeof props.className === 'string' ? props.className : '',
      ].join(' ')}
    />
  )
}

function Td(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      {...props}
      className={[
        'px-4 py-2 text-zinc-700 dark:text-zinc-200',
        typeof props.className === 'string' ? props.className : '',
      ].join(' ')}
    />
  )
}

function HoverPopover(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="group relative">
      <button
        type="button"
        className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {props.label}
      </button>
      <div
        className="invisible absolute right-0 top-full z-50 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] translate-y-1 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left shadow-lg backdrop-blur-none transition-all group-hover:visible group-hover:translate-y-0"
      >
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-300">
          Hover definitions
        </div>
        <div className="mt-3 text-zinc-100">{props.children}</div>
      </div>
    </div>
  )
}
