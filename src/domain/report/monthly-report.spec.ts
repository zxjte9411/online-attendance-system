import { describe, expect, it } from 'vitest'
import { buildMonthlyReport } from './monthly-report'
import type { WorkContext, WorkPolicy } from '../../lib/settings'
import type { AttendanceRecord } from '../../lib/attendance'
import type { DayStatus, CalendarOverride } from '../calendar-status/overview'

const mockContext: WorkContext = {
  id: 'ctx-1',
  user_id: 'user-1',
  name: '預設工作情境',
  company_identifier: 'COMPANY_A',
  project_identifier: 'PROJECT_X',
  active: true,
  is_default: true,
}

const mockPolicy: WorkPolicy = {
  id: 'pol-1',
  user_id: 'user-1',
  context_id: 'ctx-1',
  name: '標準制度 8h',
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

function createAttendance(workDate: string, overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: `att-${workDate}`,
    user_id: 'user-1',
    work_date: workDate,
    context_id: 'ctx-1',
    work_policy_id: 'pol-1',
    actual_clock_in_at: `${workDate}T09:00:00+08:00`,
    actual_clock_out_at: `${workDate}T18:00:00+08:00`,
    effective_clock_in_at: `${workDate}T09:00:00+08:00`,
    effective_clock_out_at: `${workDate}T18:00:00+08:00`,
    expected_clock_out_at: `${workDate}T18:00:00+08:00`,
    actual_elapsed_minutes: 540,
    net_worked_minutes: 480,
    regular_minutes: 480,
    overtime_minutes: 0,
    context_snapshot: {
      company_identifier: 'COMPANY_A',
      project_identifier: 'PROJECT_X',
    },
    policy_snapshot: {
      work_minutes: 480,
    },
    calculation_snapshot: {
      calculation_version: 'v1',
    },
    created_source: 'CLOCK',
    manually_adjusted: false,
    last_manual_edit_at: null,
    status_note: null,
    ...overrides,
  }
}

