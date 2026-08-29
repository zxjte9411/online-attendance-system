import { describe, expect, it } from 'vitest'
import {
  calculateAttendanceSummary,
  type AttendanceCalculationPolicy,
} from './calculate-attendance-summary'

const basePolicy: AttendanceCalculationPolicy = {
  standard_start_time: '09:00',
  work_minutes: 480,
  fixed_break_minutes: 60,
  early_arrival_policy: 'STANDARD_START',
  clock_in_rounding_mode: 'NONE',
  clock_in_rounding_minutes: null,
  clock_out_rounding_mode: 'NONE',
  clock_out_rounding_minutes: null,
}

function policy(overrides: Partial<AttendanceCalculationPolicy> = {}) {
  return { ...basePolicy, ...overrides }
}

describe('calculateAttendanceSummary', () => {
  it('早到採標準上班時間，並計算八小時正常工時', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T00:45:00.000Z',
      actual_clock_out_at: '2026-08-29T10:00:00.000Z',
      policy: policy(),
    })

    expect(result).toMatchObject({
      actual_clock_in_at: '2026-08-29T00:45:00.000Z',
      actual_clock_out_at: '2026-08-29T10:00:00.000Z',
      effective_clock_in_at: '2026-08-29T01:00:00.000Z',
      expected_clock_out_at: '2026-08-29T10:00:00.000Z',
      effective_clock_out_at: '2026-08-29T10:00:00.000Z',
      actual_elapsed_minutes: 555,
      net_worked_minutes: 480,
      regular_minutes: 480,
      overtime_minutes: 0,
    })
  })

  it('早到採實際時間，且實際時間可產生加班', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T00:45:00.000Z',
      actual_clock_out_at: '2026-08-29T10:00:00.000Z',
      policy: policy({ early_arrival_policy: 'ACTUAL' }),
    })

    expect(result.effective_clock_in_at).toBe('2026-08-29T00:45:00.000Z')
    expect(result.expected_clock_out_at).toBe('2026-08-29T09:45:00.000Z')
    expect(result.net_worked_minutes).toBe(495)
    expect(result.regular_minutes).toBe(480)
    expect(result.overtime_minutes).toBe(15)
  })

  it('clock-in NONE 不取整', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:07:00.000Z',
      policy: policy(),
    })

    expect(result.effective_clock_in_at).toBe('2026-08-29T01:07:00.000Z')
  })

  it('clock-in CEIL 以 Asia/Taipei 日曆邊界為錨點', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:21:00.000Z',
      policy: policy({
        standard_start_time: '09:10',
        clock_in_rounding_mode: 'CEIL',
        clock_in_rounding_minutes: 30,
      }),
    })

    expect(result.effective_clock_in_at).toBe('2026-08-29T01:30:00.000Z')
  })

  it('clock-out 未設定 mode 時預設 NONE 且保留秒數', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: '2026-08-29T10:01:37.000Z',
      policy: policy({ clock_out_rounding_mode: undefined }),
    })

    expect(result.effective_clock_out_at).toBe('2026-08-29T10:01:37.000Z')
  })

  it('clock-out NONE 不取整', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: '2026-08-29T10:01:37.000Z',
      policy: policy({ clock_out_rounding_mode: 'NONE', clock_out_rounding_minutes: 30 }),
    })

    expect(result.effective_clock_out_at).toBe('2026-08-29T10:01:37.000Z')
  })

  it('clock-out CEIL 以同一日曆邊界為錨點', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: '2026-08-29T09:41:00.000Z',
      policy: policy({ clock_out_rounding_mode: 'CEIL', clock_out_rounding_minutes: 30 }),
    })

    expect(result.effective_clock_out_at).toBe('2026-08-29T10:00:00.000Z')
  })

  it('clock-out FLOOR 以同一日曆邊界為錨點', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: '2026-08-29T09:41:00.000Z',
      policy: policy({ clock_out_rounding_mode: 'FLOOR', clock_out_rounding_minutes: 30 }),
    })

    expect(result.effective_clock_out_at).toBe('2026-08-29T09:30:00.000Z')
  })

  it('以有效時間扣固定休息計算正常工時與加班，支援七個半小時制度', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: '2026-08-29T10:00:00.000Z',
      policy: policy({ work_minutes: 450, fixed_break_minutes: 30 }),
    })

    expect(result.actual_elapsed_minutes).toBe(540)
    expect(result.net_worked_minutes).toBe(510)
    expect(result.regular_minutes).toBe(450)
    expect(result.overtime_minutes).toBe(60)
  })

  it.each([
    ['早於預計下班', '2026-08-29T09:30:00.000Z', 450, 450, 0],
    ['等於預計下班', '2026-08-29T10:00:00.000Z', 480, 480, 0],
    ['晚於預計下班', '2026-08-29T11:15:00.000Z', 555, 480, 75],
  ])('%s 仍保留實際下班並依有效下班計算', (_, actualClockOutAt, net, regular, overtime) => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: actualClockOutAt,
      policy: policy(),
    })

    expect(result.actual_clock_out_at).toBe(actualClockOutAt)
    expect(result.effective_clock_out_at).toBe(actualClockOutAt)
    expect(result.net_worked_minutes).toBe(net)
    expect(result.regular_minutes).toBe(regular)
    expect(result.overtime_minutes).toBe(overtime)
  })

  it('沒有實際下班時只產生預計下班，不產生完成工時', () => {
    const result = calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T01:00:00.000Z',
      actual_clock_out_at: null,
      policy: policy(),
    })

    expect(result.expected_clock_out_at).toBe('2026-08-29T10:00:00.000Z')
    expect(result.effective_clock_out_at).toBeNull()
    expect(result.actual_elapsed_minutes).toBeNull()
    expect(result.net_worked_minutes).toBeNull()
    expect(result.regular_minutes).toBeNull()
    expect(result.overtime_minutes).toBeNull()
  })

  it('拒絕下班早於上班、跨 Asia/Taipei 工作日與不合法輸入', () => {
    expect(() => calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T10:00:00.000Z',
      actual_clock_out_at: '2026-08-29T09:59:00.000Z',
      policy: policy(),
    })).toThrow()

    expect(() => calculateAttendanceSummary({
      actual_clock_in_at: '2026-08-29T15:00:00.000Z',
      actual_clock_out_at: '2026-08-29T16:00:00.000Z',
      policy: policy(),
    })).toThrow()

    expect(() => calculateAttendanceSummary({
      actual_clock_in_at: 'not-a-date',
      policy: policy(),
    })).toThrow()
  })
})
