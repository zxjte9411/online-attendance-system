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
import { getCurrentUserId, getSetupStatus } from '../lib/settings'

vi.mock('../lib/attendance', () => ({
  getMonthAttendanceRecords: vi.fn(),
  createManualAttendance: vi.fn(),
  editAttendanceRecord: vi.fn(),
  deleteAttendanceRecord: vi.fn(),
}))

vi.mock('../lib/settings', () => ({
  getCurrentUserId: vi.fn(),
  getSetupStatus: vi.fn(),
}))

vi.mock('../lib/work-policy', () => ({
  getTaipeiToday: vi.fn(() => '2026-08-29'),
}))

const sampleContexts = [
  {
    id: 'context-1',
    user_id: 'user-1',
    name: 'Context Alpha',
    company_identifier: 'COMP-A',
    project_identifier: 'PROJ-A',
    active: true,
    is_default: true,
  },
  {
    id: 'context-2',
    user_id: 'user-1',
    name: 'Context Beta',
    company_identifier: 'COMP-B',
    project_identifier: 'PROJ-B',
    active: true,
    is_default: false,
  },
]

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

describe('AttendanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: null,
      contexts: sampleContexts as never,
      defaultContext: sampleContexts[0] as never,
      policies: [],
      complete: true,
    })
    vi.mocked(getMonthAttendanceRecords).mockResolvedValue([
      completedClockRecord,
      incompleteManualRecord,
      adjustedClockRecord,
    ])
  })

  it('載入當前月份資料並渲染紀錄列表與月份切換', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    expect(getMonthAttendanceRecords).toHaveBeenCalledWith('2026-08')
    expect(wrapper.text()).toContain('2026-08-10')
    expect(wrapper.text()).toContain('2026-08-11')
    expect(wrapper.text()).toContain('2026-08-12')

    // 切換至上一月
    await wrapper.get('[data-action="prev-month"]').trigger('click')
    await flushPromises()

    expect(getMonthAttendanceRecords).toHaveBeenCalledWith('2026-07')
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
    // Actual clock in 09:15, effective 09:30, expected 18:30
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
    wrapper.unmount()
  })

  it('點擊檢視明細顯示 snapshot summaries 與人可讀資訊', async () => {
    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-record-id="rec-1"] [data-action="view-detail"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="detail-modal"]')
    expect(modal.text()).toContain('Context Alpha')
    expect(modal.text()).toContain('COMP-A')
    expect(modal.text()).toContain('PROJ-A')
    expect(modal.text()).toContain('標準工作制')
    expect(modal.text()).toContain('09:30')
    expect(modal.text()).toContain('今日正常上班')
    expect(modal.text()).toContain('COMPLETED')
    wrapper.unmount()
  })

  it('補走出勤表單驗證與成功送出後刷新清單', async () => {
    vi.mocked(createManualAttendance).mockResolvedValue(completedClockRecord as never)

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-action="open-create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="form-modal"]')
    expect(modal.text()).toContain('補登出勤紀錄')

    // 填寫表單
    await modal.get('input[name="work_date"]').setValue('2026-08-15')
    await modal.get('select[name="context_id"]').setValue('context-1')
    await modal.get('input[name="actual_clock_in_time"]').setValue('09:30')
    await modal.get('input[name="actual_clock_out_time"]').setValue('18:30')
    await modal.get('input[name="status_note"]').setValue('新補登備註')

    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(createManualAttendance).toHaveBeenCalledWith({
      work_date: '2026-08-15',
      context_id: 'context-1',
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

    const dateInput = modal.get('input[name="work_date"]')
    expect(dateInput.attributes('disabled')).toBeDefined()

    await modal.get('input[name="actual_clock_out_time"]').setValue('19:30')
    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(editAttendanceRecord).toHaveBeenCalledWith({
      id: 'rec-1',
      context_id: 'context-1',
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

  it('表單若有 DB 錯誤會清楚顯示錯誤訊息', async () => {
    vi.mocked(createManualAttendance).mockRejectedValueOnce(new Error('此工作日已存在出勤紀錄。'))

    const wrapper = mount(AttendanceView, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('[data-action="open-create"]').trigger('click')
    await flushPromises()

    const modal = wrapper.get('[data-testid="form-modal"]')
    await modal.get('input[name="work_date"]').setValue('2026-08-10')
    await modal.get('select[name="context_id"]').setValue('context-1')
    await modal.get('input[name="actual_clock_in_time"]').setValue('09:30')

    await modal.get('form').trigger('submit')
    await flushPromises()

    expect(modal.text()).toContain('此工作日已存在出勤紀錄。')
    wrapper.unmount()
  })
})
