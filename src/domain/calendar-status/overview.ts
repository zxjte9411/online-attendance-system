export type DayStatusType = 'LEAVE' | 'REMOTE' | 'BUSINESS_TRIP'
export type CalendarDayType = 'WORKDAY' | 'HOLIDAY'

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

export function formatCalendarOverrideLabel(dayType: CalendarDayType): string {
  switch (dayType) {
    case 'WORKDAY':
      return '人工工作日'
    case 'HOLIDAY':
      return '人工假日'
  }
}

export function buildMonthOverview(params: {
  yearMonth: string // YYYY-MM
  dayStatuses: DayStatus[]
  calendarOverrides: CalendarOverride[]
  attendanceDates: Set<string>
}): DailyOverview[] {
  const { yearMonth, dayStatuses, calendarOverrides, attendanceDates } = params
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

  const days: DailyOverview[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const date = `${yearMonth}-${dayStr}`
    const dateObj = new Date(Date.UTC(year, month - 1, d, 12, 0, 0))
    const dayOfWeek = dateObj.getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    const dayStatus = dayStatusMap.get(date) ?? null
    const calendarOverride = calendarOverrideMap.get(date) ?? null
    const hasAttendance = attendanceDates.has(date)

    const isHolidayOverride = calendarOverride?.day_type === 'HOLIDAY'
    const isLeaveStatus = dayStatus?.status === 'LEAVE'
    const hasException = hasAttendance && (isHolidayOverride || isLeaveStatus)

    let exceptionHint: string | null = null
    if (hasException) {
      if (isHolidayOverride && isLeaveStatus) {
        exceptionHint = '此日為人工假日且標記請假，但已有出勤紀錄'
      } else if (isHolidayOverride) {
        exceptionHint = '此日為人工假日，但已有出勤紀錄'
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
    })
  }

  return days
}
