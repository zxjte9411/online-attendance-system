// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TodayView from './TodayView.vue'
import { clockInToday, getTodayAttendanceRecord } from '../lib/attendance'
import { getCurrentUserId, getSetupStatus } from '../lib/settings'

vi.mock('../lib/attendance', () => ({
  clockInToday: vi.fn(),
  clockOutToday: vi.fn(),
  getTodayAttendanceRecord: vi.fn(),
}))

vi.mock('../lib/settings', () => ({
  getCurrentUserId: vi.fn(),
  getSetupStatus: vi.fn(),
}))

vi.mock('../lib/work-policy', () => ({
  getTaipeiToday: vi.fn(() => '2026-08-29'),
  getWorkPolicyStatus: vi.fn(() => '目前適用'),
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
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(null)
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: null,
      contexts: [],
      defaultContext: { id: 'context-1' } as never,
      policies: [policy] as never,
      complete: true,
    })
    vi.mocked(clockInToday).mockResolvedValue(clockedInRecord as never)
  })

  it('未打卡時按鈕會呼叫上班 RPC，並顯示已上班狀態', async () => {
    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-action="clock-in"]').trigger('click')
    await flushPromises()

    expect(clockInToday).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-state="clocked-in"]').text()).toContain('已上班')
    wrapper.unmount()
  })

  it('已有紀錄但目前沒有 Work Policy 時，仍顯示已上班狀態與歷史制度', async () => {
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(clockedInRecord as never)
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: null,
      contexts: [],
      defaultContext: null,
      policies: [],
      complete: false,
    })

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(getSetupStatus).not.toHaveBeenCalled()
    expect(wrapper.get('[data-state="clocked-in"]').text()).toContain('已上班')
    expect(wrapper.text()).toContain('歷史制度')
    wrapper.unmount()
  })

  it('已有完成紀錄但目前沒有 Work Policy 時，仍顯示完成狀態與歷史制度', async () => {
    vi.mocked(getTodayAttendanceRecord).mockResolvedValue(completedRecord as never)
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: null,
      contexts: [],
      defaultContext: null,
      policies: [],
      complete: false,
    })

    const wrapper = mount(TodayView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[data-state="complete"]').text()).toContain('已完成')
    expect(wrapper.get('summary').text()).toContain('詳細資訊')
    expect(wrapper.get('details').element.open).toBe(false)
    expect(wrapper.text()).toContain('歷史制度')
    wrapper.unmount()
  })
})
