import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  exportReportToXlsx,
  parseDateCellValue,
  isFormulaCell,
  ExportError,
} from './xlsx-export'
import type { ExportTemplateConfig } from './mapping-validator'
import type { MonthlyReport } from '../report/monthly-report'

function createMockReport(yearMonth = '2026-08'): MonthlyReport {
  return {
    yearMonth,
    assignment: {
      id: 'assign-1',
      user_id: 'user-1',
      staffing_employer: 'ACME_EMPLOYER',
      client_company: 'ACME_CORP',
      project: 'PROJ_ALPHA',
      effective_from: '2026-01-01',
      effective_to: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    },
    summary: {
      scheduled_minutes: 10080,
      actual_elapsed_minutes: 1020,
      net_worked_minutes: 960,
      regular_minutes: 960,
      overtime_minutes: 0,
      leave_minutes: 0,
      absence_minutes: 0,
      incomplete_count: 0,
      exception_count: 0,
    },
    rows: [
      {
        date: '2026-08-01',
        weekday: 6,
        weekdayLabel: '週六',
        in_assignment_period: true,
        staffing_employer: 'ACME_STAFFING',
        client_company: 'ACME_CLIENT',
        project: 'ACME_PROJ',
        calendar_day_type: 'HOLIDAY',
        calendar_source: 'WEEKEND_FALLBACK',
        calendar_name: null,
        status: null,
        scheduled_minutes: 0,
        actual_clock_in_at: null,
        effective_clock_in_at: null,
        actual_clock_out_at: null,
        effective_clock_out_at: null,
        expected_clock_out_at: null,
        actual_elapsed_minutes: null,
        net_worked_minutes: null,
        regular_minutes: null,
        overtime_minutes: null,
        leave_minutes: 0,
        absence_minutes: 0,
        is_incomplete: false,
        created_source: null,
        manually_adjusted: false,
        last_manual_edit_at: null,
        calculation_version: null,
        note: null,
        company_identifier: 'ACME_CORP',
        project_identifier: 'PROJ_ALPHA',
        exception_flags: [],
        attendance_id: null,
        attendance_context_id: null,
      },
      {
        date: '2026-08-02',
        weekday: 0,
        weekdayLabel: '週日',
        in_assignment_period: true,
        staffing_employer: 'ACME_STAFFING',
        client_company: 'ACME_CLIENT',
        project: 'ACME_PROJ',
        calendar_day_type: 'HOLIDAY',
        calendar_source: 'WEEKEND_FALLBACK',
        calendar_name: null,
        status: null,
        scheduled_minutes: 0,
        actual_clock_in_at: null,
        effective_clock_in_at: null,
        actual_clock_out_at: null,
        effective_clock_out_at: null,
        expected_clock_out_at: null,
        actual_elapsed_minutes: null,
        net_worked_minutes: null,
        regular_minutes: null,
        overtime_minutes: null,
        leave_minutes: 0,
        absence_minutes: 0,
        is_incomplete: false,
        created_source: null,
        manually_adjusted: false,
        last_manual_edit_at: null,
        calculation_version: null,
        note: null,
        company_identifier: 'ACME_CORP',
        project_identifier: 'PROJ_ALPHA',
        exception_flags: [],
        attendance_id: null,
        attendance_context_id: null,
      },
      {
        date: '2026-08-03',
        weekday: 1,
        weekdayLabel: '週一',
        in_assignment_period: true,
        staffing_employer: 'ACME_STAFFING',
        client_company: 'ACME_CLIENT',
        project: 'ACME_PROJ',
        calendar_day_type: 'WORKDAY',
        calendar_source: 'WORK_POLICY',
        calendar_name: null,
        status: null,
        scheduled_minutes: 480,
        actual_clock_in_at: '2026-08-03T01:00:00.000Z', // 09:00 Taipei
        effective_clock_in_at: '2026-08-03T01:00:00.000Z',
        actual_clock_out_at: '2026-08-03T10:00:00.000Z', // 18:00 Taipei
        effective_clock_out_at: '2026-08-03T10:00:00.000Z',
        expected_clock_out_at: '2026-08-03T10:00:00.000Z',
        actual_elapsed_minutes: 540,
        net_worked_minutes: 480,
        regular_minutes: 480,
        overtime_minutes: 0,
        leave_minutes: 0,
        absence_minutes: 0,
        is_incomplete: false,
        created_source: 'CLOCK',
        manually_adjusted: false,
        last_manual_edit_at: null,
        calculation_version: '1',
        note: '=SUM(1,2)', // safe text formula test
        company_identifier: 'ACME_CORP',
        project_identifier: 'PROJ_ALPHA',
        exception_flags: [],
        attendance_id: 'att-1',
        attendance_context_id: 'ctx-1',
      },
    ],
    missingPolicyDates: [],
    hasConfigurationError: false,
  }
}

