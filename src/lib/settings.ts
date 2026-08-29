import { getSupabaseClient } from './supabase'
import { getWorkPolicyStatus } from './work-policy'

const profileFields = 'id,display_name,timezone,created_at,updated_at'
const contextFields = 'id,user_id,name,company_identifier,project_identifier,active,is_default,created_at,updated_at'
const policyFields = 'id,user_id,context_id,name,standard_start_time,work_minutes,fixed_break_minutes,early_arrival_policy,clock_in_rounding_mode,clock_in_rounding_minutes,clock_out_rounding_mode,clock_out_rounding_minutes,working_days,effective_from,effective_to,timezone,created_at,updated_at'

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

export type WorkPolicy = {
  id: string
  user_id: string
  context_id: string
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

export type WorkPolicyInput = Omit<WorkPolicy, 'id' | 'user_id' | 'context_id' | 'created_at' | 'updated_at'>

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

export async function listWorkPolicies(userId: string, contextId: string) {
  const { data, error } = await getSupabaseClient()
    .from('work_policies')
    .select(policyFields)
    .eq('user_id', userId)
    .eq('context_id', contextId)
    .order('effective_from', { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkPolicy[]
}

export async function createWorkPolicy(userId: string, contextId: string, input: WorkPolicyInput) {
  const { data, error } = await getSupabaseClient()
    .from('work_policies')
    .insert({ user_id: userId, context_id: contextId, ...input })
    .select(policyFields)
    .single()

  if (error) throw error
  return data as WorkPolicy
}

export async function updateWorkPolicyEffectiveTo(userId: string, policyId: string, effectiveTo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
    throw new Error('請提供有效的制度結束日期。')
  }

  const client = getSupabaseClient()
  const { data: policy, error: readError } = await client
    .from('work_policies')
    .select('effective_from')
    .eq('id', policyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readError) throw readError
  if (!policy) throw new Error('找不到要結束的 Work Policy。')
  if (effectiveTo < policy.effective_from) {
    throw new Error('制度結束日期不能早於生效起日。')
  }

  const { data, error } = await client
    .from('work_policies')
    .update({ effective_to: effectiveTo })
    .eq('id', policyId)
    .eq('user_id', userId)
    .is('effective_to', null)
    .select(policyFields)
    .single()

  if (error) throw error
  return data as WorkPolicy
}

export async function getSetupStatus(userId: string) {
  const profile = await getProfile(userId)
  const contexts = await listWorkContexts(userId)
  const defaultContext = contexts.find((context) => context.active && context.is_default) ?? null
  const policies = defaultContext ? await listWorkPolicies(userId, defaultContext.id) : []

  return {
    profile,
    contexts,
    defaultContext,
    policies,
    complete: Boolean(
      profile?.display_name?.trim()
      && defaultContext
      && policies.some((policy) => getWorkPolicyStatus(policy) === '目前適用'),
    ),
  }
}
