import type { CalendarOverride } from '../calendar-status/overview'
import type { WorkPolicy } from '../../lib/settings'

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

export function findApplicableWorkPolicy(date: string, policies: WorkPolicy[]): WorkPolicy | null {
  const matching = policies.filter((policy) => {
    if (date < policy.effective_from) return false
    if (policy.effective_to && date > policy.effective_to) return false
    return true
  })

  if (matching.length === 0) return null

  // If multiple policies match, prioritize the most recently effective policy
  return matching.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
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
