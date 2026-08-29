import { describe, expect, it } from 'vitest'
import {
  resolveCalendarDay,
  findApplicableWorkPolicy,
  type DgpaCalendarRow,
} from './resolver'
import type { CalendarOverride } from '../calendar-status/overview'
import type { WorkPolicy } from '../../lib/settings'

describe('Domain Calendar Resolver (resolveCalendarDay)', () => {
  const sampleDgpaWorkday: DgpaCalendarRow = {
    calendar_date: '2026-02-07', // Saturday make-up workday
    day_type: 'WORKDAY',
    name: '補行上班',
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-01-01T00:00:00Z',
  }

  const sampleDgpaHoliday: DgpaCalendarRow = {
    calendar_date: '2026-01-01', // Thursday holiday
    day_type: 'HOLIDAY',
    name: '中華民國開國紀念日',
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-01-01T00:00:00Z',
  }

  const standardWorkPolicy: WorkPolicy = {
    id: 'pol-1',
    user_id: 'user-1',
    context_id: 'ctx-1',
    name: '週一至週五標準制度',
    standard_start_time: '09:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    working_days: ['1', '2', '3', '4', '5'],
    effective_from: '2026-01-01',
    effective_to: null,
    timezone: 'Asia/Taipei',
  }

  it('Manual HOLIDAY override takes precedence over DGPA WORKDAY with baseline preserved', () => {
    const manualOverride: CalendarOverride = {
      id: 'ov-1',
      user_id: 'user-1',
      calendar_date: '2026-02-07',
      day_type: 'HOLIDAY',
      name: '公司特別放假',
      note: null,
    }

    const resolved = resolveCalendarDay({
      date: '2026-02-07',
      manualOverride,
      dgpaRow: sampleDgpaWorkday,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('HOLIDAY')
    expect(resolved.source).toBe('MANUAL_OVERRIDE')
    expect(resolved.name).toBe('公司特別放假')
    expect(resolved.dgpaBaseline).toEqual({
      dayType: 'WORKDAY',
      name: '補行上班',
      fetchedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('Manual WORKDAY override takes precedence over DGPA HOLIDAY with baseline preserved', () => {
    const manualOverride: CalendarOverride = {
      id: 'ov-2',
      user_id: 'user-1',
      calendar_date: '2026-01-01',
      day_type: 'WORKDAY',
      name: '值班出勤日',
      note: null,
    }

    const resolved = resolveCalendarDay({
      date: '2026-01-01',
      manualOverride,
      dgpaRow: sampleDgpaHoliday,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('WORKDAY')
    expect(resolved.source).toBe('MANUAL_OVERRIDE')
    expect(resolved.name).toBe('值班出勤日')
    expect(resolved.dgpaBaseline).toEqual({
      dayType: 'HOLIDAY',
      name: '中華民國開國紀念日',
      fetchedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('Without manual override, DGPA HOLIDAY takes precedence over standard weekday', () => {
    const resolved = resolveCalendarDay({
      date: '2026-01-01', // Thursday
      manualOverride: null,
      dgpaRow: sampleDgpaHoliday,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('HOLIDAY')
    expect(resolved.source).toBe('DGPA')
    expect(resolved.name).toBe('中華民國開國紀念日')
    expect(resolved.dgpaBaseline).toEqual({
      dayType: 'HOLIDAY',
      name: '中華民國開國紀念日',
      fetchedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('Without manual override, DGPA Saturday make-up WORKDAY takes precedence over weekend', () => {
    const resolved = resolveCalendarDay({
      date: '2026-02-07', // Saturday
      manualOverride: null,
      dgpaRow: sampleDgpaWorkday,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('WORKDAY')
    expect(resolved.source).toBe('DGPA')
    expect(resolved.name).toBe('補行上班')
    expect(resolved.dgpaBaseline).toEqual({
      dayType: 'WORKDAY',
      name: '補行上班',
      fetchedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('Without DGPA row, date in Work Policy working_days resolves to WORKDAY', () => {
    const resolved = resolveCalendarDay({
      date: '2026-03-02', // Monday
      manualOverride: null,
      dgpaRow: null,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('WORKDAY')
    expect(resolved.source).toBe('WORK_POLICY')
    expect(resolved.name).toBeNull()
    expect(resolved.dgpaBaseline).toBeNull()
  })

  it('Without DGPA row, date NOT in Work Policy working_days resolves to HOLIDAY', () => {
    const resolved = resolveCalendarDay({
      date: '2026-03-01', // Sunday
      manualOverride: null,
      dgpaRow: null,
      applicableWorkPolicy: standardWorkPolicy,
    })

    expect(resolved.dayType).toBe('HOLIDAY')
    expect(resolved.source).toBe('WORK_POLICY')
    expect(resolved.name).toBeNull()
    expect(resolved.dgpaBaseline).toBeNull()
  })

  it('Saturday is resolved as WORKDAY if configured in Work Policy working_days', () => {
    const saturdayWorkPolicy: WorkPolicy = {
      ...standardWorkPolicy,
      working_days: ['1', '2', '3', '4', '5', '6'],
    }

    const resolved = resolveCalendarDay({
      date: '2026-03-07', // Saturday
      manualOverride: null,
      dgpaRow: null,
      applicableWorkPolicy: saturdayWorkPolicy,
    })

    expect(resolved.dayType).toBe('WORKDAY')
    expect(resolved.source).toBe('WORK_POLICY')
  })

  it('Falls back to WEEKEND_FALLBACK when no applicable Work Policy and no DGPA row exist', () => {
    const resolvedSat = resolveCalendarDay({
      date: '2026-03-07', // Saturday
      manualOverride: null,
      dgpaRow: null,
      applicableWorkPolicy: null,
    })
    expect(resolvedSat.dayType).toBe('HOLIDAY')
    expect(resolvedSat.source).toBe('WEEKEND_FALLBACK')

    const resolvedWed = resolveCalendarDay({
      date: '2026-03-04', // Wednesday
      manualOverride: null,
      dgpaRow: null,
      applicableWorkPolicy: null,
    })
    expect(resolvedWed.dayType).toBe('WORKDAY')
    expect(resolvedWed.source).toBe('WEEKEND_FALLBACK')
  })
})

describe('Work Policy Resolver (findApplicableWorkPolicy)', () => {
  const policyV1: WorkPolicy = {
    id: 'pol-v1',
    user_id: 'user-1',
    context_id: 'ctx-1',
    name: 'V1 四天工作制',
    standard_start_time: '09:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    working_days: ['1', '2', '3', '4'],
    effective_from: '2026-01-01',
    effective_to: '2026-06-15',
    timezone: 'Asia/Taipei',
  }

  const policyV2: WorkPolicy = {
    id: 'pol-v2',
    user_id: 'user-1',
    context_id: 'ctx-1',
    name: 'V2 五天工作制',
    standard_start_time: '09:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    working_days: ['1', '2', '3', '4', '5'],
    effective_from: '2026-06-16',
    effective_to: null,
    timezone: 'Asia/Taipei',
  }

  it('correctly selects applicable policy during mid-month policy version switch', () => {
    const policies = [policyV1, policyV2]

    // June 10, 2026 -> should match V1
    const matchEarlyJune = findApplicableWorkPolicy('2026-06-10', policies)
    expect(matchEarlyJune?.id).toBe('pol-v1')

    // June 20, 2026 -> should match V2
    const matchLateJune = findApplicableWorkPolicy('2026-06-20', policies)
    expect(matchLateJune?.id).toBe('pol-v2')

    // Date before any policy -> returns null
    const match2025 = findApplicableWorkPolicy('2025-12-31', policies)
    expect(match2025).toBeNull()
  })
})