async function createSyntheticTemplateWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()

  // Sheet 1: 8月 (Target sheet)
  const ws1 = wb.addWorksheet('8月')

  // Set column widths and row heights
  ws1.getColumn('B').width = 15
  ws1.getColumn('F').width = 12
  ws1.getRow(1).height = 28
  ws1.getRow(5).height = 20

  // Static headers with styles & merged cells
  const titleCell = ws1.getCell('A1')
  titleCell.value = '出勤記錄表'
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E293B' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  }
  ws1.mergeCells('A1:H1')

  ws1.getCell('B2').value = '民國 115 年 08 月' // Static year_month target
  ws1.getCell('D2').value = '公司識別碼' // Static company_identifier target
  ws1.getCell('F2').value = '總工時公式：'

  // Unmapped formula cell (must be preserved intact)
  const unmappedFormulaCell = ws1.getCell('F3')
  unmappedFormulaCell.value = { formula: 'SUM(F6:F8)', result: 8 }

  // Table Headers at Row 5 with styling
  ws1.getCell('A5').value = '項次'
  ws1.getCell('B5').value = '日期'
  ws1.getCell('C5').value = '星期'
  ws1.getCell('D5').value = '上班時間'
  ws1.getCell('E5').value = '下班時間'
  ws1.getCell('F5').value = '工時(小時)'
  ws1.getCell('G5').value = '補休' // Unmapped compensatory leave column
  ws1.getCell('H5').value = '備註'

  // Apply border and number format on column F
  ws1.getCell('F6').numFmt = '0.0'
  ws1.getCell('F7').numFmt = '0.0'
  ws1.getCell('F8').numFmt = '0.0'

  // Data rows with dates
  ws1.getCell('B6').value = '2026-08-01'
  ws1.getCell('B7').value = '2026-08-02'
  ws1.getCell('B8').value = '2026-08-03'

  ws1.getCell('G6').value = '原本補休文字1'
  ws1.getCell('G7').value = '原本補休文字2'
  ws1.getCell('G8').value = '原本補休文字3'

  // Sheet 2: 其他月份 (Should remain untouched)
  const ws2 = wb.addWorksheet('9月')
  ws2.getCell('A1').value = '九月份工作表保持不變'

  // Sheet 3: 備份工作表
  const ws3 = wb.addWorksheet('統計備份')
  ws3.getCell('A1').value = '備份'
  ws3.getCell('B1').value = { formula: 'SUM(100, 200)', result: 300 }

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}

