import ExcelJS from 'exceljs'
import type { ExportTemplateConfig } from './mapping-validator'
import type { MonthlyReport } from '../report/monthly-report'
import { applyTransformPipeline } from './transforms'

export type ExportErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'WORKSHEET_MAPPING_MISSING'
  | 'WORKSHEET_NOT_FOUND'
  | 'DATE_LOCATOR_INVALID'
  | 'DATE_ROW_MISSING'
  | 'DATE_ROW_DUPLICATE'
  | 'MAPPING_INVALID'
  | 'TRANSFORM_INVALID'
  | 'WORKBOOK_UNSUPPORTED'

export class ExportError extends Error {
  code: ExportErrorCode

  constructor(code: ExportErrorCode, message: string) {
    super(message)
    this.name = 'ExportError'
    this.code = code
  }
}

export function parseDateCellValue(
  value: unknown,
  targetMonth: string
): string | null {
  if (value === null || value === undefined || value === '') return null

  // Unwrap rich text or formula result objects if present
  if (typeof value === 'object') {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null
      const y = value.getUTCFullYear()
      const m = String(value.getUTCMonth() + 1).padStart(2, '0')
      const d = String(value.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    if ('text' in (value as any) && typeof (value as any).text === 'string') {
      return parseDateCellValue((value as any).text, targetMonth)
    }
    if ('result' in (value as any)) {
      return parseDateCellValue((value as any).result, targetMonth)
    }
    return null
  }

  // Handle numbers
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1 && value <= 31) {
      const day = String(value).padStart(2, '0')
      return `${targetMonth}-${day}`
    }
    // Excel date serial number (typically > 20000 for recent dates)
    if (value > 20000 && value < 80000) {
      const utcMs = (value - 25569) * 86400 * 1000
      const date = new Date(utcMs)
      if (!Number.isNaN(date.getTime())) {
        const y = date.getUTCFullYear()
        const m = String(date.getUTCMonth() + 1).padStart(2, '0')
        const d = String(date.getUTCDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
    }
    return null
  }

  const str = String(value).trim()
  if (!str) return null

  // YYYY-MM-DD or YYYY/MM/DD
  const fullMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str)
  if (fullMatch) {
    const y = fullMatch[1]
    const m = fullMatch[2].padStart(2, '0')
    const d = fullMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // M/D or M月D日
  const monthDayMatch = /^(\d{1,2})[/-月](\d{1,2})[日號]?$/.exec(str)
  if (monthDayMatch) {
    const [targetYear] = targetMonth.split('-')
    const m = monthDayMatch[1].padStart(2, '0')
    const d = monthDayMatch[2].padStart(2, '0')
    return `${targetYear}-${m}-${d}`
  }

  // Single day number like "1", "15", "15日"
  const singleDayMatch = /^(\d{1,2})[日號]?$/.exec(str)
  if (singleDayMatch) {
    const d = singleDayMatch[1].padStart(2, '0')
    const num = Number(singleDayMatch[1])
    if (num >= 1 && num <= 31) {
      return `${targetMonth}-${d}`
    }
  }

  return null
}

export interface ExportReportToXlsxParams {
  templateBytes: ArrayBuffer | Uint8Array | Buffer
  report: MonthlyReport
  config: ExportTemplateConfig
  targetMonth: string
}

export async function exportReportToXlsx({
  templateBytes,
  report,
  config,
  targetMonth,
}: ExportReportToXlsxParams): Promise<Uint8Array> {
  if (!templateBytes || (templateBytes instanceof Uint8Array && templateBytes.length === 0)) {
    throw new ExportError('TEMPLATE_NOT_FOUND', '找不到 XLSX 範本內容。')
  }

  const worksheetName = config.monthWorksheetMapping[targetMonth]
  if (!worksheetName || !worksheetName.trim()) {
    throw new ExportError(
      'WORKSHEET_MAPPING_MISSING',
      `尚未設定月份「${targetMonth}」對應的工作表名稱。`
    )
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(templateBytes as any)
  } catch {
    throw new ExportError(
      'WORKBOOK_UNSUPPORTED',
      '無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。'
    )
  }

  const worksheet = workbook.getWorksheet(worksheetName)
  if (!worksheet) {
    throw new ExportError(
      'WORKSHEET_NOT_FOUND',
      `範本中找不到名為「${worksheetName}」的工作表。`
    )
  }

  const dateLocator = config.rowMapping.find((e) => e.sourceField === 'date')
  if (!dateLocator || !dateLocator.targetColumn) {
    throw new ExportError(
      'DATE_LOCATOR_INVALID',
      '範本 Row mapping 缺少 date 日期定位欄位設定。'
    )
  }
  const dateCol = dateLocator.targetColumn.trim().toUpperCase()

  // Build date -> row map
  const dateRowMap = new Map<string, number>()
  const rowCount = Math.max(worksheet.rowCount, 100)

  for (let r = 1; r <= rowCount; r++) {
    const cell = worksheet.getCell(`${dateCol}${r}`)
    const parsedDate = parseDateCellValue(cell.value, targetMonth)
    if (parsedDate && parsedDate.startsWith(targetMonth)) {
      if (dateRowMap.has(parsedDate)) {
        throw new ExportError(
          'DATE_ROW_DUPLICATE',
          `工作表「${worksheetName}」在第 ${r} 列與第 ${dateRowMap.get(parsedDate)} 列出現重複日期「${parsedDate}」。`
        )
      }
      dateRowMap.set(parsedDate, r)
    }
  }

  // Validate all report dates exist in the worksheet
  for (const reportRow of report.rows) {
    if (!dateRowMap.has(reportRow.date)) {
      throw new ExportError(
        'DATE_ROW_MISSING',
        `在工作表「${worksheetName}」欄位 ${dateCol} 找不到日期「${reportRow.date}」對應的列。`
      )
    }
  }

  // 1. Write Static Cell Mappings
  for (const staticEntry of config.staticCellMapping) {
    let rawValue: unknown = null
    if (staticEntry.sourceField === 'year_month') {
      rawValue = targetMonth
    } else if (staticEntry.sourceField === 'company_identifier') {
      rawValue = report.context.company_identifier
    } else if (staticEntry.sourceField === 'project_identifier') {
      rawValue = report.context.project_identifier
    }

    try {
      const transformed = applyTransformPipeline(rawValue, staticEntry.transforms)
      const cell = worksheet.getCell(staticEntry.targetCell)
      if (transformed === null || transformed === undefined) {
        cell.value = null
      } else {
        cell.value = transformed as any
      }
    } catch (err) {
      throw new ExportError(
        'TRANSFORM_INVALID',
        `靜態欄位「${staticEntry.sourceField}」轉換失敗：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // 2. Write Daily Row Mappings
  for (const reportRow of report.rows) {
    const rowNum = dateRowMap.get(reportRow.date)!

    for (const rowEntry of config.rowMapping) {
      let rawValue: unknown = reportRow[rowEntry.sourceField]

      try {
        const transformed = applyTransformPipeline(rawValue, rowEntry.transforms)
        const cell = worksheet.getCell(`${rowEntry.targetColumn.toUpperCase()}${rowNum}`)
        if (transformed === null || transformed === undefined) {
          cell.value = null
        } else {
          cell.value = transformed as any
        }
      } catch (err) {
        throw new ExportError(
          'TRANSFORM_INVALID',
          `日期「${reportRow.date}」欄位「${rowEntry.sourceField}」轉換失敗：${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  const outputBuffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(outputBuffer)
}
