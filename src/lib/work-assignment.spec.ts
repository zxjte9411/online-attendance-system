import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkAssignment,
  hasAttendanceRecordsForAssignment,
  listWorkAssignments,
  updateWorkAssignment,
} from './work-assignment'
import * as supabaseModule from './supabase'
import type { WorkAssignment } from '../domain/work-assignment/work-assignment'

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

describe('lib/work-assignment', () => {
  const userId = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)
  })

  it('lists work assignments for the user', async () => {
    const mockAssignments: WorkAssignment[] = [
      {
        id: 'wa-1',
        user_id: userId,
        staffing_employer: '派遣雇主 H1',
        client_company: '派駐客戶 A',
        project: '專案 P1',
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
    ]

    const orderMock = vi.fn().mockResolvedValue({ data: mockAssignments, error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    const result = await listWorkAssignments(userId)
    expect(mockSupabase.from).toHaveBeenCalledWith('work_assignments')
    expect(selectMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('user_id', userId)
    expect(orderMock).toHaveBeenCalledWith('effective_from', { ascending: false })
    expect(result).toEqual(mockAssignments)
  })

  it('creates a work assignment via RPC and lists updated assignments', async () => {
    const newAssignment: WorkAssignment = {
      id: 'wa-2',
      user_id: userId,
      staffing_employer: '派遣雇主 H2',
      client_company: '派駐客戶 B',
      project: '專案 P2',
      effective_from: '2026-07-01',
      effective_to: '2026-12-31',
    }

    mockSupabase.rpc.mockResolvedValue({ data: newAssignment, error: null })

    const orderMock = vi.fn().mockResolvedValue({ data: [newAssignment], error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    const result = await createWorkAssignment(userId, {
      staffing_employer: '派遣雇主 H2',
      client_company: '派駐客戶 B',
      project: '專案 P2',
      effective_from: '2026-07-01',
      effective_to: '2026-12-31',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_work_assignment', {
      p_staffing_employer: '派遣雇主 H2',
      p_client_company: '派駐客戶 B',
      p_project: '專案 P2',
      p_effective_from: '2026-07-01',
      p_effective_to: '2026-12-31',
    })
    expect(result.createdAssignment).toEqual(newAssignment)
    expect(result.assignments).toEqual([newAssignment])
  })

  it('updates a work assignment via RPC and returns refreshed list', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })

    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    await updateWorkAssignment(userId, 'wa-1', {
      staffing_employer: '更新雇主',
      client_company: '更新客戶',
      project: '更新專案',
      effective_from: '2026-01-01',
      effective_to: '2026-07-31',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_work_assignment', {
      p_id: 'wa-1',
      p_staffing_employer: '更新雇主',
      p_client_company: '更新客戶',
      p_project: '更新專案',
      p_effective_from: '2026-01-01',
      p_effective_to: '2026-07-31',
    })
  })

  it('checks if attendance records exist for an assignment', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [{ id: 'att-1' }], error: null })
    const eqMock2 = vi.fn().mockReturnValue({ limit: limitMock })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    const exists = await hasAttendanceRecordsForAssignment(userId, 'wa-1')
    expect(exists).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('attendance_records')
  })
})
