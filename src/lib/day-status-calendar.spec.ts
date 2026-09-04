import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCalendarWorkAssignments,
  getCalendarWorkPolicies,
  getDayStatusesForMonth,
  getCalendarOverridesForMonth,
  getMonthAttendanceDates,
  upsertDayStatus,
  deleteDayStatus,
  upsertCalendarOverride,
  deleteCalendarOverride,
} from './day-status-calendar'
import * as supabaseModule from './supabase'
import * as workAssignmentModule from './work-assignment'

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('./work-assignment', () => ({
  listWorkAssignments: vi.fn(),
}))

describe('lib/day-status-calendar', () => {
  const userId = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
  })

  it('getCalendarWorkAssignments delegates to listWorkAssignments with authenticated user id', async () => {
    const mockAssignments = [
      {
        id: 'wa-1',
        user_id: userId,
        staffing_employer: 'H1',
        client_company: 'A',
        project: 'P1',
        effective_from: '2026-08-01',
        effective_to: null,
      },
    ]
    vi.mocked(workAssignmentModule.listWorkAssignments).mockResolvedValue(mockAssignments)

    const result = await getCalendarWorkAssignments()
    expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    expect(workAssignmentModule.listWorkAssignments).toHaveBeenCalledWith(userId)
    expect(result).toEqual(mockAssignments)
  })

  it('getCalendarWorkAssignments accepts explicit userId without calling auth.getUser', async () => {
    vi.mocked(workAssignmentModule.listWorkAssignments).mockResolvedValue([])

    await getCalendarWorkAssignments('user-explicit')
    expect(mockSupabase.auth.getUser).not.toHaveBeenCalled()
    expect(workAssignmentModule.listWorkAssignments).toHaveBeenCalledWith('user-explicit')
  })

  it('getCalendarWorkPolicies queries all policies for the user ordered by effective_from', async () => {
    const mockPolicies = [
      {
        id: 'pol-1',
        user_id: userId,
        assignment_id: 'wa-1',
        context_id: null,
        name: '制度 1',
        standard_start_time: '09:00:00',
        work_minutes: 480,
        fixed_break_minutes: 60,
        early_arrival_policy: 'STANDARD_START',
        clock_in_rounding_mode: 'NONE',
        clock_in_rounding_minutes: null,
        clock_out_rounding_mode: 'NONE',
        clock_out_rounding_minutes: null,
        working_days: ['1', '2', '3', '4', '5'],
        effective_from: '2026-08-01',
        effective_to: null,
        timezone: 'Asia/Taipei',
      },
    ]

    const orderMock = vi.fn().mockResolvedValue({ data: mockPolicies, error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    const result = await getCalendarWorkPolicies()
    expect(mockSupabase.from).toHaveBeenCalledWith('work_policies')
    expect(eqMock).toHaveBeenCalledWith('user_id', userId)
    expect(orderMock).toHaveBeenCalledWith('effective_from', { ascending: true })
    expect(result).toEqual(mockPolicies)
  })

  it('getCalendarWorkPolicies throws on Supabase query error', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: null, error: new Error('DB connection failed') })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    await expect(getCalendarWorkPolicies()).rejects.toThrow('DB connection failed')
  })

  it('getDayStatusesForMonth queries date range within month', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const ltMock = vi.fn().mockReturnValue({ order: orderMock })
    const gteMock = vi.fn().mockReturnValue({ lt: ltMock })
    const selectMock = vi.fn().mockReturnValue({ gte: gteMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    await getDayStatusesForMonth('2026-08')
    expect(mockSupabase.from).toHaveBeenCalledWith('day_statuses')
    expect(gteMock).toHaveBeenCalledWith('work_date', '2026-08-01')
    expect(ltMock).toHaveBeenCalledWith('work_date', '2026-09-01')
  })

  it('getCalendarOverridesForMonth queries date range within month', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const ltMock = vi.fn().mockReturnValue({ order: orderMock })
    const gteMock = vi.fn().mockReturnValue({ lt: ltMock })
    const selectMock = vi.fn().mockReturnValue({ gte: gteMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    await getCalendarOverridesForMonth('2026-08')
    expect(mockSupabase.from).toHaveBeenCalledWith('calendar_overrides')
    expect(gteMock).toHaveBeenCalledWith('calendar_date', '2026-08-01')
    expect(ltMock).toHaveBeenCalledWith('calendar_date', '2026-09-01')
  })

  it('upsertDayStatus inserts or updates with current user_id', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: 'ds-1', user_id: userId, work_date: '2026-08-05', status: 'LEAVE', note: '個人事假' },
      error: null,
    })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const upsertMock = vi.fn().mockReturnValue({ select: selectMock })
    mockSupabase.from.mockReturnValue({ upsert: upsertMock })

    const result = await upsertDayStatus({
      work_date: '2026-08-05',
      status: 'LEAVE',
      note: '  個人事假  ',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: userId,
        work_date: '2026-08-05',
        status: 'LEAVE',
        note: '個人事假',
      },
      { onConflict: 'user_id,work_date' }
    )
    expect(result.id).toBe('ds-1')
  })

  it('upsertCalendarOverride inserts or updates with current user_id', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: 'co-1', user_id: userId, calendar_date: '2026-08-05', day_type: 'HOLIDAY', name: '廠慶', note: null },
      error: null,
    })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const upsertMock = vi.fn().mockReturnValue({ select: selectMock })
    mockSupabase.from.mockReturnValue({ upsert: upsertMock })

    const result = await upsertCalendarOverride({
      calendar_date: '2026-08-05',
      day_type: 'HOLIDAY',
      name: '  廠慶  ',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: userId,
        calendar_date: '2026-08-05',
        day_type: 'HOLIDAY',
        name: '廠慶',
        note: null,
      },
      { onConflict: 'user_id,calendar_date' }
    )
    expect(result.id).toBe('co-1')
  })
})
