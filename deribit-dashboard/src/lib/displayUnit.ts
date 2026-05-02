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

  // Deribit exports often omit the asset ticker on early affiliate/deposit rows.
  // Easy/robust fallback: infer from the first few Instruments (prefix before "-"),
  // which is typically one of BTC / ETH / USDC for account logs.
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const INSTRUMENT_TOKENS: DisplayUnit[] = ['BTC', 'ETH', 'USDC']
  let seen = 0
  for (const r of sorted) {
    const inst = (r.instrument ?? '').trim()
    if (!inst) continue
    const prefix = inst.split('-')[0]?.trim().toUpperCase() ?? ''
    seen++
    if (prefix === 'BTC' || prefix === 'ETH' || prefix === 'USDC') return prefix as DisplayUnit
    if (seen >= 12) break
  }

  // Last fallback: scan forward for explicit mentions in instrument/info/note.
  for (const r of sorted) {
    const rowHaystack = [r.instrument ?? '', r.info ?? '', r.note ?? '']
      .map((x) => String(x ?? ''))
      .join('\n')
      .toUpperCase()
    for (const token of INSTRUMENT_TOKENS) {
      const re = new RegExp(`\\b${token}\\b`)
      if (re.test(rowHaystack)) return token
    }
  }
  return DEFAULT_UNIT
}
