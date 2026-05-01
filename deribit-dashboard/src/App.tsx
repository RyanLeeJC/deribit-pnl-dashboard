import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildDashboardModel } from './lib/dashboardModel'
import type { DashboardModel } from './lib/dashboardModel'
import { ACCOUNT_FIELD_INFO } from './lib/accountFieldInfo'
import { parseDeribitCsv, sortChronological } from './lib/deribitCsv'
import { generateStandaloneHtml } from './lib/exportHtml'
import { formatBtc, formatBtcFixed, formatDate, formatDateTime, sgtDateKey } from './lib/format'

type LoadedState = {
  fileName: string
  model: DashboardModel
  warnings: string[]
}

export default function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCsv, setLastCsv] = useState<{ fileName: string; text: string } | null>(null)
  const [tableTab, setTableTab] = useState<'trades' | 'transfers' | 'realisedPnl'>('trades')
  const [chartTab, setChartTab] = useState<'equity' | 'realisedPnl' | 'pnl'>('equity')

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

  async function onFileSelected(file: File) {
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseDeribitCsv(text)
      const rows = sortChronological(parsed.rows)
      const model = buildDashboardModel(rows)
      setLastCsv({ fileName: file.name, text })
      setTableTab('trades')
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

  function refreshFromLastCsv() {
    if (!lastCsv) return
    setError(null)
    try {
      const parsed = parseDeribitCsv(lastCsv.text)
      const rows = sortChronological(parsed.rows)
      const model = buildDashboardModel(rows)
      setTableTab((t) => t)
      setChartTab((t) => t)
      setLoaded({
        fileName: lastCsv.fileName,
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
            <HoverPopover label="Definitions">
              <div className="space-y-3">
                {ACCOUNT_FIELD_INFO.map((x) => (
                  <div key={x.key}>
                    <div className="text-sm font-semibold text-black">{x.title}</div>
                    <div className="mt-1 text-sm text-zinc-700">{x.description}</div>
                  </div>
                ))}
              </div>
            </HoverPopover>

            {loaded ? (
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={refreshFromLastCsv}
                title="Recompute dashboard from last uploaded CSV"
              >
                Refresh
              </button>
            ) : null}

            {loaded ? (
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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
            {loaded ? (
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  setLoaded(null)
                  setError(null)
                  setLastCsv(null)
                }}
              >
                Clear
              </button>
            ) : null}

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white">
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
              <div className="text-base font-semibold">Upload your Deribit transaction log CSV.</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Your file is processed entirely in the browser. Nothing is uploaded.
              </div>
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              ) : null}
              <div className="pt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Click to upload
              </div>
            </div>
          </label>
        ) : (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <StatCard
                label="PNL (CURRENT)"
                value={
                  loaded.model.totals.pnlCurrent == null
                    ? '-'
                    : formatBtcFixed(loaded.model.totals.pnlCurrent, 4)
                }
              />
              <StatCard
                label="REALISED PNL (TOTAL)"
                value={formatBtcFixed(loaded.model.totals.realisedPnl, 4)}
              />
              <StatCard label="FEES (TOTAL)" value={formatBtc(loaded.model.totals.feeCharged)} />
            </section>

            <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
              <div className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChartTab('equity')}
                      className={[
                        'rounded-md px-3 py-1.5 text-sm font-semibold',
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
                        'rounded-md px-3 py-1.5 text-sm font-semibold',
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
                        'rounded-md px-3 py-1.5 text-sm font-semibold',
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
                            typeof v === 'number' ? `${v.toFixed(6)} BTC` : String(v)
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
                            typeof v === 'number' ? `${v.toFixed(6)} BTC` : String(v)
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
                            typeof v === 'number' ? `${v.toFixed(6)} BTC` : String(v)
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
                          : formatBtcFixed(loaded.model.totals.equityCurrent, 4)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">
                        Trade Volume (BTC Notional)
                      </span>
                      <span className="font-medium">
                        {formatBtc(loaded.model.totals.tradeVolumeBtcNotional)}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Net Deposit</span>
                      <span className="font-medium">{formatBtc(loaded.model.totals.netDeposit)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Deposits</span>
                      <span className="font-medium">{formatBtc(loaded.model.totals.deposits)}</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">Withdrawals</span>
                      <span className="font-medium">
                        {formatBtc(loaded.model.totals.withdrawals)}
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
                    onClick={() => setTableTab('trades')}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'trades'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Recent trades
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableTab('transfers')}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'transfers'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Transfers
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableTab('realisedPnl')}
                    className={[
                      'rounded-md px-3 py-1.5 text-sm font-semibold',
                      tableTab === 'realisedPnl'
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
                    ].join(' ')}
                  >
                    Realised PnL
                  </button>
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Showing up to 50 rows
                </div>
              </div>
              <div className="overflow-x-auto border-t border-zinc-200 dark:border-zinc-800">
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
                            {r.cashFlow == null ? '-' : formatBtc(r.cashFlow)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.feeCharged == null ? '-' : formatBtc(r.feeCharged)}
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
                        <Th>Type</Th>
                        <Th className="text-right">Cash flow</Th>
                        <Th className="text-right">Change</Th>
                        <Th className="text-right">Balance</Th>
                        <Th className="text-right">Equity</Th>
                        <Th>Note</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.transfers.slice(0, 50).map((r) => (
                        <tr key={`${r.t}-${r.type}-${r.note ?? ''}-${r.info ?? ''}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap">{r.type}</Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.cashFlow == null ? '-' : formatBtc(r.cashFlow)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.change == null ? '-' : formatBtc(r.change)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.balance == null ? '-' : formatBtc(r.balance)}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {r.equity == null ? '-' : formatBtc(r.equity)}
                          </Td>
                          <Td className="max-w-[36rem] truncate">{r.note ?? r.info ?? '-'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-400">
                      <tr>
                        <Th>Date</Th>
                        <Th>Instrument</Th>
                        <Th className="text-right">Amount</Th>
                        <Th className="text-right">Realised PnL</Th>
                        <Th className="text-right">Fee</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {loaded.model.tables.realisedPnl.slice(0, 50).map((r) => (
                        <tr key={`${r.t}-${r.instrument}-${r.amount}`}>
                          <Td className="whitespace-nowrap">{formatDateTime(r.t)}</Td>
                          <Td className="whitespace-nowrap">{r.instrument}</Td>
                          <Td className="whitespace-nowrap text-right">{r.amount}</Td>
                          <Td className="whitespace-nowrap text-right">{formatBtc(r.realisedPnl)}</Td>
                          <Td className="whitespace-nowrap text-right">{formatBtc(r.fee)}</Td>
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

function StatCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {props.label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{props.value}</div>
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
        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {props.label}
      </button>
      <div className="invisible absolute right-0 top-full z-50 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] translate-y-1 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-lg opacity-0 transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Hover definitions
        </div>
        <div className="mt-3 text-zinc-900 dark:text-zinc-100">{props.children}</div>
      </div>
    </div>
  )
}
