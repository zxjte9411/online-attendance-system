import type { CalendarOverride } from '../calendar-status/overview'
import type { WorkPolicy } from '../../lib/settings'
import type { WorkAssignment } from '../work-assignment/work-assignment'

export type CalendarDayType = 'WORKDAY' | 'HOLIDAY'

export type CalendarResolutionSource =
  | 'MANUAL_OVERRIDE'
  | 'DGPA'
  | 'WORK_POLICY'
  | 'WEEKEND_FALLBACK'

export type DgpaCalendarRow = {
  calendar_date: string
  day_type: CalendarDayType
  name: string | null
  source: string
  fetched_at: string
}

export type DgpaBaseline = {
  dayType: CalendarDayType
  name: string | null
  fetchedAt: string
}

export type ResolvedCalendarDay = {
  dayType: CalendarDayType
  source: CalendarResolutionSource
  name: string | null
  dgpaBaseline: DgpaBaseline | null
}

export function findApplicableWorkAssignment(
  date: string,
  assignments: WorkAssignment[],
): WorkAssignment | null {
  const matching = assignments.filter((assignment) => {
    if (date < assignment.effective_from) return false
    if (assignment.effective_to && date > assignment.effective_to) return false
    return true
  })

  if (matching.length === 0) return null

  if (matching.length > 1) {
    throw new Error('multiple work assignments resolve for target date')
  }

  return matching[0]
}

export function findApplicableWorkPolicy(
  date: string,
  policies: WorkPolicy[],
  assignmentId?: string | null,
): WorkPolicy | null {
  const matching = policies.filter((policy) => {
    if (assignmentId !== undefined && policy.assignment_id !== assignmentId) return false
    if (date < policy.effective_from) return false
    if (policy.effective_to && date > policy.effective_to) return false
    return true
  })

  if (matching.length === 0) return null

  if (matching.length > 1) {
    throw new Error('multiple work policies resolve for assignment and target date')
  }

  return matching[0]
}

export function resolveApplicableWorkPolicy(params: {
  date: string
  workAssignments?: WorkAssignment[]
  workPolicies?: WorkPolicy[]
}): WorkPolicy | null {
  const { date, workAssignments, workPolicies = [] } = params

  if (workAssignments !== undefined) {
    const assignment = findApplicableWorkAssignment(date, workAssignments)
    if (!assignment) {
      return null
    }
    return findApplicableWorkPolicy(date, workPolicies, assignment.id)
  }

  return findApplicableWorkPolicy(date, workPolicies)
}

export function resolveCalendarDay(params: {
  date: string
  manualOverride?: CalendarOverride | null
  dgpaRow?: DgpaCalendarRow | null
  applicableWorkPolicy?: WorkPolicy | null
}): ResolvedCalendarDay {
  const { date, manualOverride, dgpaRow, applicableWorkPolicy } = params

  const dgpaBaseline: DgpaBaseline | null = dgpaRow
    ? {
        dayType: dgpaRow.day_type,
        name: dgpaRow.name,
        fetchedAt: dgpaRow.fetched_at,
      }
    : null

  // 1. Manual Override takes highest precedence
  if (manualOverride) {
    return {
      dayType: manualOverride.day_type,
      source: 'MANUAL_OVERRIDE',
      name: manualOverride.name ?? null,
      dgpaBaseline,
    }
  }

  // 2. DGPA Calendar row takes next precedence
  if (dgpaRow) {
    return {
      dayType: dgpaRow.day_type,
      source: 'DGPA',
      name: dgpaRow.name,
      dgpaBaseline,
    }
  }

  // Calculate day of week (0=Sun, 1=Mon, ..., 6=Sat)
  const [y, m, d] = date.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()

  // 3. Work Policy applicable to this date
  if (applicableWorkPolicy) {
    const isWorkingDay = applicableWorkPolicy.working_days.includes(String(dayOfWeek) as any)
    return {
      dayType: isWorkingDay ? 'WORKDAY' : 'HOLIDAY',
      source: 'WORK_POLICY',
      name: null,
      dgpaBaseline: null,
    }
  }

  // 4. Weekend Fallback
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  return {
    dayType: isWeekend ? 'HOLIDAY' : 'WORKDAY',
    source: 'WEEKEND_FALLBACK',
    name: null,
    dgpaBaseline: null,
  }
}
