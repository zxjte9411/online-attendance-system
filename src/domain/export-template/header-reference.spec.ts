import { describe, expect, it } from 'vitest'
import {
  checkHeaderConsistency,
  checkStaticCellConsistency,
  clearSelectionTarget,
  deriveColumnHeaderLabels,
  formatColumnPickerLabel,
  getStaticCellStructure,
  isSameSelectionTarget,
  isValidHeaderRange,
  parseA1Address,
  toggleSelectionTarget,
  type HeaderReferenceRange,
  type PreviewSelectionTarget,
} from './header-reference'
import type { WorkbookWorksheetPreview } from '../../lib/export-templates'

describe('header-reference', () => {
  describe('PreviewSelectionTarget helpers', () => {
    it('isSameSelectionTarget compares row and static targets correctly', () => {
      expect(isSameSelectionTarget(null, null)).toBe(true)
      expect(isSameSelectionTarget({ kind: 'row_mapping', index: 0 }, { kind: 'row_mapping', index: 0 })).toBe(true)
      expect(isSameSelectionTarget({ kind: 'row_mapping', index: 0 }, { kind: 'row_mapping', index: 1 })).toBe(false)
      expect(isSameSelectionTarget({ kind: 'static_mapping', index: 0 }, { kind: 'static_mapping', index: 0 })).toBe(true)
      expect(isSameSelectionTarget({ kind: 'static_mapping', index: 0 }, { kind: 'static_mapping', index: 1 })).toBe(false)
      expect(isSameSelectionTarget({ kind: 'row_mapping', index: 0 }, { kind: 'static_mapping', index: 0 })).toBe(false)
      expect(isSameSelectionTarget({ kind: 'row_mapping', index: 0 }, null)).toBe(false)
      expect(isSameSelectionTarget(null, { kind: 'static_mapping', index: 0 })).toBe(false)
    })

    it('toggleSelectionTarget activates target, cancels same target, and switches target', () => {
      const rowTarget0: NonNullable<PreviewSelectionTarget> = { kind: 'row_mapping', index: 0 }
      const rowTarget1: NonNullable<PreviewSelectionTarget> = { kind: 'row_mapping', index: 1 }
      const staticTarget0: NonNullable<PreviewSelectionTarget> = { kind: 'static_mapping', index: 0 }

      // 1. Activate from null
      expect(toggleSelectionTarget(null, rowTarget0)).toEqual(rowTarget0)
      expect(toggleSelectionTarget(null, staticTarget0)).toEqual(staticTarget0)

      // 2. Toggle off when activating same target
      expect(toggleSelectionTarget(rowTarget0, rowTarget0)).toBeNull()
      expect(toggleSelectionTarget(staticTarget0, staticTarget0)).toBeNull()

      // 3. Switch target: row to row
      expect(toggleSelectionTarget(rowTarget0, rowTarget1)).toEqual(rowTarget1)

      // 4. Switch target: row to static
      expect(toggleSelectionTarget(rowTarget0, staticTarget0)).toEqual(staticTarget0)

      // 5. Switch target: static to row
      expect(toggleSelectionTarget(staticTarget0, rowTarget0)).toEqual(rowTarget0)
    })

    it('clearSelectionTarget returns null', () => {
      expect(clearSelectionTarget()).toBeNull()
    })
  })
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

  describe('parseA1Address', () => {
    it('parses valid single and multi-letter A1 addresses', () => {
      expect(parseA1Address('A1')).toEqual({ column: 'A', rowNumber: 1 })
      expect(parseA1Address('b2')).toEqual({ column: 'B', rowNumber: 2 })
      expect(parseA1Address('  AA10  ')).toEqual({ column: 'AA', rowNumber: 10 })
      expect(parseA1Address('XFD1048576')).toEqual({ column: 'XFD', rowNumber: 1048576 })
    })

    it('returns null for invalid cell addresses', () => {
      expect(parseA1Address('')).toBeNull()
      expect(parseA1Address('A')).toBeNull()
      expect(parseA1Address('1')).toBeNull()
      expect(parseA1Address('A0')).toBeNull()
      expect(parseA1Address('A-1')).toBeNull()
      expect(parseA1Address('1A')).toBeNull()
      expect(parseA1Address('A1B2')).toBeNull()
    })
  })

  describe('getStaticCellStructure', () => {
    const ws: WorkbookWorksheetPreview = {
      name: 'Sheet1',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 1,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 1, text: '2026-08', structureType: 'ordinary' },
            { column: 'B', rowNumber: 1, text: 'ƒ =SUM(A1)', structureType: 'formula' },
          ],
        },
        {
          rowNumber: 2,
          isHidden: false,
          cells: [
            { column: 'A', rowNumber: 2, text: '↖ merged A2:B2', structureType: 'merged' },
          ],
        },
      ],
    }

    it('returns structureType of existing cell in preview', () => {
      expect(getStaticCellStructure(ws, 'A1')).toBe('ordinary')
      expect(getStaticCellStructure(ws, 'B1')).toBe('formula')
      expect(getStaticCellStructure(ws, 'A2')).toBe('merged')
    })

    it('returns ordinary for empty cell within row and column bounds', () => {
      // B2 is within column A..B and row 1..2, but not explicitly in row.cells
      expect(getStaticCellStructure(ws, 'B2')).toBe('ordinary')
    })

    it('returns null when target cell is outside preview bounds or invalid', () => {
      expect(getStaticCellStructure(ws, 'Z1')).toBeNull() // Column out of bounds
      expect(getStaticCellStructure(ws, 'A100')).toBeNull() // Row out of bounds
      expect(getStaticCellStructure(ws, 'INVALID')).toBeNull()
      expect(getStaticCellStructure(null, 'A1')).toBeNull()
    })
  })

  describe('checkStaticCellConsistency', () => {
    const sheetOrdinary: WorkbookWorksheetPreview = {
      name: 'SheetOrd',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 2,
          isHidden: false,
          cells: [{ column: 'B', rowNumber: 2, text: '2026-08', structureType: 'ordinary' }],
        },
      ],
    }

    const sheetFormula1: WorkbookWorksheetPreview = {
      name: 'SheetForm1',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 2,
          isHidden: false,
          cells: [{ column: 'B', rowNumber: 2, text: 'ƒ =A1+1', structureType: 'formula' }],
        },
      ],
    }

    const sheetFormula2: WorkbookWorksheetPreview = {
      name: 'SheetForm2',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 2,
          isHidden: false,
          cells: [{ column: 'B', rowNumber: 2, text: 'ƒ =SUM(C1:C10)', structureType: 'formula' }],
        },
      ],
    }

    const sheetMerged: WorkbookWorksheetPreview = {
      name: 'SheetMerge',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 2,
          isHidden: false,
          cells: [{ column: 'B', rowNumber: 2, text: '↖ merged B2:C2', structureType: 'merged' }],
        },
      ],
    }

    const sheetOrdinaryDifferentText: WorkbookWorksheetPreview = {
      name: 'SheetOrdDiff',
      isHidden: false,
      isProtected: false,
      hasImages: false,
      columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
      rows: [
        {
          rowNumber: 2,
          isHidden: false,
          cells: [{ column: 'B', rowNumber: 2, text: '2026-09 (Different Month)', structureType: 'ordinary' }],
        },
      ],
    }

    it('returns empty array when only 1 unique worksheet is mapped', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetOrd' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetOrdinary, sheetFormula1],
      })
      expect(warnings).toHaveLength(0)
    })

    it('returns warning when formula vs ordinary cell structure mismatch occurs', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetForm1' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetOrdinary, sheetFormula1],
      })
      expect(warnings).toHaveLength(1)
      expect(warnings[0].cell).toBe('B2')
      expect(warnings[0].sourceField).toBe('year_month')
      expect(warnings[0].sheetStructures).toEqual([
        { sheetName: 'SheetOrd', structureType: 'ordinary' },
        { sheetName: 'SheetForm1', structureType: 'formula' },
      ])
    })

    it('returns warning when merged vs ordinary cell structure mismatch occurs', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetMerge' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetOrdinary, sheetMerged],
      })
      expect(warnings).toHaveLength(1)
      expect(warnings[0].cell).toBe('B2')
      expect(warnings[0].sheetStructures).toEqual([
        { sheetName: 'SheetOrd', structureType: 'ordinary' },
        { sheetName: 'SheetMerge', structureType: 'merged' },
      ])
    })

    it('does NOT warn when comparing formula vs formula even if formula content/result differs', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetForm1', '2026-09': 'SheetForm2' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetFormula1, sheetFormula2],
      })
      expect(warnings).toHaveLength(0)
    })

    it('does NOT warn when comparing ordinary cells with different text values', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetOrdDiff' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetOrdinary, sheetOrdinaryDifferentText],
      })
      expect(warnings).toHaveLength(0)
    })

    it('runs comparison without requiring any Header Reference Range', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetForm1' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetOrdinary, sheetFormula1],
      })
      expect(warnings).toHaveLength(1)
    })

    it('does not warn when target cell is outside preview bounds for one sheet (insufficient data)', () => {
      const smallSheet: WorkbookWorksheetPreview = {
        name: 'SmallSheet',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [{ column: 'A', isHidden: false }],
        rows: [{ rowNumber: 1, isHidden: false, cells: [] }],
      }

      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SmallSheet' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }], // B2 not in SmallSheet
        worksheetPreviews: [sheetOrdinary, smallSheet],
      })
      expect(warnings).toHaveLength(0)
    })

    it('does NOT warn when comparing merged+formula vs merged+ordinary cell (both are merged)', () => {
      const sheetMergedFormula: WorkbookWorksheetPreview = {
        name: 'SheetMergeForm',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
        rows: [
          {
            rowNumber: 2,
            isHidden: false,
            cells: [{ column: 'B', rowNumber: 2, text: 'ƒ =SUM(A1:A5)', structureType: 'merged' }],
          },
        ],
      }

      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetMerge', '2026-09': 'SheetMergeForm' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetMerged, sheetMergedFormula],
      })
      expect(warnings).toHaveLength(0)
    })

    it('warns when comparing merged+formula vs unmerged formula cell (merged vs formula mismatch)', () => {
      const sheetMergedFormula: WorkbookWorksheetPreview = {
        name: 'SheetMergeForm',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [{ column: 'A', isHidden: false }, { column: 'B', isHidden: false }],
        rows: [
          {
            rowNumber: 2,
            isHidden: false,
            cells: [{ column: 'B', rowNumber: 2, text: 'ƒ =SUM(A1:A5)', structureType: 'merged' }],
          },
        ],
      }

      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetMergeForm', '2026-09': 'SheetForm1' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        worksheetPreviews: [sheetMergedFormula, sheetFormula1],
      })
      expect(warnings).toHaveLength(1)
      expect(warnings[0].cell).toBe('B2')
      expect(warnings[0].sheetStructures).toEqual([
        { sheetName: 'SheetMergeForm', structureType: 'merged' },
        { sheetName: 'SheetForm1', structureType: 'formula' },
      ])
    })

    it('ignores worksheets not referenced in month_worksheet_mapping', () => {
      const warnings = checkStaticCellConsistency({
        monthWorksheetMapping: { '2026-08': 'SheetOrd', '2026-09': 'SheetOrdDiff' },
        staticMappings: [{ sourceField: 'year_month', targetCell: 'B2' }],
        // SheetForm1 is in workbook, but not referenced in month mapping
        worksheetPreviews: [sheetOrdinary, sheetOrdinaryDifferentText, sheetFormula1],
      })
      expect(warnings).toHaveLength(0)
    })
  })
})

