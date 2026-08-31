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
const contextFields = 'id,user_id,name,company_identifier,project_identifier,active,is_default,created_at,updated_at'
const policyFields = 'id,user_id,assignment_id,context_id,name,standard_start_time,work_minutes,fixed_break_minutes,early_arrival_policy,clock_in_rounding_mode,clock_in_rounding_minutes,clock_out_rounding_mode,clock_out_rounding_minutes,working_days,effective_from,effective_to,timezone,created_at,updated_at'

export type Profile = {
  id: string
  display_name: string
  timezone: string
  created_at?: string
  updated_at?: string
}

export type WorkContext = {
  id: string
  user_id: string
  name: string
  company_identifier: string
  project_identifier: string
  active: boolean
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export type WorkContextInput = Pick<WorkContext, 'name' | 'company_identifier' | 'project_identifier' | 'active'>

export type EarlyArrivalPolicy = 'STANDARD_START' | 'ACTUAL'
export type ClockInRoundingMode = 'NONE' | 'CEIL'
export type ClockOutRoundingMode = 'NONE' | 'CEIL' | 'FLOOR'
export type WorkingDay = '0' | '1' | '2' | '3' | '4' | '5' | '6'

type WorkPolicyFields = {
  id: string
  user_id: string
  assignment_id?: string | null
  context_id: string | null
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
  assignments?: WorkAssignment[]
  currentAssignment?: WorkAssignment | null
  policies: WorkPolicy[]
  complete: boolean
  // Legacy setup consumers are migrated separately from this data-access lane.
  contexts: WorkContext[]
  defaultContext: WorkContext | null
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

export async function listWorkContexts(userId: string) {
  const { data, error } = await getSupabaseClient()
    .from('work_contexts')
    .select(contextFields)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkContext[]
}

export async function createWorkContext(userId: string, input: WorkContextInput) {
  const { error } = await getSupabaseClient().rpc('create_work_context', {
    p_name: input.name,
    p_company_identifier: input.company_identifier,
    p_project_identifier: input.project_identifier,
    p_active: input.active,
  })

  if (error) throw error
  return listWorkContexts(userId)
}

export async function updateWorkContext(userId: string, contextId: string, input: WorkContextInput) {
  const { error } = await getSupabaseClient()
    .from('work_contexts')
    .update({
      name: input.name,
      company_identifier: input.company_identifier,
      project_identifier: input.project_identifier,
      active: input.active,
    })
    .eq('id', contextId)
    .eq('user_id', userId)

  if (error) throw error
  return listWorkContexts(userId)
}

export async function activateWorkContext(
  userId: string,
  contextId: string,
  input?: Partial<WorkContextInput>
) {
  const { error } = await getSupabaseClient().rpc('activate_work_context', {
    p_context_id: contextId,
    p_name: input?.name ?? null,
    p_company_identifier: input?.company_identifier ?? null,
    p_project_identifier: input?.project_identifier ?? null,
  })

  if (error) throw error
  return listWorkContexts(userId)
}

export async function setDefaultWorkContext(userId: string, contextId: string) {
  const { error } = await getSupabaseClient().rpc('set_default_work_context', {
    p_context_id: contextId,
  })

  if (error) throw error
  return listWorkContexts(userId)
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

export async function listLegacyWorkPolicies(userId: string, contextId: string): Promise<WorkPolicy[]> {
  const { data, error } = await getSupabaseClient()
    .from('work_policies')
    .select(policyFields)
    .eq('user_id', userId)
    .eq('context_id', contextId)
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
  const [profile, contexts, assignments] = await Promise.all([
    getProfile(userId),
    listWorkContexts(userId),
    listWorkAssignments(userId),
  ])
  const defaultContext = contexts.find((context) => context.active && context.is_default) ?? null
  const setupAssignment = assignments[0] ?? null
  const policies = defaultContext ? await listLegacyWorkPolicies(userId, defaultContext.id) : []

  return {
    profile,
    assignments,
    currentAssignment: setupAssignment,
    contexts,
    defaultContext,
    policies,
    complete: Boolean(
      profile?.display_name?.trim()
      && defaultContext
      && policies.length > 0,
    ),
  }
}
