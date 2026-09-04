// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, config } from '@vue/test-utils'
import ReportView from './ReportView.vue'
import * as settingsLib from '../lib/settings'
import * as workAssignmentLib from '../lib/work-assignment'
import type { WorkAssignment } from '../domain/work-assignment/work-assignment'
import * as attendanceLib from '../lib/attendance'
import * as dayStatusCalendarLib from '../lib/day-status-calendar'
import * as dgpaCalendarLib from '../lib/dgpa-calendar'
import * as exportTemplatesLib from '../lib/export-templates'
import * as xlsxExportDomain from '../domain/export-template/xlsx-export'

config.global.stubs = {
  RouterLink: true,
}

const mockAssignments: WorkAssignment[] = [
  {
    id: 'assign-1',
    user_id: 'user-1',
    staffing_employer: '派遣公司 A',
    client_company: 'COMPANY_A',
    project: 'PROJECT_X',
    effective_from: '2026-01-01',
    effective_to: null,
  },
  {
    id: 'assign-2',
    user_id: 'user-1',
    staffing_employer: '派遣公司 B',
    client_company: 'COMPANY_B',
    project: 'PROJECT_Y',
    effective_from: '2025-01-01',
    effective_to: '2025-12-31',
  },
]

const mockPolicyAssign1: settingsLib.WorkPolicy = {
  id: 'pol-1',
  user_id: 'user-1',
  assignment_id: 'assign-1',
  context_id: null,
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

const mockPolicyAssign2: settingsLib.WorkPolicy = {
  id: 'pol-2',
  user_id: 'user-1',
  assignment_id: 'assign-2',
  context_id: null,
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
  effective_from: '2025-01-01',
  effective_to: null,
  timezone: 'Asia/Taipei',
}

describe('ReportView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    vi.spyOn(settingsLib, 'getCurrentUserId').mockResolvedValue('user-1')
    vi.spyOn(workAssignmentLib, 'listWorkAssignments').mockResolvedValue(mockAssignments)
    vi.spyOn(settingsLib, 'listWorkPolicies').mockImplementation(async (_uid, assignId) => {
      return assignId === 'assign-2' ? [mockPolicyAssign2] : [mockPolicyAssign1]
    })
    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockResolvedValue([])
    vi.spyOn(dayStatusCalendarLib, 'getDayStatusesForMonth').mockResolvedValue([])
    vi.spyOn(dayStatusCalendarLib, 'getCalendarOverridesForMonth').mockResolvedValue([])
    vi.spyOn(dgpaCalendarLib, 'getDgpaCalendarForMonth').mockResolvedValue([])
    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockResolvedValue(null)
  })

  it('載入並呈現工作派駐選擇、月份導覽與預設統計', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.text()).toContain('報表')
    expect(wrapper.text()).toContain('COMPANY_A')
    expect(wrapper.find('[data-test="assignment-select"]').exists()).toBe(true)
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
        assignment_id: 'assign-1',
        context_id: null,
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
        assignment_id: 'assign-1',
        context_id: null,
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
        assignment_id: 'assign-1',
        context_id: null,
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

  it('切換 Work Assignment 時重新 query 並呈現新派駐制度與資料', async () => {
    const listPoliciesSpy = vi.spyOn(settingsLib, 'listWorkPolicies')
    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2025-08')
    await flushPromises()

    // Switch assignment to assign-2 (effective 2025-01-01 ~ 2025-12-31)
    await wrapper.find('[data-test="assignment-select"]').setValue('assign-2')
    await flushPromises()

    expect(listPoliciesSpy).toHaveBeenCalledWith('user-1', 'assign-2')
    // In assign-2 (work_minutes = 360), 21 working days in 2025-08: scheduled = 21 * 360 = 7560 min = 126 hours
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

  it('Async Scope Consistency: 切換 assignment 或 month 在 pending 期間立即呈現 loading，不顯示錯配舊資料', async () => {
    let resolvePolicies!: (val: settingsLib.WorkPolicy[]) => void
    const pendingPromise = new Promise<settingsLib.WorkPolicy[]>((resolve) => {
      resolvePolicies = resolve
    })

    const wrapper = mount(ReportView)
    await flushPromises()

    // Currently showing assign-1 data
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)

    // Make listWorkPolicies return a pending promise on next call
    vi.spyOn(settingsLib, 'listWorkPolicies').mockReturnValue(pendingPromise)

    // Trigger assignment switch to assign-2
    await wrapper.find('[data-test="assignment-select"]').setValue('assign-2')

    // While request is pending: loading indicator exists, summary cards and table rows are hidden
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="report-row"]')).toHaveLength(0)

    // Now resolve
    resolvePolicies([mockPolicyAssign2])
    await flushPromises()

    // Loading indicator gone, new report displayed
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)
  })

  it('Async Scope Consistency: query failure 時清除報表並呈現 error banner，不殘留 stale report', async () => {
    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)

    // Mock failure on next query
    vi.spyOn(attendanceLib, 'getMonthAttendanceRecords').mockRejectedValue(new Error('Network error'))

    await wrapper.find('[data-test="assignment-select"]').setValue('assign-2')
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

    // Switch to assign-2 (req 1)
    await wrapper.find('[data-test="assignment-select"]').setValue('assign-2')
    // Immediately switch back to assign-1 (req 2)
    await wrapper.find('[data-test="assignment-select"]').setValue('assign-1')

    // Req 1 finishes later
    resolveReq1([mockPolicyAssign2])
    await flushPromises()

    // Still in loading because current selection is assign-1
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(true)

    // Req 2 finishes
    resolveReq2([mockPolicyAssign1])
    await flushPromises()

    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(true)
  })

  it('呈現 incomplete 與 exception flags 標記', async () => {
    const incompleteAttendance: attendanceLib.AttendanceRecord = {
      id: 'att-1',
      user_id: 'user-1',
      work_date: '2026-08-03',
      assignment_id: 'assign-1',
      context_id: null,
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
    expect(wrapper.text()).toContain('請假但出勤')
  })

  it('缺少適用 Work Policy 時顯示設定不完整提示並停用 CSV 下載', async () => {
    vi.spyOn(settingsLib, 'listWorkPolicies').mockResolvedValue([])

    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
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
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    const downloadButton = wrapper.find('[data-test="download-csv-button"]')
    expect(downloadButton.exists()).toBe(true)
    expect(downloadButton.attributes('disabled')).toBeUndefined()

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadButton.trigger('click')

    expect(createObjectUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('無任何 Work Assignment 時結束 loading 並顯示 empty state，不發出 month query 且 CSV 按鈕停用', async () => {
    vi.spyOn(workAssignmentLib, 'listWorkAssignments').mockResolvedValue([])
    const listPoliciesSpy = vi.spyOn(settingsLib, 'listWorkPolicies')

    const wrapper = mount(ReportView)
    await flushPromises()

    // Loading indicator must be gone
    expect(wrapper.find('[data-test="loading-indicator"]').exists()).toBe(false)
    // Empty state text must be shown
    expect(wrapper.text()).toContain('尚未建立任何工作派駐')
    expect(wrapper.find('[data-test="empty-assignment-state"]').exists()).toBe(true)
    // Summary cards and table rows must not exist
    expect(wrapper.find('[data-test="summary-scheduled"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="report-row"]')).toHaveLength(0)
    // Month query must not be triggered
    expect(listPoliciesSpy).not.toHaveBeenCalled()
    // CSV button must be disabled
    const downloadButton = wrapper.find('[data-test="download-csv-button"]')
    expect(downloadButton.attributes('disabled')).toBeDefined()
  })

  it('未設定 XLSX 範本時顯示前往設定 CTA，不顯示下載 XLSX 按鈕', async () => {
    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockResolvedValue(null)

    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.find('[data-test="missing-template-cta"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="download-xlsx-button"]').exists()).toBe(false)
  })

  it('已設定 XLSX 範本但當前月份無工作表對應時，顯示提示並停用下載 XLSX 按鈕', async () => {
    const mockTpl: exportTemplatesLib.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      assignment_id: 'assign-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/assign-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-09': '9月' }, // No 2026-08
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockResolvedValue(mockTpl)

    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    expect(wrapper.find('[data-test="missing-worksheet-cta"]').exists()).toBe(true)
    const xlsxButton = wrapper.find('[data-test="download-xlsx-button"]')
    expect(xlsxButton.exists()).toBe(true)
    expect(xlsxButton.attributes('disabled')).toBeDefined()
  })

  it('已設定 XLSX 範本且當月有對應時，點擊下載 XLSX 產出填寫後之活頁簿檔案', async () => {
    const mockTpl: exportTemplatesLib.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      assignment_id: 'assign-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/assign-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'actual_clock_in_at', targetColumn: 'D', transforms: [{ type: 'TIME_HH_MM' }] },
      ],
      static_cell_mapping: [
        { sourceField: 'year_month', targetCell: 'B2', transforms: [{ type: 'ROC_YEAR_MONTH' }] },
      ],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockResolvedValue(mockTpl)
    vi.spyOn(exportTemplatesLib, 'downloadExportTemplateFile').mockResolvedValue(new ArrayBuffer(16))
    vi.spyOn(xlsxExportDomain, 'exportReportToXlsx').mockResolvedValue(new Uint8Array([1, 2, 3]))

    const createObjectUrlSpy = vi.fn().mockReturnValue('blob:mock-xlsx-url')
    const revokeObjectUrlSpy = vi.fn()
    window.URL.createObjectURL = createObjectUrlSpy
    window.URL.revokeObjectURL = revokeObjectUrlSpy
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const wrapper = mount(ReportView, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    })
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    expect(wrapper.find('[data-test="missing-template-cta"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="missing-worksheet-cta"]').exists()).toBe(false)

    const xlsxButton = wrapper.find('[data-test="download-xlsx-button"]')
    expect(xlsxButton.exists()).toBe(true)
    expect(xlsxButton.attributes('disabled')).toBeUndefined()

    await xlsxButton.trigger('click')
    await flushPromises()

    expect(exportTemplatesLib.downloadExportTemplateFile).toHaveBeenCalledWith('user-1/assign-1/tpl-1/source.xlsx')
    expect(createObjectUrlSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('XLSX 匯出失敗時顯示友善錯誤提示', async () => {
    const mockTpl: exportTemplatesLib.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      assignment_id: 'assign-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/assign-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockResolvedValue(mockTpl)
    vi.spyOn(exportTemplatesLib, 'downloadExportTemplateFile').mockRejectedValue(new Error('Storage failure'))

    const wrapper = mount(ReportView, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    })
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    const xlsxButton = wrapper.find('[data-test="download-xlsx-button"]')
    await xlsxButton.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="export-xlsx-error-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="export-xlsx-error-banner"]').text()).toContain('匯出 XLSX 失敗')
  })

  it('載入範本發生資料庫或網路錯誤時呈現錯誤提示，而非偽裝為尚未設定範本', async () => {
    vi.spyOn(exportTemplatesLib, 'getExportTemplate').mockRejectedValue(new Error('PostgREST connection failure'))

    const wrapper = mount(ReportView)
    await flushPromises()

    expect(wrapper.find('[data-test="load-error-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="missing-template-cta"]').exists()).toBe(false)
  })

  it('月中起訖派駐：Assignment period 外標為非派駐期間，不計入工時，且不因非派駐期間阻擋匯出', async () => {
    // assign-part: 2026-08-10 ~ 2026-08-20
    const partialAssignment: WorkAssignment = {
      id: 'assign-part',
      user_id: 'user-1',
      staffing_employer: '派遣公司 P',
      client_company: 'COMPANY_PART',
      project: 'PROJECT_PART',
      effective_from: '2026-08-10',
      effective_to: '2026-08-20',
    }
    const policyPart: settingsLib.WorkPolicy = {
      ...mockPolicyAssign1,
      assignment_id: 'assign-part',
    }

    vi.spyOn(workAssignmentLib, 'listWorkAssignments').mockResolvedValue([partialAssignment])
    vi.spyOn(settingsLib, 'listWorkPolicies').mockResolvedValue([policyPart])

    const wrapper = mount(ReportView)
    await wrapper.find('[data-test="month-input"]').setValue('2026-08')
    await flushPromises()

    // Aug 1 (Sat, outside period): na-badge
    const rows = wrapper.findAll('[data-test="report-row"]')
    expect(rows).toHaveLength(31)

    // Row 1 (Aug 1): outside period
    const row1 = rows[0]
    expect(row1.find('[data-test="na-badge"]').exists()).toBe(true)
    expect(row1.find('[data-test="na-badge"]').text()).toBe('非派駐期間')

    // Row 10 (Aug 10): inside period, workday
    const row10 = rows[9]
    expect(row10.find('[data-test="na-badge"]').exists()).toBe(false)
    expect(row10.text()).toContain('工作日')

    // Configuration error banner should NOT exist even though 1~9 and 21~31 are outside policy/period
    expect(wrapper.find('[data-test="configuration-error-banner"]').exists()).toBe(false)
    const downloadButton = wrapper.find('[data-test="download-csv-button"]')
    expect(downloadButton.attributes('disabled')).toBeUndefined()
  })

  it('兩筆雇主/客戶/專案相同但期間不同的 ENDED Assignment，option 可清楚區分且切換時使用正確 assignment id', async () => {
    const endedAssignment1: WorkAssignment = {
      id: 'assign-ended-1',
      user_id: 'user-1',
      staffing_employer: '派遣雇主 X',
      client_company: '派駐客戶 Y',
      project: '專案 Z',
      effective_from: '2025-01-01',
      effective_to: '2025-06-30',
    }
    const endedAssignment2: WorkAssignment = {
      id: 'assign-ended-2',
      user_id: 'user-1',
      staffing_employer: '派遣雇主 X',
      client_company: '派駐客戶 Y',
      project: '專案 Z',
      effective_from: '2025-07-01',
      effective_to: '2025-12-31',
    }

    vi.spyOn(workAssignmentLib, 'listWorkAssignments').mockResolvedValue([
      endedAssignment1,
      endedAssignment2,
    ])
    const listPoliciesSpy = vi.spyOn(settingsLib, 'listWorkPolicies').mockResolvedValue([])

    const wrapper = mount(ReportView)
    await flushPromises()

    const options = wrapper.findAll('[data-test="assignment-select"] option')
    expect(options).toHaveLength(2)

    // Option 1 has 2025-01-01 ~ 2025-06-30
    expect(options[0].text()).toContain('派遣雇主 X / 派駐客戶 Y / 專案 Z (2025-01-01 ~ 2025-06-30) (已結束)')
    // Option 2 has 2025-07-01 ~ 2025-12-31
    expect(options[1].text()).toContain('派遣雇主 X / 派駐客戶 Y / 專案 Z (2025-07-01 ~ 2025-12-31) (已結束)')
    expect(options[0].text()).not.toBe(options[1].text())

    // Switch selection to endedAssignment2
    await wrapper.find('[data-test="assignment-select"]').setValue('assign-ended-2')
    await flushPromises()

    expect(listPoliciesSpy).toHaveBeenCalledWith('user-1', 'assign-ended-2')
  })
})
