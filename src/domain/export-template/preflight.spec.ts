import { describe, it, expect } from 'vitest'
import {
  runExportPreflight,
  checkFormulaTargetWarnings,
  type RunExportPreflightParams,
} from './preflight'
import type { WorkbookWorksheetPreview } from '../../lib/export-templates'

function createMockWorksheetPreview(overrides: Partial<WorkbookWorksheetPreview> = {}): WorkbookWorksheetPreview {
  return {
    name: '8月',
    isHidden: false,
    isProtected: false,
    hasImages: false,
    columns: [
      { column: 'A', isHidden: false },
      { column: 'B', isHidden: false },
      { column: 'C', isHidden: false },
      { column: 'D', isHidden: false },
    ],
    rows: [
      {
        rowNumber: 1,
        isHidden: false,
        cells: [
          { column: 'A', rowNumber: 1, text: '員工出勤表', structureType: 'ordinary' },
          { column: 'B', rowNumber: 1, text: '', structureType: 'ordinary' },
        ],
      },
      {
        rowNumber: 2,
        isHidden: false,
        cells: [
          { column: 'A', rowNumber: 2, text: '月份:', structureType: 'ordinary' },
          { column: 'B', rowNumber: 2, text: '115 年 08 月', structureType: 'ordinary' },
        ],
      },
      {
        rowNumber: 3,
        isHidden: false,
        cells: [
          { column: 'A', rowNumber: 3, text: '日期', structureType: 'ordinary' },
          { column: 'B', rowNumber: 3, text: '星期', structureType: 'ordinary' },
          { column: 'C', rowNumber: 3, text: '上班時間', structureType: 'ordinary' },
          { column: 'D', rowNumber: 3, text: '工時', structureType: 'ordinary' },
        ],
      },
      {
        rowNumber: 4,
        isHidden: false,
        cells: [
          { column: 'A', rowNumber: 4, text: '2026-08-01', structureType: 'ordinary' },
          { column: 'B', rowNumber: 4, text: '六', structureType: 'formula' },
          { column: 'C', rowNumber: 4, text: '09:00', structureType: 'ordinary' },
          { column: 'D', rowNumber: 4, text: '8.0', structureType: 'formula' },
        ],
      },
      {
        rowNumber: 5,
        isHidden: false,
        cells: [
          { column: 'A', rowNumber: 5, text: '2026-08-02', structureType: 'ordinary' },
          { column: 'B', rowNumber: 5, text: '日', structureType: 'formula' },
          { column: 'C', rowNumber: 5, text: '09:00', structureType: 'ordinary' },
          { column: 'D', rowNumber: 5, text: '8.0', structureType: 'formula' },
        ],
      },
    ],
    ...overrides,
  }
}

