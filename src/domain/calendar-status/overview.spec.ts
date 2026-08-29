import { describe, expect, it } from 'vitest'
import {
  buildMonthOverview,
  formatDayStatusLabel,
  formatCalendarResolutionLabel,
  type DayStatus,
  type CalendarOverride,
} from './overview'
import type { DgpaCalendarRow } from '../dgpa-calendar/resolver'
import type { WorkPolicy } from '../../lib/settings'

describe('buildMonthOverview', () => {
  it('generates all days for a given month with correct weekdays and default weekend fallback', () => {
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
    expect(overview[0].resolvedDayType).toBe('HOLIDAY')
    expect(overview[0].resolvedSource).toBe('WEEKEND_FALLBACK')

    expect(overview[1].date).toBe('2026-02-02') // Monday
    expect(overview[1].resolvedDayType).toBe('WORKDAY')
    expect(overview[1].resolvedSource).toBe('WEEKEND_FALLBACK')

    expect(overview[27].date).toBe('2026-02-28')
    expect(overview[27].dayOfWeekLabel).toBe('週六')
  })

  it('integrates DGPA rows into resolved day type and preserves baseline under manual override', () => {
    const dgpaRows: DgpaCalendarRow[] = [
      {
        calendar_date: '2026-02-07', // Saturday DGPA make-up workday
        day_type: 'WORKDAY',
        name: '補行上班',
        source: 'https://test',
        fetched_at: '2026-01-01T00:00:00Z',
      },
      {
        calendar_date: '2026-02-15', // Sunday DGPA holiday
        day_type: 'HOLIDAY',
        name: '小年夜',
        source: 'https://test',
        fetched_at: '2026-01-01T00:00:00Z',
      },
      {
        calendar_date: '2026-02-16', // Monday DGPA holiday
        day_type: 'HOLIDAY',
        name: '除夕',
        source: 'https://test',
        fetched_at: '2026-01-01T00:00:00Z',
      },
    ]

    const calendarOverrides: CalendarOverride[] = [
      {
        id: 'co-1',
        user_id: 'user-1',
        calendar_date: '2026-02-07',
        day_type: 'HOLIDAY',
        name: '公司免補班',
        note: null,
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-02',
      dayStatuses: [],
      calendarOverrides,
      attendanceDates: new Set(),
      dgpaRows,
    })

    // Feb 7: Manual override HOLIDAY on DGPA WORKDAY
    const feb7 = overview.find((d) => d.date === '2026-02-07')!
    expect(feb7.resolvedDayType).toBe('HOLIDAY')
    expect(feb7.resolvedSource).toBe('MANUAL_OVERRIDE')
    expect(feb7.resolvedName).toBe('公司免補班')
    expect(feb7.dgpaBaseline).toEqual({
      dayType: 'WORKDAY',
      name: '補行上班',
      fetchedAt: '2026-01-01T00:00:00Z',
    })

    // Feb 16: DGPA Holiday on Monday
    const feb16 = overview.find((d) => d.date === '2026-02-16')!
    expect(feb16.resolvedDayType).toBe('HOLIDAY')
    expect(feb16.resolvedSource).toBe('DGPA')
    expect(feb16.resolvedName).toBe('除夕')
    expect(feb16.dgpaBaseline).toEqual({
      dayType: 'HOLIDAY',
      name: '除夕',
      fetchedAt: '2026-01-01T00:00:00Z',
    })
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
    expect(aug10.exceptionHint).toBe('此日為假日且標記請假，但已有出勤紀錄')

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

  it('detects exception when attendance exists on HOLIDAY override or DGPA holiday', () => {
    const dgpaRows: DgpaCalendarRow[] = [
      {
        calendar_date: '2026-08-20',
        day_type: 'HOLIDAY',
        name: '節日放假',
        source: 'https://test',
        fetched_at: '2026-01-01T00:00:00Z',
      },
    ]

    const overview = buildMonthOverview({
      yearMonth: '2026-08',
      dayStatuses: [],
      calendarOverrides: [],
      attendanceDates: new Set(['2026-08-20']),
      dgpaRows,
    })

    const aug20 = overview.find((d) => d.date === '2026-08-20')!
    expect(aug20.hasException).toBe(true)
    expect(aug20.exceptionHint).toBe('此日為假日，但已有出勤紀錄')
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

  it('formats labels correctly', () => {
    expect(formatDayStatusLabel('LEAVE')).toBe('請假')
    expect(formatDayStatusLabel('REMOTE')).toBe('遠端')
    expect(formatDayStatusLabel('BUSINESS_TRIP')).toBe('出差')
    expect(formatCalendarResolutionLabel('MANUAL_OVERRIDE', 'WORKDAY')).toBe('人工工作日')
    expect(formatCalendarResolutionLabel('MANUAL_OVERRIDE', 'HOLIDAY')).toBe('人工假日')
    expect(formatCalendarResolutionLabel('DGPA', 'WORKDAY', false)).toBe('DGPA 工作日')
    expect(formatCalendarResolutionLabel('DGPA', 'WORKDAY', true)).toBe('DGPA 補班日')
    expect(formatCalendarResolutionLabel('DGPA', 'HOLIDAY', false)).toBe('DGPA 假日')
    expect(formatCalendarResolutionLabel('DGPA', 'HOLIDAY', true)).toBe('DGPA 假日')
    expect(formatCalendarResolutionLabel('WORK_POLICY', 'WORKDAY')).toBe('制度工作日')
    expect(formatCalendarResolutionLabel('WORK_POLICY', 'HOLIDAY')).toBe('制度非工作日')
    expect(formatCalendarResolutionLabel('WEEKEND_FALLBACK', 'WORKDAY')).toBe('預設平日')
    expect(formatCalendarResolutionLabel('WEEKEND_FALLBACK', 'HOLIDAY')).toBe('週末預設')
  })
})
