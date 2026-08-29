// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReportView from './ReportView.vue'
import * as settingsLib from '../lib/settings'
import * as attendanceLib from '../lib/attendance'
import * as dayStatusCalendarLib from '../lib/day-status-calendar'
import * as dgpaCalendarLib from '../lib/dgpa-calendar'

const mockContexts: settingsLib.WorkContext[] = [
  {
    id: 'ctx-1',
    user_id: 'user-1',
    name: '預設工作情境',
    company_identifier: 'COMPANY_A',
    project_identifier: 'PROJECT_X',
    active: true,
    is_default: true,
  },
  {
    id: 'ctx-2',
    user_id: 'user-1',
    name: '第二工作情境',
    company_identifier: 'COMPANY_B',
    project_identifier: 'PROJECT_Y',
    active: true,
    is_default: false,
  },
]

const mockPolicy: settingsLib.WorkPolicy = {
  id: 'pol-1',
  user_id: 'user-1',
  context_id: 'ctx-1',
  name: '標準 8h',
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

describe('ReportView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(settingsLib, 'getCurrentUserId').mockResolvedValue('user-1')
    vi.spyOn(settingsLib, 'listWorkContexts').mockResolvedValue(mockContexts)
    vi.spyOn(settingsLib, 'listWorkPolicies').mockResolvedValue([mockPolicy])
    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockResolvedValue([])
    vi.spyOn(dayStatusCalendarLib, 'getDayStatusesForMonth').mockResolvedValue([])
    vi.spyOn(dayStatusCalendarLib, 'getCalendarOverridesForMonth').mockResolvedValue([])
    vi.spyOn(dgpaCalendarLib, 'getDgpaCalendarForMonth').mockResolvedValue([])
  })

  it('載入並呈現情境選擇、月份導覽與預設統計', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.text()).toContain('報表')
    expect(wrapper.text()).toContain('預設工作情境')
    expect(wrapper.find('[data-test="context-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-regular"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-leave"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-absence"]').exists()).toBe(true)
  })

  it('包含無 Attendance 的 WORKDAY / HOLIDAY，顯示完整月份每日資料列', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    const rows = wrapper.findAll('[data-test="report-row"]')
    // Default month has either 28, 29, 30, or 31 days
    expect(rows.length).toBeGreaterThanOrEqual(28)
  })

  it('呈現 incomplete 與 exception flags 標記', async () => {
    const incompleteAttendance: attendanceLib.AttendanceRecord = {
      id: 'att-1',
      user_id: 'user-1',
      work_date: '2026-08-03',
      context_id: 'ctx-1',
      work_policy_id: 'pol-1',
      actual_clock_in_at: '2026-08-03T09:00:00+08:00',
      actual_clock_out_at: null,
      effective_clock_in_at: '2026-08-03T09:00:00+08:00',
      effective_clock_out_at: null,
      expected_clock_out_at: '2026-08-03T18:00:00+08:00',
      actual_elapsed_minutes: null,
      net_worked_minutes: null,
      regular_minutes: null,
      overtime_minutes: null,
      context_snapshot: { company_identifier: 'COMPANY_A', project_identifier: 'PROJECT_X' },
      policy_snapshot: { work_minutes: 480 },
      calculation_snapshot: { calculation_version: 'v1' },
      created_source: 'CLOCK',
      manually_adjusted: false,
      last_manual_edit_at: null,
      status_note: null,
    }

    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockResolvedValue([incompleteAttendance])
    vi.spyOn(dayStatusCalendarLib, 'getDayStatusesForMonth').mockResolvedValue([
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-03', status: 'LEAVE', note: '請假但有打卡' },
    ])

    const wrapper = mount(ReportView)
    // Set to 2026-08
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    expect(wrapper.text()).toContain('未完成')
    expect(wrapper.text()).toContain('LEAVE_WITH_ATTENDANCE')
  })

  it('缺少適用 Work Policy 時顯示設定不完整提示並停用 CSV 下載', async () => {
    // Return empty policies for context
    vi.spyOn(settingsLib, 'listWorkPolicies').mockResolvedValue([])

    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.find('[data-test="configuration-error-banner"]').exists()).toBe(true)
    const downloadButton = wrapper.find<HTMLButtonElement>('[data-test="download-csv-button"]')
    expect(downloadButton.attributes('disabled')).toBeDefined()
  })

  it('點擊 CSV 下載按鈕時直接使用畫面同一份 Report Model 產生下載', async () => {
    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectUrlSpy = vi.fn()
    window.URL.createObjectURL = createObjectUrlSpy
    window.URL.revokeObjectURL = revokeObjectUrlSpy

    const wrapper = mount(ReportView)
    await flushPromises()

    const downloadButton = wrapper.find('[data-test="download-csv-button"]')
    expect(downloadButton.exists()).toBe(true)
    expect(downloadButton.attributes('disabled')).toBeUndefined()

    // Spy on anchor click
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadButton.trigger('click')

    expect(createObjectUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })
})