describe('Domain: Export Preflight & Formula Guidance (Issue #46)', () => {
  describe('Formula Target Guidance', () => {
    it('detects formula cells in Row Mapping target column and returns warning/blocker', () => {
      const worksheet = createMockWorksheetPreview()
      const warnings = checkFormulaTargetWarnings({
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMappings: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'weekday', targetColumn: 'B' }, // B contains formula cells
        ],
        worksheetPreviews: [worksheet],
      })

      expect(warnings).toHaveLength(1)
      expect(warnings[0].kind).toBe('row_mapping')
      expect(warnings[0].target).toBe('B')
      expect(warnings[0].sourceField).toBe('weekday')
      expect(warnings[0].worksheet).toBe('8月')
      expect(warnings[0].message).toContain('包含公式')
      expect(warnings[0].message).toContain('拒絕覆寫')
    })

    it('detects formula in Static Cell Mapping target cell and returns warning/blocker', () => {
      const worksheet = createMockWorksheetPreview({
        rows: [
          {
            rowNumber: 2,
            isHidden: false,
            cells: [
              { column: 'B', rowNumber: 2, text: '=TODAY()', structureType: 'formula' },
            ],
          },
        ],
      })
      const warnings = checkFormulaTargetWarnings({
        monthWorksheetMapping: { '2026-08': '8月' },
        staticMappings: [
          { sourceField: 'year_month', targetCell: 'B2' }, // B2 is formula
        ],
        worksheetPreviews: [worksheet],
      })

      expect(warnings).toHaveLength(1)
      expect(warnings[0].kind).toBe('static_mapping')
      expect(warnings[0].target).toBe('B2')
      expect(warnings[0].sourceField).toBe('year_month')
      expect(warnings[0].message).toContain('包含公式')
      expect(warnings[0].message).toContain('拒絕覆寫')
    })

    it('does not produce formula warnings for unmapped formula columns', () => {
      const worksheet = createMockWorksheetPreview()
      // B and D have formulas, but only A and C are mapped
      const warnings = checkFormulaTargetWarnings({
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMappings: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [worksheet],
      })

      expect(warnings).toHaveLength(0)
    })
  })

  describe('runExportPreflight', () => {
    it('reports error when date locator is missing', () => {
      const worksheet = createMockWorksheetPreview()
      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const dateItem = result.items.find((i) => i.category === 'date_locator')
      expect(dateItem).toBeDefined()
      expect(dateItem?.status).toBe('error')
      expect(dateItem?.message).toContain('缺少')
      expect(dateItem?.message).toContain('日期')
    })

    it('reports error when target column has formula overwrite', () => {
      const worksheet = createMockWorksheetPreview()
      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'weekday', targetColumn: 'B' }, // Column B has formulas in row 4 and 5
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const formulaItem = result.items.find((i) => i.category === 'formula_target')
      expect(formulaItem).toBeDefined()
      expect(formulaItem?.status).toBe('error')
      expect(formulaItem?.message).toContain('公式')
      expect(formulaItem?.message).toContain('拒絕覆寫')
    })

    it('reports error when month worksheet mapping is missing for target month', () => {
      const worksheet = createMockWorksheetPreview()
      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-09': '9月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const mappingItem = result.items.find((i) => i.category === 'worksheet_mapping')
      expect(mappingItem).toBeDefined()
      expect(mappingItem?.status).toBe('error')
      expect(mappingItem?.message).toContain('2026-08')
    })

    it('reports error when mapped worksheet does not exist in workbook', () => {
      const worksheet = createMockWorksheetPreview({ name: 'Sheet1' })
      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const wsItem = result.items.find((i) => i.category === 'worksheet_mapping')
      expect(wsItem).toBeDefined()
      expect(wsItem?.status).toBe('error')
      expect(wsItem?.message).toContain('找不到名為「8月」的工作表')
    })

    it('passes and provides unmapped preservation info when configuration is valid', () => {
      const worksheet = createMockWorksheetPreview()
      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        staticCellMapping: [
          { sourceField: 'year_month', targetCell: 'B2' },
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(true)
      expect(result.hasErrors).toBe(false)

      const dateItem = result.items.find((i) => i.category === 'date_locator')
      expect(dateItem?.status).toBe('pass')
      expect(dateItem?.message).toContain('A 欄')

      const wsItem = result.items.find((i) => i.category === 'worksheet_mapping')
      expect(wsItem?.status).toBe('pass')

      const unmappedItem = result.items.find((i) => i.category === 'unmapped_preservation')
      expect(unmappedItem).toBeDefined()
      expect(unmappedItem?.status).toBe('info')
      expect(unmappedItem?.message).toContain('未 Mapping 的公式與原始內容會保留')
    })

    it('handles candidate or multi-month mapping input safely', () => {
      const ws8 = createMockWorksheetPreview({ name: '8月' })
      const ws9 = createMockWorksheetPreview({ name: '9月' })
      const result = runExportPreflight({
        monthWorksheetMapping: [
          { month: '2026-08', worksheet: '8月' },
          { month: '2026-09', worksheet: '9月' },
        ],
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [ws8, ws9],
      })

      expect(result.canExport).toBe(true)
      expect(result.hasErrors).toBe(false)
    })

    it('detects collision between static mapping target and daily row mapping target', () => {
      const worksheet: WorkbookWorksheetPreview = {
        name: '8月',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [
          { column: 'A', isHidden: false },
          { column: 'C', isHidden: false },
        ],
        rows: [
          {
            rowNumber: 4,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 4, text: '2026-08-01', structureType: 'ordinary' },
              { column: 'C', rowNumber: 4, text: '09:00', structureType: 'ordinary' },
            ],
          },
        ],
      }

      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        staticCellMapping: [
          { sourceField: 'year_month', targetCell: 'C4' }, // Collides with row mapping C on date row 4
        ],
        worksheetPreviews: [worksheet],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const collisionItem = result.items.find((i) => i.category === 'collision')
      expect(collisionItem).toBeDefined()
      expect(collisionItem?.status).toBe('error')
      expect(collisionItem?.message).toContain('靜態儲存格「C4」在工作表「8月」與每日列目標位置衝突')
    })

    it('reports error during overview preflight when mapped worksheet does not exist in preview', () => {
      const ws8 = createMockWorksheetPreview({ name: '8月' })
      const result = runExportPreflight({
        monthWorksheetMapping: {
          '2026-08': '8月',
          '2026-09': '9月不存在',
        },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
        ],
        worksheetPreviews: [ws8],
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const wsError = result.items.find((i) => i.category === 'worksheet_mapping')
      expect(wsError?.message).toContain('月份「2026-09」對應之工作表「9月不存在」不存在於範本中')
    })

    it('cross-month isolation: formula in 2026-09 worksheet does not block 2026-08 preflight', () => {
      const ws8 = createMockWorksheetPreview({
        name: '8月',
        rows: [
          {
            rowNumber: 4,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 4, text: '2026-08-01', structureType: 'ordinary' },
              { column: 'B', rowNumber: 4, text: '09:00', structureType: 'ordinary' },
            ],
          },
        ],
      })
      const ws9 = createMockWorksheetPreview({
        name: '9月',
        rows: [
          {
            rowNumber: 4,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 4, text: '2026-09-01', structureType: 'ordinary' },
              { column: 'B', rowNumber: 4, text: '=IF(...)', structureType: 'formula' }, // Formula in Sept
            ],
          },
        ],
      })

      const monthMap = { '2026-08': '8月', '2026-09': '9月' }
      const rowMap = [
        { sourceField: 'date' as const, targetColumn: 'A' },
        { sourceField: 'actual_clock_in_at' as const, targetColumn: 'B' },
      ]

      // 1. Target month 2026-08 should pass cleanly
      const resultAug = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: monthMap,
        rowMapping: rowMap,
        worksheetPreviews: [ws8, ws9],
      })
      expect(resultAug.canExport).toBe(true)
      expect(resultAug.hasErrors).toBe(false)
      expect(resultAug.isFullyVerified).toBe(true)

      // 2. Target month 2026-09 should be blocked
      const resultSep = runExportPreflight({
        targetMonth: '2026-09',
        monthWorksheetMapping: monthMap,
        rowMapping: rowMap,
        worksheetPreviews: [ws8, ws9],
      })
      expect(resultSep.canExport).toBe(false)
      expect(resultSep.hasErrors).toBe(true)
      const sepFormulaErr = resultSep.items.find((i) => i.category === 'formula_target')
      expect(sepFormulaErr?.status).toBe('error')
      expect(sepFormulaErr?.message).toContain('9月')

      // 3. Overview mode (no targetMonth) identifies the 2026-09 issue without claiming global safe
      const resultOverview = runExportPreflight({
        monthWorksheetMapping: monthMap,
        rowMapping: rowMap,
        worksheetPreviews: [ws8, ws9],
      })
      expect(resultOverview.canExport).toBe(false)
      expect(resultOverview.hasErrors).toBe(true)
      expect(resultOverview.items.some((i) => i.message.includes('9月'))).toBe(true)
    })

    it('aligns with exporter: formulas in header or summary rows do NOT block when daily rows are ordinary', () => {
      const wsWithHeaderSummaryFormulas: WorkbookWorksheetPreview = {
        name: '8月',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [
          { column: 'A', isHidden: false },
          { column: 'C', isHidden: false },
        ],
        rows: [
          {
            rowNumber: 1,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 1, text: '報表表頭', structureType: 'ordinary' },
              { column: 'C', rowNumber: 1, text: '="動態欄位名稱"', structureType: 'formula' }, // Header formula in col C
            ],
          },
          {
            rowNumber: 4,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 4, text: '2026-08-01', structureType: 'ordinary' },
              { column: 'C', rowNumber: 4, text: '09:00', structureType: 'ordinary' }, // Daily row is ordinary!
            ],
          },
          {
            rowNumber: 35,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 35, text: '總計', structureType: 'ordinary' },
              { column: 'C', rowNumber: 35, text: '=COUNTA(C4:C34)', structureType: 'formula' }, // Summary formula in col C
            ],
          },
        ],
      }

      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [wsWithHeaderSummaryFormulas],
      })

      // Must NOT be blocked since actual daily row C4 has no formula
      expect(result.canExport).toBe(true)
      expect(result.hasErrors).toBe(false)
      const formulaItem = result.items.find((i) => i.category === 'formula_target')
      expect(formulaItem?.status).toBe('pass')
    })

    it('truthful presentation: does not report false-safe when preview evidence is absent', () => {
      const resultNoPreview = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'A' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
        ],
        worksheetPreviews: [], // No preview loaded
      })

      // canExport is true to allow authoritative exporter check, but isFullyVerified must be FALSE
      expect(resultNoPreview.canExport).toBe(true)
      expect(resultNoPreview.hasErrors).toBe(false)
      expect(resultNoPreview.isFullyVerified).toBe(false)

      const unverifiedItems = resultNoPreview.items.filter((i) => i.status === 'not_verified')
      expect(unverifiedItems.length).toBeGreaterThan(0)
      expect(unverifiedItems.some((i) => i.category === 'formula_target')).toBe(true)
      expect(unverifiedItems.some((i) => i.category === 'date_row_locator')).toBe(true)
    })

    it('reports error when active report date cannot be located in date column', () => {
      const worksheet: WorkbookWorksheetPreview = {
        name: '8月',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [{ column: 'A', isHidden: false }],
        rows: [
          {
            rowNumber: 4,
            isHidden: false,
            cells: [{ column: 'A', rowNumber: 4, text: '2026-08-01', structureType: 'ordinary' }],
          },
          // Missing 2026-08-02
        ],
      }

      const mockReport: any = {
        yearMonth: '2026-08',
        assignment: null,
        rows: [
          { date: '2026-08-01', in_assignment_period: true },
          { date: '2026-08-02', in_assignment_period: true },
        ],
        summary: {
          scheduled_minutes: 0,
          leave_minutes: 0,
          absence_minutes: 0,
          regular_minutes: 0,
          overtime_minutes: 0,
          actual_elapsed_minutes: 0,
          net_worked_minutes: 0,
          incomplete_count: 0,
          exception_count: 0,
        },
        hasConfigurationError: false,
        missingPolicyDates: [],
      }

      const result = runExportPreflight({
        targetMonth: '2026-08',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [{ sourceField: 'date', targetColumn: 'A' }],
        worksheetPreviews: [worksheet],
        report: mockReport,
      })

      expect(result.canExport).toBe(false)
      expect(result.hasErrors).toBe(true)
      const dateRowItem = result.items.find((i) => i.category === 'date_row_locator')
      expect(dateRowItem?.status).toBe('error')
      expect(dateRowItem?.message).toContain('找不到日期「2026-08-02」對應的列')
    })
  })
})