describe('Domain: XLSX Export Engine', () => {
  describe('parseDateCellValue', () => {
    it('parses Date object to YYYY-MM-DD', () => {
      const d = new Date(Date.UTC(2026, 7, 10))
      expect(parseDateCellValue(d, '2026-08')).toBe('2026-08-10')
    })

    it('parses ISO date string', () => {
      expect(parseDateCellValue('2026-08-15', '2026-08')).toBe('2026-08-15')
      expect(parseDateCellValue('2026/08/15', '2026-08')).toBe('2026-08-15')
    })

    it('parses single day number or M/D with target month context', () => {
      expect(parseDateCellValue('8/15', '2026-08')).toBe('2026-08-15')
      expect(parseDateCellValue('15', '2026-08')).toBe('2026-08-15')
      expect(parseDateCellValue(15, '2026-08')).toBe('2026-08-15')
    })

    it('returns null for non-date headers or empty cells', () => {
      expect(parseDateCellValue(null, '2026-08')).toBeNull()
      expect(parseDateCellValue('', '2026-08')).toBeNull()
      expect(parseDateCellValue('日期', '2026-08')).toBeNull()
    })
  })

  describe('isFormulaCell helper', () => {
    it('identifies formula cell types correctly', () => {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('test')
      ws.getCell('A1').value = { formula: 'SUM(1,2)', result: 3 }
      ws.getCell('A2').value = 'plain text'
      ws.getCell('A3').value = 42

      expect(isFormulaCell(ws.getCell('A1'))).toBe(true)
      expect(isFormulaCell(ws.getCell('A2'))).toBe(false)
      expect(isFormulaCell(ws.getCell('A3'))).toBe(false)
    })
  })

  describe('exportReportToXlsx Round-trip & Edge Cases', () => {
    const config: ExportTemplateConfig = {
      name: '測試範本',
      monthWorksheetMapping: {
        '2026-08': '8月',
        '2026-09': '9月',
      },
      rowMapping: [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'weekday', targetColumn: 'C', transforms: [{ type: 'WEEKDAY_ZH_TW' }] },
        { sourceField: 'actual_clock_in_at', targetColumn: 'D', transforms: [{ type: 'TIME_HH_MM' }] },
        { sourceField: 'actual_clock_out_at', targetColumn: 'E', transforms: [{ type: 'TIME_HH_MM' }] },
        {
          sourceField: 'net_worked_minutes',
          targetColumn: 'F',
          transforms: [{ type: 'MINUTES_TO_DECIMAL_HOURS' }, { type: 'EMPTY_IF_ZERO' }],
        },
        { sourceField: 'note', targetColumn: 'H' },
      ],
      staticCellMapping: [
        { sourceField: 'year_month', targetCell: 'B2', transforms: [{ type: 'ROC_YEAR_MONTH' }] },
        { sourceField: 'company_identifier', targetCell: 'D2' },
      ],
    }

    it('successfully exports workbook and preserves unmapped sheets/formulas/styles/dimensions', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-08')

      const resultBytes = await exportReportToXlsx({
        templateBytes,
        report,
        config,
        targetMonth: '2026-08',
      })

      expect(resultBytes).toBeInstanceOf(Uint8Array)
      expect(resultBytes.length).toBeGreaterThan(0)

      // Reopen with ExcelJS to verify round-trip fidelity
      const readWb = new ExcelJS.Workbook()
      await readWb.xlsx.load(resultBytes.slice().buffer as ArrayBuffer)

      const ws8 = readWb.getWorksheet('8月')
      expect(ws8).toBeDefined()

      // 1. Verify dimensions preservation
      expect(ws8?.getColumn('B').width).toBe(15)
      expect(ws8?.getColumn('F').width).toBe(12)
      expect(ws8?.getRow(1).height).toBe(28)

      // 2. Verify merged cell and styles preservation
      const titleCell = ws8?.getCell('A1')
      expect(titleCell?.value).toBe('出勤記錄表')
      expect(titleCell?.font?.bold).toBe(true)
      expect(titleCell?.alignment?.horizontal).toBe('center')

      // 3. Verify Static Cell writes
      expect(ws8?.getCell('B2').value).toBe('115 年 08 月')
      expect(ws8?.getCell('D2').value).toBeNull()

      // 4. Verify Row writes
      // 2026-08-01 (Row 6)
      expect(ws8?.getCell('B6').value).toBe('2026-08-01')
      expect(ws8?.getCell('C6').value).toBe('週六')
      expect(ws8?.getCell('D6').value).toBeNull() // No clock in
      expect(ws8?.getCell('E6').value).toBeNull() // No clock out
      expect(ws8?.getCell('F6').value).toBeNull() // 0 net minutes converted to null via EMPTY_IF_ZERO
      expect(ws8?.getCell('F6').numFmt).toBe('0.0') // Preserves number format!

      // 2026-08-03 (Row 8)
      expect(ws8?.getCell('B8').value).toBe('2026-08-03')
      expect(ws8?.getCell('C8').value).toBe('週一')
      expect(ws8?.getCell('D8').value).toBe('09:00')
      expect(ws8?.getCell('E8').value).toBe('18:00')
      expect(ws8?.getCell('F8').value).toBe(8) // 480 mins / 60 = 8

      // 5. Formula injection safety: text '=SUM(1,2)' must be stored as literal string, not formula
      const noteCell = ws8?.getCell('H8')
      expect(noteCell?.value).toBe('=SUM(1,2)')
      expect(typeof noteCell?.value).toBe('string')
      expect(noteCell?.type).not.toBe(ExcelJS.ValueType.Formula)

      // 6. Unmapped compensatory leave column intact
      expect(ws8?.getCell('G6').value).toBe('原本補休文字1')
      expect(ws8?.getCell('G8').value).toBe('原本補休文字3')

      // 7. Unmapped existing formula intact
      const formulaCell = ws8?.getCell('F3')
      expect(formulaCell?.formula).toBe('SUM(F6:F8)')

      // 8. Other worksheets (9月, 統計備份) untouched
      const ws9 = readWb.getWorksheet('9月')
      expect(ws9?.getCell('A1').value).toBe('九月份工作表保持不變')
      const wsBackup = readWb.getWorksheet('統計備份')
      expect(wsBackup?.getCell('B1').formula).toBe('SUM(100, 200)')
    })

    it('prevents destructive formula-cell overwrite on Static Cell target', async () => {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('8月')
      ws.getCell('B6').value = '2026-08-01'
      ws.getCell('B7').value = '2026-08-02'
      ws.getCell('B8').value = '2026-08-03'
      // D2 is a formula cell mapped to company_identifier!
      ws.getCell('D2').value = { formula: 'CONCATENATE("ACME", "_CORP")', result: 'ACME_CORP' }

      const templateBytes = new Uint8Array(await wb.xlsx.writeBuffer())
      const report = createMockReport('2026-08')

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config, // config maps static company_identifier to D2
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'FORMULA_CELL_OVERWRITE' })
      )
    })

    it('prevents destructive formula-cell overwrite on Daily Row target', async () => {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('8月')
      ws.getCell('B6').value = '2026-08-01'
      ws.getCell('B7').value = '2026-08-02'
      ws.getCell('B8').value = '2026-08-03'
      // F8 (mapped to net_worked_minutes) is a formula cell!
      ws.getCell('F8').value = { formula: 'E8-D8', result: 8 }

      const templateBytes = new Uint8Array(await wb.xlsx.writeBuffer())
      const report = createMockReport('2026-08')

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'FORMULA_CELL_OVERWRITE' })
      )
    })

    it('detects Row Mapping and Static Cell Mapping collisions and halts export before writes', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-08')

      // Collision: static target set to D8, which is also written by Daily Row mapping for 2026-08-03
      const collidingConfig: ExportTemplateConfig = {
        ...config,
        staticCellMapping: [
          { sourceField: 'company_identifier', targetCell: 'D8' },
        ],
      }

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config: collidingConfig,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'CELL_COLLISION' })
      )
    })

    it('throws WORKSHEET_MAPPING_MISSING when month not in mapping', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-10')

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config,
          targetMonth: '2026-10',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'WORKSHEET_MAPPING_MISSING' })
      )
    })

    it('throws WORKSHEET_NOT_FOUND when mapped worksheet does not exist in workbook', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-08')
      const badConfig: ExportTemplateConfig = {
        ...config,
        monthWorksheetMapping: { '2026-08': '不存在的工作表' },
      }

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config: badConfig,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'WORKSHEET_NOT_FOUND' })
      )
    })

    it('throws DATE_ROW_MISSING when a report date is not found in the worksheet', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-08')
      // Add a date that is not in the synthetic template (e.g. 2026-08-04)
      report.rows.push({
        ...report.rows[0],
        date: '2026-08-04',
      })

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'DATE_ROW_MISSING' })
      )
    })

    it('throws DATE_ROW_DUPLICATE when date column contains duplicate dates', async () => {
      // Create workbook with duplicate dates in column B
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('8月')
      ws.getCell('B6').value = '2026-08-01'
      ws.getCell('B7').value = '2026-08-01' // Duplicate!
      ws.getCell('B8').value = '2026-08-03'
      const templateBytes = new Uint8Array(await wb.xlsx.writeBuffer())

      const report = createMockReport('2026-08')

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'DATE_ROW_DUPLICATE' })
      )
    })

    it('throws WORKBOOK_UNSUPPORTED for invalid or corrupted template bytes', async () => {
      const corruptBytes = new Uint8Array([0, 1, 2, 3, 4, 5])
      const report = createMockReport('2026-08')

      await expect(
        exportReportToXlsx({
          templateBytes: corruptBytes,
          report,
          config,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'WORKBOOK_UNSUPPORTED' })
      )
    })

    it('throws MAPPING_INVALID when template configuration is invalid', async () => {
      const templateBytes = await createSyntheticTemplateWorkbook()
      const report = createMockReport('2026-08')
      const invalidConfig: ExportTemplateConfig = {
        ...config,
        rowMapping: [
          // Missing date locator!
          { sourceField: 'actual_clock_in_at', targetColumn: 'D' },
        ],
      }

      await expect(
        exportReportToXlsx({
          templateBytes,
          report,
          config: invalidConfig,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'MAPPING_INVALID' })
      )
    })

    it('N/A 日期不寫入 daily row mapping，保留範本原有儲存格內容且不因該格公式中斷匯出', async () => {
      // Create workbook with formula in row 6 (2026-08-01 D6)
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('8月')
      ws.getCell('B6').value = '2026-08-01'
      ws.getCell('D6').value = { formula: 'SUM(1,2)' } // formula cell on N/A date
      ws.getCell('E6').value = 'PRESERVED_ORIGINAL'
      ws.getCell('B7').value = '2026-08-03'
      ws.getCell('D7').value = null
      ws.getCell('E7').value = null

      const customBytes = new Uint8Array(await wb.xlsx.writeBuffer())

      const naReport = {
        yearMonth: '2026-08',
        assignment: {
          id: 'assign-1',
          user_id: 'user-1',
          staffing_employer: '派遣雇主',
          client_company: '客戶公司',
          project: '專案 P',
          effective_from: '2026-08-03', // Aug 1 is outside assignment period
          effective_to: null,
        },
        context: {
          id: 'ctx-1',
          user_id: 'user-1',
          name: '預設情境',
          company_identifier: 'COMPANY_A',
          project_identifier: 'PROJECT_X',
          active: true,
          is_default: true,
        },
        summary: {
          scheduled_minutes: 480,
          leave_minutes: 0,
          absence_minutes: 0,
          regular_minutes: 480,
          overtime_minutes: 0,
          actual_elapsed_minutes: 540,
          net_worked_minutes: 480,
          incomplete_count: 0,
          exception_count: 0,
        },
        rows: [
          {
            date: '2026-08-01',
            weekday: 6,
            weekdayLabel: '週六',
            in_assignment_period: false, // N/A date
            calendar_day_type: 'HOLIDAY',
            calendar_source: 'DEFAULT_WEEKEND',
            calendar_name: null,
            status: null,
            scheduled_minutes: 0,
            actual_clock_in_at: null,
            effective_clock_in_at: null,
            actual_clock_out_at: null,
            effective_clock_out_at: null,
            expected_clock_out_at: null,
            actual_elapsed_minutes: null,
            net_worked_minutes: null,
            regular_minutes: null,
            overtime_minutes: null,
            leave_minutes: 0,
            absence_minutes: 0,
            is_incomplete: false,
            created_source: null,
            manually_adjusted: false,
            last_manual_edit_at: null,
            calculation_version: null,
            note: null,
            company_identifier: 'COMPANY_A',
            project_identifier: 'PROJECT_X',
            exception_flags: [],
            attendance_id: null,
            attendance_context_id: null,
          },
          {
            date: '2026-08-03',
            weekday: 1,
            weekdayLabel: '週一',
            in_assignment_period: true,
            calendar_day_type: 'WORKDAY',
            calendar_source: 'WORK_POLICY',
            calendar_name: null,
            status: null,
            scheduled_minutes: 480,
            actual_clock_in_at: '2026-08-03T01:00:00.000Z',
            effective_clock_in_at: '2026-08-03T01:00:00.000Z',
            actual_clock_out_at: '2026-08-03T10:00:00.000Z',
            effective_clock_out_at: '2026-08-03T10:00:00.000Z',
            expected_clock_out_at: '2026-08-03T10:00:00.000Z',
            actual_elapsed_minutes: 540,
            net_worked_minutes: 480,
            regular_minutes: 480,
            overtime_minutes: 0,
            leave_minutes: 0,
            absence_minutes: 0,
            is_incomplete: false,
            created_source: 'CLOCK',
            manually_adjusted: false,
            last_manual_edit_at: null,
            calculation_version: '1',
            note: 'ATTENDANCE_NOTE',
            company_identifier: 'COMPANY_A',
            project_identifier: 'PROJECT_X',
            exception_flags: [],
            attendance_id: 'att-1',
            attendance_context_id: 'ctx-1',
          },
        ],
        missingPolicyDates: [],
        hasConfigurationError: false,
      }

      const customConfig: ExportTemplateConfig = {
        name: '測試範本',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'D' },
          { sourceField: 'note', targetColumn: 'E' },
        ],
        staticCellMapping: [],
      }

      // Should succeed without throwing FORMULA_CELL_OVERWRITE for D6
      const exportedBytes = await exportReportToXlsx({
        templateBytes: customBytes,
        report: naReport as any,
        config: customConfig,
        targetMonth: '2026-08',
      })

      // Verify original content preserved in row 6
      const exportedWb = new ExcelJS.Workbook()
      await exportedWb.xlsx.load(exportedBytes.slice().buffer as ArrayBuffer)
      const exportedWs = exportedWb.getWorksheet('8月')!

      // D6 formula preserved
      expect(exportedWs.getCell('D6').formula).toBe('SUM(1,2)')
      // E6 original content preserved (not overwritten with blank or dummy company)
      expect(exportedWs.getCell('E6').value).toBe('PRESERVED_ORIGINAL')
      // Row 7 (active date) written
      expect(exportedWs.getCell('E7').value).toBe('ATTENDANCE_NOTE')
    })

    it('月中結束 Assignment：期間內寫入對應儲存格，期間外保留範本儲存格內容', async () => {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('8月')
      ws.getCell('B6').value = '2026-08-10' // in assignment
      ws.getCell('E6').value = null
      ws.getCell('B7').value = '2026-08-25' // outside assignment
      ws.getCell('E7').value = 'RETAIN_THIS_VALUE'

      const customBytes = new Uint8Array(await wb.xlsx.writeBuffer())

      const endReport = {
        yearMonth: '2026-08',
        assignment: {
          id: 'assign-end',
          user_id: 'user-1',
          staffing_employer: '派遣雇主',
          client_company: '客戶公司',
          project: '專案 E',
          effective_from: '2026-08-01',
          effective_to: '2026-08-15',
        },
        rows: [
          {
            date: '2026-08-10',
            weekday: 1,
            calendar_day_type: 'WORKDAY',
            calendar_source: 'DGPA',
            in_assignment_period: true,
            note: 'IN_PERIOD_NOTE',
          },
          {
            date: '2026-08-25',
            weekday: 2,
            calendar_day_type: 'WORKDAY',
            calendar_source: 'DGPA',
            in_assignment_period: false,
            note: 'OUT_OF_PERIOD_NOTE',
          },
        ],
        missingPolicyDates: [],
        hasConfigurationError: false,
      }

      const customConfig: ExportTemplateConfig = {
        name: '測試範本',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'note', targetColumn: 'E' },
        ],
        staticCellMapping: [],
      }

      const exportedBytes = await exportReportToXlsx({
        templateBytes: customBytes,
        report: endReport as any,
        config: customConfig,
        targetMonth: '2026-08',
      })

      const exportedWb = new ExcelJS.Workbook()
      await exportedWb.xlsx.load(exportedBytes.slice().buffer as ArrayBuffer)
      const exportedWs = exportedWb.getWorksheet('8月')!

      expect(exportedWs.getCell('E6').value).toBe('IN_PERIOD_NOTE')
      expect(exportedWs.getCell('E7').value).toBe('RETAIN_THIS_VALUE')
    })

    it('Policy gap（存在未配置制度之工作日）阻擋正式 XLSX 匯出', async () => {
      const customBytes = await createSyntheticTemplateWorkbook()
      const gapReport = {
        yearMonth: '2026-08',
        assignment: {
          id: 'assign-gap',
          user_id: 'user-1',
          staffing_employer: '派遣雇主',
          client_company: '客戶公司',
          project: '專案 G',
          effective_from: '2026-08-01',
          effective_to: '2026-08-31',
        },
        rows: [],
        missingPolicyDates: ['2026-08-03'],
        hasConfigurationError: true,
      }

      const customConfig: ExportTemplateConfig = {
        name: '測試範本',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [{ sourceField: 'date', targetColumn: 'B' }],
        staticCellMapping: [],
      }

      await expect(
        exportReportToXlsx({
          templateBytes: customBytes,
          report: gapReport as any,
          config: customConfig,
          targetMonth: '2026-08',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'CONFIGURATION_ERROR' })
      )
    })

    it('完整 coverage 且使用 assignment static mapping 正常匯出公司與專案名稱', async () => {
      const customBytes = await createSyntheticTemplateWorkbook()
      const fullReport = {
        yearMonth: '2026-08',
        assignment: {
          id: 'assign-full',
          user_id: 'user-1',
          staffing_employer: '派遣雇主',
          client_company: '派駐客戶科技公司',
          project: '核心差勤系統開發',
          effective_from: '2026-08-01',
          effective_to: '2026-08-31',
        },
        rows: [
          {
            date: '2026-08-01',
            weekday: 6,
            calendar_day_type: 'HOLIDAY',
            calendar_source: 'WEEKEND_FALLBACK',
            in_assignment_period: true,
            note: 'FULL_COVERAGE_OK',
          },
        ],
        missingPolicyDates: [],
        hasConfigurationError: false,
      }

      const staticConfig: ExportTemplateConfig = {
        name: '派駐靜態欄位範本',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'note', targetColumn: 'E' },
        ],
        staticCellMapping: [
          { sourceField: 'company_identifier', targetCell: 'B2' },
          { sourceField: 'project_identifier', targetCell: 'B3' },
        ],
      }

      const exportedBytes = await exportReportToXlsx({
        templateBytes: customBytes,
        report: fullReport as any,
        config: staticConfig,
        targetMonth: '2026-08',
      })

      const exportedWb = new ExcelJS.Workbook()
      await exportedWb.xlsx.load(exportedBytes.slice().buffer as ArrayBuffer)
      const exportedWs = exportedWb.getWorksheet('8月')!

      expect(exportedWs.getCell('B2').value).toBeNull() // must NOT guess assignment.client_company
      expect(exportedWs.getCell('B3').value).toBeNull() // must NOT guess assignment.project
      expect(exportedWs.getCell('E6').value).toBe('FULL_COVERAGE_OK')
    })
  })
})
