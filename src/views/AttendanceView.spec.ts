// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AttendanceView from './AttendanceView.vue'
import {
  createManualAttendance,
  deleteAttendanceRecord,
  editAttendanceRecord,
  getMonthAttendanceRecords,
  type AttendanceRecord,
} from '../lib/attendance'

vi.mock('../lib/attendance', () => ({
  getMonthAttendanceRecords: vi.fn(),
  createManualAttendance: vi.fn(),
  editAttendanceRecord: vi.fn(),
  deleteAttendanceRecord: vi.fn(),
}))

vi.mock('../lib/work-policy', () => ({
  getTaipeiToday: vi.fn(() => '2026-08-29'),
}))

const completedClockRecord: AttendanceRecord = {
  id: 'rec-1',
  user_id: 'user-1',
  work_date: '2026-08-10',
  context_id: 'context-1',
  work_policy_id: 'policy-1',
  actual_clock_in_at: '2026-08-10T01:15:00.000Z', // 09:15 Taipei
  actual_clock_out_at: '2026-08-10T10:30:00.000Z', // 18:30 Taipei
  effective_clock_in_at: '2026-08-10T01:30:00.000Z', // 09:30 Taipei
  effective_clock_out_at: '2026-08-10T10:30:00.000Z', // 18:30 Taipei
  expected_clock_out_at: '2026-08-10T10:30:00.000Z',
  actual_elapsed_minutes: 555,
  net_worked_minutes: 480,
  regular_minutes: 480,
  overtime_minutes: 0,
  created_source: 'CLOCK',
  manually_adjusted: false,
  last_manual_edit_at: null,
  status_note: '今日正常上班',
  context_snapshot: {
    name: 'Context Alpha',
    company_identifier: 'COMP-A',
    project_identifier: 'PROJ-A',
  },
  policy_snapshot: {
    name: '標準工作制',
    standard_start_time: '09:30:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    effective_from: '2026-01-01',
    effective_to: null,
    timezone: 'Asia/Taipei',
  },
  calculation_snapshot: {
    state: 'COMPLETED',
    calculation_version: 'v1',
    calculated_at: '2026-08-10T10:30:00.000Z',
    actual_elapsed_minutes: 555,
    net_worked_minutes: 480,
    regular_minutes: 480,
    overtime_minutes: 0,
    effective_clock_in_at: '2026-08-10T01:30:00.000Z',
    effective_clock_out_at: '2026-08-10T10:30:00.000Z',
    expected_clock_out_at: '2026-08-10T10:30:00.000Z',
  },
}

const incompleteManualRecord: AttendanceRecord = {
  id: 'rec-2',
  user_id: 'user-1',
  work_date: '2026-08-11',
  context_id: 'context-1',
  work_policy_id: 'policy-1',
  actual_clock_in_at: '2026-08-11T01:30:00.000Z', // 09:30 Taipei
  actual_clock_out_at: null,
  effective_clock_in_at: '2026-08-11T01:30:00.000Z',
  effective_clock_out_at: null,
  expected_clock_out_at: '2026-08-11T10:30:00.000Z',
  actual_elapsed_minutes: null,
  net_worked_minutes: null,
  regular_minutes: null,
  overtime_minutes: null,
  created_source: 'MANUAL',
  manually_adjusted: false,
  last_manual_edit_at: null,
  status_note: null,
  context_snapshot: {
    name: 'Context Alpha',
    company_identifier: 'COMP-A',
    project_identifier: 'PROJ-A',
  },
  policy_snapshot: {
    name: '標準工作制',
    standard_start_time: '09:30:00',
    work_minutes: 480,
    fixed_break_minutes: 60,
    early_arrival_policy: 'STANDARD_START',
    clock_in_rounding_mode: 'NONE',
    clock_in_rounding_minutes: null,
    clock_out_rounding_mode: 'NONE',
    clock_out_rounding_minutes: null,
    effective_from: '2026-01-01',
    effective_to: null,
    timezone: 'Asia/Taipei',
  },
  calculation_snapshot: {
    state: 'IN_PROGRESS',
    calculation_version: 'v1',
    calculated_at: '2026-08-11T01:30:00.000Z',
    actual_elapsed_minutes: null,
    net_worked_minutes: null,
    regular_minutes: null,
    overtime_minutes: null,
    effective_clock_in_at: '2026-08-11T01:30:00.000Z',
    effective_clock_out_at: null,
    expected_clock_out_at: '2026-08-11T10:30:00.000Z',
  },
}

