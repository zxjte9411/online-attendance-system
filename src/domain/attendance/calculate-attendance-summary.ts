import type { WorkPolicy } from '../../lib/settings'
import { getTaipeiToday } from '../../lib/work-policy'

const TAIPEI_OFFSET_MINUTES = 8 * 60
const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T.+(?:Z|[+-]\d{2}:?\d{2})$/
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

export type AttendanceCalculationPolicy = Pick<
  WorkPolicy,
  | 'standard_start_time'
  | 'work_minutes'
  | 'fixed_break_minutes'
  | 'early_arrival_policy'
  | 'clock_in_rounding_mode'
  | 'clock_in_rounding_minutes'
> & Partial<Pick<WorkPolicy, 'clock_out_rounding_mode' | 'clock_out_rounding_minutes'>>

export type AttendanceCalculationInput = {
  actual_clock_in_at: string
  actual_clock_out_at?: string | null
  policy: AttendanceCalculationPolicy
}

export type AttendanceCalculationResult = {
  actual_clock_in_at: string
  actual_clock_out_at: string | null
  effective_clock_in_at: string
  effective_clock_out_at: string | null
  expected_clock_out_at: string
  actual_elapsed_minutes: number | null
  net_worked_minutes: number | null
  regular_minutes: number | null
  overtime_minutes: number | null
}

type ParsedTime = {
  hours: number
  minutes: number
  seconds: number
  milliseconds: number
}

function invalid(message: string): never {
  throw new Error(`出勤時間計算失敗：${message}`)
}

function parseTimestamp(value: string, label: string) {
  const match = timestampPattern.exec(value)
  if (!match) invalid(`${label} 必須是含時區的 ISO 時間。`)

  const [, year, month, day] = match
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    calendarDate.getUTCFullYear() !== Number(year)
    || calendarDate.getUTCMonth() !== Number(month) - 1
    || calendarDate.getUTCDate() !== Number(day)
  ) {
    invalid(`${label} 不是有效日期。`)
  }

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) invalid(`${label} 不是有效時間。`)
  return timestamp
}

function parseTime(value: string) {
  const match = timePattern.exec(value)
  if (!match) invalid('standard_start_time 不是有效時間。')

  const [, hours, minutes, seconds = '0', fraction = '0'] = match
  const parsed = {
    hours: Number(hours),
    minutes: Number(minutes),
    seconds: Number(seconds),
    milliseconds: Number(fraction.padEnd(3, '0')),
  }
  if (parsed.hours > 23 || parsed.minutes > 59 || parsed.seconds > 59) {
    invalid('standard_start_time 不是有效時間。')
  }
  return parsed
}

function taipeiMidnight(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime() - TAIPEI_OFFSET_MINUTES * 60_000
}

function standardStartAt(date: string, time: ParsedTime) {
  return new Date(
    taipeiMidnight(date)
      + (((time.hours * 60 + time.minutes) * 60 + time.seconds) * 1000)
      + time.milliseconds,
  )
}

function validateNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) invalid(`${label} 必須是非負整數。`)
}

function roundingBoundary(timestamp: Date, mode: 'CEIL' | 'FLOOR', minutes: number, date: string) {
  const interval = minutes * 60_000
  const offset = timestamp.getTime() - taipeiMidnight(date)
  const boundary = mode === 'CEIL' ? Math.ceil(offset / interval) : Math.floor(offset / interval)
  return new Date(taipeiMidnight(date) + boundary * interval)
}

