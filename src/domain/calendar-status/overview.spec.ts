import { describe, expect, it } from 'vitest'
import {
  buildMonthOverview,
  formatDayStatusLabel,
  formatCalendarOverrideLabel,
  type DayStatus,
  type CalendarOverride,
} from './overview'

describe('buildMonthOverview', () => {
  it('generates all days for a given month with correct weekdays', () => {
    const overview = buildMonthOverview({
      yearMonth: '2026-02',
      dayStatuses: [],
      calendarOverrides: [],
      attendanceDates: new Set(),
    })

    expect(overview).toHaveLength(28)
    expect(overview[0].date).toBe('2026-02-01')
    expect(overview[0].dayOfWeekLabel).toBe('週日')
    expect(overview[0].isWeekend).toBe(true)
    expect(overview[27].date).toBe('2026-02-28')
    expect(overview[27].dayOfWeekLabel).toBe('週六')
  })

  it('maps Day Status and Calendar Override onto matching dates', () => {
    const dayStatuses: DayStatus[] = [
      {
        id: 'ds-1',
        user_id: 'user-1',
        work_date: '2026-08-10',
        status: 'LEAVE',
        note: '特休',
      },
      {
        id: 'ds-2',
        user_id: 'user-1',
        work_date: '2026-08-11',
        status: 'REMOTE',
        note: '在家工作',
      },
      {
        id: 'ds-3',
        user_id: 'user-1',
        work_date: '2026-08-12',
        status: 'BUSINESS_TRIP',
        note: '台中出差',
      },
    ]

    const calendarOverrides: CalendarOverride[] = [
      {
        id: 'co-1',
        user_id: 'user-1',
        calendar_date: '2026-08-10',
        day_type: 'HOLIDAY',
        name: '廠慶',
        note: '全公司放假',
      },
      {
        id: 'co-2',
        user_id: 'user-1',
        calendar_date: '2026-08-15',
        day_type: 'WORKDAY',
        name: '補班',
        note: null,
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-08',
      dayStatuses,
      calendarOverrides,
      attendanceDates: new Set(['2026-08-10', '2026-08-11']),
    })

    const aug10 = overview.find((d) => d.date === '2026-08-10')!
    expect(aug10.dayStatus?.status).toBe('LEAVE')
    expect(aug10.calendarOverride?.day_type).toBe('HOLIDAY')
    expect(aug10.hasAttendance).toBe(true)
    expect(aug10.hasException).toBe(true)
    expect(aug10.exceptionHint).toBe('此日為人工假日且標記請假，但已有出勤紀錄')

    const aug11 = overview.find((d) => d.date === '2026-08-11')!
    expect(aug11.dayStatus?.status).toBe('REMOTE')
    expect(aug11.calendarOverride).toBeNull()
    expect(aug11.hasAttendance).toBe(true)
    expect(aug11.hasException).toBe(false)
    expect(aug11.exceptionHint).toBeNull()

    const aug15 = overview.find((d) => d.date === '2026-08-15')!
    expect(aug15.calendarOverride?.day_type).toBe('WORKDAY')
    expect(aug15.hasAttendance).toBe(false)
    expect(aug15.hasException).toBe(false)
  })

  it('detects exception when attendance exists on HOLIDAY override only', () => {
    const calendarOverrides: CalendarOverride[] = [
      {
        id: 'co-1',
        user_id: 'user-1',
        calendar_date: '2026-08-20',
        day_type: 'HOLIDAY',
        name: '國定假日',
        note: null,
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-08',
      dayStatuses: [],
      calendarOverrides,
      attendanceDates: new Set(['2026-08-20']),
    })

    const aug20 = overview.find((d) => d.date === '2026-08-20')!
    expect(aug20.hasException).toBe(true)
    expect(aug20.exceptionHint).toBe('此日為人工假日，但已有出勤紀錄')
  })

  it('detects exception when attendance exists on LEAVE status only', () => {
    const dayStatuses: DayStatus[] = [
      {
        id: 'ds-1',
        user_id: 'user-1',
        work_date: '2026-08-21',
        status: 'LEAVE',
        note: null,
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-08',
      dayStatuses,
      calendarOverrides: [],
      attendanceDates: new Set(['2026-08-21']),
    })

    const aug21 = overview.find((d) => d.date === '2026-08-21')!
    expect(aug21.hasException).toBe(true)
    expect(aug21.exceptionHint).toBe('此日標記請假，但已有出勤紀錄')
  })

  it('does not flag exception when attendance exists on WORKDAY override or without status', () => {
    const calendarOverrides: CalendarOverride[] = [
      {
        id: 'co-1',
        user_id: 'user-1',
        calendar_date: '2026-08-22',
        day_type: 'WORKDAY',
        name: '週末補班',
        note: null,
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-08',
      dayStatuses: [],
      calendarOverrides,
      attendanceDates: new Set(['2026-08-22', '2026-08-23']),
    })

    const aug22 = overview.find((d) => d.date === '2026-08-22')!
    expect(aug22.hasException).toBe(false)
    expect(aug22.exceptionHint).toBeNull()

    const aug23 = overview.find((d) => d.date === '2026-08-23')!
    expect(aug23.hasException).toBe(false)
    expect(aug23.exceptionHint).toBeNull()
  })

  it('formats labels correctly', () => {
    expect(formatDayStatusLabel('LEAVE')).toBe('請假')
    expect(formatDayStatusLabel('REMOTE')).toBe('遠端')
    expect(formatDayStatusLabel('BUSINESS_TRIP')).toBe('出差')
    expect(formatCalendarOverrideLabel('WORKDAY')).toBe('人工工作日')
    expect(formatCalendarOverrideLabel('HOLIDAY')).toBe('人工假日')
  })
})
