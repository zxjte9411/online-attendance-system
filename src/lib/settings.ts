import { getSupabaseClient } from './supabase'
import type { WorkAssignment } from '../domain/work-assignment/work-assignment'
import { listWorkAssignments } from './work-assignment'

export type {
  WorkAssignment,
  WorkAssignmentInput,
  WorkAssignmentStatus,
} from '../domain/work-assignment/work-assignment'
export {
  listWorkAssignments,
  createWorkAssignment,
  updateWorkAssignment,
  hasAttendanceRecordsForAssignment,
} from './work-assignment'

const profileFields = 'id,display_name,timezone,created_at,updated_at'
export const policyFields = 'id,user_id,assignment_id,context_id,name,standard_start_time,work_minutes,fixed_break_minutes,early_arrival_policy,clock_in_rounding_mode,clock_in_rounding_minutes,clock_out_rounding_mode,clock_out_rounding_minutes,working_days,effective_from,effective_to,timezone,created_at,updated_at'

export type Profile = {
  id: string
  display_name: string
  timezone: string
  created_at?: string
  updated_at?: string
}

export type EarlyArrivalPolicy = 'STANDARD_START' | 'ACTUAL'
export type ClockInRoundingMode = 'NONE' | 'CEIL'
export type ClockOutRoundingMode = 'NONE' | 'CEIL' | 'FLOOR'
export type WorkingDay = '0' | '1' | '2' | '3' | '4' | '5' | '6'

type WorkPolicyFields = {
  id: string
  user_id: string
  assignment_id?: string | null
  context_id?: string | null
  name: string
  standard_start_time: string
  work_minutes: number
  fixed_break_minutes: number
  early_arrival_policy: EarlyArrivalPolicy
  clock_in_rounding_mode: ClockInRoundingMode
  clock_in_rounding_minutes: number | null
  clock_out_rounding_mode: ClockOutRoundingMode
  clock_out_rounding_minutes: number | null
  working_days: WorkingDay[]
  effective_from: string
  effective_to: string | null
  timezone: string
  created_at?: string
  updated_at?: string
}

export type WorkPolicy = WorkPolicyFields

export type WorkPolicyInput = Omit<WorkPolicyFields, 'id' | 'user_id' | 'assignment_id' | 'context_id' | 'created_at' | 'updated_at'>

type AssignmentWorkPolicy = WorkPolicy & { assignment_id: string }

export type SetupStatus = {
  profile: Profile | null
  assignments: WorkAssignment[]
  currentAssignment: WorkAssignment | null
  policies: WorkPolicy[]
  complete: boolean
}

export async function getCurrentUserId() {
  const { data, error } = await getSupabaseClient().auth.getSession()

  if (error) throw error
  if (!data.session?.user.id) throw new Error('找不到目前登入帳號。')

  return data.session.user.id
}

export async function getProfile(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select(profileFields)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data as Profile | null
}

export async function saveProfile(userId: string, displayName: string) {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert({ id: userId, display_name: displayName, timezone: 'Asia/Taipei' }, { onConflict: 'id' })
    .select(profileFields)
    .single()

  if (error) throw error
  return data as Profile
}

export async function listWorkPolicies(userId: string, assignmentId: string): Promise<WorkPolicy[]> {
  const { data, error } = await getSupabaseClient()
    .from('work_policies')
    .select(policyFields)
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId)
    .order('effective_from', { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkPolicy[]
}

export async function createWorkPolicy(assignmentId: string, input: WorkPolicyInput): Promise<AssignmentWorkPolicy> {
  const { data, error } = await getSupabaseClient().rpc('create_work_policy', {
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

  if (error) throw error
  return data as AssignmentWorkPolicy
}

export async function updateWorkPolicy(policyId: string, input: WorkPolicyInput): Promise<AssignmentWorkPolicy> {
  const { data, error } = await getSupabaseClient().rpc('update_work_policy', {
    p_id: policyId,
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

  if (error) throw error
  return data as AssignmentWorkPolicy
}

export async function hasAttendanceRecordsForWorkPolicy(
  policyId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('has_attendance_records_for_work_policy', {
    p_id: policyId,
  })

  if (error) throw error
  return Boolean(data)
}

export async function getSetupStatus(userId: string): Promise<SetupStatus> {
  const [profile, assignments] = await Promise.all([
    getProfile(userId),
    listWorkAssignments(userId),
  ])
  const currentAssignment = assignments[0] ?? null
  const policies = currentAssignment ? await listWorkPolicies(userId, currentAssignment.id) : []

  return {
    profile,
    assignments,
    currentAssignment,
    policies,
    complete: Boolean(
      profile?.display_name?.trim()
      && currentAssignment
      && policies.length > 0,
    ),
  }
}

