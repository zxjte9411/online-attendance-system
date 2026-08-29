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

const mockPolicyCtx1: settingsLib.WorkPolicy = {
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

const mockPolicyCtx2: settingsLib.WorkPolicy = {
  id: 'pol-2',
  user_id: 'user-1',
  context_id: 'ctx-2',
  name: '工時 6h 制度',
  standard_start_time: '10:00:00',
  work_minutes: 360,
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
    vi.spyOn(settingsLib, 'listWorkPolicies').mockImplementation(async (_uid, ctxId) => {
      return ctxId === 'ctx-2' ? [mockPolicyCtx2] : [mockPolicyCtx1]
    })
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
    expect(rows.length).toBeGreaterThanOrEqual(28)
  })

  it('固定 fixture 驗證各工時 summary 數值精確顯示', async () => {
    // 2026-08 (31 days: 21 workdays, 10 weekend days)
    // WORKDAY 1 (2026-08-03): Attendance complete: regular 480, overtime 60
    // WORKDAY 2 (2026-08-04): Attendance complete: regular 480
    // WORKDAY 3 (2026-08-05): Incomplete attendance
    // WORKDAY 4 (2026-08-06): LEAVE status (480 leave minutes)
    // Other 17 WORKDAYs: no attendance, no leave (17 * 480 = 8160 absence minutes)
    // Total scheduled = 21 * 480 = 10080 min (168 小時)
    // Regular = 480 + 480 = 960 min (16 小時)
    // Overtime = 60 min (1 小時)
    // Leave = 480 min (8 小時)
    // Absence = 17 * 480 = 8160 min (136 小時)
    // Incomplete = 1 筆
    const attendanceRecords: attendanceLib.AttendanceRecord[] = [
      {
        id: 'att-1',
        user_id: 'user-1',
        work_date: '2026-08-03',
        context_id: 'ctx-1',
        work_policy_id: 'pol-1',
        actual_clock_in_at: '2026-08-03T09:00:00+08:00',
        actual_clock_out_at: '2026-08-03T19:00:00+08:00',
        effective_clock_in_at: '2026-08-03T09:00:00+08:00',
        effective_clock_out_at: '2026-08-03T19:00:00+08:00',
        expected_clock_out_at: '2026-08-03T18:00:00+08:00',
        actual_elapsed_minutes: 600,
        net_worked_minutes: 540,
        regular_minutes: 480,
        overtime_minutes: 60,
        context_snapshot: { company_identifier: 'COMPANY_A', project_identifier: 'PROJECT_X' },
        policy_snapshot: { work_minutes: 480 },
        calculation_snapshot: { calculation_version: 'v1' },
        created_source: 'CLOCK',
        manually_adjusted: false,
        last_manual_edit_at: null,
        status_note: null,
      },
      {
        id: 'att-2',
        user_id: 'user-1',
        work_date: '2026-08-04',
        context_id: 'ctx-1',
        work_policy_id: 'pol-1',
        actual_clock_in_at: '2026-08-04T09:00:00+08:00',
        actual_clock_out_at: '2026-08-04T18:00:00+08:00',
        effective_clock_in_at: '2026-08-04T09:00:00+08:00',
        effective_clock_out_at: '2026-08-04T18:00:00+08:00',
        expected_clock_out_at: '2026-08-04T18:00:00+08:00',
        actual_elapsed_minutes: 540,
        net_worked_minutes: 480,
        regular_minutes: 480,
        overtime_minutes: 0,
        context_snapshot: { company_identifier: 'COMPANY_A', project_identifier: 'PROJECT_X' },
        policy_snapshot: { work_minutes: 480 },
        calculation_snapshot: { calculation_version: 'v1' },
        created_source: 'CLOCK',
        manually_adjusted: false,
        last_manual_edit_at: null,
        status_note: null,
      },
      {
        id: 'att-3',
        user_id: 'user-1',
        work_date: '2026-08-05',
        context_id: 'ctx-1',
        work_policy_id: 'pol-1',
        actual_clock_in_at: '2026-08-05T09:00:00+08:00',
        actual_clock_out_at: null,
        effective_clock_in_at: '2026-08-05T09:00:00+08:00',
        effective_clock_out_at: null,
        expected_clock_out_at: '2026-08-05T18:00:00+08:00',
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
      },
    ]

    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockResolvedValue(attendanceRecords)
    vi.spyOn(dayStatusCalendarLib, 'getDayStatusesForMonth').mockResolvedValue([
      { id: 'ds-1', user_id: 'user-1', work_date: '2026-08-06', status: 'LEAVE', note: '請假一日' },
    ])

    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    expect(wrapper.find('[data-test="summary-scheduled"]').text()).toContain('168 小時')
    expect(wrapper.find('[data-test="summary-regular"]').text()).toContain('16 小時')
    expect(wrapper.find('[data-test="summary-overtime"]').text()).toContain('1 小時')
    expect(wrapper.find('[data-test="summary-leave"]').text()).toContain('8 小時')
    expect(wrapper.find('[data-test="summary-absence"]').text()).toContain('136 小時')
    expect(wrapper.find('[data-test="summary-incomplete"]').text()).toContain('1 筆')
  })

  it('切換 Work Context 時重新 query 並呈現新情境制度與資料', async () => {
    const listPoliciesSpy = vi.spyOn(settingsLib, 'listWorkPolicies')
    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    // Switch context to ctx-2
    await wrapper.find('[data-test="context-select"]').setValue('ctx-2')
    await flushPromises()

    expect(listPoliciesSpy).toHaveBeenCalledWith('user-1', 'ctx-2')
    // In ctx-2 (work_minutes = 360), 21 working days in 2026-08: scheduled = 21 * 360 = 7560 min = 126 hours
    expect(wrapper.find('[data-test="summary-scheduled"]').text()).toContain('126 小時')
  })

  it('切換月份時重新載入並更新逐日明細表格', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    await wrapper.find('[data-test="month-input"]').setValue('2026-02')
    await flushPromises()

    expect(wrapper.text()).toContain('2026 年 2 月')
    const rows = wrapper.findAll('[data-test="report-row"]')
    expect(rows).toHaveLength(28)
  })

  it('Async Scope Consistency: 切換 context 或 month 在 pending 期間立即呈現 loading，不顯示錯配舊資料', async () => {
    let resolvePolicies!: (val: settingsLib.WorkPolicy[]) => void
    const pendingPromise = new Promise<settingsLib.WorkPolicy[]>((resolve) => {
      resolvePolicies = resolve
    })

    const wrapper = mount(ReportView)
    await flushPromises()

    // Currently showing ctx-1 data
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)

    // Make listWorkPolicies return a pending promise on next call
    vi.spyOn(settingsLib, 'listWorkPolicies').mockReturnValue(pendingPromise)

    // Trigger context switch to ctx-2
    await wrapper.find('[data-test="context-select"]').setValue('ctx-2')

    // While request is pending: loading indicator exists, summary cards and table rows are hidden
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="report-row"]')).toHaveLength(0)

    // Now resolve
    resolvePolicies([mockPolicyCtx2])
    await flushPromises()

    // Loading indicator gone, new report displayed
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)
  })

  it('Async Scope Consistency: query failure 時清除報表並呈現 error banner，不殘留 stale report', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)

    // Mock failure on next month fetch
    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockRejectedValue(new Error('Network error'))

    await wrapper.find('[data-test="month-input"]').setValue('2026-09')
    await flushPromises()

    expect(wrapper.find('[data-test="load-error-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="report-row"]')).toHaveLength(0)
  })

  it('Async Scope Consistency: 連續快速切換只套用最後一個 request 的資料', async () => {
    let resolveReq1!: (val: settingsLib.WorkPolicy[]) => void
    const p1 = new Promise<settingsLib.WorkPolicy[]>((resolve) => {
      resolveReq1 = resolve
    })
    let resolveReq2!: (val: settingsLib.WorkPolicy[]) => void
    const p2 = new Promise<settingsLib.WorkPolicy[]>((resolve) => {
      resolveReq2 = resolve
    })

    const wrapper = mount(ReportView)
    await flushPromises()

    const spy = vi.spyOn(settingsLib, 'listWorkPolicies')
    spy.mockReturnValueOnce(p1).mockReturnValueOnce(p2)

    // Switch to ctx-2 (req 1)
    await wrapper.find('[data-test="context-select"]').setValue('ctx-2')
    // Immediately switch back to ctx-1 (req 2)
    await wrapper.find('[data-test="context-select"]').setValue('ctx-1')

    // Req 1 finishes later
    resolveReq1([mockPolicyCtx2])
    await flushPromises()

    // Still in loading or not showing ctx-2 because current selection is ctx-1
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(true)

    // Req 2 finishes
    resolveReq2([mockPolicyCtx1])
    await flushPromises()

    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)
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
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    expect(wrapper.text()).toContain('未完成')
    expect(wrapper.text()).toContain('LEAVE_WITH_ATTENDANCE')
  })

  it('缺少適用 Work Policy 時顯示設定不完整提示並停用 CSV 下載', async () => {
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

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadButton.trigger('click')

    expect(createObjectUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('無任何 Work Context 時結束 loading 並顯示 empty state，不發出 month query 且 CSV 按鈕停用', async () => {
    vi.spyOn(settingsLib, 'listWorkContexts').mockResolvedValue([])
    const listPoliciesSpy = vi.spyOn(settingsLib, 'listWorkPolicies')

    const wrapper = mount(ReportView)
    await flushPromises()

    // Loading indicator must be gone
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    // Empty state text must be shown
    expect(wrapper.text()).toContain('尚未設定任何工作情境')
    // Summary cards and table rows must not exist
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="report-row"]')).toHaveLength(0)
    // Month query must not be triggered
    expect(listPoliciesSpy).not.toHaveBeenCalled()
    // CSV button must be disabled
    const downloadButton = wrapper.find('[data-test="download-csv-button"]')
    expect(downloadButton.attributes('disabled')).toBeDefined()
  })
})
