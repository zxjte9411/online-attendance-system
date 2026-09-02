// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TodayView from './TodayView.vue'
import {
  clockInToday,
  clockOutToday,
  getTodayAttendanceReadiness,
  getTodayAttendanceRecord,
} from '../lib/attendance'
import { getTaipeiToday } from '../lib/work-policy'

const mockedReadiness = vi.mocked(getTodayAttendanceReadiness)

vi.mock('../lib/attendance', () => ({
  clockInToday: vi.fn(),
  clockOutToday: vi.fn(),
  getTodayAttendanceRecord: vi.fn(),
  getTodayAttendanceReadiness: vi.fn(),
}))

vi.mock('../lib/work-policy', () => ({
  getTaipeiToday: vi.fn(() => '2026-08-29'),
}))

const policy = {
  id: 'policy-1',
  user_id: 'user-1',
  context_id: 'context-1',
  name: '標準工作日',
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

const clockedInRecord = {
  id: 'record-1',
  user_id: 'user-1',
  work_date: '2026-08-29',
  context_id: 'context-1',
  work_policy_id: 'policy-1',
  actual_clock_in_at: '2026-08-29T01:12:00.000Z',
  actual_clock_out_at: null,
  effective_clock_in_at: '2026-08-29T01:12:00.000Z',
  effective_clock_out_at: null,
  expected_clock_out_at: '2026-08-29T10:12:00.000Z',
  actual_elapsed_minutes: null,
  net_worked_minutes: null,
  regular_minutes: null,
  overtime_minutes: null,
  status_note: null,
  calculation_version: 'v1',
  created_source: 'CLOCK',
  manually_adjusted: false,
  last_manual_edit_at: null,
  context_snapshot: {},
  policy_snapshot: {
    name: '歷史制度',
    standard_start_time: '09:00:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
  },
  calculation_snapshot: {},
}

const completedRecord = {
  ...clockedInRecord,
  actual_clock_out_at: '2026-08-29T10:30:00.000Z',
  effective_clock_out_at: '2026-08-29T10:30:00.000Z',
  actual_elapsed_minutes: 558,
  net_worked_minutes: 498,
  regular_minutes: 480,
  overtime_minutes: 18,
}

describe('TodayView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(null)
    mockedReadiness.mockResolvedValue({
      resolution: 'RESOLVED',
      assignmentId: 'assignment-1',
      policy: policy as never,
    })
    vi.mocked(clockInToday).mockResolvedValue(clockedInRecord as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Ready 時顯示預覽，按鈕會呼叫上班 RPC 並顯示已上班狀態', async () => {
    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-state="preview"]').text()).toContain('準備開始工作')
    await wrapper.get('[data-action="clock-in"]').trigger('click')
    await flushPromises()

    expect(clockInToday).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-state="clocked-in"]').text()).toContain('已上班')
    wrapper.unmount()
  })

  it('已有紀錄但目前沒有 Work Policy 時，仍顯示已上班狀態與歷史制度', async () => {
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(clockedInRecord as never)

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(mockedReadiness).not.toHaveBeenCalled()
    expect(wrapper.get('[data-state="clocked-in"]').text()).toContain('已上班')
    expect(wrapper.text()).toContain('歷史制度')
    wrapper.unmount()
  })

  it('已有完成紀錄但目前沒有 Work Policy 時，仍顯示完成狀態與歷史制度', async () => {
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(completedRecord as never)

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-state="complete"]').text()).toContain('已完成')
    expect(wrapper.get('summary').text()).toContain('詳細資訊')
    expect(wrapper.get('details').element.open).toBe(false)
    expect(wrapper.text()).toContain('歷史制度')
    wrapper.unmount()
  })

  it('沒有今日 Assignment 時顯示不可打卡狀態與 Settings CTA', async () => {
    mockedReadiness.mockResolvedValueOnce({
      resolution: 'NO_ASSIGNMENT',
      assignmentId: null,
      policy: null,
    })

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-state="unavailable-no-assignment"]').text()).toContain('今天沒有工作派駐')
    expect(wrapper.get('[data-action="settings"]').attributes('href')).toBe('/settings')
    expect(wrapper.text()).not.toContain('今日資料還沒載入')
    expect(wrapper.find('[data-action="clock-in"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('有今日 Assignment 但缺少 Work Policy 時顯示日期特定不可打卡狀態與帶 context 的 CTA', async () => {
    mockedReadiness.mockResolvedValueOnce({
      resolution: 'MISSING_POLICY',
      assignmentId: 'assignment-resolved',
      policy: null,
    })

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-state="unavailable-missing-policy"]').text()).toContain('今天沒有適用的 Work Policy')
    expect(wrapper.get('[data-action="settings"]').attributes('href')).toBe('/settings?assignment_id=assignment-resolved#policies')
    expect(wrapper.find('[data-action="clock-in"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['NO_ASSIGNMENT', 'MISSING_POLICY'] as const)('clock-in 收到 %s 時重新載入不可打卡狀態', async (resolution) => {
    mockedReadiness
      .mockResolvedValueOnce({ resolution: 'RESOLVED', assignmentId: 'assignment-1', policy: policy as never })
      .mockResolvedValueOnce({
        resolution,
        assignmentId: resolution === 'MISSING_POLICY' ? 'assignment-2' : null,
        policy: null,
      })
    vi.mocked(clockInToday).mockRejectedValueOnce(new Error(resolution))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('[data-action="clock-in"]').trigger('click')
    await flushPromises()

    expect(mockedReadiness).toHaveBeenCalledTimes(2)
    expect(wrapper.find(`[data-state="unavailable-${resolution === 'NO_ASSIGNMENT' ? 'no-assignment' : 'missing-policy'}"]`).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('無法確認這次打卡是否完成')
    wrapper.unmount()
  })

  it('載入錯誤顯示載入提示，不混入打卡狀態不明提示', async () => {
    vi.mocked(getTodayAttendanceRecord).mockRejectedValueOnce(new Error('讀取失敗'))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('今日資料還沒載入')
    expect(wrapper.text()).toContain('這次失敗不會建立或修改出勤資料')
    expect(wrapper.text()).not.toContain('無法確認這次打卡是否完成')
    expect(wrapper.get('[data-action="retry-load"]').text()).toContain('重新載入')
    wrapper.unmount()
  })

  it('上班打卡錯誤顯示狀態不明提示，重新確認後以 server 紀錄恢復已上班', async () => {
    vi.mocked(clockInToday).mockRejectedValueOnce(new Error('打卡逾時'))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('[data-action="clock-in"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('無法確認這次打卡是否完成，請重新載入今日狀態確認。')
    expect(wrapper.text()).toContain('重新確認今日狀態')
    expect(wrapper.text()).not.toContain('今日資料還沒載入')
    expect(wrapper.text()).not.toContain('這次失敗不會建立或修改出勤資料')

    vi.mocked(getTodayAttendanceRecord).mockResolvedValueOnce(clockedInRecord as never)
    await wrapper.get('[data-action="reload-status"]').trigger('click')
    await flushPromises()

    expect(getTodayAttendanceRecord).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-state="clocked-in"]').text()).toContain('已上班')
    wrapper.unmount()
  })

  it('resolver 讀取錯誤顯示系統資料載入錯誤', async () => {
    mockedReadiness.mockRejectedValueOnce(new Error('解析服務讀取失敗'))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('今日資料還沒載入')
    expect(wrapper.text()).toContain('解析服務讀取失敗')
    expect(wrapper.find('[data-state="unavailable-no-assignment"]').exists()).toBe(false)
    expect(wrapper.find('[data-state="unavailable-missing-policy"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('跨過台北午夜時清除前日狀態並重新載入', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-29T15:59:45.000Z'))
    vi.mocked(getTaipeiToday).mockImplementation((value = new Date()) => (
      value.getTime() >= new Date('2026-08-29T16:00:00.000Z').getTime() ? '2026-08-30' : '2026-08-29'
    ))
    mockedReadiness
      .mockResolvedValueOnce({ resolution: 'RESOLVED', assignmentId: 'assignment-1', policy: policy as never })
      .mockResolvedValueOnce({ resolution: 'NO_ASSIGNMENT', assignmentId: null, policy: null })

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[data-state="preview"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(getTodayAttendanceRecord).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-state="unavailable-no-assignment"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('打卡錯誤後重新確認仍失敗時，保留狀態不明提示而不改成載入錯誤語意', async () => {
    vi.mocked(clockInToday).mockRejectedValueOnce(new Error('打卡逾時'))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('[data-action="clock-in"]').trigger('click')
    await flushPromises()

    vi.mocked(getTodayAttendanceRecord).mockRejectedValueOnce(new Error('重新讀取失敗'))
    await wrapper.get('[data-action="reload-status"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('無法確認這次打卡是否完成，請重新載入今日狀態確認。')
    expect(wrapper.text()).not.toContain('今日資料還沒載入')
    expect(wrapper.text()).not.toContain('這次失敗不會建立或修改出勤資料')
    expect(wrapper.get('[data-action="reload-status"]').text()).toContain('重新確認今日狀態')
    wrapper.unmount()
  })

  it('下班打卡錯誤也維持狀態不明提示，不顯示載入錯誤內容', async () => {
    vi.mocked(getTodayAttendanceRecord).mockResolvedValueOnce(clockedInRecord as never)
    vi.mocked(clockOutToday).mockRejectedValueOnce(new Error('打卡逾時'))

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('[data-action="clock-out"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('無法確認這次打卡是否完成，請重新載入今日狀態確認。')
    expect(wrapper.text()).not.toContain('今日資料還沒載入')
    expect(wrapper.text()).not.toContain('這次失敗不會建立或修改出勤資料')
    wrapper.unmount()
  })
})
