import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import Papa from 'papaparse'

dayjs.extend(customParseFormat)
dayjs.extend(utc)

export const DERIBIT_TX_LOG_HEADERS = [
  'ID',
  'UserSeq',
  'Date',
  'Instrument',
  'Type',
  'Side',
  'Amount',
  'Base Amount',
  'Position',
  'Price',
  'Mark Price',
  'Index Price',
  'Settlement Price',
  'Cash Flow',
  'Funding',
  'Fee Rate',
  'Fee Charged',
  'Fee Balance',
  'Change',
  'Balance',
  'Equity',
  'Trade ID',
  'Order ID',
  'Info',
  'Note',
] as const

export type DeribitTxLogHeader = (typeof DERIBIT_TX_LOG_HEADERS)[number]

export type DeribitTxLogRow = {
  id: string
  userSeq: string
  date: Date
  instrument: string | null
  type: string
  side: string | null
  amount: number | null
  baseAmount: number | null
  position: number | null
  price: number | null
  markPrice: number | null
  indexPrice: number | null
  settlementPrice: number | null
  cashFlow: number | null
  funding: number | null
  feeRate: number | null
  feeCharged: number | null
  feeBalance: number | null
  change: number | null
  balance: number | null
  equity: number | null
  tradeId: string | null
  orderId: string | null
  info: string | null
  note: string | null
  raw: Record<string, string>
}

export type DeribitCsvParseWarning = {
  rowNumber: number
  kind:
    | 'missing_header'
    | 'extra_header'
    | 'bad_date'
    | 'bad_number'
    | 'unknown_type'
    | 'empty_row'
  message: string
}

export type DeribitCsvParseResult = {
  rows: DeribitTxLogRow[]
  warnings: DeribitCsvParseWarning[]
}

const DERIBIT_DATE_FORMATS = [
  // Deribit export format (example)
  'DD MMM YYYY HH:mm:ss',
  // Some exports / re-saved files use full month names (e.g. "30 September 2025 08:00:00")
  'DD MMMM YYYY HH:mm:ss',
  'D MMMM YYYY H:mm:ss',
  'D MMMM YYYY HH:mm:ss',
  'DD MMM YYYY HH:mm',
  'DD MMMM YYYY HH:mm',
  // Common “Excel-saved” / locale numeric formats seen in re-saved CSVs
  'D/M/YYYY H:mm',
  'D/M/YYYY HH:mm',
  'D/M/YYYY H:mm:ss',
  'D/M/YYYY HH:mm:ss',
  'DD/MM/YYYY H:mm',
  'DD/MM/YYYY HH:mm',
  'DD/MM/YYYY H:mm:ss',
  'DD/MM/YYYY HH:mm:ss',
] as const

function normalizeBlank(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s.length === 0 ? null : s
}

function parseDeribitNumber(
  value: unknown,
  ctx: { rowNumber: number; field: string },
  warnings: DeribitCsvParseWarning[],
): number | null {
  const s = normalizeBlank(value)
  if (s === null) return null
  if (s === '-' || s.toLowerCase() === 'null') return null

  const n = Number(s)
  if (!Number.isFinite(n)) {
    warnings.push({
      rowNumber: ctx.rowNumber,
      kind: 'bad_number',
      message: `Could not parse number in "${ctx.field}": ${JSON.stringify(s)}`,
    })
    return null
  }
  return n
}

function parseDeribitDate(
  value: unknown,
  rowNumber: number,
  warnings: DeribitCsvParseWarning[],
): Date | null {
  const raw = normalizeBlank(value)
  if (raw === null) return null
  // Normalize common month spelling differences (e.g. "Sept" vs "Sep") before strict parsing.
  const s = raw.replace(/\bSept\b/g, 'Sep').replace(/\bSEPT\b/g, 'SEP')
  // CSV timestamps are UTC (e.g. "30 Apr 2026 08:00:00" means 08:00 UTC).
  // Some users re-save via Excel and end up with numeric dates like "30/4/2026 8:00".
  let parsed: dayjs.Dayjs | null = null
  for (const fmt of DERIBIT_DATE_FORMATS) {
    const d = dayjs.utc(s, fmt, true)
    if (d.isValid()) {
      parsed = d
      break
    }
  }

  if (!parsed) {
    warnings.push({
      rowNumber,
      kind: 'bad_date',
      message: `Could not parse Date: ${JSON.stringify(s)} (expected formats like "30 Apr 2026 08:00:00" or "30/4/2026 8:00")`,
    })
    return null
  }
  return parsed.toDate()
}

