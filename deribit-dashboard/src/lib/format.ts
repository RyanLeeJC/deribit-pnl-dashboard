import type { DisplayUnit } from './displayUnit'

export function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
}

export function formatAsset(n: number, unit: DisplayUnit): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 2,
  }).format(n)} ${unit}`
}

export function formatAssetFixed(n: number, decimals: number, unit: DisplayUnit): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n)} ${unit}`
}

/** Account summary panel: 4 dp; Volume Traded uses {@link formatVolumeTradedAmount} (2 dp). */
export function formatAccountSummaryAmount(n: number, unit: DisplayUnit): string {
  return formatAssetFixed(n, 4, unit)
}

export function formatVolumeTradedAmount(n: number, unit: DisplayUnit): string {
  return formatAssetFixed(n, 2, unit)
}

export function formatBtc(n: number): string {
  return formatAsset(n, 'BTC')
}

export function formatBtcFixed(n: number, decimals: number): string {
  return formatAssetFixed(n, decimals, 'BTC')
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDate(ms: number): string {
  const d = new Date(ms)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d)
}

export function sgtDateKey(ms: number): string {
  const d = new Date(ms)
  // en-CA yields YYYY-MM-DD in most environments; force SGT timezone.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

type Ymd = { y: number; m: number; d: number }

function sgtYmd(ms: number): Ymd {
  // SGT is UTC+8 (no DST). Shift into SGT, then read UTC components.
  const d = new Date(ms + 8 * 60 * 60 * 1000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

function daysInMonth(y: number, m: number): number {
  // m: 1..12
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function formatPeriod(fromMs: number | null, toMs: number | null): string {
  if (fromMs == null || toMs == null) return '-'
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return '-'

  const a = Math.min(fromMs, toMs)
  const b = Math.max(fromMs, toMs)

  const start = sgtYmd(a)
  const end = sgtYmd(b)

  let y = end.y - start.y
  let m = end.m - start.m
  let d = end.d - start.d

  if (d < 0) {
    m -= 1
    const prevMonth = end.m - 1 <= 0 ? 12 : end.m - 1
    const prevYear = end.m - 1 <= 0 ? end.y - 1 : end.y
    d += daysInMonth(prevYear, prevMonth)
  }

  if (m < 0) {
    y -= 1
    m += 12
  }

  const unit = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)

  const parts: string[] = []
  if (y > 0) parts.push(`${y} ${unit(y, 'Year', 'Years')}`)

  // If we have years, and months is 0 but days is non-zero: omit months entirely (Year Day).
  // Otherwise, include months when we have years (even if 0) or when months is non-zero.
  if (y > 0) {
    if (!(m === 0 && d !== 0)) parts.push(`${m} ${unit(m, 'Month', 'Months')}`)
  } else if (m > 0) {
    parts.push(`${m} ${unit(m, 'Month', 'Months')}`)
  }

  parts.push(`${d} ${unit(d, 'Day', 'Days')}`)
  return parts.join(' ')
}

