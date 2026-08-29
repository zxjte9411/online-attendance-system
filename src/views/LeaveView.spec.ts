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

  it('載入當前月份並呈現特殊狀態優先、日曆覆寫與出勤共存之列表', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getCalendarOverridesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getMonthAttendanceDates).toHaveBeenCalledWith('2026-08')

    // 檢查 2026-08-10 同日共存與例外標記
    const rowAug10 = wrapper.find('[data-testid="day-row-2026-08-10"]')
    expect(rowAug10.exists()).toBe(true)
    expect(rowAug10.text()).toContain('請假')
    expect(rowAug10.text()).toContain('個人事假')
    expect(rowAug10.text()).toContain('人工假日')
    expect(rowAug10.text()).toContain('特別紀念日')
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

  it('已有 Calendar Override + Day Status，只修改 Day Status 時 Calendar Override 不被 mutation', async () => {
    vi.mocked(upsertDayStatus).mockResolvedValue({
      id: 'ds-1',
      user_id: 'user-1',
      work_date: '2026-08-10',
      status: 'REMOTE',
      note: '改為遠端工作',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 編輯 2026-08-10 (已有 co-1 及 ds-1)
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 只變更 Day Status
    await wrapper.find('[data-testid="day-status-type"]').setValue('REMOTE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('改為遠端工作')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    // Day Status 有被更新
    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-10',
      status: 'REMOTE',
      note: '改為遠端工作',
    })

    // Calendar Override 完全沒有被呼叫
    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('已有 Calendar Override + Day Status，只修改 Calendar Override 時 Day Status 不被 mutation', async () => {
    vi.mocked(upsertCalendarOverride).mockResolvedValue({
      id: 'co-1',
      user_id: 'user-1',
      calendar_date: '2026-08-10',
      day_type: 'WORKDAY',
      name: '特別工作日',
      note: '專案衝刺',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 編輯 2026-08-10 (已有 co-1 及 ds-1)
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 只變更 Calendar Override
    await wrapper.find('[data-testid="calendar-override-type"]').setValue('WORKDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別工作日')
    await wrapper.find('[data-testid="calendar-override-note"]').setValue('專案衝刺')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    // Calendar Override 有被更新
    expect(upsertCalendarOverride).toHaveBeenCalledWith({
      calendar_date: '2026-08-10',
      day_type: 'WORKDAY',
      name: '特別工作日',
      note: '專案衝刺',
    })

    // Day Status 完全沒有被呼叫
    expect(upsertDayStatus).not.toHaveBeenCalled()
    expect(deleteDayStatus).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('沒有任何實質變更直接 Save (no-op Save) 不產生任何 mutation', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 直接點擊儲存，沒有改任何值
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()
    expect(upsertDayStatus).not.toHaveBeenCalled()
    expect(deleteDayStatus).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('空白與空白字元正規化不造成假變更', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    // 編輯 2026-08-10 (co-1: name='特別紀念日', note='公司放假'; ds-1: note='個人事假')
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 前後加入空白，實際正規化後內容相同
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('  特別紀念日  ')
    await wrapper.find('[data-testid="calendar-override-note"]').setValue('  公司放假  ')
    await wrapper.find('[data-testid="day-status-note"]').setValue('  個人事假  ')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()
    expect(upsertDayStatus).not.toHaveBeenCalled()
    expect(deleteDayStatus).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('支援新增及編輯 BUSINESS_TRIP 出差狀態', async () => {
    vi.mocked(upsertDayStatus).mockResolvedValue({
      id: 'ds-bt',
      user_id: 'user-1',
      work_date: '2026-08-20',
      status: 'BUSINESS_TRIP',
      note: '台北總部研討會',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="day-status-type"]').setValue('BUSINESS_TRIP')
    await wrapper.find('[data-testid="day-status-note"]').setValue('台北總部研討會')
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-20',
      status: 'BUSINESS_TRIP',
      note: '台北總部研討會',
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('處理 partial-success：當日曆覆寫成功但特殊狀態失敗時重新載入月份並顯示清楚提示', async () => {
    vi.mocked(upsertCalendarOverride).mockResolvedValue({
      id: 'co-new',
      user_id: 'user-1',
      calendar_date: '2026-08-20',
      day_type: 'HOLIDAY',
      name: '特別假日',
      note: null,
    })
    vi.mocked(upsertDayStatus).mockRejectedValueOnce({
      code: '42501',
      message: 'new row violates row-level security policy for table "day_statuses"',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 初始載入 1 次
    expect(getDayStatusesForMonth).toHaveBeenCalledTimes(1)

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 同時修改兩層
    await wrapper.find('[data-testid="calendar-override-type"]').setValue('HOLIDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別假日')
    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    // Calendar override 成功，Day status 失敗 -> 重新從 server loadMonth (第 2 次呼叫)
    expect(getDayStatusesForMonth).toHaveBeenCalledTimes(2)

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('日曆覆寫已更新，但特殊狀態儲存失敗：權限不足，無法執行此操作。')
  })

  it('partial-success reload 後重新同步 baseline，使用者直接 retry 時不再重複寫入已成功的日曆覆寫', async () => {
    const newOverride: CalendarOverride = {
      id: 'co-new-retry',
      user_id: 'user-1',
      calendar_date: '2026-08-20',
      day_type: 'HOLIDAY',
      name: '特別假日',
      note: null,
    }

    vi.mocked(upsertCalendarOverride).mockResolvedValue(newOverride)
    vi.mocked(upsertDayStatus).mockRejectedValueOnce({
      code: '42501',
      message: 'new row violates row-level security policy for table "day_statuses"',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 點擊 2026-08-20 編輯按鈕（初始無 override、無 status）
    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    // 同時修改兩層
    await wrapper.find('[data-testid="calendar-override-type"]').setValue('HOLIDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別假日')
    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('個人事假')

    // 第一次送出：Calendar Override 成功，Day Status 失敗
    // 當 partial failure 觸發 loadMonth 時，回傳包含已成功寫入的 newOverride
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValue([...mockCalendarOverrides, newOverride])

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    // 1. modal 仍開啟並顯示 partial-success 訊息
    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('日曆覆寫已更新，但特殊狀態儲存失敗：權限不足，無法執行此操作。')

    // 2. 使用者的 LEAVE form selection 與 note 仍保留
    const statusSelect = wrapper.find('[data-testid="day-status-type"]') as { element: HTMLSelectElement }
    expect(statusSelect.element.value).toBe('LEAVE')
    const statusNote = wrapper.find('[data-testid="day-status-note"]') as { element: HTMLInputElement }
    expect(statusNote.element.value).toBe('個人事假')

    // 3. 清除 mock 呼叫歷史，並將 upsertDayStatus 改為成功
    vi.mocked(upsertCalendarOverride).mockClear()
    vi.mocked(deleteCalendarOverride).mockClear()
    vi.mocked(upsertDayStatus).mockClear()
    vi.mocked(upsertDayStatus).mockResolvedValueOnce({
      id: 'ds-new-retry',
      user_id: 'user-1',
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '個人事假',
    })

    // 4. 不修改任何 form，直接再次按 Save
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    // 5. 第二次 Save：upsertDayStatus 被 retry，upsertCalendarOverride / deleteCalendarOverride 完全沒有被呼叫
    expect(upsertDayStatus).toHaveBeenCalledTimes(1)
    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '個人事假',
    })
    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()

    // 6. 最終儲存成功後 modal 正常關閉
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('將 Supabase/PostgREST 原始錯誤轉換為繁體中文友善訊息', async () => {
    // 測試 Unique Constraint 衝突錯誤
    vi.mocked(upsertDayStatus).mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint "day_statuses_user_id_work_date_key"',
      details: 'Key (user_id, work_date)=(...) already exists.',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')
    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('資料發生衝突，同一日期已有重複設定。')
    expect(modal.text()).not.toContain('duplicate key value')
  })

  it('避免月份切換 stale-response race（延遲回應不覆寫最新月份）', async () => {
    // 建立延遲 promise
    let resolveJulyStatuses: (val: DayStatus[]) => void
    const julyStatusesPromise = new Promise<DayStatus[]>((resolve) => {
      resolveJulyStatuses = resolve
    })

    let resolveAugustStatuses: (val: DayStatus[]) => void
    const augustStatusesPromise = new Promise<DayStatus[]>((resolve) => {
      resolveAugustStatuses = resolve
    })

    vi.mocked(getDayStatusesForMonth).mockImplementation((ym: string) => {
      if (ym === '2026-07') return julyStatusesPromise
      if (ym === '2026-08') return augustStatusesPromise
      return Promise.resolve([])
    })

    const wrapper = mount(LeaveView)

    // 切換到 7 月（發出 request A）
    const prevBtn = wrapper.find('[data-action="prev-month"]')
    await prevBtn.trigger('click')

    // 切換回 8 月（發出 request B）
    const nextBtn = wrapper.find('[data-action="next-month"]')
    await nextBtn.trigger('click')

    // 8 月（request B）先完成
    resolveAugustStatuses!([
      {
        id: 'ds-aug',
        user_id: 'user-1',
        work_date: '2026-08-01',
        status: 'REMOTE',
        note: '八月遠端',
      },
    ])
    await flushPromises()

    // 確認目前畫面呈現 8 月資料
    expect(wrapper.text()).toContain('2026 年 8 月')
    expect(wrapper.find('[data-testid="day-row-2026-08-01"]').text()).toContain('遠端')

    // 7 月（request A）最後完成
    resolveJulyStatuses!([
      {
        id: 'ds-jul',
        user_id: 'user-1',
        work_date: '2026-07-01',
        status: 'LEAVE',
        note: '七月請假',
      },
    ])
    await flushPromises()

    // UI 仍只能顯示 8 月資料，未被 7 月覆蓋
    expect(wrapper.text()).toContain('2026 年 8 月')
    expect(wrapper.find('[data-testid="day-row-2026-08-01"]').text()).toContain('遠端')
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

  it('清除覆寫與特殊狀態時分別呼叫 delete', async () => {
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

  it('載入失敗時顯示友善錯誤提示與重試按鈕', async () => {
    vi.mocked(getDayStatusesForMonth).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const wrapper = mount(LeaveView)
    await flushPromises()

    const errorAlert = wrapper.find('[role="alert"]')
    expect(errorAlert.exists()).toBe(true)
    expect(errorAlert.text()).toContain('網路連線異常，請檢查網路連線後再試。')

    // 重試
    vi.mocked(getDayStatusesForMonth).mockResolvedValue([])
    const retryBtn = wrapper.find('[data-action="retry-load"]')
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
