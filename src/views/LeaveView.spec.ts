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
import {
  getDgpaCalendarForMonth,
  syncDgpaCalendarYear,
} from '../lib/dgpa-calendar'
import type { DgpaCalendarRow } from '../domain/dgpa-calendar/resolver'
import {
  getSetupStatus,
  getCurrentUserId,
} from '../lib/settings'

vi.mock('../lib/day-status-calendar', () => ({
  getDayStatusesForMonth: vi.fn(),
  getCalendarOverridesForMonth: vi.fn(),
  getMonthAttendanceDates: vi.fn(),
  upsertDayStatus: vi.fn(),
  deleteDayStatus: vi.fn(),
  upsertCalendarOverride: vi.fn(),
  deleteCalendarOverride: vi.fn(),
}))

vi.mock('../lib/dgpa-calendar', () => ({
  getDgpaCalendarForMonth: vi.fn(),
  syncDgpaCalendarYear: vi.fn(),
}))

vi.mock('../lib/settings', () => ({
  getCurrentUserId: vi.fn(),
  getSetupStatus: vi.fn(),
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
    name: '特別工作日',
    note: null,
  },
]

const mockDgpaRows: DgpaCalendarRow[] = [
  {
    calendar_date: '2026-08-03', // Monday normal DGPA workday
    day_type: 'WORKDAY',
    name: null,
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-08-01T10:00:00Z',
  },
  {
    calendar_date: '2026-08-08', // Saturday DGPA makeup workday
    day_type: 'WORKDAY',
    name: '補行上班',
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-08-01T10:00:00Z',
  },
  {
    calendar_date: '2026-08-10', // Monday DGPA workday
    day_type: 'WORKDAY',
    name: null,
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-08-01T10:00:00Z',
  },
  {
    calendar_date: '2026-08-15', // Saturday DGPA holiday
    day_type: 'HOLIDAY',
    name: '中元節',
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-08-01T10:00:00Z',
  },
  {
    calendar_date: '2026-08-20', // Thursday DGPA holiday
    day_type: 'HOLIDAY',
    name: '國定假日',
    source: 'https://data.gov.tw/dataset/14718/test',
    fetched_at: '2026-08-01T10:00:00Z',
  },
]

const mockAttendanceDates = new Set(['2026-08-10', '2026-08-11', '2026-08-15', '2026-08-20'])

describe('LeaveView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDayStatusesForMonth).mockResolvedValue([...mockDayStatuses])
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValue([...mockCalendarOverrides])
    vi.mocked(getMonthAttendanceDates).mockResolvedValue(new Set(mockAttendanceDates))
    vi.mocked(getDgpaCalendarForMonth).mockResolvedValue([...mockDgpaRows])
    vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: { id: 'user-1', display_name: '測試使用者', timezone: 'Asia/Taipei' },
      contexts: [
        {
          id: 'ctx-1',
          user_id: 'user-1',
          name: '預設工作',
          company_identifier: 'C1',
          project_identifier: 'P1',
          active: true,
          is_default: true,
        },
      ],
      defaultContext: {
        id: 'ctx-1',
        user_id: 'user-1',
        name: '預設工作',
        company_identifier: 'C1',
        project_identifier: 'P1',
        active: true,
        is_default: true,
      },
      policies: [
        {
          id: 'pol-1',
          user_id: 'user-1',
          context_id: 'ctx-1',
          name: '標準制度',
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
        },
      ],
      complete: true,
    })
  })

  it('載入當前月份並呈現 DGPA 狀態、特殊狀態優先、日曆覆寫與出勤共存之列表', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    expect(getDayStatusesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getCalendarOverridesForMonth).toHaveBeenCalledWith('2026-08')
    expect(getMonthAttendanceDates).toHaveBeenCalledWith('2026-08')
    expect(getDgpaCalendarForMonth).toHaveBeenCalledWith('2026-08')

    // 檢查 DGPA 狀態列
    const dgpaStatus = wrapper.find('[data-testid="dgpa-status-summary"]')
    expect(dgpaStatus.exists()).toBe(true)
    expect(dgpaStatus.text()).toContain('DGPA 日曆已同步')

    // 檢查 2026-08-03（週一 DGPA 工作日，一般平日）
    const rowAug03 = wrapper.find('[data-testid="day-row-2026-08-03"]')
    expect(rowAug03.exists()).toBe(true)
    expect(rowAug03.text()).toContain('DGPA 工作日')

    // 檢查 2026-08-08（週六 DGPA 補班日，週末工作日）
    const rowAug08 = wrapper.find('[data-testid="day-row-2026-08-08"]')
    expect(rowAug08.exists()).toBe(true)
    expect(rowAug08.text()).toContain('DGPA 補班日')
    expect(rowAug08.text()).toContain('補行上班')

    // 檢查 2026-08-10 同日共存與例外標記、人工覆寫與 DGPA 基準
    const rowAug10 = wrapper.find('[data-testid="day-row-2026-08-10"]')
    expect(rowAug10.exists()).toBe(true)
    expect(rowAug10.text()).toContain('請假')
    expect(rowAug10.text()).toContain('個人事假')
    expect(rowAug10.text()).toContain('人工假日')
    expect(rowAug10.text()).toContain('特別紀念日')
    expect(rowAug10.text()).toContain('原 DGPA: 工作日')
    expect(rowAug10.text()).toContain('已有出勤')

    const exceptionBadgeAug10 = wrapper.find('[data-testid="exception-badge-2026-08-10"]')
    expect(exceptionBadgeAug10.exists()).toBe(true)
    expect(exceptionBadgeAug10.text()).toContain('已有出勤紀錄')

    // 檢查 2026-08-11 遠端
    const rowAug11 = wrapper.find('[data-testid="day-row-2026-08-11"]')
    expect(rowAug11.text()).toContain('遠端')
    expect(rowAug11.text()).toContain('在家遠端工作')

    // 檢查 2026-08-15 人工工作日與原 DGPA 假日基準
    const rowAug15 = wrapper.find('[data-testid="day-row-2026-08-15"]')
    expect(rowAug15.text()).toContain('人工工作日')
    expect(rowAug15.text()).toContain('特別工作日')
    expect(rowAug15.text()).toContain('原 DGPA: 假日 - 中元節')

    // 檢查 2026-08-20 DGPA 假日
    const rowAug20 = wrapper.find('[data-testid="day-row-2026-08-20"]')
    expect(rowAug20.text()).toContain('DGPA 假日')
    expect(rowAug20.text()).toContain('國定假日')
  })

  it('Work Policy 查詢失敗時正確傳播錯誤並呈現 load error，而非靜默轉為 empty policies', async () => {
    vi.mocked(getSetupStatus).mockRejectedValueOnce(new Error('Work policy database query failed'))

    const wrapper = mount(LeaveView)
    await flushPromises()

    const errorAlert = wrapper.find('[role="alert"]')
    expect(errorAlert.exists()).toBe(true)
    expect(errorAlert.text()).toContain('日曆與狀態資料載入失敗')
    // 列表表格不應在載入失敗時正常渲染假資料
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('真正沒有 default context 時正常解析為空制度並允許週末預設 fallback', async () => {
    vi.mocked(getSetupStatus).mockResolvedValueOnce({
      profile: null,
      contexts: [],
      defaultContext: null,
      policies: [],
      complete: false,
    })
    // 且該月份無 DGPA 資料
    vi.mocked(getDgpaCalendarForMonth).mockResolvedValueOnce([])
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValueOnce([])
    vi.mocked(getDayStatusesForMonth).mockResolvedValueOnce([])

    const wrapper = mount(LeaveView)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    // 2026-08-01 為週六 -> 週末預設 (HOLIDAY)
    const rowAug01 = wrapper.find('[data-testid="day-row-2026-08-01"]')
    expect(rowAug01.text()).toContain('週末預設')
    // 2026-08-03 為週一 -> 預設平日 (WORKDAY)
    const rowAug03 = wrapper.find('[data-testid="day-row-2026-08-03"]')
    expect(rowAug03.text()).toContain('預設平日')
  })

  it('有 default context 但特定日期無適用制度時才正確 fallback 至預設平日或週末預設', async () => {
    vi.mocked(getSetupStatus).mockResolvedValueOnce({
      profile: { id: 'user-1', display_name: 'Test', timezone: 'Asia/Taipei' },
      contexts: [{ id: 'ctx-1', user_id: 'user-1', name: '預設工作', company_identifier: 'C1', project_identifier: 'P1', active: true, is_default: true }],
      defaultContext: { id: 'ctx-1', user_id: 'user-1', name: '預設工作', company_identifier: 'C1', project_identifier: 'P1', active: true, is_default: true },
      policies: [
        {
          id: 'pol-future',
          user_id: 'user-1',
          context_id: 'ctx-1',
          name: '未來制度',
          standard_start_time: '09:00:00',
          work_minutes: 480,
          fixed_break_minutes: 60,
          early_arrival_policy: 'STANDARD_START',
          clock_in_rounding_mode: 'NONE',
          clock_in_rounding_minutes: null,
          clock_out_rounding_mode: 'NONE',
          clock_out_rounding_minutes: null,
          working_days: ['1', '2', '3', '4', '5'],
          effective_from: '2026-09-01', // 2026-08 尚未生效
          effective_to: null,
          timezone: 'Asia/Taipei',
        },
      ],
      complete: true,
    })
    vi.mocked(getDgpaCalendarForMonth).mockResolvedValueOnce([])
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValueOnce([])
    vi.mocked(getDayStatusesForMonth).mockResolvedValueOnce([])

    const wrapper = mount(LeaveView)
    await flushPromises()

    // 2026-08-03 (週一) 由於 8 月沒有適用 policy，fallback 至 預設平日
    const rowAug03 = wrapper.find('[data-testid="day-row-2026-08-03"]')
    expect(rowAug03.text()).toContain('預設平日')
  })

  it('支援點擊「更新 DGPA」呼叫 Edge Function 並在成功後重新載入資料', async () => {
    vi.mocked(syncDgpaCalendarYear).mockResolvedValue({
      success: true,
      count: 365,
      year: 2026,
      source: 'https://data.gov.tw/test.csv',
      fetched_at: '2026-08-30T10:00:00Z',
    })

    const wrapper = mount(LeaveView)
    await flushPromises()

    expect(getDgpaCalendarForMonth).toHaveBeenCalledTimes(1)

    const syncBtn = wrapper.find('[data-testid="sync-dgpa-button"]')
    await syncBtn.trigger('click')
    await flushPromises()

    expect(syncDgpaCalendarYear).toHaveBeenCalledWith(2026)
    expect(getDgpaCalendarForMonth).toHaveBeenCalledTimes(2)

    const successAlert = wrapper.find('[data-testid="sync-success-alert"]')
    expect(successAlert.exists()).toBe(true)
    expect(successAlert.text()).toContain('已成功同步 2026 年 DGPA 辦公日曆')
  })

  it('DGPA 同步失敗時呈現錯誤提示並保留既有日曆快取資料', async () => {
    vi.mocked(syncDgpaCalendarYear).mockRejectedValueOnce(new Error('找不到 2026 年的合法 DGPA CSV 資源。'))

    const wrapper = mount(LeaveView)
    await flushPromises()

    const syncBtn = wrapper.find('[data-testid="sync-dgpa-button"]')
    await syncBtn.trigger('click')
    await flushPromises()

    const errorAlert = wrapper.find('[data-testid="sync-error-alert"]')
    expect(errorAlert.exists()).toBe(true)
    expect(errorAlert.text()).toContain('找不到 2026 年的合法 DGPA CSV 資源。')

    const rowAug20 = wrapper.find('[data-testid="day-row-2026-08-20"]')
    expect(rowAug20.text()).toContain('DGPA 假日')
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

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="day-status-type"]').setValue('REMOTE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('改為遠端工作')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-10',
      status: 'REMOTE',
      note: '改為遠端工作',
    })

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

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="calendar-override-type"]').setValue('WORKDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別工作日')
    await wrapper.find('[data-testid="calendar-override-note"]').setValue('專案衝刺')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertCalendarOverride).toHaveBeenCalledWith({
      calendar_date: '2026-08-10',
      day_type: 'WORKDAY',
      name: '特別工作日',
      note: '專案衝刺',
    })

    expect(upsertDayStatus).not.toHaveBeenCalled()
    expect(deleteDayStatus).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('沒有任何實質變更直接 Save (no-op Save) 不產生任何 mutation', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

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

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

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

    expect(getDayStatusesForMonth).toHaveBeenCalledTimes(1)

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="calendar-override-type"]').setValue('HOLIDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別假日')
    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

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

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="calendar-override-type"]').setValue('HOLIDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別假日')
    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('個人事假')

    vi.mocked(getCalendarOverridesForMonth).mockResolvedValue([...mockCalendarOverrides, newOverride])

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('日曆覆寫已更新，但特殊狀態儲存失敗：權限不足，無法執行此操作。')

    const statusSelect = wrapper.find('[data-testid="day-status-type"]') as { element: HTMLSelectElement }
    expect(statusSelect.element.value).toBe('LEAVE')
    const statusNote = wrapper.find('[data-testid="day-status-note"]') as { element: HTMLInputElement }
    expect(statusNote.element.value).toBe('個人事假')

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

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertDayStatus).toHaveBeenCalledTimes(1)
    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '個人事假',
    })
    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('partial-success 後 reconciliation reload 失敗，網路恢復直接 retry 仍不 rewrite 已成功 Calendar Override', async () => {
    const newOverride: CalendarOverride = {
      id: 'co-new-reload-fail',
      user_id: 'user-1',
      calendar_date: '2026-08-20',
      day_type: 'HOLIDAY',
      name: '特別假日',
      note: null,
    }

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-20"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="calendar-override-type"]').setValue('HOLIDAY')
    await wrapper.find('[data-testid="calendar-override-name"]').setValue('特別假日')
    await wrapper.find('[data-testid="day-status-type"]').setValue('LEAVE')
    await wrapper.find('[data-testid="day-status-note"]').setValue('個人事假')

    vi.mocked(upsertCalendarOverride).mockResolvedValue(newOverride)
    vi.mocked(upsertDayStatus).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.mocked(getDayStatusesForMonth).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('日曆覆寫已更新，但特殊狀態儲存失敗：網路連線異常，請檢查網路連線後再試。')

    vi.mocked(upsertCalendarOverride).mockClear()
    vi.mocked(deleteCalendarOverride).mockClear()
    vi.mocked(upsertDayStatus).mockClear()

    vi.mocked(getDayStatusesForMonth).mockResolvedValue([...mockDayStatuses])
    vi.mocked(getCalendarOverridesForMonth).mockResolvedValue([...mockCalendarOverrides, newOverride])
    vi.mocked(upsertDayStatus).mockResolvedValueOnce({
      id: 'ds-new-reload-fail',
      user_id: 'user-1',
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '個人事假',
    })

    await wrapper.find('[data-action="save-day"]').trigger('click')
    await flushPromises()

    expect(upsertDayStatus).toHaveBeenCalledTimes(1)
    expect(upsertDayStatus).toHaveBeenCalledWith({
      work_date: '2026-08-20',
      status: 'LEAVE',
      note: '個人事假',
    })
    expect(upsertCalendarOverride).not.toHaveBeenCalled()
    expect(deleteCalendarOverride).not.toHaveBeenCalled()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('將 Supabase/PostgREST 原始錯誤轉換為繁體中文友善訊息', async () => {
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

    const prevBtn = wrapper.find('[data-action="prev-month"]')
    await prevBtn.trigger('click')

    const nextBtn = wrapper.find('[data-action="next-month"]')
    await nextBtn.trigger('click')

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

    expect(wrapper.text()).toContain('2026 年 8 月')
    expect(wrapper.find('[data-testid="day-row-2026-08-01"]').text()).toContain('遠端')

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

    expect(wrapper.text()).toContain('2026 年 8 月')
    expect(wrapper.find('[data-testid="day-row-2026-08-01"]').text()).toContain('遠端')
  })

  it('已有出勤之日期在對話框內顯示出勤保留提示與 DGPA 基準', async () => {
    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    const attendanceNotice = wrapper.find('[data-testid="attendance-retention-notice"]')
    expect(attendanceNotice.exists()).toBe(true)
    expect(attendanceNotice.text()).toContain('已有出勤紀錄')
    expect(attendanceNotice.text()).toContain('不會修改、刪除或重算出勤紀錄')

    const modal = wrapper.find('[role="dialog"]')
    expect(modal.text()).toContain('DGPA 官方基準：')
    expect(modal.text()).toContain('工作日')
  })

  it('清除覆寫與特殊狀態時分別呼叫 delete', async () => {
    vi.mocked(deleteDayStatus).mockResolvedValue()
    vi.mocked(deleteCalendarOverride).mockResolvedValue()

    const wrapper = mount(LeaveView)
    await flushPromises()

    const editBtn = wrapper.find('[data-testid="day-row-2026-08-10"] [data-action="edit-day"]')
    await editBtn.trigger('click')

    await wrapper.find('[data-testid="calendar-override-type"]').setValue('NONE')
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

    vi.mocked(getDayStatusesForMonth).mockResolvedValue([])
    const retryBtn = wrapper.find('[data-action="retry-load"]')
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