function validatePolicy(policy: AttendanceCalculationPolicy) {
  parseTime(policy.standard_start_time)
  validateNonNegativeInteger(policy.work_minutes, 'work_minutes')
  validateNonNegativeInteger(policy.fixed_break_minutes, 'fixed_break_minutes')

  if (policy.early_arrival_policy !== 'STANDARD_START' && policy.early_arrival_policy !== 'ACTUAL') {
    invalid('early_arrival_policy 不合法。')
  }
  if (policy.clock_in_rounding_mode !== 'NONE' && policy.clock_in_rounding_mode !== 'CEIL') {
    invalid('clock_in_rounding_mode 不合法。')
  }
  if (policy.clock_in_rounding_mode === 'CEIL') {
    if (policy.clock_in_rounding_minutes == null) invalid('clock_in_rounding_minutes 必須為正整數。')
    if (!Number.isInteger(policy.clock_in_rounding_minutes) || policy.clock_in_rounding_minutes <= 0) {
      invalid('clock_in_rounding_minutes 必須為正整數。')
    }
  }

  const clockOutMode = policy.clock_out_rounding_mode ?? 'NONE'
  if (clockOutMode !== 'NONE' && clockOutMode !== 'CEIL' && clockOutMode !== 'FLOOR') {
    invalid('clock_out_rounding_mode 不合法。')
  }
  if (clockOutMode !== 'NONE') {
    if (policy.clock_out_rounding_minutes == null) invalid('clock_out_rounding_minutes 必須為正整數。')
    if (!Number.isInteger(policy.clock_out_rounding_minutes) || policy.clock_out_rounding_minutes <= 0) {
      invalid('clock_out_rounding_minutes 必須為正整數。')
    }
  }

  return { clockOutMode, standardStart: parseTime(policy.standard_start_time) }
}

export function calculateAttendanceSummary({
  actual_clock_in_at,
  actual_clock_out_at = null,
  policy,
}: AttendanceCalculationInput): AttendanceCalculationResult {
  const actualClockIn = parseTimestamp(actual_clock_in_at, 'actual_clock_in_at')
  const actualClockOut = actual_clock_out_at === null
    ? null
    : parseTimestamp(actual_clock_out_at, 'actual_clock_out_at')
  const { clockOutMode, standardStart } = validatePolicy(policy)
  const workDate = getTaipeiToday(actualClockIn)
  const standardStartTimestamp = standardStartAt(workDate, standardStart)

  if (actualClockOut && getTaipeiToday(actualClockOut) !== workDate) {
    invalid('上、下班時間必須屬於同一個 Asia/Taipei 工作日。')
  }
  if (actualClockOut && actualClockOut.getTime() < actualClockIn.getTime()) {
    invalid('下班時間不可早於上班時間。')
  }

  const isEarlyOrOnTime = actualClockIn.getTime() <= standardStartTimestamp.getTime()
  let effectiveClockIn = isEarlyOrOnTime && policy.early_arrival_policy === 'STANDARD_START'
    ? standardStartTimestamp
    : actualClockIn
  if (!isEarlyOrOnTime && policy.clock_in_rounding_mode === 'CEIL') {
    effectiveClockIn = roundingBoundary(
      actualClockIn,
      'CEIL',
      policy.clock_in_rounding_minutes as number,
      workDate,
    )
  }

  const expectedClockOut = new Date(
    effectiveClockIn.getTime()
      + (policy.work_minutes + policy.fixed_break_minutes) * 60_000,
  )

  if (!actualClockOut) {
    return {
      actual_clock_in_at,
      actual_clock_out_at: null,
      effective_clock_in_at: effectiveClockIn.toISOString(),
      effective_clock_out_at: null,
      expected_clock_out_at: expectedClockOut.toISOString(),
      actual_elapsed_minutes: null,
      net_worked_minutes: null,
      regular_minutes: null,
      overtime_minutes: null,
    }
  }

  const effectiveClockOut = clockOutMode === 'NONE'
    ? actualClockOut
    : roundingBoundary(
      actualClockOut,
      clockOutMode,
      policy.clock_out_rounding_minutes as number,
      workDate,
    )
  const actualElapsedMinutes = Math.floor((actualClockOut.getTime() - actualClockIn.getTime()) / 60_000)
  const netWorkedMinutes = Math.max(
    0,
    Math.floor((effectiveClockOut.getTime() - effectiveClockIn.getTime()) / 60_000) - policy.fixed_break_minutes,
  )

  return {
    actual_clock_in_at,
    actual_clock_out_at,
    effective_clock_in_at: effectiveClockIn.toISOString(),
    effective_clock_out_at: effectiveClockOut.toISOString(),
    expected_clock_out_at: expectedClockOut.toISOString(),
    actual_elapsed_minutes: actualElapsedMinutes,
    net_worked_minutes: netWorkedMinutes,
    regular_minutes: Math.min(netWorkedMinutes, policy.work_minutes),
    overtime_minutes: Math.max(0, netWorkedMinutes - policy.work_minutes),
  }
}
