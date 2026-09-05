import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkPolicy,
  getSetupStatus,
  hasAttendanceRecordsForWorkPolicy,
  listWorkPolicies,
  updateWorkPolicy,
  type WorkPolicy,
} from './settings'
import * as supabaseModule from './supabase'

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
}

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

describe('lib/settings work policy wrappers', () => {
  const userId = '00000000-0000-0000-0000-000000000001'
  const assignmentId = 'assignment-1'
  const policy: WorkPolicy = {
    id: 'policy-1',
    user_id: userId,
    assignment_id: assignmentId,
    context_id: null,
    name: '一般工時',
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
  const input = {
    name: policy.name,
    standard_start_time: policy.standard_start_time,
    work_minutes: policy.work_minutes,
    fixed_break_minutes: policy.fixed_break_minutes,
    early_arrival_policy: policy.early_arrival_policy,
    clock_in_rounding_mode: policy.clock_in_rounding_mode,
    clock_in_rounding_minutes: policy.clock_in_rounding_minutes,
    clock_out_rounding_mode: policy.clock_out_rounding_mode,
    clock_out_rounding_minutes: policy.clock_out_rounding_minutes,
    working_days: policy.working_days,
    effective_from: policy.effective_from,
    effective_to: policy.effective_to,
    timezone: policy.timezone,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)
  })

  it('lists work policies for an assignment', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [policy], error: null })
    const assignmentEqMock = vi.fn().mockReturnValue({ order: orderMock })
    const userEqMock = vi.fn().mockReturnValue({ eq: assignmentEqMock })
    const selectMock = vi.fn().mockReturnValue({ eq: userEqMock })
    mockSupabase.from.mockReturnValue({ select: selectMock })

    await expect(listWorkPolicies(userId, assignmentId)).resolves.toEqual([policy])
    expect(mockSupabase.from).toHaveBeenCalledWith('work_policies')
    expect(userEqMock).toHaveBeenCalledWith('user_id', userId)
    expect(assignmentEqMock).toHaveBeenCalledWith('assignment_id', assignmentId)
    expect(orderMock).toHaveBeenCalledWith('effective_from', { ascending: false })
  })


  it('creates a work policy through the RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: policy, error: null })

    await expect(createWorkPolicy(assignmentId, input)).resolves.toEqual(policy)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_work_policy', {
      p_assignment_id: assignmentId,
      p_name: input.name,
      p_standard_start_time: input.standard_start_time,
      p_work_minutes: input.work_minutes,
      p_fixed_break_minutes: input.fixed_break_minutes,
      p_early_arrival_policy: input.early_arrival_policy,
      p_clock_in_rounding_mode: input.clock_in_rounding_mode,
      p_clock_in_rounding_minutes: input.clock_in_rounding_minutes,
      p_clock_out_rounding_mode: input.clock_out_rounding_mode,
      p_clock_out_rounding_minutes: input.clock_out_rounding_minutes,
      p_working_days: input.working_days,
      p_effective_from: input.effective_from,
      p_effective_to: input.effective_to,
      p_timezone: input.timezone,
    })
  })

  it('updates a work policy through the RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: policy, error: null })

    await expect(updateWorkPolicy(policy.id, input)).resolves.toEqual(policy)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_work_policy', {
      p_id: policy.id,
      p_name: input.name,
      p_standard_start_time: input.standard_start_time,
      p_work_minutes: input.work_minutes,
      p_fixed_break_minutes: input.fixed_break_minutes,
      p_early_arrival_policy: input.early_arrival_policy,
      p_clock_in_rounding_mode: input.clock_in_rounding_mode,
      p_clock_in_rounding_minutes: input.clock_in_rounding_minutes,
      p_clock_out_rounding_mode: input.clock_out_rounding_mode,
      p_clock_out_rounding_minutes: input.clock_out_rounding_minutes,
      p_working_days: input.working_days,
      p_effective_from: input.effective_from,
      p_effective_to: input.effective_to,
      p_timezone: input.timezone,
    })
  })

  it('checks if attendance records exist for a work policy', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null })

    await expect(hasAttendanceRecordsForWorkPolicy(policy.id)).resolves.toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('has_attendance_records_for_work_policy', {
      p_id: policy.id,
    })
  })

  it('uses an existing assignment and any of its policies for setup status', async () => {
    const assignment = {
      id: assignmentId,
      user_id: userId,
      staffing_employer: '雇主',
      client_company: '客戶',
      project: '專案',
      effective_from: '9999-01-01',
      effective_to: null,
    }
    const legacyPolicy = { ...policy, assignment_id: assignmentId, context_id: 'context-1', effective_from: '9999-01-01' }
    const queryMocks = {
      profiles: {
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: userId, display_name: '小明', timezone: 'Asia/Taipei' },
          error: null,
        }),
      },
      work_assignments: {
        order: vi.fn().mockResolvedValue({ data: [assignment], error: null }),
      },
      work_policies: {
        order: vi.fn().mockResolvedValue({ data: [legacyPolicy], error: null }),
      },
    }
    mockSupabase.from.mockImplementation((table: keyof typeof queryMocks) => {
      const query = queryMocks[table]
      const assignmentEq = vi.fn().mockReturnValue(query)
      const eq = vi.fn().mockReturnValue(table === 'work_policies'
        ? { eq: assignmentEq }
        : query)
      const select = vi.fn().mockReturnValue({ eq })
      return { select }
    })

    const result = await getSetupStatus(userId)

    expect(result.assignments).toEqual([assignment])
    expect(result.currentAssignment).toEqual(assignment)
    expect(result.policies).toEqual([legacyPolicy])
    expect(result.complete).toBe(true)
    expect(queryMocks.work_policies.order).toHaveBeenCalled()
  })
})
