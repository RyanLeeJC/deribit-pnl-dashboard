export function formatInt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
}

export function formatBtc(n: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 8,
    minimumFractionDigits: 2,
  }).format(n)} BTC`
}

export function formatBtcFixed(n: number, decimals: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n)} BTC`
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return new Intl.DateTimeFormat(undefined, {
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
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'Asia/Singapore',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function sgtDateKey(ms: number): string {
  const d = new Date(ms)
  // en-CA yields YYYY-MM-DD in most environments; force SGT timezone.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

