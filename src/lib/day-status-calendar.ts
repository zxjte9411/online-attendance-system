import { getSupabaseClient } from './supabase'
import { listWorkAssignments } from './work-assignment'
import type { WorkPolicy, WorkAssignment } from './settings'
import type {
  DayStatus,
  CalendarOverride,
  DayStatusType,
  CalendarDayType,
} from '../domain/calendar-status/overview'

async function requireCurrentUserId() {
  const { data, error } = await getSupabaseClient().auth.getUser()
  if (error || !data.user) throw new Error('請先登入。')
  return data.user.id
}

export type {
  DayStatus,
  CalendarOverride,
  DayStatusType,
  CalendarDayType,
} from '../domain/calendar-status/overview'

export type DayStatusInput = {
  work_date: string
  status: DayStatusType
  note?: string | null
}

export type CalendarOverrideInput = {
  calendar_date: string
  day_type: CalendarDayType
  name?: string | null
  note?: string | null
}

function getMonthDateRange(yearMonth: string) {
  const startDate = `${yearMonth}-01`
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const nextMonthDate = new Date(Date.UTC(year, month, 1))
  const nextMonthYearMonth = nextMonthDate.toISOString().slice(0, 7)
  const endDateExclusive = `${nextMonthYearMonth}-01`
  return { startDate, endDateExclusive }
}

export async function getDayStatusesForMonth(yearMonth: string): Promise<DayStatus[]> {
  const { startDate, endDateExclusive } = getMonthDateRange(yearMonth)

  const { data, error } = await getSupabaseClient()
    .from('day_statuses')
    .select('id,user_id,work_date,status,note,created_at,updated_at')
    .gte('work_date', startDate)
    .lt('work_date', endDateExclusive)
    .order('work_date', { ascending: true })

  if (error) throw error
  return (data || []) as DayStatus[]
}

export async function getCalendarOverridesForMonth(yearMonth: string): Promise<CalendarOverride[]> {
  const { startDate, endDateExclusive } = getMonthDateRange(yearMonth)

  const { data, error } = await getSupabaseClient()
    .from('calendar_overrides')
    .select('id,user_id,calendar_date,day_type,name,note,created_at,updated_at')
    .gte('calendar_date', startDate)
    .lt('calendar_date', endDateExclusive)
    .order('calendar_date', { ascending: true })

  if (error) throw error
  return (data || []) as CalendarOverride[]
}

export async function getMonthAttendanceDates(yearMonth: string): Promise<Set<string>> {
  const { startDate, endDateExclusive } = getMonthDateRange(yearMonth)

  const { data, error } = await getSupabaseClient()
    .from('attendance_records')
    .select('work_date')
    .gte('work_date', startDate)
    .lt('work_date', endDateExclusive)

  if (error) throw error
  const dates = new Set<string>()
  for (const row of data || []) {
    if (row.work_date) dates.add(row.work_date)
  }
  return dates
}

export async function upsertDayStatus(input: DayStatusInput): Promise<DayStatus> {
  const userId = await requireCurrentUserId()
  const note = input.note?.trim() ? input.note.trim() : null

  const { data, error } = await getSupabaseClient()
    .from('day_statuses')
    .upsert(
      {
        user_id: userId,
        work_date: input.work_date,
        status: input.status,
        note,
      },
      { onConflict: 'user_id,work_date' }
    )
    .select('id,user_id,work_date,status,note,created_at,updated_at')
    .single()

  if (error) throw error
  return data as DayStatus
}

export async function deleteDayStatus(id: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('day_statuses')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function upsertCalendarOverride(input: CalendarOverrideInput): Promise<CalendarOverride> {
  const userId = await requireCurrentUserId()
  const name = input.name?.trim() ? input.name.trim() : null
  const note = input.note?.trim() ? input.note.trim() : null

  const { data, error } = await getSupabaseClient()
    .from('calendar_overrides')
    .upsert(
      {
        user_id: userId,
        calendar_date: input.calendar_date,
        day_type: input.day_type,
        name,
        note,
      },
      { onConflict: 'user_id,calendar_date' }
    )
    .select('id,user_id,calendar_date,day_type,name,note,created_at,updated_at')
    .single()

  if (error) throw error
  return data as CalendarOverride
}

export async function deleteCalendarOverride(id: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('calendar_overrides')
    .delete()
    .eq('id', id)

  if (error) throw error
}

const calendarPolicyFields =
  'id,user_id,assignment_id,context_id,name,standard_start_time,work_minutes,fixed_break_minutes,early_arrival_policy,clock_in_rounding_mode,clock_in_rounding_minutes,clock_out_rounding_mode,clock_out_rounding_minutes,working_days,effective_from,effective_to,timezone,created_at,updated_at'

export async function getCalendarWorkAssignments(userId?: string): Promise<WorkAssignment[]> {
  const uid = userId ?? (await requireCurrentUserId())
  return listWorkAssignments(uid)
}

export async function getCalendarWorkPolicies(userId?: string): Promise<WorkPolicy[]> {
  const uid = userId ?? (await requireCurrentUserId())
  const { data, error } = await getSupabaseClient()
    .from('work_policies')
    .select(calendarPolicyFields)
    .eq('user_id', uid)
    .order('effective_from', { ascending: true })

  if (error) throw error
  return (data || []) as WorkPolicy[]
}

