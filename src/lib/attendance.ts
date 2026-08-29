import { getTaipeiToday } from './work-policy'
import { getSupabaseClient } from './supabase'

const attendanceFields = 'id,user_id,work_date,context_id,work_policy_id,actual_clock_in_at,actual_clock_out_at,effective_clock_in_at,effective_clock_out_at,expected_clock_out_at,actual_elapsed_minutes,net_worked_minutes,regular_minutes,overtime_minutes,context_snapshot,policy_snapshot,calculation_snapshot,created_at,updated_at'

export type AttendanceRecord = {
  id: string
  user_id: string
  work_date: string
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
  created_at?: string
  updated_at?: string
}

function requireAttendanceRecord(data: AttendanceRecord | AttendanceRecord[] | null) {
  const record = Array.isArray(data) ? data[0] : data
  if (!record) throw new Error('找不到今日出勤紀錄。')
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

export async function clockInToday() {
  const { data, error } = await getSupabaseClient().rpc('clock_in_today')

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null)
}

export async function clockOutToday() {
  const { data, error } = await getSupabaseClient().rpc('clock_out_today')

  if (error) throw error
  return requireAttendanceRecord(data as AttendanceRecord | AttendanceRecord[] | null)
}
