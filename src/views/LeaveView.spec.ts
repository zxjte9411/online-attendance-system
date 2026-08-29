// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeaveView from './LeaveView.vue'
import {
  getDayStatusesForMonth,
  getCalendarOverridesForMonth,
  getMonthAttendanceDates,
  upsertDayStatus,
  deleteDayStatus,
  upsertCalendarOverride,
  deleteCalendarOverride,
  type DayStatus,
  type CalendarOverride,
} from '../lib/day-status-calendar'

vi.mock('../lib/day-status-calendar', () => ({
  getDayStatusesForMonth: vi.fn(),
  getCalendarOverridesForMonth: vi.fn(),
  getMonthAttendanceDates: vi.fn(),
  upsertDayStatus: vi.fn(),
  deleteDayStatus: vi.fn(),
  upsertCalendarOverride: vi.fn(),
  deleteCalendarOverride: vi.fn(),
}))

vi.mock('../lib/work-policy', () => ({
  getTaipeiToday: vi.fn(() => '2026-08-30'),
}))

const mockDayStatuses: DayStatus[] = [
  {
    id: 'ds-1',
    user_id: 'user-1',
    work_date: '2026-08-10',
    status: 'LEAVE',
    note: '個人事假',
  },
  {
    id: 'ds-2',
    user_id: 'user-1',
    work_date: '2026-08-11',
    status: 'REMOTE',
    note: '在家遠端工作',
  },
  {
    id: 'ds-3',
    user_id: 'user-1',
    work_date: '2026-08-12',
    status: 'BUSINESS_TRIP',
    note: '新竹客戶端出差',
  },
]

const mockCalendarOverrides: CalendarOverride[] = [
  {
    id: 'co-1',
    user_id: 'user-1',
    calendar_date: '2026-08-10',
    day_type: 'HOLIDAY',
    name: '特別紀念日',
    note: '公司放假',
  },
  {
    id: 'co-2',
    user_id: 'user-1',
    calendar_date: '2026-08-15',
    day_type: 'WORKDAY',
    name: '補行上班',
    note: null,
  },
]

const mockAttendanceDates = new Set(['2026-08-10', '2026-08-11', '2026-08-15'])

