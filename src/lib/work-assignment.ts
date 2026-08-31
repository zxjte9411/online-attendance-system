import { getSupabaseClient } from './supabase'
import type {
  WorkAssignment,
  WorkAssignmentInput,
} from '../domain/work-assignment/work-assignment'

export const assignmentFields =
  'id,user_id,staffing_employer,client_company,project,effective_from,effective_to,created_at,updated_at'

export async function listWorkAssignments(userId: string): Promise<WorkAssignment[]> {
  const { data, error } = await getSupabaseClient()
    .from('work_assignments')
    .select(assignmentFields)
    .eq('user_id', userId)
    .order('effective_from', { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkAssignment[]
}

export async function createWorkAssignment(
  userId: string,
  input: WorkAssignmentInput
): Promise<{ assignments: WorkAssignment[]; createdAssignment: WorkAssignment }> {
  const { data, error } = await getSupabaseClient().rpc('create_work_assignment', {
    p_staffing_employer: input.staffing_employer,
    p_client_company: input.client_company,
    p_project: input.project,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to,
  })

  if (error) throw error
  const assignments = await listWorkAssignments(userId)
  return { assignments, createdAssignment: data as WorkAssignment }
}

export async function updateWorkAssignment(
  userId: string,
  assignmentId: string,
  input: WorkAssignmentInput
): Promise<WorkAssignment[]> {
  const { error } = await getSupabaseClient().rpc('update_work_assignment', {
    p_id: assignmentId,
    p_staffing_employer: input.staffing_employer,
    p_client_company: input.client_company,
    p_project: input.project,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to,
  })

  if (error) throw error
  return listWorkAssignments(userId)
}

export async function hasAttendanceRecordsForAssignment(
  userId: string,
  assignmentId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('attendance_records')
    .select('id')
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId)
    .limit(1)

  if (error) throw error
  return Boolean(data && data.length > 0)
}
