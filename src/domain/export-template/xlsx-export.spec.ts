import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  exportReportToXlsx,
  parseDateCellValue,
  ExportError,
} from './xlsx-export'
import type { ExportTemplateConfig } from './mapping-validator'
import type { MonthlyReport } from '../report/monthly-report'

function createMockReport(yearMonth = '2026-08'): MonthlyReport {
  return {
    yearMonth,
    context: {
      id: 'ctx-1',
      user_id: 'user-1',
      name: '預設情境',
      company_identifier: 'ACME_CORP',
      project_identifier: 'PROJ_ALPHA',
      active: true,
      is_default: true,
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
  
  // Static headers & unmapped formulas
  ws1.getCell('A1').value = '出勤記錄表'
  ws1.getCell('B2').value = '民國 115 年 08 月' // Static year_month target
  ws1.getCell('D2').value = '公司識別碼' // Static company_identifier target
  ws1.getCell('F2').value = '未對應公式'
  ws1.getCell('F3').value = { formula: 'SUM(10, 20)', result: 30 } // Existing formula preservation

  // Merged cells
  ws1.mergeCells('A1:D1')

  // Table Headers at Row 5
  ws1.getCell('A5').value = '項次'
  ws1.getCell('B5').value = '日期'
  ws1.getCell('C5').value = '星期'
  ws1.getCell('D5').value = '上班時間'
  ws1.getCell('E5').value = '下班時間'
  ws1.getCell('F5').value = '工時(小時)'
  ws1.getCell('G5').value = '補休' // Unmapped compensatory leave column
  ws1.getCell('H5').value = '備註'

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

  describe('exportReportToXlsx Round-trip', () => {
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
        { sourceField: 'net_worked_minutes', targetColumn: 'F', transforms: [{ type: 'MINUTES_TO_DECIMAL_HOURS' }, { type: 'EMPTY_IF_ZERO' }] },
        { sourceField: 'note', targetColumn: 'H' },
      ],
      staticCellMapping: [
        { sourceField: 'year_month', targetCell: 'B2', transforms: [{ type: 'ROC_YEAR_MONTH' }] },
        { sourceField: 'company_identifier', targetCell: 'D2' },
      ],
    }

    it('successfully exports workbook and preserves unmapped sheets/formulas/styles', async () => {
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

      // Verify Static Cell writes
      expect(ws8?.getCell('B2').value).toBe('115 年 08 月')
      expect(ws8?.getCell('D2').value).toBe('ACME_CORP')

      // Verify Row writes
      // 2026-08-01 (Row 6)
      expect(ws8?.getCell('B6').value).toBe('2026-08-01')
      expect(ws8?.getCell('C6').value).toBe('週六')
      expect(ws8?.getCell('D6').value).toBeNull() // No clock in
      expect(ws8?.getCell('E6').value).toBeNull() // No clock out
      expect(ws8?.getCell('F6').value).toBeNull() // 0 net minutes converted to null via EMPTY_IF_ZERO

      // 2026-08-03 (Row 8)
      expect(ws8?.getCell('B8').value).toBe('2026-08-03')
      expect(ws8?.getCell('C8').value).toBe('週一')
      expect(ws8?.getCell('D8').value).toBe('09:00')
      expect(ws8?.getCell('E8').value).toBe('18:00')
      expect(ws8?.getCell('F8').value).toBe(8) // 480 mins / 60 = 8

      // Formula injection safety: text '=SUM(1,2)' must be stored as literal string, not formula
      const noteCell = ws8?.getCell('H8')
      expect(noteCell?.value).toBe('=SUM(1,2)')
      expect(typeof noteCell?.value).toBe('string')
      expect(noteCell?.type).not.toBe(ExcelJS.ValueType.Formula)

      // Unmapped compensatory leave column intact
      expect(ws8?.getCell('G6').value).toBe('原本補休文字1')
      expect(ws8?.getCell('G8').value).toBe('原本補休文字3')

      // Unmapped existing formula intact
      const formulaCell = ws8?.getCell('F3')
      expect(formulaCell?.formula).toBe('SUM(10, 20)')

      // Other worksheet (9月) untouched
      const ws9 = readWb.getWorksheet('9月')
      expect(ws9?.getCell('A1').value).toBe('九月份工作表保持不變')
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
  })
})