describe('Monthly Report Domain (buildMonthlyReport)', () => {
  it('產生 28 / 29 / 30 / 31 天的完整 date spine', () => {
    // 2026-02 (28 days)
    const reportFeb2026 = buildMonthlyReport({
      yearMonth: '2026-02',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })
    expect(reportFeb2026.rows).toHaveLength(28)
    expect(reportFeb2026.rows[0].date).toBe('2026-02-01')
    expect(reportFeb2026.rows[27].date).toBe('2026-02-28')

    // 2024-02 (29 days - leap year)
    const reportFeb2024 = buildMonthlyReport({
      yearMonth: '2024-02',
      context: mockContext,
      workPolicies: [{ ...mockPolicy, effective_from: '2024-01-01' }],
      attendanceRecords: [],
    })
    expect(reportFeb2024.rows).toHaveLength(29)
    expect(reportFeb2024.rows[28].date).toBe('2024-02-29')

    // 2026-04 (30 days)
    const reportApr = buildMonthlyReport({
      yearMonth: '2026-04',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })
    expect(reportApr.rows).toHaveLength(30)

    // 2026-08 (31 days)
    const reportAug = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })
    expect(reportAug.rows).toHaveLength(31)
  })

  it('覆蓋 Case A–J 每日矩陣與規則', () => {
    // We construct 10 specific dates in 2026-08
    // 2026-08-01 is Saturday (Weekend fallback HOLIDAY)
    // 2026-08-02 is Sunday (Weekend fallback HOLIDAY)
    // 2026-08-03 (Mon) - 2026-08-07 (Fri) are WORKDAYs
    // 2026-08-10 (Mon) - 2026-08-14 (Fri) are WORKDAYs

    const dayStatuses: DayStatus[] = [
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-02', status: 'LEAVE', note: '週日請假' }, // B: HOLIDAY + LEAVE
      { id: 'ds-2', user_id: 'user-1', work_date: '2026-08-04', status: 'REMOTE', note: '遠端' }, // D: WORKDAY + REMOTE + complete
      { id: 'ds-3', user_id: 'user-1', work_date: '2026-08-05', status: 'LEAVE', note: '休假' }, // E: WORKDAY + LEAVE + none
      { id: 'ds-4', user_id: 'user-1', work_date: '2026-08-06', status: 'LEAVE', note: '請假但出勤' }, // F: WORKDAY + LEAVE + complete
      { id: 'ds-5', user_id: 'user-1', work_date: '2026-08-10', status: 'REMOTE', note: '遠端無出勤' }, // H: WORKDAY + REMOTE + none
      { id: 'ds-6', user_id: 'user-1', work_date: '2026-08-11', status: 'BUSINESS_TRIP', note: '出差無出勤' }, // I: WORKDAY + BUSINESS_TRIP + none
    ]

    const attendanceRecords: AttendanceRecord[] = [
      createAttendance('2026-08-03'), // A: WORKDAY, none, complete
      createAttendance('2026-08-04'), // D: WORKDAY, REMOTE, complete
      createAttendance('2026-08-06'), // F: WORKDAY, LEAVE, complete
      createAttendance('2026-08-08'), // G: 2026-08-08 (Sat - HOLIDAY), none, complete
      createAttendance('2026-08-12', { // J: WORKDAY, none, incomplete
        actual_clock_out_at: null,
        effective_clock_out_at: null,
        actual_elapsed_minutes: null,
        net_worked_minutes: null,
        regular_minutes: null,
        overtime_minutes: null,
      }),
    ]

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords,
      dayStatuses,
    })

    const rowMap = new Map(report.rows.map((r) => [r.date, r]))

    // Case A: 2026-08-03 WORKDAY, none, complete
    const rowA = rowMap.get('2026-08-03')!
    expect(rowA.calendar_day_type).toBe('WORKDAY')
    expect(rowA.status).toBeNull()
    expect(rowA.scheduled_minutes).toBe(480)
    expect(rowA.leave_minutes).toBe(0)
    expect(rowA.absence_minutes).toBe(0)
    expect(rowA.regular_minutes).toBe(480)
    expect(rowA.is_incomplete).toBe(false)
    expect(rowA.exception_flags).toEqual([])

    // Case B: 2026-08-02 HOLIDAY, LEAVE, none
    const rowB = rowMap.get('2026-08-02')!
    expect(rowB.calendar_day_type).toBe('HOLIDAY')
    expect(rowB.status).toBe('LEAVE')
    expect(rowB.scheduled_minutes).toBe(0)
    expect(rowB.leave_minutes).toBe(0)
    expect(rowB.absence_minutes).toBe(0)
    expect(rowB.exception_flags).toEqual([])

    // Case C: 2026-08-07 WORKDAY, none, none
    const rowC = rowMap.get('2026-08-07')!
    expect(rowC.calendar_day_type).toBe('WORKDAY')
    expect(rowC.status).toBe('ABSENT')
    expect(rowC.scheduled_minutes).toBe(480)
    expect(rowC.leave_minutes).toBe(0)
    expect(rowC.absence_minutes).toBe(480)
    expect(rowC.is_incomplete).toBe(false)

    // Case D: 2026-08-04 WORKDAY, REMOTE, complete
    const rowD = rowMap.get('2026-08-04')!
    expect(rowD.calendar_day_type).toBe('WORKDAY')
    expect(rowD.status).toBe('REMOTE')
    expect(rowD.scheduled_minutes).toBe(480)
    expect(rowD.leave_minutes).toBe(0)
    expect(rowD.absence_minutes).toBe(0)
    expect(rowD.regular_minutes).toBe(480)

    // Case E: 2026-08-05 WORKDAY, LEAVE, none
    const rowE = rowMap.get('2026-08-05')!
    expect(rowE.calendar_day_type).toBe('WORKDAY')
    expect(rowE.status).toBe('LEAVE')
    expect(rowE.scheduled_minutes).toBe(480)
    expect(rowE.leave_minutes).toBe(480)
    expect(rowE.absence_minutes).toBe(0)

    // Case F: 2026-08-06 WORKDAY, LEAVE, complete
    const rowF = rowMap.get('2026-08-06')!
    expect(rowF.calendar_day_type).toBe('WORKDAY')
    expect(rowF.status).toBe('LEAVE')
    expect(rowF.scheduled_minutes).toBe(480)
    expect(rowF.leave_minutes).toBe(0) // Has attendance -> no leave_minutes
    expect(rowF.absence_minutes).toBe(0)
    expect(rowF.regular_minutes).toBe(480)
    expect(rowF.exception_flags).toContain('LEAVE_WITH_ATTENDANCE')

    // Case G: 2026-08-08 HOLIDAY, none, complete
    const rowG = rowMap.get('2026-08-08')!
    expect(rowG.calendar_day_type).toBe('HOLIDAY')
    expect(rowG.scheduled_minutes).toBe(0)
    expect(rowG.leave_minutes).toBe(0)
    expect(rowG.absence_minutes).toBe(0)
    expect(rowG.regular_minutes).toBe(480) // Retains attendance regular minutes
    expect(rowG.exception_flags).toContain('HOLIDAY_WITH_ATTENDANCE')

    // Case H: 2026-08-10 WORKDAY, REMOTE, none
    const rowH = rowMap.get('2026-08-10')!
    expect(rowH.calendar_day_type).toBe('WORKDAY')
    expect(rowH.status).toBe('REMOTE')
    expect(rowH.scheduled_minutes).toBe(480)
    expect(rowH.leave_minutes).toBe(0)
    expect(rowH.absence_minutes).toBe(480) // Remote without attendance = absence

    // Case I: 2026-08-11 WORKDAY, BUSINESS_TRIP, none
    const rowI = rowMap.get('2026-08-11')!
    expect(rowI.calendar_day_type).toBe('WORKDAY')
    expect(rowI.status).toBe('BUSINESS_TRIP')
    expect(rowI.scheduled_minutes).toBe(480)
    expect(rowI.leave_minutes).toBe(0)
    expect(rowI.absence_minutes).toBe(480) // Business trip without attendance = absence

    // Case J: 2026-08-12 WORKDAY, none, incomplete
    const rowJ = rowMap.get('2026-08-12')!
    expect(rowJ.calendar_day_type).toBe('WORKDAY')
    expect(rowJ.status).toBeNull()
    expect(rowJ.is_incomplete).toBe(true)
    expect(rowJ.scheduled_minutes).toBe(480)
    expect(rowJ.leave_minutes).toBe(0)
    expect(rowJ.absence_minutes).toBe(0) // Incomplete is not absent!
    expect(rowJ.actual_clock_out_at).toBeNull()
    expect(rowJ.regular_minutes).toBeNull()
  })

  it('PRD Case A–E 五日合計：scheduled 1920 / leave 480 / absence 480', () => {
    // 2026-08-02 (Sun, HOLIDAY): Case B (LEAVE, no attendance)
    // 2026-08-03 (Mon, WORKDAY): Case A (none, complete attendance)
    // 2026-08-04 (Tue, WORKDAY): Case D (REMOTE, complete attendance)
    // 2026-08-05 (Wed, WORKDAY): Case E (LEAVE, no attendance)
    // 2026-08-07 (Fri, WORKDAY): Case C (none, no attendance)
    const targetDates = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07']

    const dayStatuses: DayStatus[] = [
      { id: 'ds-b', user_id: 'user-1', work_date: '2026-08-02', status: 'LEAVE', note: null },
      { id: 'ds-d', user_id: 'user-1', work_date: '2026-08-04', status: 'REMOTE', note: null },
      { id: 'ds-e', user_id: 'user-1', work_date: '2026-08-05', status: 'LEAVE', note: null },
    ]

    const attendanceRecords: AttendanceRecord[] = [
      createAttendance('2026-08-03'),
      createAttendance('2026-08-04'),
    ]

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords,
      dayStatuses,
    })

    const targetRows = report.rows.filter((r) => targetDates.includes(r.date))
    expect(targetRows).toHaveLength(5)

    const scheduledSum = targetRows.reduce((sum, r) => sum + r.scheduled_minutes, 0)
    const leaveSum = targetRows.reduce((sum, r) => sum + r.leave_minutes, 0)
    const absenceSum = targetRows.reduce((sum, r) => sum + r.absence_minutes, 0)

    expect(scheduledSum).toBe(1920) // 0 + 480 + 480 + 480 + 480
    expect(leaveSum).toBe(480) // 0 + 0 + 0 + 480 + 0
    expect(absenceSum).toBe(480) // 0 + 0 + 0 + 0 + 480
  })

  it('無適用 Work Policy 的 WORKDAY 形成 configuration error，不猜測 480 default', () => {
    // Policy only effective starting 2026-08-15
    const latePolicy: WorkPolicy = {
      ...mockPolicy,
      effective_from: '2026-08-15',
    }

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [latePolicy],
      attendanceRecords: [],
    })

    expect(report.hasConfigurationError).toBe(true)
    expect(report.missingPolicyDates).toContain('2026-08-03')
    const row = report.rows.find((r) => r.date === '2026-08-03')!
    expect(row.scheduled_minutes).toBe(0)
    expect(row.absence_minutes).toBe(0)
  })

  it('優先使用 Attendance 保存之 context_snapshot company/project identifier，維持歷史語意', () => {
    const historicalAttendance = createAttendance('2026-08-03', {
      context_snapshot: {
        company_identifier: 'OLD_COMPANY',
        project_identifier: 'OLD_PROJECT',
      },
    })

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: {
        ...mockContext,
        company_identifier: 'NEW_COMPANY',
        project_identifier: 'NEW_PROJECT',
      },
      workPolicies: [mockPolicy],
      attendanceRecords: [historicalAttendance],
    })

    const rowWithAttendance = report.rows.find((r) => r.date === '2026-08-03')!
    expect(rowWithAttendance.company_identifier).toBe('OLD_COMPANY')
    expect(rowWithAttendance.project_identifier).toBe('OLD_PROJECT')

    const rowWithoutAttendance = report.rows.find((r) => r.date === '2026-08-04')!
    expect(rowWithoutAttendance.company_identifier).toBe('NEW_COMPANY')
    expect(rowWithoutAttendance.project_identifier).toBe('NEW_PROJECT')
  })

  it('偵測 OTHER_CONTEXT_ATTENDANCE 例外旗標，且不混入其工時', () => {
    const otherContextDates = new Set(['2026-08-03'])

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [], // No attendance in this context
      otherContextAttendanceDates: otherContextDates,
    })

    const row = report.rows.find((r) => r.date === '2026-08-03')!
    expect(row.exception_flags).toContain('OTHER_CONTEXT_ATTENDANCE')
    expect(row.regular_minutes).toBeNull()
    expect(row.absence_minutes).toBe(480) // In current context it is still absent
  })

  it('Monthly summary 嚴格由 daily rows reduce 得到', () => {
    const attendanceRecords: AttendanceRecord[] = [
      createAttendance('2026-08-03', { net_worked_minutes: 480, regular_minutes: 480, overtime_minutes: 60 }),
      createAttendance('2026-08-04', { net_worked_minutes: 480, regular_minutes: 480, overtime_minutes: 0 }),
      createAttendance('2026-08-05', { actual_clock_out_at: null, net_worked_minutes: null, regular_minutes: null }),
    ]

    const dayStatuses: DayStatus[] = [
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-06', status: 'LEAVE', note: null },
    ]

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords,
      dayStatuses,
    })

    const summary = report.summary
    const calculatedRegular = report.rows.reduce((sum, r) => sum + (r.regular_minutes ?? 0), 0)
    const calculatedOvertime = report.rows.reduce((sum, r) => sum + (r.overtime_minutes ?? 0), 0)
    const calculatedLeave = report.rows.reduce((sum, r) => sum + r.leave_minutes, 0)
    const calculatedAbsence = report.rows.reduce((sum, r) => sum + r.absence_minutes, 0)
    const calculatedIncomplete = report.rows.filter((r) => r.is_incomplete).length

    expect(summary.regular_minutes).toBe(calculatedRegular)
    expect(summary.overtime_minutes).toBe(calculatedOvertime)
    expect(summary.leave_minutes).toBe(calculatedLeave)
    expect(summary.absence_minutes).toBe(calculatedAbsence)
    expect(summary.incomplete_count).toBe(calculatedIncomplete)
    expect(summary.incomplete_count).toBe(1)
  })
})