const adjustedClockRecord: AttendanceRecord = {
  ...completedClockRecord,
  id: 'rec-3',
  work_date: '2026-08-12',
  manually_adjusted: true,
  last_manual_edit_at: '2026-08-12T12:00:00.000Z',
  overtime_minutes: 60,
  net_worked_minutes: 540,
  status_note: '主管確認補加班',
}

const assignmentSnapshotRecord: AttendanceRecord = {
  ...completedClockRecord,
  id: 'rec-assignment-snapshot',
  context_snapshot: {},
  assignment_snapshot: {
    staffing_employer: '歷史派遣雇主',
    client_company: '歷史派駐客戶',
    project: '歷史專案',
  },
}

describe('AttendanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMonthAttendanceRecords).mockResolvedValue([
      completedClockRecord,
      incompleteManualRecord,
      adjustedClockRecord,
    ])
  })

  it('目前沒有 Assignment 或 Policy 時仍可載入歷史月份資料', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    expect(getMonthAttendanceRecords).toHaveBeenCalledWith('2026-08')
    expect(wrapper.text()).toContain('2026-08-10')
    expect(wrapper.text()).toContain('Context Alpha')
    expect(wrapper.text()).toContain('COMP-A')
    expect(wrapper.text()).toContain('PROJ-A')
    expect(wrapper.text()).toContain('+ 補登出勤')
    wrapper.unmount()
  })

  it('清楚區分已完成與未完成紀錄，未完成不補猜工時', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    const completedRow = wrapper.get('[data-record-id="rec-1"]')
    expect(completedRow.text()).toContain('已完成')
    expect(completedRow.text()).toContain('8 小時')

    const incompleteRow = wrapper.get('[data-record-id="rec-2"]')
    expect(incompleteRow.text()).toContain('未完成')
    expect(incompleteRow.text()).toContain('—')
    expect(incompleteRow.text()).not.toContain('8 小時')
    wrapper.unmount()
  })

  it('清楚區分 actual / effective / expected 時間', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    const row = wrapper.get('[data-record-id="rec-1"]')
    expect(row.text()).toContain('實際時間 (ACTUAL)')
    expect(row.text()).toContain('有效時間 (EFFECTIVE)')
    expect(row.text()).toContain('09:15')
    expect(row.text()).toContain('09:30')
    expect(row.text()).toContain('18:30')
    wrapper.unmount()
  })

  it('清楚區分 MANUAL 建立來源與 manually_adjusted 修正狀態', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    const manualRow = wrapper.get('[data-record-id="rec-2"]')
    expect(manualRow.text()).toContain('手動補登')
    expect(manualRow.text()).not.toContain('已人工修正')

    const adjustedRow = wrapper.get('[data-record-id="rec-3"]')
    expect(adjustedRow.text()).toContain('打卡')
    expect(adjustedRow.text()).toContain('已人工修正')
    expect(adjustedRow.text()).toContain('最後修正')
    wrapper.unmount()
  })

  it('點擊檢視明細優先顯示歷史保存的 snapshot 與人可讀資訊', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    const card = wrapper.get('[data-record-id="rec-1"]')
    expect(card.text()).toContain('歷史工作資料快照')
    expect(card.text()).not.toContain('工作情境')
    expect(card.text()).not.toContain('工作派駐快照')

    await card.get('[data-action="view-detail"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="detail-modal"]')
    expect(modal.text()).toContain('保存的歷史工作資料快照')
    expect(modal.text()).toContain('保存的工作制度快照')
    expect(modal.text()).not.toContain('工作情境')
    expect(modal.text()).not.toContain('歷史工作派駐快照')
    expect(modal.text()).toContain('Context Alpha')
    expect(modal.text()).toContain('COMP-A')
    expect(modal.text()).toContain('PROJ-A')
    expect(modal.text()).toContain('標準工作制')
    expect(modal.text()).toContain('09:30')
    expect(modal.text()).toContain('今日正常上班')
    expect(modal.text()).toContain('COMPLETED')
    expect(modal.text()).toContain('快照有效工時')
    wrapper.unmount()
  })

  it('有 Assignment snapshot 時，列表與明細都顯示保存的工作歸屬', async () => {
    vi.mocked(getMonthAttendanceRecords).mockResolvedValue([assignmentSnapshotRecord])

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    const row = wrapper.get('[data-record-id="rec-assignment-snapshot"]')
    expect(row.text()).toContain('工作派駐快照')
    expect(row.text()).toContain('歷史派遣雇主')
    expect(row.text()).toContain('歷史派駐客戶')
    expect(row.text()).toContain('歷史專案')

    await row.get('[data-action="view-detail"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="detail-modal"]')
    expect(modal.text()).toContain('保存的工作派駐快照')
    expect(modal.text()).toContain('保存的工作制度快照')
    expect(modal.text()).toContain('歷史派遣雇主')
    expect(modal.text()).toContain('歷史派駐客戶')
    expect(modal.text()).toContain('歷史專案')
    wrapper.unmount()
  })

  it('從 single-day detail 點擊修改時，關閉 detail modal 且僅開啟 edit modal', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-record-id="rec-1"] [data-action="view-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-modal"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-modal"]').exists()).toBe(false)

    // 點擊 detail 內的修改此紀錄按鈕
    await wrapper.get('[data-action="edit-from-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-modal"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="form-modal"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('從 single-day detail 點擊刪除時，關閉 detail modal 且開啟 delete confirmation 對話框', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-record-id="rec-1"] [data-action="view-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-modal"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="delete-confirm-dialog"]').exists()).toBe(false)

    // 點擊 detail 內的刪除此紀錄按鈕
    await wrapper.get('[data-action="delete-from-detail"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-modal"]').exists()).toBe(false)
    const confirmDialog = wrapper.find('[data-testid="delete-confirm-dialog"]')
    expect(confirmDialog.exists()).toBe(true)
    expect(confirmDialog.text()).toContain('2026-08-10')
    wrapper.unmount()
  })

  it('月份切換具備 stale request 防護，晚回應的舊請求不會覆蓋新月份', async () => {
    let resolveJuly: (value: AttendanceRecord[]) => void
    let resolveJune: (value: AttendanceRecord[]) => void

    const julyPromise = new Promise<AttendanceRecord[]>((resolve) => {
      resolveJuly = resolve
    })
    const junePromise = new Promise<AttendanceRecord[]>((resolve) => {
      resolveJune = resolve
    })

    vi.mocked(getMonthAttendanceRecords).mockImplementation((month) => {
      if (month === '2026-07') return julyPromise
      if (month === '2026-06') return junePromise
      return Promise.resolve([])
    })

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    // 1. 切換至 7 月 (啟動 request A)
    await wrapper.get('[data-action="prev-month"]').trigger('click')

    // 2. 緊接著切換至 6 月 (啟動 request B)
    await wrapper.get('[data-action="prev-month"]').trigger('click')

    // 3. 讓 6 月 request B 先 resolve
    const juneRecord: AttendanceRecord = {
      ...completedClockRecord,
      id: 'june-rec',
      work_date: '2026-06-15',
    }
    resolveJune!([juneRecord])
    await flushPromises()

    expect(wrapper.text()).toContain('2026-06-15')

    // 4. 讓 7 月 request A 晚 resolve
    const julyRecord: AttendanceRecord = {
      ...completedClockRecord,
      id: 'july-rec',
      work_date: '2026-07-15',
    }
    resolveJuly!([julyRecord])
    await flushPromises()

    // 5. 畫面應維持 6 月的資料，不被 7 月覆蓋
    expect(wrapper.text()).toContain('2026-06-15')
    expect(wrapper.text()).not.toContain('2026-07-15')
    wrapper.unmount()
  })

  it('補登出勤表單驗證與成功送出後刷新清單', async () => {
    vi.mocked(createManualAttendance).mockResolvedValue(completedClockRecord as never)

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-action="open-create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="form-modal"]')
    expect(modal.text()).toContain('補登出勤紀錄')
    expect(modal.find('select[name="context_id"]').exists()).toBe(false)

    // 填寫表單
    await modal.get('input[name="work_date"]').setValue('2026-08-15')
    await modal.get('input[name="actual_clock_in_time"]').setValue('09:30')
    await modal.get('input[name="actual_clock_out_time"]').setValue('18:30')
    await modal.get('input[name="status_note"]').setValue('新補登備註')

    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(createManualAttendance).toHaveBeenCalledWith({
      work_date: '2026-08-15',
      actual_clock_in_time: '09:30',
      actual_clock_out_time: '18:30',
      status_note: '新補登備註',
    })
    expect(getMonthAttendanceRecords).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('修改出勤表單工作日唯讀，送出成功後刷新清單', async () => {
    vi.mocked(editAttendanceRecord).mockResolvedValue(completedClockRecord as never)

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-record-id="rec-1"] [data-action="edit-record"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="form-modal"]')
    expect(modal.text()).toContain('修改出勤紀錄')
    expect(modal.find('select[name="context_id"]').exists()).toBe(false)

    const dateInput = modal.get('input[name="work_date"]')
    expect(dateInput.attributes('disabled')).toBeDefined()

    await modal.get('input[name="actual_clock_out_time"]').setValue('19:30')
    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(editAttendanceRecord).toHaveBeenCalledWith({
      id: 'rec-1',
      actual_clock_in_time: '09:15',
      actual_clock_out_time: '19:30',
      status_note: '今日正常上班',
    })
    expect(getMonthAttendanceRecords).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('刪除需要明確確認對話框包含日期，確認後呼叫刪除 RPC 並刷新', async () => {
    vi.mocked(deleteAttendanceRecord).mockResolvedValue(undefined as never)

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-record-id="rec-1"] [data-action="delete-record"]').trigger('click')
    await flushPromises()

    const confirmDialog = wrapper.get('[data-testid="delete-confirm-dialog"]')
    expect(confirmDialog.text()).toContain('2026-08-10')

    await confirmDialog.get('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(deleteAttendanceRecord).toHaveBeenCalledWith('rec-1')
    expect(getMonthAttendanceRecords).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it.each([
    [
      'NO_ASSIGNMENT',
      '2026-08-10',
      '2026-08-10 沒有可用的 Work Assignment（NO_ASSIGNMENT）。',
      '2026-08-10 沒有可用的工作派駐（NO_ASSIGNMENT）。',
    ],
    [
      'MISSING_POLICY',
      '2026-08-11',
      '2026-08-11 找不到適用的 Work Policy（MISSING_POLICY）。',
      '2026-08-11 找不到適用的工作制度（MISSING_POLICY）。',
    ],
  ])('日期特定 %s RPC 錯誤會轉換為統一術語且可區分地顯示', async (resolution, workDate, rpcMessage, expectedMessage) => {
    vi.mocked(createManualAttendance).mockRejectedValueOnce({
      message: rpcMessage,
      code: 'P0001',
      details: `RPC resolution: ${resolution}`,
      hint: '請先完成工作派駐與工作制度設定。',
      status: 400,
    })

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-action="open-create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="form-modal"]')
    await modal.get('input[name="work_date"]').setValue(workDate)
    await modal.get('input[name="actual_clock_in_time"]').setValue('09:30')

    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(modal.get('[role="alert"]').text()).toContain(resolution)
    expect(modal.get('[role="alert"]').text()).toBe(expectedMessage)
    expect(modal.get('[role="alert"]').text()).not.toContain('Work Assignment')
    expect(modal.get('[role="alert"]').text()).not.toContain('Work Policy')
    wrapper.unmount()
  })
})