function validateHeaders(
  headerFields: string[],
  warnings: DeribitCsvParseWarning[],
): void {
  const expected = new Set(DERIBIT_TX_LOG_HEADERS)

  for (const h of DERIBIT_TX_LOG_HEADERS) {
    if (!headerFields.includes(h)) {
      warnings.push({
        rowNumber: 1,
        kind: 'missing_header',
        message: `Missing expected header: ${JSON.stringify(h)}`,
      })
    }
  }

  for (const h of headerFields) {
    if (!expected.has(h as DeribitTxLogHeader)) {
      warnings.push({
        rowNumber: 1,
        kind: 'extra_header',
        message: `Unexpected header: ${JSON.stringify(h)}`,
      })
    }
  }
}

export function parseDeribitCsv(text: string): DeribitCsvParseResult {
  const warnings: DeribitCsvParseWarning[] = []

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  })

  if (parsed.errors.length > 0) {
    for (const e of parsed.errors) {
      warnings.push({
        rowNumber: (e.row ?? 0) + 2,
        kind: 'empty_row',
        message: `CSV parse: ${e.message}`,
      })
    }
  }

  const headerFields = (parsed.meta.fields ?? []).map((f) => f.trim())
  validateHeaders(headerFields, warnings)

  const knownTypes = new Set([
    'trade',
    'options_settlement_summary',
    'delivery',
    'deposit',
    'withdrawal',
    'withdraw',
    'transfer',
    'negative_balance_fee',
    'lock_deposit_balance',
    'unlock_deposit_balance',
  ])

  const rows: DeribitTxLogRow[] = []
  const data = parsed.data ?? []

  for (let i = 0; i < data.length; i++) {
    const raw = data[i] ?? {}
    const rowNumber = i + 2

    const date = parseDeribitDate(raw['Date'], rowNumber, warnings)
    if (!date) continue

    const type = normalizeBlank(raw['Type']) ?? ''
    if (type && !knownTypes.has(type)) {
      warnings.push({
        rowNumber,
        kind: 'unknown_type',
        message: `Unrecognized Type: ${JSON.stringify(type)}`,
      })
    }

    rows.push({
      id: String(raw['ID'] ?? '').trim(),
      userSeq: String(raw['UserSeq'] ?? '').trim(),
      date,
      instrument: normalizeBlank(raw['Instrument']),
      type,
      side: normalizeBlank(raw['Side']),
      amount: parseDeribitNumber(raw['Amount'], { rowNumber, field: 'Amount' }, warnings),
      baseAmount: parseDeribitNumber(
        raw['Base Amount'],
        { rowNumber, field: 'Base Amount' },
        warnings,
      ),
      position: parseDeribitNumber(
        raw['Position'],
        { rowNumber, field: 'Position' },
        warnings,
      ),
      price: parseDeribitNumber(raw['Price'], { rowNumber, field: 'Price' }, warnings),
      markPrice: parseDeribitNumber(
        raw['Mark Price'],
        { rowNumber, field: 'Mark Price' },
        warnings,
      ),
      indexPrice: parseDeribitNumber(
        raw['Index Price'],
        { rowNumber, field: 'Index Price' },
        warnings,
      ),
      settlementPrice: parseDeribitNumber(
        raw['Settlement Price'],
        { rowNumber, field: 'Settlement Price' },
        warnings,
      ),
      cashFlow: parseDeribitNumber(
        raw['Cash Flow'],
        { rowNumber, field: 'Cash Flow' },
        warnings,
      ),
      funding: parseDeribitNumber(
        raw['Funding'],
        { rowNumber, field: 'Funding' },
        warnings,
      ),
      feeRate: parseDeribitNumber(
        raw['Fee Rate'],
        { rowNumber, field: 'Fee Rate' },
        warnings,
      ),
      feeCharged: parseDeribitNumber(
        raw['Fee Charged'],
        { rowNumber, field: 'Fee Charged' },
        warnings,
      ),
      feeBalance: parseDeribitNumber(
        raw['Fee Balance'],
        { rowNumber, field: 'Fee Balance' },
        warnings,
      ),
      change: parseDeribitNumber(raw['Change'], { rowNumber, field: 'Change' }, warnings),
      balance: parseDeribitNumber(raw['Balance'], { rowNumber, field: 'Balance' }, warnings),
      equity: parseDeribitNumber(raw['Equity'], { rowNumber, field: 'Equity' }, warnings),
      tradeId: normalizeBlank(raw['Trade ID']),
      orderId: normalizeBlank(raw['Order ID']),
      info: normalizeBlank(raw['Info']),
      note: normalizeBlank(raw['Note']),
      raw,
    })
  }

  return { rows, warnings }
}

export function sortChronological(rows: DeribitTxLogRow[]): DeribitTxLogRow[] {
  return [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())
}

