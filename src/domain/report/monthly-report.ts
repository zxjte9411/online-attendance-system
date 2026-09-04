import {
  type CalendarDayType,
  type CalendarResolutionSource,
  type DgpaCalendarRow,
  findApplicableWorkPolicy,
  resolveCalendarDay,
} from '../dgpa-calendar/resolver'
import {
  formatWeekdayLabel,
  type CalendarOverride,
  type DayStatus,
  type DayStatusType,
} from '../calendar-status/overview'
import type { WorkAssignment } from '../work-assignment/work-assignment'
import type { WorkContext, WorkPolicy } from '../../lib/settings'
import type { AttendanceRecord } from '../../lib/attendance'

export type ReportStatusType = DayStatusType | 'ABSENT'

export type ReportExceptionFlag =
  | 'HOLIDAY_WITH_ATTENDANCE'
  | 'LEAVE_WITH_ATTENDANCE'
  | 'OTHER_CONTEXT_ATTENDANCE'

export type DailyReportRow = {
  date: string // YYYY-MM-DD
  weekday: number // 0 (Sun) - 6 (Sat)
  weekdayLabel: string // 週日..週六
  in_assignment_period: boolean
  staffing_employer: string
  client_company: string
  project: string
  company_identifier: string
  project_identifier: string
  actual_clock_in_at: string | null
  actual_clock_out_at: string | null
  effective_clock_in_at: string | null
  effective_clock_out_at: string | null
  expected_clock_out_at: string | null
  scheduled_minutes: number
  actual_elapsed_minutes: number | null
  net_worked_minutes: number | null
  regular_minutes: number | null
  overtime_minutes: number | null
  leave_minutes: number
  absence_minutes: number
  created_source: 'CLOCK' | 'MANUAL' | null
  manually_adjusted: boolean
  last_manual_edit_at: string | null
  calculation_version: string | null
  status: ReportStatusType | null
  note: string | null
  calendar_day_type: CalendarDayType
  calendar_source: CalendarResolutionSource
  calendar_name: string | null
  is_incomplete: boolean
  exception_flags: ReportExceptionFlag[]
  attendance_id: string | null
  attendance_context_id: string | null
  attendance_assignment_id?: string | null
}

export type MonthlyReportSummary = {
  scheduled_minutes: number
  leave_minutes: number
  absence_minutes: number
  regular_minutes: number
  overtime_minutes: number
  actual_elapsed_minutes: number
  net_worked_minutes: number
  incomplete_count: number
  exception_count: number
}

export type MonthlyReport = {
  yearMonth: string
  assignment: WorkAssignment
  context?: WorkContext | null
  rows: DailyReportRow[]
  summary: MonthlyReportSummary
  hasConfigurationError: boolean
  missingPolicyDates: string[]
}

export type BuildMonthlyReportParams = {
  yearMonth: string // YYYY-MM
  assignment?: WorkAssignment
  context?: WorkContext
  workPolicies: WorkPolicy[]
  attendanceRecords: AttendanceRecord[]
  otherContextAttendanceDates?: Set<string>
  dayStatuses?: DayStatus[]
  calendarOverrides?: CalendarOverride[]
  dgpaRows?: DgpaCalendarRow[]
}

