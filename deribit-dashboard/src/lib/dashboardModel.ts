import type { DeribitTxLogRow } from './deribitCsv'
import { inferDisplayUnitFromEarliestRow } from './displayUnit'
import type { DisplayUnit } from './displayUnit'

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
    /** Inferred from the earliest-dated row(s) in the CSV (token match). */
    displayUnit: DisplayUnit
  }
  totals: {
    cashFlow: number
    feeCharged: number
    funding: number
    deposits: number
    withdrawals: number
    netDeposit: number
    netTransfers: number
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
      netTransfersToDate: number
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
      side: 'BUY' | 'SELL' | null
      instrument: string
      amount: number
      realisedPnl: number
      fee: number
      roi: number | null
      closingIndexPrice: number | null
    }>
    negativeBalanceFees: Array<{
      t: number
      feeCharged: number | null
      feeChargedRaw: string | null
      feeChargedText: string | null
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

function expandScientificToDecimal(input: string): string {
  const s = input.trim()
  if (!/[eE]/.test(s)) return s

  const m = /^([+-])?(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(s)
  if (!m) return s

  const sign = m[1] === '-' ? '-' : ''
  const intPart = m[2] ?? '0'
  const fracPart = m[3] ?? ''
  const exp = Number(m[4] ?? 0)
  if (!Number.isFinite(exp) || !Number.isInteger(exp)) return s

  const digits = (intPart + fracPart).replace(/^0+(?=\d)/, '') || '0'
  const decPos = intPart.length + exp

  if (decPos <= 0) {
    return sign + '0.' + '0'.repeat(-decPos) + digits
  }

  if (decPos >= digits.length) {
    return sign + digits + '0'.repeat(decPos - digits.length)
  }

  return sign + digits.slice(0, decPos) + '.' + digits.slice(decPos)
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
  const displayUnit = inferDisplayUnitFromEarliestRow(rows)
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

  const netTransfers = sumNullable(
    rows
      .filter((r) => r.type === 'transfer')
      // IMPORTANT: do not abs() this; transfers can be IN or OUT for this account.
      .map((r) => r.cashFlow ?? r.change ?? null),
  )

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

  const transferTypes = new Set(['deposit', 'withdrawal', 'withdraw', 'transfer'])

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

  const negativeBalanceFees = rows
    .filter((r) => r.type === 'negative_balance_fee')
    .slice()
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((r) => ({
      t: r.date.getTime(),
      // Spec: show the CSV "Cash Flow" value under Fee Charged (as-is, no sign flip).
      feeCharged: r.cashFlow,
      feeChargedRaw:
        typeof r.raw?.['Cash Flow'] === 'string' && r.raw['Cash Flow'].trim().length
          ? r.raw['Cash Flow'].trim()
          : null,
      feeChargedText:
        typeof r.raw?.['Cash Flow'] === 'string' && r.raw['Cash Flow'].trim().length
          ? expandScientificToDecimal(r.raw['Cash Flow'])
          : null,
    }))

  // Realised PnL definition (user spec):
  // - Emit once the matched open lots for this instrument are fully closed (multi partial closes OK).
  // - Do not use CSV Position≈0 alone: Deribit can show Position 0 on a partial close, which would
  //   realise too early with wrong amount/PnL.
  // - Short lifecycle: close buy vs prior open sells. Long lifecycle: close sell vs prior open buys.
  // - Realised PnL = sum(Cash Flow) across matched lifecycle; Fee = sum(Fee Charged).
  const instrumentState = new Map<
    string,
    {
      shortLots: OpenLot[]
      longLots: OpenLot[]
      entrySide: 'BUY' | 'SELL' | null
      pendingShortAmount: number
      pendingShortCashFlow: number
      pendingShortFee: number
      pendingShortOpenCashFlow: number
      pendingLongAmount: number
      pendingLongCashFlow: number
      pendingLongFee: number
      pendingLongOpenCashFlow: number
    }
  >()

  const realisedPnl: DashboardModel['tables']['realisedPnl'] = []

  for (const r of rows) {
    const instrument = r.instrument
    if (!instrument) continue

    // Settlement/expiry can finalize lifecycle without a closing trade.
    if (r.type === 'delivery' || r.type === 'options_settlement_summary') {
      const s =
        instrumentState.get(instrument) ?? {
          shortLots: [] as OpenLot[],
          longLots: [] as OpenLot[],
          entrySide: null as 'BUY' | 'SELL' | null,
          pendingShortAmount: 0,
          pendingShortCashFlow: 0,
          pendingShortFee: 0,
          pendingShortOpenCashFlow: 0,
          pendingLongAmount: 0,
          pendingLongCashFlow: 0,
          pendingLongFee: 0,
          pendingLongOpenCashFlow: 0,
        }

      const hasOpenOrPending =
        s.shortLots.length > 0 ||
        s.longLots.length > 0 ||
        s.pendingShortAmount !== 0 ||
        s.pendingLongAmount !== 0

      if (!hasOpenOrPending) continue

      // Flush any remaining open lots into pending, then add this settlement row's cashflow/fee.
      for (const lot of s.shortLots) {
        if (lot.remaining > 1e-12) s.pendingShortAmount += lot.remaining
        s.pendingShortCashFlow += lot.cashFlow
        s.pendingShortFee += lot.fee
        s.pendingShortOpenCashFlow += lot.cashFlow
      }
      for (const lot of s.longLots) {
        if (lot.remaining > 1e-12) s.pendingLongAmount += lot.remaining
        s.pendingLongCashFlow += lot.cashFlow
        s.pendingLongFee += lot.fee
        s.pendingLongOpenCashFlow += lot.cashFlow
      }

      const rowCash = r.cashFlow ?? 0
      const rowFee = r.feeCharged ?? 0

      // Heuristic: apply row cash/fee to whichever side is active; if ambiguous, include in total.
      if (s.shortLots.length > 0 || s.pendingShortAmount !== 0) {
        s.pendingShortCashFlow += rowCash
        s.pendingShortFee += rowFee
      } else if (s.longLots.length > 0 || s.pendingLongAmount !== 0) {
        s.pendingLongCashFlow += rowCash
        s.pendingLongFee += rowFee
      } else {
        s.pendingLongCashFlow += rowCash
        s.pendingLongFee += rowFee
      }

      const totalAmount = s.pendingShortAmount + s.pendingLongAmount
      const totalPnl = s.pendingShortCashFlow + s.pendingLongCashFlow
      const totalFee = s.pendingShortFee + s.pendingLongFee
      const totalOpenCashFlow = s.pendingShortOpenCashFlow + s.pendingLongOpenCashFlow
      const roiDenom = Math.abs(totalOpenCashFlow)
      // ROI% is normalized by the opening leg magnitude (premium paid/received).
      // For open-buy then close-sell, this yields (closeCashFlow - |openCashFlow|) / |openCashFlow|.
      const roi = roiDenom === 0 ? null : totalPnl / roiDenom

      realisedPnl.push({
        t: r.date.getTime(),
        side: s.entrySide,
        instrument,
        amount: totalAmount,
        realisedPnl: totalPnl,
        fee: totalFee,
        roi,
        closingIndexPrice: r.indexPrice ?? null,
      })

      instrumentState.set(instrument, {
        shortLots: [],
        longLots: [],
        entrySide: null,
        pendingShortAmount: 0,
        pendingShortCashFlow: 0,
        pendingShortFee: 0,
        pendingShortOpenCashFlow: 0,
        pendingLongAmount: 0,
        pendingLongCashFlow: 0,
        pendingLongFee: 0,
        pendingLongOpenCashFlow: 0,
      })

      continue
    }

    if (r.type !== 'trade') continue

    const side = (r.side ?? '').toLowerCase()
    const amount = r.amount ?? null

    const s =
      instrumentState.get(instrument) ?? {
        shortLots: [] as OpenLot[],
        longLots: [] as OpenLot[],
        entrySide: null as 'BUY' | 'SELL' | null,
        pendingShortAmount: 0,
        pendingShortCashFlow: 0,
        pendingShortFee: 0,
        pendingShortOpenCashFlow: 0,
        pendingLongAmount: 0,
        pendingLongCashFlow: 0,
        pendingLongFee: 0,
        pendingLongOpenCashFlow: 0,
      }

    if (side === 'open sell' && typeof amount === 'number' && amount > 0) {
      instrumentState.set(instrument, {
        ...s,
        entrySide: s.entrySide ?? 'SELL',
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
        entrySide: s.entrySide ?? 'BUY',
        longLots: [
          ...s.longLots,
          { remaining: amount, cashFlow: r.cashFlow ?? 0, fee: r.feeCharged ?? 0 },
        ],
      })
      continue
    }

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
        s.pendingShortOpenCashFlow += takeCashFlow

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

      const shortFullyClosed =
        newShortLots.length === 0 || newShortLots.every((lot) => lot.remaining <= 1e-12)

      if (shortFullyClosed) {
        const roiDenom = Math.abs(s.pendingShortOpenCashFlow)
        const roi = roiDenom === 0 ? null : s.pendingShortCashFlow / roiDenom
        realisedPnl.push({
          t: r.date.getTime(),
          side: 'SELL',
          instrument,
          amount: s.pendingShortAmount,
          realisedPnl: s.pendingShortCashFlow,
          fee: s.pendingShortFee,
          roi,
          closingIndexPrice: r.indexPrice ?? null,
        })
        instrumentState.set(instrument, {
          shortLots: [],
          longLots: [],
          entrySide: null,
          pendingShortAmount: 0,
          pendingShortCashFlow: 0,
          pendingShortFee: 0,
          pendingShortOpenCashFlow: 0,
          pendingLongAmount: 0,
          pendingLongCashFlow: 0,
          pendingLongFee: 0,
          pendingLongOpenCashFlow: 0,
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
        s.pendingLongOpenCashFlow += takeCashFlow

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

      const longFullyClosed =
        newLongLots.length === 0 || newLongLots.every((lot) => lot.remaining <= 1e-12)

      if (longFullyClosed) {
        const roiDenom = Math.abs(s.pendingLongOpenCashFlow)
        const roi = roiDenom === 0 ? null : s.pendingLongCashFlow / roiDenom
        realisedPnl.push({
          t: r.date.getTime(),
          side: 'BUY',
          instrument,
          amount: s.pendingLongAmount,
          realisedPnl: s.pendingLongCashFlow,
          fee: s.pendingLongFee,
          roi,
          closingIndexPrice: r.indexPrice ?? null,
        })
        instrumentState.set(instrument, {
          shortLots: [],
          longLots: [],
          entrySide: null,
          pendingShortAmount: 0,
          pendingShortCashFlow: 0,
          pendingShortFee: 0,
          pendingShortOpenCashFlow: 0,
          pendingLongAmount: 0,
          pendingLongCashFlow: 0,
          pendingLongFee: 0,
          pendingLongOpenCashFlow: 0,
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

  // PNL series (per SGT day): end-of-day equity minus net deposits-to-date minus net transfers-to-date.
  // Transfers are internal (between subaccounts) and should not move PnL, so we subtract them explicitly.
  const netDepositsByDay = new Map<string, number>()
  for (const r of rows) {
    if (r.type !== 'deposit' && r.type !== 'withdrawal' && r.type !== 'withdraw') continue
    const day = sgtDayKey(r.date.getTime())
    netDepositsByDay.set(day, (netDepositsByDay.get(day) ?? 0) + transferSignedAmount(r))
  }

  const netTransfersByDay = new Map<string, number>()
  for (const r of rows) {
    if (r.type !== 'transfer') continue
    const day = sgtDayKey(r.date.getTime())
    const raw = r.cashFlow ?? r.change ?? null
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    netTransfersByDay.set(day, (netTransfersByDay.get(day) ?? 0) + n)
  }

  const pnlByDay = new Map<string, { t: number; equityEod: number | null }>()
  for (const r of rows) {
    const day = sgtDayKey(r.date.getTime())
    const reported =
      typeof r.equity === 'number' && Number.isFinite(r.equity) ? r.equity : null
    pnlByDay.set(day, { t: r.date.getTime(), equityEod: reported })
  }

  const parseDayKeyToUtcMs = (dayKey: string): number => {
    const [y, m, d] = dayKey.split('-').map((x) => Number(x))
    return Date.UTC(y, m - 1, d, 12, 0, 0)
  }

  const daySet = new Set<string>()
  for (const r of rows) daySet.add(sgtDayKey(r.date.getTime()))
  for (const d of netDepositsByDay.keys()) daySet.add(d)
  for (const d of netTransfersByDay.keys()) daySet.add(d)
  const allDays = [...daySet].sort()

  let cumulativeNetDeposits = 0
  let cumulativeNetTransfers = 0
  let lastEquityEod: number | null = null
  let lastEquityT = 0
  const pnlSeries: DashboardModel['series']['pnl'] = []
  for (const day of allDays) {
    cumulativeNetDeposits += netDepositsByDay.get(day) ?? 0
    cumulativeNetTransfers += netTransfersByDay.get(day) ?? 0
    const point = pnlByDay.get(day)
    let equityEod: number | null
    let t: number
    if (point) {
      equityEod = point.equityEod
      t = point.t
      if (equityEod != null) {
        lastEquityEod = equityEod
        lastEquityT = t
      }
    } else {
      equityEod = lastEquityEod
      t = lastEquityT || parseDayKeyToUtcMs(day)
    }
    pnlSeries.push({
      t,
      equityEod,
      netDepositsToDate: cumulativeNetDeposits,
      netTransfersToDate: cumulativeNetTransfers,
      pnl:
        equityEod == null
          ? null
          : equityEod - cumulativeNetDeposits - cumulativeNetTransfers,
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
      displayUnit,
    },
    totals: {
      cashFlow,
      feeCharged,
      funding,
      deposits,
      withdrawals,
      netDeposit,
      netTransfers,
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
      negativeBalanceFees,
    },
  }
}

