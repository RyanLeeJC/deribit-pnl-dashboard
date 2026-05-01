import type { DeribitTxLogRow } from './deribitCsv'

export type EquityPoint = {
  t: number
  equity: number | null
  balance: number | null
}

export type TypeCount = {
  type: string
  count: number
}

export type InstrumentCount = {
  instrument: string
  count: number
}

export type DashboardModel = {
  meta: {
    generatedAt: number
    rowCount: number
    from: number | null
    to: number | null
  }
  totals: {
    cashFlow: number
    feeCharged: number
    funding: number
    deposits: number
    withdrawals: number
    netDeposit: number
    realisedPnl: number
    pnlCurrent: number | null
    tradeVolumeBtcNotional: number
    equityCurrent: number | null
  }
  series: {
    equity: EquityPoint[]
    pnl: Array<{
      t: number
      pnl: number | null
      equityEod: number | null
      netDepositsToDate: number
    }>
  }
  breakdowns: {
    byType: TypeCount[]
    byInstrument: InstrumentCount[]
  }
  tables: {
    recentTrades: Array<{
      t: number
      instrument: string | null
      side: string | null
      amount: number | null
      price: number | null
      cashFlow: number | null
      feeCharged: number | null
      orderId: string | null
      tradeId: string | null
    }>
    transfers: Array<{
      t: number
      type: string
      cashFlow: number | null
      change: number | null
      balance: number | null
      equity: number | null
      info: string | null
      note: string | null
    }>
    realisedPnl: Array<{
      t: number
      instrument: string
      amount: number
      realisedPnl: number
      fee: number
    }>
  }
}

function sumNullable(values: Array<number | null | undefined>): number {
  let s = 0
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}

function countBy<T extends string>(values: T[]): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

type OpenLot = {
  remaining: number
  cashFlow: number
  fee: number
}