export function buildMonthlyReport(params: BuildMonthlyReportParams): MonthlyReport {
  const {
    yearMonth,
    workPolicies,
    attendanceRecords,
    dayStatuses = [],
    calendarOverrides = [],
    dgpaRows = [],
  } = params

  const assignment: WorkAssignment = params.assignment ?? {
    id: params.context?.id ?? '',
    user_id: params.context?.user_id ?? '',
    staffing_employer: '',
    client_company: '',
    project: '',
    effective_from: '1970-01-01',
    effective_to: null,
    created_at: params.context?.created_at ?? '',
    updated_at: params.context?.updated_at ?? '',
  }

  const attendanceMap = new Map<string, AttendanceRecord>()
  for (const rec of attendanceRecords) {
    if (rec.assignment_id) {
      if (rec.assignment_id === assignment.id) {
        attendanceMap.set(rec.work_date, rec)
      }
    } else if (params.context && rec.context_id === params.context.id) {
      attendanceMap.set(rec.work_date, rec)
    }
  }

  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const dayStatusMap = new Map<string, DayStatus>()
  for (const ds of dayStatuses) {
    dayStatusMap.set(ds.work_date, ds)
  }

  const calendarOverrideMap = new Map<string, CalendarOverride>()
  for (const co of calendarOverrides) {
    calendarOverrideMap.set(co.calendar_date, co)
  }

  const dgpaMap = new Map<string, DgpaCalendarRow>()
  for (const row of dgpaRows) {
    dgpaMap.set(row.calendar_date, row)
  }

  const rows: DailyReportRow[] = []
  const missingPolicyDates: string[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const date = `${yearMonth}-${dayStr}`
    const dateObj = new Date(Date.UTC(year, month - 1, d, 12, 0, 0))
    const weekday = dateObj.getUTCDay()
    const weekdayLabel = formatWeekdayLabel(weekday)

    const manualOverride = calendarOverrideMap.get(date) ?? null
    const dgpaRow = dgpaMap.get(date) ?? null
    const dayStatus = dayStatusMap.get(date) ?? null

    const in_assignment_period =
      date >= assignment.effective_from &&
      (assignment.effective_to === null || date <= assignment.effective_to)

    if (!in_assignment_period) {
      const resolved = resolveCalendarDay({
        date,
        manualOverride,
        dgpaRow,
        applicableWorkPolicy: null,
      })

      rows.push({
        date,
        weekday,
        weekdayLabel,
        in_assignment_period: false,
        staffing_employer: assignment.staffing_employer,
        client_company: assignment.client_company,
        project: assignment.project,
        company_identifier: params.context?.company_identifier ?? '',
        project_identifier: params.context?.project_identifier ?? '',
        actual_clock_in_at: null,
        actual_clock_out_at: null,
        effective_clock_in_at: null,
        effective_clock_out_at: null,
        expected_clock_out_at: null,
        scheduled_minutes: 0,
        actual_elapsed_minutes: null,
        net_worked_minutes: null,
        regular_minutes: null,
        overtime_minutes: null,
        leave_minutes: 0,
        absence_minutes: 0,
        created_source: null,
        manually_adjusted: false,
        last_manual_edit_at: null,
        calculation_version: null,
        status: null,
        note: null,
        calendar_day_type: resolved.dayType,
        calendar_source: resolved.source,
        calendar_name: resolved.name,
        is_incomplete: false,
        exception_flags: [],
        attendance_id: null,
        attendance_context_id: null,
        attendance_assignment_id: null,
      })
      continue
    }

    const applicableWorkPolicy = findApplicableWorkPolicy(date, workPolicies, assignment.id)

    const resolved = resolveCalendarDay({
      date,
      manualOverride,
      dgpaRow,
      applicableWorkPolicy,
    })

    const calendar_day_type = resolved.dayType
    const calendar_source = resolved.source
    const calendar_name = resolved.name

    let scheduled_minutes = 0
    let isMissingPolicy = false

    if (calendar_day_type === 'WORKDAY') {
      if (!applicableWorkPolicy) {
        isMissingPolicy = true
        missingPolicyDates.push(date)
        scheduled_minutes = 0
      } else {
        scheduled_minutes = applicableWorkPolicy.work_minutes
      }
    } else {
      scheduled_minutes = 0
    }

    const attendance = attendanceMap.get(date) ?? null
    const is_incomplete = Boolean(attendance && attendance.actual_clock_in_at && !attendance.actual_clock_out_at)

    let leave_minutes = 0
    let absence_minutes = 0

    if (calendar_day_type === 'HOLIDAY' || isMissingPolicy) {
      leave_minutes = 0
      absence_minutes = 0
    } else if (attendance) {
      leave_minutes = 0
      absence_minutes = 0
    } else if (dayStatus?.status === 'LEAVE') {
      leave_minutes = scheduled_minutes
      absence_minutes = 0
    } else {
      leave_minutes = 0
      absence_minutes = scheduled_minutes
    }

    let status: ReportStatusType | null = null
    if (dayStatus) {
      status = dayStatus.status
    } else if (calendar_day_type === 'WORKDAY' && !attendance) {
      status = 'ABSENT'
    }

    const exception_flags: ReportExceptionFlag[] = []
    if (calendar_day_type === 'HOLIDAY' && attendance) {
      exception_flags.push('HOLIDAY_WITH_ATTENDANCE')
    }
    if (dayStatus?.status === 'LEAVE' && attendance) {
      exception_flags.push('LEAVE_WITH_ATTENDANCE')
    }
    if (params.otherContextAttendanceDates?.has(date)) {
      exception_flags.push('OTHER_CONTEXT_ATTENDANCE')
    }

    let company_identifier = params.context?.company_identifier ?? ''
    let project_identifier = params.context?.project_identifier ?? ''
    if (attendance?.context_snapshot) {
      const snap = attendance.context_snapshot
      if (typeof snap.company_identifier === 'string') {
        company_identifier = snap.company_identifier
      }
      if (typeof snap.project_identifier === 'string') {
        project_identifier = snap.project_identifier
      }
    }

    const note = attendance?.status_note ?? dayStatus?.note ?? null

    let calculation_version: string | null = null
    if (attendance) {
      if (typeof attendance.calculation_snapshot?.calculation_version === 'string' && attendance.calculation_snapshot.calculation_version.trim()) {
        calculation_version = attendance.calculation_snapshot.calculation_version
      } else {
        calculation_version = null
      }
    }

    rows.push({
      date,
      weekday,
      weekdayLabel,
      in_assignment_period: true,
      staffing_employer: assignment.staffing_employer,
      client_company: assignment.client_company,
      project: assignment.project,
      company_identifier,
      project_identifier,
      actual_clock_in_at: attendance?.actual_clock_in_at ?? null,
      actual_clock_out_at: attendance?.actual_clock_out_at ?? null,
      effective_clock_in_at: attendance?.effective_clock_in_at ?? null,
      effective_clock_out_at: attendance?.effective_clock_out_at ?? null,
      expected_clock_out_at: attendance?.expected_clock_out_at ?? null,
      scheduled_minutes,
      actual_elapsed_minutes: attendance?.actual_elapsed_minutes ?? null,
      net_worked_minutes: attendance?.net_worked_minutes ?? null,
      regular_minutes: attendance?.regular_minutes ?? null,
      overtime_minutes: attendance?.overtime_minutes ?? null,
      leave_minutes,
      absence_minutes,
      created_source: attendance?.created_source ?? null,
      manually_adjusted: attendance?.manually_adjusted ?? false,
      last_manual_edit_at: attendance?.last_manual_edit_at ?? null,
      calculation_version,
      status,
      note,
      calendar_day_type,
      calendar_source,
      calendar_name,
      is_incomplete,
      exception_flags,
      attendance_id: attendance?.id ?? null,
      attendance_context_id: attendance?.context_id ?? null,
      attendance_assignment_id: attendance?.assignment_id ?? null,
    })
  }

  const summary: MonthlyReportSummary = {
    scheduled_minutes: rows.reduce((sum, r) => sum + r.scheduled_minutes, 0),
    leave_minutes: rows.reduce((sum, r) => sum + r.leave_minutes, 0),
    absence_minutes: rows.reduce((sum, r) => sum + r.absence_minutes, 0),
    regular_minutes: rows.reduce((sum, r) => sum + (r.regular_minutes ?? 0), 0),
    overtime_minutes: rows.reduce((sum, r) => sum + (r.overtime_minutes ?? 0), 0),
    actual_elapsed_minutes: rows.reduce((sum, r) => sum + (r.actual_elapsed_minutes ?? 0), 0),
    net_worked_minutes: rows.reduce((sum, r) => sum + (r.net_worked_minutes ?? 0), 0),
    incomplete_count: rows.filter((r) => r.is_incomplete).length,
    exception_count: rows.filter((r) => r.exception_flags.length > 0).length,
  }

  return {
    yearMonth,
    assignment,
    context: params.context ?? null,
    rows,
    summary,
    hasConfigurationError: missingPolicyDates.length > 0,
    missingPolicyDates,
  }
}
