import { getTaipeiToday } from './work-policy'
import { getSupabaseClient } from './supabase'
import type { WorkPolicy } from './settings'

const attendanceFields = 'id,user_id,work_date,assignment_id,assignment_snapshot,context_id,work_policy_id,actual_clock_in_at,actual_clock_out_at,effective_clock_in_at,effective_clock_out_at,expected_clock_out_at,actual_elapsed_minutes,net_worked_minutes,regular_minutes,overtime_minutes,context_snapshot,policy_snapshot,calculation_snapshot,created_source,manually_adjusted,last_manual_edit_at,status_note,created_at,updated_at'
const readinessPolicyFields = 'id,user_id,assignment_id,context_id,name,standard_start_time,work_minutes,fixed_break_minutes,early_arrival_policy,clock_in_rounding_mode,clock_in_rounding_minutes,clock_out_rounding_mode,clock_out_rounding_minutes,working_days,effective_from,effective_to,timezone,created_at,updated_at'

export type AttendanceRecord = {
  id: string
  user_id: string
  work_date: string
  assignment_id?: string | null
  assignment_snapshot?: Record<string, unknown> | null
  context_id: string
  work_policy_id: string
  actual_clock_in_at: string
  actual_clock_out_at: string | null
  effective_clock_in_at: string
  effective_clock_out_at: string | null
  expected_clock_out_at: string
  actual_elapsed_minutes: number | null
  net_worked_minutes: number | null
  regular_minutes: number | null
  overtime_minutes: number | null
  context_snapshot: Record<string, unknown>
  policy_snapshot: Record<string, unknown>
  calculation_snapshot: Record<string, unknown>
  created_source: 'CLOCK' | 'MANUAL'
  manually_adjusted: boolean
  last_manual_edit_at: string | null
  status_note: string | null
  created_at?: string
  updated_at?: string
}

export type AttendanceReadinessResolution = 'NO_ASSIGNMENT' | 'MISSING_POLICY' | 'RESOLVED'

export type TodayAttendanceReadiness = {
  resolution: AttendanceReadinessResolution
  assignmentId: string | null
  policy: WorkPolicy | null
}

export type ManualAttendanceInput = {
  work_date: string
  context_id: string
  actual_clock_in_time: string
  actual_clock_out_time?: string | null
  status_note?: string | null
}

export type EditAttendanceInput = {
  id: string
  context_id: string
  actual_clock_in_time: string
  actual_clock_out_time?: string | null
  status_note?: string | null
}

function requireAttendanceRecord(data: AttendanceRecord | AttendanceRecord[] | null, fallbackMessage = '找不到出勤紀錄。') {
  const record = Array.isArray(data) ? data[0] : data
  if (!record) throw new Error(fallbackMessage)
  return record
}

export async function getTodayAttendanceRecord() {
  const { data, error } = await getSupabaseClient()
    .from('attendance_records')
    .select(attendanceFields)
    .eq('work_date', getTaipeiToday())
    .maybeSingle()

  if (error) throw error
  return data as AttendanceRecord | null
}

export async function getTodayAttendanceReadiness(): Promise<TodayAttendanceReadiness> {
  const client = getSupabaseClient()
  const { data: resolutionData, error: resolutionError } = await client.rpc('resolve_work_assignment_policy', {
    p_target_date: getTaipeiToday(),
  })

  if (resolutionError) throw resolutionError

  const resolutionRow = (Array.isArray(resolutionData) ? resolutionData[0] : resolutionData) as {
    resolution: AttendanceReadinessResolution
    assignment_id: string | null
    policy_id: string | null
  } | null
  if (!resolutionRow) throw new Error('找不到今日 Work Policy 解析結果。')

  if (resolutionRow.resolution !== 'RESOLVED') {
    return {
      resolution: resolutionRow.resolution,
      assignmentId: resolutionRow.assignment_id,
      policy: null,
    }
  }
  if (!resolutionRow.policy_id) throw new Error('今日 Work Policy 解析結果無效。')

  const { data: policyData, error: policyError } = await client
    .from('work_policies')
    .select(readinessPolicyFields)
    .eq('id', resolutionRow.policy_id)
    .maybeSingle()

  if (policyError) throw policyError
  if (!policyData) throw new Error('找不到今日 Work Policy。')

  return {
    resolution: resolutionRow.resolution,
    assignmentId: resolutionRow.assignment_id,
    policy: policyData as WorkPolicy,
  }
}

export async function getMonthAttendanceRecords(yearMonth: string) {
  const startDate = `${yearMonth}-01`
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const nextMonthDate = new Date(Date.UTC(year, month, 1))
  const nextMonthYearMonth = nextMonthDate.toISOString().slice(0, 7)
  const endDateExclusive = `${nextMonthYearMonth}-01`

  const { data, error } = await getSupabaseClient()
    .from('attendance_records')
    .select(attendanceFields)
    .gte('work_date', startDate)
    .lt('work_date', endDateExclusive)
    .order('work_date', { ascending: true })

  if (error) throw error
  return (data || []) as AttendanceRecord[]
}

export async function clockInToday() {
  const { data, error } = await getSupabaseClient().rpc('clock_in_today')

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null, '找不到今日出勤紀錄。')
}

export async function clockOutToday() {
  const { data, error } = await getSupabaseClient().rpc('clock_out_today')

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null, '找不到今日出勤紀錄。')
}

export async function createManualAttendance(input: ManualAttendanceInput) {
  const { data, error } = await getSupabaseClient().rpc('create_manual_attendance', {
    p_work_date: input.work_date,
    p_context_id: input.context_id,
    p_actual_clock_in_time: input.actual_clock_in_time,
    p_actual_clock_out_time: input.actual_clock_out_time || null,
    p_status_note: input.status_note || null,
  })

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null, '建立補登紀錄失敗。')
}

export async function editAttendanceRecord(input: EditAttendanceInput) {
  const { data, error } = await getSupabaseClient().rpc('edit_attendance_record', {
    p_id: input.id,
    p_context_id: input.context_id,
    p_actual_clock_in_time: input.actual_clock_in_time,
    p_actual_clock_out_time: input.actual_clock_out_time || null,
    p_status_note: input.status_note || null,
  })

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null, '修改出勤紀錄失敗。')
}

export async function deleteAttendanceRecord(id: string) {
  const { error } = await getSupabaseClient().rpc('delete_attendance_record', {
    p_id: id,
  })

  if (error) throw error
}
