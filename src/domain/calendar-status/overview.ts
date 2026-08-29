import {
  resolveCalendarDay,
  findApplicableWorkPolicy,
  type CalendarResolutionSource,
  type CalendarDayType,
  type DgpaCalendarRow,
  type DgpaBaseline,
} from '../dgpa-calendar/resolver'
import type { WorkPolicy } from '../../lib/settings'

export type DayStatusType = 'LEAVE' | 'REMOTE' | 'BUSINESS_TRIP'
export type { CalendarDayType }

export type DayStatus = {
  id: string
  user_id: string
  work_date: string
  status: DayStatusType
  note: string | null
  created_at?: string
  updated_at?: string
}

export type CalendarOverride = {
  id: string
  user_id: string
  calendar_date: string
  day_type: CalendarDayType
  name: string | null
  note: string | null
  created_at?: string
  updated_at?: string
}

export type DailyOverview = {
  date: string
  dayOfMonth: number
  dayOfWeek: number // 0 (Sun) - 6 (Sat)
  dayOfWeekLabel: string
  isWeekend: boolean
  dayStatus: DayStatus | null
  calendarOverride: CalendarOverride | null
  hasAttendance: boolean
  hasException: boolean
  exceptionHint: string | null
  resolvedDayType: CalendarDayType
  resolvedSource: CalendarResolutionSource
  resolvedName: string | null
  dgpaBaseline: DgpaBaseline | null
}

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const

export function formatDayStatusLabel(status: DayStatusType): string {
  switch (status) {
    case 'LEAVE':
      return '請假'
    case 'REMOTE':
      return '遠端'
    case 'BUSINESS_TRIP':
      return '出差'
  }
}

export function formatCalendarResolutionLabel(
  source: CalendarResolutionSource,
  dayType: CalendarDayType,
  isWeekend = false
): string {
  switch (source) {
    case 'MANUAL_OVERRIDE':
      return dayType === 'WORKDAY' ? '人工工作日' : '人工假日'
    case 'DGPA':
      if (dayType === 'HOLIDAY') return 'DGPA 假日'
      return isWeekend ? 'DGPA 補班日' : 'DGPA 工作日'
    case 'WORK_POLICY':
      return dayType === 'WORKDAY' ? '制度工作日' : '制度非工作日'
    case 'WEEKEND_FALLBACK':
      return dayType === 'WORKDAY' ? '預設平日' : '週末預設'
  }
}

export function buildMonthOverview(params: {
  yearMonth: string // YYYY-MM
  dayStatuses: DayStatus[]
  calendarOverrides: CalendarOverride[]
  attendanceDates: Set<string>
  dgpaRows?: DgpaCalendarRow[]
  workPolicies?: WorkPolicy[]
}): DailyOverview[] {
  const {
    yearMonth,
    dayStatuses,
    calendarOverrides,
    attendanceDates,
    dgpaRows = [],
    workPolicies = [],
  } = params

  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr) // 1-based

  // Number of days in month (UTC safe)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const dayStatusMap = new Map<string, DayStatus>()
  for (const ds of dayStatuses) {
    dayStatusMap.set(ds.work_date, ds)
  }

  const calendarOverrideMap = new Map<string, CalendarOverride>()
  for (const co of calendarOverrides) {
    calendarOverrideMap.set(co.calendar_date, co)
  }

  const dgpaMap = new Map<string, DgpaCalendarRow>()
  for (const row of dgpaRows) {
    dgpaMap.set(row.calendar_date, row)
  }

  const days: DailyOverview[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const date = `${yearMonth}-${dayStr}`
    const dateObj = new Date(Date.UTC(year, month - 1, d, 12, 0, 0))
    const dayOfWeek = dateObj.getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    const dayStatus = dayStatusMap.get(date) ?? null
    const calendarOverride = calendarOverrideMap.get(date) ?? null
    const dgpaRow = dgpaMap.get(date) ?? null
    const applicableWorkPolicy = findApplicableWorkPolicy(date, workPolicies)

    const resolved = resolveCalendarDay({
      date,
      manualOverride: calendarOverride,
      dgpaRow,
      applicableWorkPolicy,
    })

    const hasAttendance = attendanceDates.has(date)
    const isHoliday = resolved.dayType === 'HOLIDAY'
    const isLeaveStatus = dayStatus?.status === 'LEAVE'
    const hasException = hasAttendance && (isHoliday || isLeaveStatus)

    let exceptionHint: string | null = null
    if (hasException) {
      if (isHoliday && isLeaveStatus) {
        exceptionHint = '此日為假日且標記請假，但已有出勤紀錄'
      } else if (isHoliday) {
        exceptionHint = '此日為假日，但已有出勤紀錄'
      } else if (isLeaveStatus) {
        exceptionHint = '此日標記請假，但已有出勤紀錄'
      }
    }

    days.push({
      date,
      dayOfMonth: d,
      dayOfWeek,
      dayOfWeekLabel: WEEKDAY_LABELS[dayOfWeek],
      isWeekend,
      dayStatus,
      calendarOverride,
      hasAttendance,
      hasException,
      exceptionHint,
      resolvedDayType: resolved.dayType,
      resolvedSource: resolved.source,
      resolvedName: resolved.name,
      dgpaBaseline: resolved.dgpaBaseline,
    })
  }

  return days
}
