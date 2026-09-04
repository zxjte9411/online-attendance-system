import { describe, expect, it } from 'vitest'
import {
  doAssignmentPeriodsOverlap,
  formatWorkAssignmentPeriod,
  formatWorkAssignmentStatus,
  getWorkAssignmentStatus,
  isUninterruptedRenewal,
  validateWorkAssignmentInput,
  type WorkAssignment,
  type WorkAssignmentInput,
} from './work-assignment'

describe('Work Assignment Domain Model', () => {
  const today = '2026-08-31'

  describe('getWorkAssignmentStatus & formatWorkAssignmentStatus', () => {
    it('returns FUTURE for future assignment', () => {
      const status = getWorkAssignmentStatus(
        { effective_from: '2026-09-01', effective_to: '2026-12-31' },
        today
      )
      expect(status).toBe('FUTURE')
      expect(formatWorkAssignmentStatus(status)).toBe('尚未生效')
    })

    it('returns CURRENT for open-ended assignment after start date', () => {
      const status = getWorkAssignmentStatus(
        { effective_from: '2026-01-01', effective_to: null },
        today
      )
      expect(status).toBe('CURRENT')
      expect(formatWorkAssignmentStatus(status)).toBe('目前派駐')
    })

    it('returns CURRENT on start date and end date (inclusive)', () => {
      expect(getWorkAssignmentStatus({ effective_from: today, effective_to: today }, today)).toBe('CURRENT')
      expect(getWorkAssignmentStatus({ effective_from: '2026-01-01', effective_to: today }, today)).toBe('CURRENT')
      expect(getWorkAssignmentStatus({ effective_from: today, effective_to: '2026-12-31' }, today)).toBe('CURRENT')
    })

    it('returns ENDED for assignment past effective_to', () => {
      const status = getWorkAssignmentStatus(
        { effective_from: '2026-01-01', effective_to: '2026-08-30' },
        today
      )
      expect(status).toBe('ENDED')
      expect(formatWorkAssignmentStatus(status)).toBe('已結束')
    })
  })

  describe('formatWorkAssignmentPeriod', () => {
    it('formats closed period with from and to dates', () => {
      expect(
        formatWorkAssignmentPeriod({
          effective_from: '2025-01-01',
          effective_to: '2025-06-30',
        })
      ).toBe('2025-01-01 ~ 2025-06-30')
    })

    it('formats CURRENT open-ended period with 至今', () => {
      expect(
        formatWorkAssignmentPeriod(
          {
            effective_from: '2026-01-01',
            effective_to: null,
          },
          today
        )
      ).toBe('2026-01-01 ~ 至今')
    })

    it('formats FUTURE open-ended period with 未定 (not 至今)', () => {
      const periodText = formatWorkAssignmentPeriod(
        {
          effective_from: '2027-01-01',
          effective_to: null,
        },
        today
      )
      expect(periodText).toBe('2027-01-01 ~ 未定')
      expect(periodText).not.toContain('至今')
    })
  })

  describe('doAssignmentPeriodsOverlap (inclusive semantics)', () => {
    it('returns false for adjacent non-overlapping periods', () => {
      const a = { effective_from: '2026-01-01', effective_to: '2026-01-31' }
      const b = { effective_from: '2026-02-01', effective_to: '2026-02-28' }
      expect(doAssignmentPeriodsOverlap(a, b)).toBe(false)
      expect(doAssignmentPeriodsOverlap(b, a)).toBe(false)
    })

    it('returns true for same boundary date', () => {
      const a = { effective_from: '2026-01-01', effective_to: '2026-01-31' }
      const b = { effective_from: '2026-01-31', effective_to: '2026-02-28' }
      expect(doAssignmentPeriodsOverlap(a, b)).toBe(true)
    })

    it('returns true when one overlaps open-ended assignment', () => {
      const open = { effective_from: '2026-05-01', effective_to: null }
      const inside = { effective_from: '2026-06-01', effective_to: '2026-07-01' }
      expect(doAssignmentPeriodsOverlap(open, inside)).toBe(true)
      expect(doAssignmentPeriodsOverlap(inside, open)).toBe(true)
    })

    it('returns false when before open-ended assignment', () => {
      const open = { effective_from: '2026-05-01', effective_to: null }
      const before = { effective_from: '2026-01-01', effective_to: '2026-04-30' }
      expect(doAssignmentPeriodsOverlap(open, before)).toBe(false)
    })
  })

  describe('isUninterruptedRenewal', () => {
    const existing: WorkAssignment = {
      id: 'a1',
      user_id: 'u1',
      staffing_employer: '派遣雇主 H1',
      client_company: '派駐客戶 A',
      project: '專案 P',
      effective_from: '2026-01-01',
      effective_to: '2026-06-30',
    }

    it('returns true for exact next day with matching H/A/P', () => {
      const incoming: WorkAssignmentInput = {
        staffing_employer: '派遣雇主 H1',
        client_company: '派駐客戶 A',
        project: '專案 P',
        effective_from: '2026-07-01',
        effective_to: '2026-12-31',
      }
      expect(isUninterruptedRenewal(existing, incoming)).toBe(true)
    })

    it('returns false if there is a gap', () => {
      const incoming: WorkAssignmentInput = {
        staffing_employer: '派遣雇主 H1',
        client_company: '派駐客戶 A',
        project: '專案 P',
        effective_from: '2026-07-02',
        effective_to: '2026-12-31',
      }
      expect(isUninterruptedRenewal(existing, incoming)).toBe(false)
    })

    it('returns false if H/A/P differs', () => {
      const incoming: WorkAssignmentInput = {
        staffing_employer: '派遣雇主 H2',
        client_company: '派駐客戶 A',
        project: '專案 P',
        effective_from: '2026-07-01',
        effective_to: '2026-12-31',
      }
      expect(isUninterruptedRenewal(existing, incoming)).toBe(false)
    })
  })

  describe('validateWorkAssignmentInput', () => {
    const existing: WorkAssignment[] = [
      {
        id: 'a1',
        user_id: 'u1',
        staffing_employer: '派遣雇主 H1',
        client_company: '派駐客戶 A',
        project: '專案 P',
        effective_from: '2026-01-01',
        effective_to: '2026-06-30',
      },
    ]

    it('validates required fields', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '',
          client_company: '客戶 A',
          project: '專案 P',
          effective_from: '2026-07-01',
          effective_to: null,
        },
        existing
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe('請填寫派遣雇主、派駐客戶與專案名稱。')
    })

    it('validates effective_to cannot precede effective_from', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '雇主',
          client_company: '客戶',
          project: '專案',
          effective_from: '2026-07-01',
          effective_to: '2026-06-30',
        },
        existing
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe('最後有效日不得早於生效起日。')
    })

    it('prevents overlap with existing assignments', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '其他雇主',
          client_company: '客戶 B',
          project: '專案 Q',
          effective_from: '2026-05-01',
          effective_to: '2026-08-31',
        },
        existing
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe('派駐期間不可與其他工作派駐重疊。')
    })

    it('allows valid renewal without overlap error', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '派遣雇主 H1',
          client_company: '派駐客戶 A',
          project: '專案 P',
          effective_from: '2026-07-01',
          effective_to: '2026-12-31',
        },
        existing
      )
      expect(result.valid).toBe(true)
    })

    it('prevents modifying H/A/P when attendance exists', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '修改後的雇主',
          client_company: '派駐客戶 A',
          project: '專案 P',
          effective_from: '2026-01-01',
          effective_to: '2026-06-30',
        },
        existing,
        {
          editingId: 'a1',
          hasAttendance: true,
          originalAssignment: existing[0],
        }
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe('已有出勤紀錄的工作派駐不可修改派遣雇主、派駐客戶或專案。')
    })

    it('allows modifying period when attendance exists if H/A/P unchanged', () => {
      const result = validateWorkAssignmentInput(
        {
          staffing_employer: '派遣雇主 H1',
          client_company: '派駐客戶 A',
          project: '專案 P',
          effective_from: '2026-01-01',
          effective_to: '2026-07-31',
        },
        existing,
        {
          editingId: 'a1',
          hasAttendance: true,
          originalAssignment: existing[0],
        }
      )
      expect(result.valid).toBe(true)
    })
  })
})
