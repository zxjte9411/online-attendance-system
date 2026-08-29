import { describe, expect, it } from 'vitest'
import { buildMonthlyReport } from './monthly-report'
import { exportReportToCsv, CSV_HEADERS, formatTaipeiDateTime, escapeCsvField } from './csv-export'
import type { WorkContext, WorkPolicy } from '../../lib/settings'
import type { AttendanceRecord } from '../../lib/attendance'
import type { DayStatus } from '../calendar-status/overview'

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

describe('CSV Exporter (exportReportToCsv)', () => {
  it('檔案開頭為 UTF-8 BOM (\\uFEFF)', () => {
    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })

    const csv = exportReportToCsv(report)
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })

  it('包含 exact required headers，順序正確且使用 CRLF', () => {
    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })

    const csv = exportReportToCsv(report)
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    const headerLine = lines[0]
    expect(headerLine).toBe(CSV_HEADERS.join(','))
  })

  it('總列數符合天數 + 標題列 (31 天為 32 列)', () => {
    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
    })

    const csv = exportReportToCsv(report)
    // Strip BOM and trailing empty line if any
    const content = csv.replace(/^\uFEFF/, '').trimEnd()
    const lines = content.split('\r\n')
    expect(lines).toHaveLength(32) // 1 header + 31 days
  })

  it('正確處理 comma、quote、newline 跳脫與中文 note round-trip', () => {
    const specialNote = '備註包含 "引號" 與 , 逗號\n換行文字'
    const dayStatuses: DayStatus[] = [
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-05', status: 'LEAVE', note: specialNote },
    ]

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
      dayStatuses,
    })

    const csv = exportReportToCsv(report)
    expect(csv).toContain('""引號""')
    expect(csv).toContain('LEAVE')
    expect(csv).toContain('備註包含 ""引號"" 與 , 逗號\n換行文字')
  })

  it('將時間格式化為 Asia/Taipei，且缺少之 actual/effective clock-out 保持空白', () => {
    const incompleteAttendance = createAttendance('2026-08-03', {
      actual_clock_in_at: '2026-08-03T01:00:00.000Z', // 09:00:00+08:00
      effective_clock_in_at: '2026-08-03T01:00:00.000Z',
      expected_clock_out_at: '2026-08-03T10:00:00.000Z', // 18:00:00+08:00
      actual_clock_out_at: null,
      effective_clock_out_at: null,
      actual_elapsed_minutes: null,
      net_worked_minutes: null,
      regular_minutes: null,
      overtime_minutes: null,
    })

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [incompleteAttendance],
    })

    const csv = exportReportToCsv(report)
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')
    // 2026-08-03 is the 3rd row (index 3 in lines: header=0, 08-01=1, 08-02=2, 08-03=3)
    const rowAug3 = lines[3]
    const columns = rowAug3.split(',')
    // Headers: date(0), weekday(1), company(2), project(3), actual_in(4), effective_in(5), actual_out(6), effective_out(7), expected_out(8)
    expect(columns[0]).toBe('2026-08-03')
    expect(columns[4]).toBe('2026-08-03T09:00:00+08:00')
    expect(columns[5]).toBe('2026-08-03T09:00:00+08:00')
    expect(columns[6]).toBe('') // actual_clock_out_at missing
    expect(columns[7]).toBe('') // effective_clock_out_at missing
    expect(columns[8]).toBe('2026-08-03T18:00:00+08:00') // expected_clock_out_at
  })

  it('對公式字元 (=, +, -, @) 進行 safe-text escaping 防止 Excel formula injection', () => {
    const dangerousNote = '=SUM(A1:A10)'
    const dayStatuses: DayStatus[] = [
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-05', status: 'LEAVE', note: dangerousNote },
    ]

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [],
      dayStatuses,
    })

    const csv = exportReportToCsv(report)
    expect(csv).toContain("'=SUM(A1:A10)")
    expect(csv).not.toContain(',=SUM(A1:A10),')
  })

  it('獨立輸出 actual_elapsed_minutes 與 net_worked_minutes，不互換', () => {
    const attendance = createAttendance('2026-08-03', {
      actual_elapsed_minutes: 540,
      net_worked_minutes: 480,
      regular_minutes: 480,
      overtime_minutes: 0,
    })

    const report = buildMonthlyReport({
      yearMonth: '2026-08',
      context: mockContext,
      workPolicies: [mockPolicy],
      attendanceRecords: [attendance],
    })

    const csv = exportReportToCsv(report)
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')
    const rowAug3 = lines[3]
    const columns = rowAug3.split(',')
    // scheduled_minutes(9), actual_elapsed_minutes(10), net_worked_minutes(11), regular_minutes(12), overtime_minutes(13)
    expect(columns[9]).toBe('480')
    expect(columns[10]).toBe('540')
    expect(columns[11]).toBe('480')
    expect(columns[12]).toBe('480')
    expect(columns[13]).toBe('0')
  })
})
