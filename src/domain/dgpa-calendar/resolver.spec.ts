import { describe, expect, it } from 'vitest'
import {
  resolveCalendarDay,
  findApplicableWorkPolicy,
  findApplicableWorkAssignment,
  resolveApplicableWorkPolicy,
  type DgpaCalendarRow,
} from './resolver'
import type { CalendarOverride } from '../calendar-status/overview'
import type { WorkPolicy, WorkAssignment } from '../../lib/settings'

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

  it('throws invariant violation error if multiple policies match for the same date and assignment', () => {
    const overlappingPolicy: WorkPolicy = {
      ...policyV1,
      id: 'pol-v1-overlap',
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
    }

    expect(() => {
      findApplicableWorkPolicy('2026-06-10', [policyV1, overlappingPolicy])
    }).toThrow('multiple work policies resolve for assignment and target date')
  })
})

describe('findApplicableWorkAssignment', () => {
  const assignmentA: WorkAssignment = {
    id: 'wa-a',
    user_id: 'user-1',
    staffing_employer: 'Employer A',
    client_company: 'Client A',
    project: 'Project A',
    effective_from: '2026-08-01',
    effective_to: '2026-08-15',
  }

  const assignmentB: WorkAssignment = {
    id: 'wa-b',
    user_id: 'user-1',
    staffing_employer: 'Employer B',
    client_company: 'Client B',
    project: 'Project B',
    effective_from: '2026-08-20',
    effective_to: null,
  }

  it('resolves active assignment for target date within effective range', () => {
    expect(findApplicableWorkAssignment('2026-08-10', [assignmentA, assignmentB])?.id).toBe('wa-a')
    expect(findApplicableWorkAssignment('2026-08-25', [assignmentA, assignmentB])?.id).toBe('wa-b')
  })

  it('returns null on NO_ASSIGNMENT (date before, in gap, or empty list)', () => {
    expect(findApplicableWorkAssignment('2026-07-31', [assignmentA, assignmentB])).toBeNull()
    expect(findApplicableWorkAssignment('2026-08-17', [assignmentA, assignmentB])).toBeNull()
    expect(findApplicableWorkAssignment('2026-08-10', [])).toBeNull()
  })

  it('throws invariant violation error if multiple assignments match the same target date', () => {
    const overlappingAssignment: WorkAssignment = {
      ...assignmentB,
      id: 'wa-overlap',
      effective_from: '2026-08-05',
    }

    expect(() => {
      findApplicableWorkAssignment('2026-08-10', [assignmentA, overlappingAssignment])
    }).toThrow('multiple work assignments resolve for target date')
  })
})

describe('resolveApplicableWorkPolicy', () => {
  const assignment1: WorkAssignment = {
    id: 'wa-1',
    user_id: 'user-1',
    staffing_employer: 'Emp 1',
    client_company: 'Client 1',
    project: 'Project 1',
    effective_from: '2026-08-01',
    effective_to: '2026-08-15',
  }

  const assignment2: WorkAssignment = {
    id: 'wa-2',
    user_id: 'user-1',
    staffing_employer: 'Emp 2',
    client_company: 'Client 2',
    project: 'Project 2',
    effective_from: '2026-08-20',
    effective_to: '2026-08-31',
  }

  const policy1: WorkPolicy = {
    id: 'pol-1',
    user_id: 'user-1',
    assignment_id: 'wa-1',
    context_id: null,
    name: 'Policy 1 (Mon-Fri)',
    standard_start_time: '09:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    working_days: ['1', '2', '3', '4', '5'],
    effective_from: '2026-08-01',
    effective_to: '2026-08-15',
    timezone: 'Asia/Taipei',
  }

  const policy2: WorkPolicy = {
    id: 'pol-2',
    user_id: 'user-1',
    assignment_id: 'wa-2',
    context_id: null,
    name: 'Policy 2 (Tue-Sat)',
    standard_start_time: '10:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    working_days: ['2', '3', '4', '5', '6'],
    effective_from: '2026-08-20',
    effective_to: null,
    timezone: 'Asia/Taipei',
  }

  it('returns null on NO_ASSIGNMENT (empty assignments list)', () => {
    const policy = resolveApplicableWorkPolicy({
      date: '2026-08-05',
      workAssignments: [],
      workPolicies: [policy1],
    })
    expect(policy).toBeNull()
  })

  it('returns null on MISSING_POLICY (assignment exists but has no policy)', () => {
    const policy = resolveApplicableWorkPolicy({
      date: '2026-08-05',
      workAssignments: [assignment1],
      workPolicies: [], // No policies
    })
    expect(policy).toBeNull()
  })

  it('returns null during gap between two assignments', () => {
    const policy = resolveApplicableWorkPolicy({
      date: '2026-08-18', // Between wa-1 (ends Aug 15) and wa-2 (starts Aug 20)
      workAssignments: [assignment1, assignment2],
      workPolicies: [policy1, policy2],
    })
    expect(policy).toBeNull()
  })

  it('correctly maps target date to canonical assignment policy without misapplying across assignments', () => {
    // Under wa-1
    const p1 = resolveApplicableWorkPolicy({
      date: '2026-08-10',
      workAssignments: [assignment1, assignment2],
      workPolicies: [policy1, policy2],
    })
    expect(p1?.id).toBe('pol-1')

    // Under wa-2
    const p2 = resolveApplicableWorkPolicy({
      date: '2026-08-25',
      workAssignments: [assignment1, assignment2],
      workPolicies: [policy1, policy2],
    })
    expect(p2?.id).toBe('pol-2')
  })

  it('does not apply past assignment policy to future dates or future assignment policy to past dates', () => {
    // Before wa-1 starts
    expect(resolveApplicableWorkPolicy({
      date: '2026-07-31',
      workAssignments: [assignment1],
      workPolicies: [policy1],
    })).toBeNull()

    // After wa-1 ends
    expect(resolveApplicableWorkPolicy({
      date: '2026-08-16',
      workAssignments: [assignment1],
      workPolicies: [policy1],
    })).toBeNull()
  })
})
