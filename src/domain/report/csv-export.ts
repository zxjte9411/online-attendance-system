import type { DailyReportRow, MonthlyReport } from './monthly-report'

export const CSV_HEADERS = [
  'date',
  'weekday',
  'company_identifier',
  'project_identifier',
  'actual_clock_in_at',
  'effective_clock_in_at',
  'actual_clock_out_at',
  'effective_clock_out_at',
  'expected_clock_out_at',
  'scheduled_minutes',
  'actual_elapsed_minutes',
  'net_worked_minutes',
  'regular_minutes',
  'overtime_minutes',
  'leave_minutes',
  'absence_minutes',
  'created_source',
  'manually_adjusted',
  'last_manual_edit_at',
  'calculation_version',
  'status',
  'note',
  'calendar_day_type',
  'calendar_source',
  'is_incomplete',
  'exception_flags',
] as const

export function formatTaipeiDateTime(isoString: string | null | undefined): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const find = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const year = find('year')
  const month = find('month')
  const day = find('day')
  let hour = find('hour')
  if (hour === '24') hour = '00'
  const minute = find('minute')
  const second = find('second')

  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`
}

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str = String(value)

  if (typeof value === 'string' && /^[=+\-@]/.test(str)) {
    str = `'${str}`
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

export function exportReportToCsv(report: MonthlyReport): string {
  const headerLine = CSV_HEADERS.map((h) => escapeCsvField(h)).join(',')

  const rowLines = report.rows.map((row: DailyReportRow) => {
    const fields: unknown[] = [
      row.date,
      row.weekday,
      row.company_identifier,
      row.project_identifier,
      formatTaipeiDateTime(row.actual_clock_in_at),
      formatTaipeiDateTime(row.effective_clock_in_at),
      formatTaipeiDateTime(row.actual_clock_out_at),
      formatTaipeiDateTime(row.effective_clock_out_at),
      formatTaipeiDateTime(row.expected_clock_out_at),
      row.scheduled_minutes,
      row.actual_elapsed_minutes ?? '',
      row.net_worked_minutes ?? '',
      row.regular_minutes ?? '',
      row.overtime_minutes ?? '',
      row.leave_minutes,
      row.absence_minutes,
      row.created_source ?? '',
      row.manually_adjusted,
      formatTaipeiDateTime(row.last_manual_edit_at),
      row.calculation_version ?? '',
      row.status ?? '',
      row.note ?? '',
      row.calendar_day_type,
      row.calendar_source,
      row.is_incomplete,
      row.exception_flags.join(';'),
    ]

    return fields.map((f) => escapeCsvField(f)).join(',')
  })

  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n')
}
