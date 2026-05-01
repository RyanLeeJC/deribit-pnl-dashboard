import type { DeribitTxLogRow } from './deribitCsv'

/** Tokens detected on the earliest-dated CSV row(s), in match priority order. */
export const DISPLAY_UNIT_TOKENS = ['ETH', 'BTC', 'USDC', 'USDT', 'SOL', 'XRP'] as const

export type DisplayUnit = (typeof DISPLAY_UNIT_TOKENS)[number]

const DEFAULT_UNIT: DisplayUnit = 'BTC'

/**
 * Derive dashboard amount labels from the earliest timestamp in the log:
 * scan all raw CSV cell values for whole-word token matches (priority: ETH, BTC, USDC, USDT, SOL, XRP).
 */
export function inferDisplayUnitFromEarliestRow(rows: DeribitTxLogRow[]): DisplayUnit {
  if (rows.length === 0) return DEFAULT_UNIT

  let minT = Infinity
  for (const r of rows) {
    const t = r.date.getTime()
    if (Number.isFinite(t) && t < minT) minT = t
  }
  if (!Number.isFinite(minT)) return DEFAULT_UNIT

  const earliest = rows.filter((r) => r.date.getTime() === minT)
  const haystack = earliest
    .flatMap((r) => Object.values(r.raw).map((cell) => String(cell ?? '')))
    .join('\n')
    .toUpperCase()

  for (const token of DISPLAY_UNIT_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`)
    if (re.test(haystack)) return token
  }
  return DEFAULT_UNIT
}