describe('LeaveView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDayStatusesForMonth).mockResolvedValue([...mockDayStatuses])
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValue([...mockCalendarOverrides])
    vi.mocked(getMonthAttendanceDates).mockResolvedValue(new Set(mockAttendanceDates))
  })

  it('載入當前月份並呈現日曆覆寫與特殊狀態分開的列表', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getCalendarOverridesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getMonthAttendanceDates).toHaveBeenCalledWith('2026-08')

    // 檢查 2026-08-10 同日共存與例外標記
    const rowAug10 = wrapper.find('[data-testid="day-row-2026-08-10"]')
    expect(rowAug10.exists()).toBe(true)
    expect(rowAug10.text()).toContain('人工假日')
    expect(rowAug10.text()).toContain('特別紀念日')
    expect(rowAug10.text()).toContain('請假')
    expect(rowAug10.text()).toContain('個人事假')
    expect(rowAug10.text()).toContain('已有出勤')

    const exceptionBadgeAug10 = wrapper.find('[data-testid="exception-badge-2026-08-10"]')
    expect(exceptionBadgeAug10.exists()).toBe(true)
    expect(exceptionBadgeAug10.text()).toContain('已有出勤紀錄')

    // 檢查 2026-08-11 遠端
    const rowAug11 = wrapper.find('[data-testid="day-row-2026-08-11"]')
    expect(rowAug11.text()).toContain('遠端')
    expect(rowAug11.text()).toContain('在家遠端工作')

    // 檢查 2026-08-12 出差
    const rowAug12 = wrapper.find('[data-testid="day-row-2026-08-12"]')
    expect(rowAug12.text()).toContain('出差')
    expect(rowAug12.text()).toContain('新竹客戶端出差')

    // 檢查 2026-08-15 人工工作日
    const rowAug15 = wrapper.find('[data-testid="day-row-2026-08-15"]')
    expect(rowAug15.text()).toContain('人工工作日')
    expect(rowAug15.text()).toContain('補行上班')
  })

  it('支援月份切換（上個月、下個月、回到本月）', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    const prevBtn = wrapper.find('[data-action="prev-month"]')
    await prevBtn.trigger('click')
    await flushPromises()

    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-07')

    const nextBtn = wrapper.find('[data-action="next-month"]')
    await nextBtn.trigger('click')
    await flushPromises()

    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-08')

    await prevBtn.trigger('click')
    await flushPromises()
    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-07')

    const thisMonthBtn = wrapper.find('[data-action="this-month"]')
    await thisMonthBtn.trigger('click')
    await flushPromises()
    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-08')
  })

  it('開啟編輯對話框並可成功更新 Day Status (LEAVE) 與 Calendar Override (HOLIDAY)', async () => {
    vi.mocked(upsertDayStatus).mockResolvedValue({
      id: 'ds-new',
      user_id: 'user-1',
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '新增事假',
    })
    vi.mocked(upsertCalendarOverride).mockResolvedValue({
      id: 'co-new',
      user_id: 'user-1',
      calendar_date: '2026-08-20',
      day_type: 'HOLIDAY',
      name: '特別假日',
      note: null,
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 點擊 2026-08-20 編輯按鈕
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)

    // 設定日曆覆寫為 HOLIDAY
    const overrideSelect = wrapper.find('[data-testid="calendar-override-type"]')
    await overrideSelect.setValue('HOLIDAY')
    const overrideNameInput = wrapper.find('[data-testid="calendar-override-name"]')
    await overrideNameInput.setValue('特別假日')

    // 設定特殊狀態為 LEAVE
    const statusSelect = wrapper.find('[data-testid="day-status-type"]')
    await statusSelect.setValue('LEAVE')
    const statusNoteInput = wrapper.find('[data-testid="day-status-note"]')
    await statusNoteInput.setValue('新增事假')

    // 儲存
    const saveBtn = wrapper.find('[data-action="save-day"]')
    await saveBtn.trigger('click')
    await flushPromises()

    expect(upsertCalendarOverride).toHaveBeenCalledWith({
      calendar_date: '2026-08-20',
      day_type: 'HOLIDAY',
      name: '特別假日',
      note: null,
    })
    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '新增事假',
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('支援設定 REMOTE 與 BUSINESS_TRIP 狀態', async () => {
    vi.mocked(upsertDayStatus).mockResolvedValue({
      id: 'ds-remote',
      user_id: 'user-1',
      work_date: '2026-08-22',
      status: 'REMOTE',
      note: '遠端協作',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-22"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="day-status-type"]').setValue('REMOTE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('遠端協作')
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-22',
      status: 'REMOTE',
      note: '遠端協作',
    })
  })

  it('已有出勤之日期在對話框內顯示出勤保留提示', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    // 點擊 2026-08-10 (已有出勤)
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    const attendanceNotice = wrapper.find('[data-testid="attendance-retention-notice"]')
    expect(attendanceNotice.exists()).toBe(true)
    expect(attendanceNotice.text()).toContain('已有出勤紀錄')
    expect(attendanceNotice.text()).toContain('不會修改、刪除或重算出勤紀錄')
  })

  it('清除覆寫或特殊狀態時呼叫 delete', async () => {
    vi.mocked(deleteDayStatus).mockResolvedValue()
    vi.mocked(deleteCalendarOverride).mockResolvedValue()

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 編輯 2026-08-10 (原本有 ds-1 與 co-1)
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 清除日曆覆寫
    await wrapper.find('[data-testid="calendar-override-type"]').setValue('NONE')
    // 清除特殊狀態
    await wrapper.find('[data-testid="day-status-type"]').setValue('NONE')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(deleteCalendarOverride).toHaveBeenCalledWith('co-1')
    expect(deleteDayStatus).toHaveBeenCalledWith('ds-1')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('對話框儲存失敗時在對話框內顯示錯誤訊息且不關閉對話框', async () => {
    vi.mocked(upsertDayStatus).mockRejectedValueOnce(new Error('權限不足或資料庫衝突'))

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('權限不足或資料庫衝突')

    // 取消關閉對話框
    await wrapper.find('[data-action="cancel-edit"]').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('載入失敗時顯示錯誤提示與重試按鈕', async () => {
    vi.mocked(getDayStatusesForMonth).mockRejectedValueOnce(new Error('網路連線逾時'))

    const wrapper = mount(LeaveView)
    await flushPromises()

    const errorAlert = wrapper.find('[role="alert"]')
    expect(errorAlert.exists()).toBe(true)
    expect(errorAlert.text()).toContain('網路連線逾時')

    // 重試
    vi.mocked(getDayStatusesForMonth).mockResolvedValue([])
    const retryBtn = wrapper.find('[data-action="retry-load"]')
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