function sgtDayKey(ms: number): string {
  // YYYY-MM-DD in SGT
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

function transferSignedAmount(r: DeribitTxLogRow): number {
  const raw = r.cashFlow ?? r.change ?? 0
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  if (r.type === 'deposit') return Math.abs(n)
  if (r.type === 'withdrawal' || r.type === 'withdraw') return -Math.abs(n)
  return n
}

export function buildDashboardModel(rows: DeribitTxLogRow[]): DashboardModel {
  const ts = rows.map((r) => r.date.getTime())
  const from = ts.length ? Math.min(...ts) : null
  const to = ts.length ? Math.max(...ts) : null

  const equityCurrent = (() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const e = rows[i]?.equity
      if (typeof e === 'number' && Number.isFinite(e)) return e
    }
    return null
  })()

  const equitySeries: EquityPoint[] = rows.map((r) => ({
    t: r.date.getTime(),
    equity: r.equity,
    balance: r.balance,
  }))

  const cashFlow = sumNullable(rows.map((r) => r.cashFlow))
  const feeCharged = sumNullable(rows.map((r) => r.feeCharged))
  const funding = sumNullable(rows.map((r) => r.funding))

  const deposits = sumNullable(
    rows
      .filter((r) => r.type === 'deposit')
      .map((r) => r.cashFlow ?? r.change ?? null),
  )

  const withdrawals = sumNullable(
    rows
      .filter((r) => r.type === 'withdrawal' || r.type === 'withdraw')
      .map((r) => r.cashFlow ?? r.change ?? null),
  )

  const netDeposit = deposits + withdrawals

  const byType = countBy(rows.map((r) => r.type || '(blank)')).map(({ key, count }) => ({
    type: key,
    count,
  }))

  const byInstrument = countBy(
    rows
      .filter((r) => r.type === 'trade')
      .map((r) => r.instrument ?? '(unknown)'),
  ).map(({ key, count }) => ({ instrument: key, count }))

  const recentTrades = rows
    .filter((r) => r.type === 'trade')
    .slice(-50)
    .reverse()
    .map((r) => ({
      t: r.date.getTime(),
      instrument: r.instrument,
      side: r.side,
      amount: r.amount,
      price: r.price,
      cashFlow: r.cashFlow,
      feeCharged: r.feeCharged,
      orderId: r.orderId,
      tradeId: r.tradeId,
    }))

  const transferTypes = new Set(['deposit', 'withdrawal', 'withdraw'])

  const transfers = rows
    .filter((r) => transferTypes.has(r.type))
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((r) => ({
      t: r.date.getTime(),
      type: r.type,
      cashFlow: r.cashFlow,
      change: r.change,
      balance: r.balance,
      equity: r.equity,
      info: r.info,
      note: r.note,
    }))

  // Realised PnL definition (user spec):
  // - Show only when contracts are fully squared off (a close trade where Position becomes 0).
  // - If short lifecycle: match close buy (Position=0) to prior open sell rows of same Instrument.
  // - If long lifecycle: match close sell (Position=0) to prior open buy rows of same Instrument.
  // - Realised PnL = sum(Cash Flow) across matched lifecycle
  // - Fee = sum(Fee Charged) across matched lifecycle
  const instrumentState = new Map<
    string,
    {
      shortLots: OpenLot[]
      longLots: OpenLot[]
      pendingShortAmount: number
      pendingShortCashFlow: number
      pendingShortFee: number
      pendingLongAmount: number
      pendingLongCashFlow: number
      pendingLongFee: number
    }
  >()

  const realisedPnl: DashboardModel['tables']['realisedPnl'] = []

  for (const r of rows) {
    if (r.type !== 'trade') continue
    const instrument = r.instrument
    if (!instrument) continue

    const side = (r.side ?? '').toLowerCase()
    const amount = r.amount ?? null

    const s =
      instrumentState.get(instrument) ?? {
        shortLots: [] as OpenLot[],
        longLots: [] as OpenLot[],
        pendingShortAmount: 0,
        pendingShortCashFlow: 0,
        pendingShortFee: 0,
        pendingLongAmount: 0,
        pendingLongCashFlow: 0,
        pendingLongFee: 0,
      }

    if (side === 'open sell' && typeof amount === 'number' && amount > 0) {
      instrumentState.set(instrument, {
        ...s,
        shortLots: [
          ...s.shortLots,
          { remaining: amount, cashFlow: r.cashFlow ?? 0, fee: r.feeCharged ?? 0 },
        ],
      })
      continue
    }

    if (side === 'open buy' && typeof amount === 'number' && amount > 0) {
      instrumentState.set(instrument, {
        ...s,
        longLots: [
          ...s.longLots,
          { remaining: amount, cashFlow: r.cashFlow ?? 0, fee: r.feeCharged ?? 0 },
        ],
      })
      continue
    }

    const flattened = r.position != null && Math.abs(r.position) < 1e-12

    if (side === 'close buy' && typeof amount === 'number' && amount > 0) {
      // Closing a short (open sells). Ignore if we have nothing open for this instrument.
      if (s.shortLots.length === 0 && s.pendingShortAmount === 0) continue

      let remainingToClose = amount
      const newShortLots: OpenLot[] = []

      for (const lot of s.shortLots) {
        if (remainingToClose <= 0) {
          newShortLots.push(lot)
          continue
        }

        const take = Math.min(lot.remaining, remainingToClose)
        const ratio = lot.remaining > 0 ? take / lot.remaining : 0

        const takeCashFlow = lot.cashFlow * ratio
        const takeFee = lot.fee * ratio

        s.pendingShortAmount += take
        s.pendingShortCashFlow += takeCashFlow
        s.pendingShortFee += takeFee

        const leftover = lot.remaining - take
        if (leftover > 1e-12) {
          newShortLots.push({
            remaining: leftover,
            cashFlow: lot.cashFlow - takeCashFlow,
            fee: lot.fee - takeFee,
          })
        }

        remainingToClose -= take
      }

      // Include the close-buy row itself.
      s.pendingShortCashFlow += r.cashFlow ?? 0
      s.pendingShortFee += r.feeCharged ?? 0

      if (flattened) {
        realisedPnl.push({
          t: r.date.getTime(),
          instrument,
          amount: s.pendingShortAmount,
          realisedPnl: s.pendingShortCashFlow,
          fee: s.pendingShortFee,
        })
        instrumentState.set(instrument, {
          shortLots: [],
          longLots: [],
          pendingShortAmount: 0,
          pendingShortCashFlow: 0,
          pendingShortFee: 0,
          pendingLongAmount: 0,
          pendingLongCashFlow: 0,
          pendingLongFee: 0,
        })
      } else {
        instrumentState.set(instrument, { ...s, shortLots: newShortLots })
      }
      continue
    }

    if (side === 'close sell' && typeof amount === 'number' && amount > 0) {
      // Closing a long (open buys). Ignore if we have nothing open for this instrument.
      if (s.longLots.length === 0 && s.pendingLongAmount === 0) continue

      let remainingToClose = amount
      const newLongLots: OpenLot[] = []

      for (const lot of s.longLots) {
        if (remainingToClose <= 0) {
          newLongLots.push(lot)
          continue
        }

        const take = Math.min(lot.remaining, remainingToClose)
        const ratio = lot.remaining > 0 ? take / lot.remaining : 0

        const takeCashFlow = lot.cashFlow * ratio
        const takeFee = lot.fee * ratio

        s.pendingLongAmount += take
        s.pendingLongCashFlow += takeCashFlow
        s.pendingLongFee += takeFee

        const leftover = lot.remaining - take
        if (leftover > 1e-12) {
          newLongLots.push({
            remaining: leftover,
            cashFlow: lot.cashFlow - takeCashFlow,
            fee: lot.fee - takeFee,
          })
        }

        remainingToClose -= take
      }

      // Include the close-sell row itself.
      s.pendingLongCashFlow += r.cashFlow ?? 0
      s.pendingLongFee += r.feeCharged ?? 0

      if (flattened) {
        realisedPnl.push({
          t: r.date.getTime(),
          instrument,
          amount: s.pendingLongAmount,
          realisedPnl: s.pendingLongCashFlow,
          fee: s.pendingLongFee,
        })
        instrumentState.set(instrument, {
          shortLots: [],
          longLots: [],
          pendingShortAmount: 0,
          pendingShortCashFlow: 0,
          pendingShortFee: 0,
          pendingLongAmount: 0,
          pendingLongCashFlow: 0,
          pendingLongFee: 0,
        })
      } else {
        instrumentState.set(instrument, { ...s, longLots: newLongLots })
      }
    }
  }

  realisedPnl.sort((a, b) => b.t - a.t)
  const realisedPnlTotal = sumNullable(realisedPnl.map((x) => x.realisedPnl))
  const tradeVolumeBtcNotional = sumNullable(
    rows
      .filter((r) => r.type === 'trade')
      .map((r) => (typeof r.amount === 'number' ? Math.abs(r.amount) : null)),
  )

  // PNL series (per SGT day): end-of-day equity minus net deposits-to-date.
  const netDepositsByDay = new Map<string, number>()
  for (const r of rows) {
    if (!transferTypes.has(r.type)) continue
    const day = sgtDayKey(r.date.getTime())
    netDepositsByDay.set(day, (netDepositsByDay.get(day) ?? 0) + transferSignedAmount(r))
  }

  const pnlByDay = new Map<string, { t: number; equityEod: number | null }>()
  for (const r of rows) {
    const day = sgtDayKey(r.date.getTime())
    const equity = typeof r.equity === 'number' && Number.isFinite(r.equity) ? r.equity : null
    // rows are chronological; keep last value in that day
    pnlByDay.set(day, { t: r.date.getTime(), equityEod: equity })
  }

  const allDays = [...pnlByDay.keys()].sort()
  let cumulativeNetDeposits = 0
  const pnlSeries: DashboardModel['series']['pnl'] = []
  for (const day of allDays) {
    cumulativeNetDeposits += netDepositsByDay.get(day) ?? 0
    const point = pnlByDay.get(day)!
    pnlSeries.push({
      t: point.t,
      equityEod: point.equityEod,
      netDepositsToDate: cumulativeNetDeposits,
      pnl: point.equityEod == null ? null : point.equityEod - cumulativeNetDeposits,
    })
  }

  const pnlCurrent = (() => {
    for (let i = pnlSeries.length - 1; i >= 0; i--) {
      const v = pnlSeries[i]?.pnl
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return null
  })()

  return {
    meta: {
      generatedAt: Date.now(),
      rowCount: rows.length,
      from,
      to,
    },
    totals: {
      cashFlow,
      feeCharged,
      funding,
      deposits,
      withdrawals,
      netDeposit,
      realisedPnl: realisedPnlTotal,
      pnlCurrent,
      tradeVolumeBtcNotional,
      equityCurrent,
    },
    series: {
      equity: equitySeries,
      pnl: pnlSeries,
    },
    breakdowns: {
      byType,
      byInstrument,
    },
    tables: {
      recentTrades,
      transfers,
      realisedPnl,
    },
  }
}

