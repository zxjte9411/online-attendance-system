import { getTaipeiToday } from '../../lib/work-policy'

export type WorkAssignmentStatus = 'FUTURE' | 'CURRENT' | 'ENDED'

export type WorkAssignment = {
  id: string
  user_id: string
  staffing_employer: string
  client_company: string
  project: string
  effective_from: string
  effective_to: string | null
  created_at?: string
  updated_at?: string
}

export type WorkAssignmentInput = {
  staffing_employer: string
  client_company: string
  project: string
  effective_from: string
  effective_to: string | null
}

export function getWorkAssignmentStatus(
  assignment: Pick<WorkAssignment, 'effective_from' | 'effective_to'>,
  today = getTaipeiToday()
): WorkAssignmentStatus {
  if (today < assignment.effective_from) return 'FUTURE'
  if (assignment.effective_to !== null && today > assignment.effective_to) return 'ENDED'
  return 'CURRENT'
}

export function formatWorkAssignmentStatus(status: WorkAssignmentStatus): string {
  switch (status) {
    case 'FUTURE':
      return '尚未生效'
    case 'CURRENT':
      return '目前派駐'
    case 'ENDED':
      return '已結束'
  }
}

export function doAssignmentPeriodsOverlap(
  a: { effective_from: string; effective_to: string | null },
  b: { effective_from: string; effective_to: string | null }
): boolean {
  const aEnd = a.effective_to ?? '9999-12-31'
  const bEnd = b.effective_to ?? '9999-12-31'
  return a.effective_from <= bEnd && b.effective_from <= aEnd
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function isUninterruptedRenewal(
  existing: Pick<WorkAssignment, 'staffing_employer' | 'client_company' | 'project' | 'effective_to'>,
  incoming: Pick<WorkAssignmentInput, 'staffing_employer' | 'client_company' | 'project' | 'effective_from'>
): boolean {
  if (
    existing.staffing_employer !== incoming.staffing_employer ||
    existing.client_company !== incoming.client_company ||
    existing.project !== incoming.project
  ) {
    return false
  }

  if (!existing.effective_to) return false

  const expectedNextDay = addDaysToDateString(existing.effective_to, 1)
  return incoming.effective_from === expectedNextDay
}

export function validateWorkAssignmentInput(
  input: WorkAssignmentInput,
  existingAssignments: WorkAssignment[],
  options?: {
    editingId?: string
    hasAttendance?: boolean
    originalAssignment?: WorkAssignment
  }
): { valid: boolean; error?: string } {
  const employer = input.staffing_employer?.trim()
  const client = input.client_company?.trim()
  const proj = input.project?.trim()

  if (!employer || !client || !proj) {
    return { valid: false, error: '請填寫派遣雇主、派駐客戶與專案名稱。' }
  }

  if (!input.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) {
    return { valid: false, error: '請提供有效的派駐生效起日。' }
  }

  if (input.effective_to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_to) || input.effective_to < input.effective_from) {
      return { valid: false, error: '最後有效日不得早於生效起日。' }
    }
  }

  if (options?.hasAttendance && options.originalAssignment) {
    if (
      options.originalAssignment.staffing_employer !== employer ||
      options.originalAssignment.client_company !== client ||
      options.originalAssignment.project !== proj
    ) {
      return { valid: false, error: '已有出勤紀錄的工作派駐不可修改派遣雇主、派駐客戶或專案。' }
    }
  }

  const otherAssignments = existingAssignments.filter((a) => a.id !== options?.editingId)

  for (const other of otherAssignments) {
    if (!options?.editingId && isUninterruptedRenewal(other, input)) {
      continue
    }

    if (doAssignmentPeriodsOverlap(other, input)) {
      return { valid: false, error: '派駐期間不可與其他工作派駐重疊。' }
    }
  }

  return { valid: true }
}
