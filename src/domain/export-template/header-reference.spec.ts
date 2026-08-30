import { describe, expect, it } from 'vitest'
import {
  checkHeaderConsistency,
  deriveColumnHeaderLabels,
  formatColumnPickerLabel,
  isValidHeaderRange,
  type HeaderReferenceRange,
} from './header-reference'
import type { WorkbookWorksheetPreview } from '../../lib/export-templates'

describe('header-reference', () => {
  describe('isValidHeaderRange', () => {
    it('validates positive contiguous integer ranges', () => {
      expect(isValidHeaderRange({ startRow: 1, endRow: 1 })).toBe(true)
      expect(isValidHeaderRange({ startRow: 4, endRow: 5 })).toBe(true)
      expect(isValidHeaderRange({ startRow: 2, endRow: 10 })).toBe(true)

      expect(isValidHeaderRange(null)).toBe(false)
      expect(isValidHeaderRange(undefined)).toBe(false)
      expect(isValidHeaderRange({})).toBe(false)
      expect(isValidHeaderRange({ startRow: 0, endRow: 5 })).toBe(false)
      expect(isValidHeaderRange({ startRow: 5, endRow: 4 })).toBe(false)
      expect(isValidHeaderRange({ startRow: 1.5, endRow: 3 })).toBe(false)
      expect(isValidHeaderRange({ startRow: '1', endRow: '3' })).toBe(false)
    })
  })

  describe('deriveColumnHeaderLabels', () => {
    const mockWorksheet: WorkbookWorksheetPreview = {
      name: '8月',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [
        { column: 'A', isHidden: false },
        { column: 'B', isHidden: false },
        { column: 'C', isHidden: false },
        { column: 'D', isHidden: false },
        { column: 'E', isHidden: false },
        { column: 'F', isHidden: false },
      ],
      rows: [
        {
          rowNumber: 1,
          isHidden: false,
          cells: [{ column: 'A', rowNumber: 1, text: '公司考勤表' }],
        },
        {
          rowNumber: 4,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 4, text: '員工編號' },
            { column: 'B', rowNumber: 4, text: '  日期  ' },
            { column: 'C', rowNumber: 4, text: '姓名' },
            { column: 'D', rowNumber: 4, text: '出勤時數統計', headerText: '出勤時數統計' },
            { column: 'E', rowNumber: 4, text: '↖ merged D4:E4', headerText: '出勤時數統計' },
          ],
        },
        {
          rowNumber: 5,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 5, text: '' },
            { column: 'B', rowNumber: 5, text: '   ' },
            { column: 'C', rowNumber: 5, text: '姓名' }, // duplicate of row 4
            { column: 'D', rowNumber: 5, text: '工時' },
            { column: 'E', rowNumber: 5, text: '上班' },
          ],
        },
      ],
    }

    it('returns empty string for all columns when range is null or invalid', () => {
      const labels = deriveColumnHeaderLabels(mockWorksheet, null)
      expect(labels.get('A')).toBe('')
      expect(labels.get('B')).toBe('')
      expect(labels.get('E')).toBe('')
    })

    it('handles single-row header range', () => {
      const labels = deriveColumnHeaderLabels(mockWorksheet, { startRow: 4, endRow: 4 })
      expect(labels.get('A')).toBe('員工編號')
      expect(labels.get('B')).toBe('日期')
      expect(labels.get('C')).toBe('姓名')
      expect(labels.get('D')).toBe('出勤時數統計')
      expect(labels.get('E')).toBe('出勤時數統計')
      expect(labels.get('F')).toBe('')
    })

    it('handles multi-row header range and joins with top-to-bottom hierarchy', () => {
      const labels = deriveColumnHeaderLabels(mockWorksheet, { startRow: 4, endRow: 5 })
      expect(labels.get('A')).toBe('員工編號')
      expect(labels.get('B')).toBe('日期')
      expect(labels.get('C')).toBe('姓名') // duplicate removed
      expect(labels.get('D')).toBe('出勤時數統計 / 工時')
      expect(labels.get('E')).toBe('出勤時數統計 / 上班')
      expect(labels.get('F')).toBe('')
    })

    it('propagates merged owner headerText for merged member columns', () => {
      const labels = deriveColumnHeaderLabels(mockWorksheet, { startRow: 4, endRow: 5 })
      expect(labels.get('E')).toBe('出勤時數統計 / 上班')
    })
  })

  describe('formatColumnPickerLabel', () => {
    it('formats column with non-empty label', () => {
      expect(formatColumnPickerLabel('B', '日期')).toBe('B — 日期')
      expect(formatColumnPickerLabel('E', '出勤時數統計 / 上班')).toBe('E — 出勤時數統計 / 上班')
    })

    it('returns only column letter when label is empty or whitespace', () => {
      expect(formatColumnPickerLabel('A', '')).toBe('A')
      expect(formatColumnPickerLabel('A', '   ')).toBe('A')
      expect(formatColumnPickerLabel('Z', null)).toBe('Z')
      expect(formatColumnPickerLabel('Z', undefined)).toBe('Z')
    })
  })

  describe('checkHeaderConsistency', () => {
    const sheet1: WorkbookWorksheetPreview = {
      name: 'Sheet1',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }, { column: 'C', isHidden: false }],
      rows: [
        {
          rowNumber: 4,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 4, text: '員工編號' },
            { column: 'B', rowNumber: 4, text: '日期' },
            { column: 'C', rowNumber: 4, text: '上班時間' },
          ],
        },
      ],
    }

    const sheet2Consistent: WorkbookWorksheetPreview = {
      name: 'Sheet2',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }, { column: 'C', isHidden: false }],
      rows: [
        {
          rowNumber: 4,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 4, text: '員工編號' },
            { column: 'B', rowNumber: 4, text: '日期' },
            { column: 'C', rowNumber: 4, text: '上班時間' },
          ],
        },
      ],
    }

    const sheet2Inconsistent: WorkbookWorksheetPreview = {
      name: 'Sheet2',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }, { column: 'C', isHidden: false }],
      rows: [
        {
          rowNumber: 4,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 4, text: '員工編號' },
            { column: 'B', rowNumber: 4, text: '日期' },
            { column: 'C', rowNumber: 4, text: '下班時間' }, // differs from Sheet1
          ],
        },
      ],
    }

    it('returns empty array when only 1 unique worksheet is mapped', () => {
      const warnings = checkHeaderConsistency({
        monthWorksheetMapping: { '2026-08': 'Sheet1', '2026-09': 'Sheet1' },
        rowMappings: [{ sourceField: 'actual_clock_in_at', targetColumn: 'C' }],
        worksheetPreviews: [sheet1, sheet2Inconsistent],
        worksheetHeaderRanges: { Sheet1: { startRow: 4, endRow: 4 }, Sheet2: { startRow: 4, endRow: 4 } },
      })
      expect(warnings).toHaveLength(0)
    })

    it('returns empty array when sheets have consistent headers', () => {
      const warnings = checkHeaderConsistency({
        monthWorksheetMapping: { '2026-08': 'Sheet1', '2026-09': 'Sheet2' },
        rowMappings: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [sheet1, sheet2Consistent],
        worksheetHeaderRanges: { Sheet1: { startRow: 4, endRow: 4 }, Sheet2: { startRow: 4, endRow: 4 } },
      })
      expect(warnings).toHaveLength(0)
    })

    it('returns warning when mapped column headers differ between mapped worksheets', () => {
      const warnings = checkHeaderConsistency({
        monthWorksheetMapping: { '2026-08': 'Sheet1', '2026-09': 'Sheet2' },
        rowMappings: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [sheet1, sheet2Inconsistent],
        worksheetHeaderRanges: { Sheet1: { startRow: 4, endRow: 4 }, Sheet2: { startRow: 4, endRow: 4 } },
      })
      expect(warnings).toHaveLength(1)
      expect(warnings[0].column).toBe('C')
      expect(warnings[0].sourceField).toBe('actual_clock_in_at')
      expect(warnings[0].sheetHeaders).toEqual([
        { sheetName: 'Sheet1', headerLabel: '上班時間' },
        { sheetName: 'Sheet2', headerLabel: '下班時間' },
      ])
    })

    it('produces no false warning when a sheet has no reference range set (insufficient data)', () => {
      const warnings = checkHeaderConsistency({
        monthWorksheetMapping: { '2026-08': 'Sheet1', '2026-09': 'Sheet2' },
        rowMappings: [{ sourceField: 'actual_clock_in_at', targetColumn: 'C' }],
        worksheetPreviews: [sheet1, sheet2Inconsistent],
        worksheetHeaderRanges: { Sheet1: { startRow: 4, endRow: 4 } }, // Sheet2 has no range
      })
      expect(warnings).toHaveLength(0)
    })

    it('produces no false warning when target column is outside preview bounds', () => {
      const warnings = checkHeaderConsistency({
        monthWorksheetMapping: { '2026-08': 'Sheet1', '2026-09': 'Sheet2' },
        rowMappings: [{ sourceField: 'actual_clock_in_at', targetColumn: 'Z' }], // Z not in preview
        worksheetPreviews: [sheet1, sheet2Inconsistent],
        worksheetHeaderRanges: { Sheet1: { startRow: 4, endRow: 4 }, Sheet2: { startRow: 4, endRow: 4 } },
      })
      expect(warnings).toHaveLength(0)
    })
  })
})
