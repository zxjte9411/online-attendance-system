import ExcelJS from 'exceljs'
import { getSupabaseClient } from './supabase'
import {
  validateExportTemplateConfig,
  validateRowMapping,
  type RowMappingEntry,
  type StaticCellMappingEntry,
} from '../domain/export-template/mapping-validator'
import { isFormulaCell, parseDateCellValue } from '../domain/export-template/xlsx-export'
import type { PreviewCellStructureType } from '../domain/export-template/header-reference'

export interface ExportTemplate {
  id: string
  user_id: string
  context_id: string
  name: string
  storage_path: string
  month_worksheet_mapping: Record<string, string>
  row_mapping: RowMappingEntry[]
  static_cell_mapping: StaticCellMappingEntry[]
  created_at: string
  updated_at: string
}

export function validateXlsxFileInput(
  file: File | Blob | Uint8Array | ArrayBuffer
): void {
  if (typeof File !== 'undefined' && file instanceof File) {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx')) {
      throw new Error('僅支援 .xlsx 格式之 Excel 活頁簿，不支援 .xls、.xlsm 或 .csv 檔案。')
    }
    if (file.type) {
      const type = file.type.toLowerCase()
      if (
        type.includes('csv') ||
        type === 'application/vnd.ms-excel' ||
        type.includes('macroenabled')
      ) {
        throw new Error('僅支援 .xlsx 格式之 Excel 活頁簿，不支援 .xls、.xlsm 或 .csv 檔案。')
      }
    }
  }
}

export async function getExportTemplate(
  userId: string,
  contextId: string
): Promise<ExportTemplate | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('export_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('context_id', contextId)
    .maybeSingle()

  if (error) {
    throw error
  }
  return (data as ExportTemplate) ?? null
}

export async function getWorkbookWorksheetNames(
  fileData: ArrayBuffer | Uint8Array | Blob
): Promise<string[]> {
  const buffer = await toArrayBuffer(fileData)

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as any)
  } catch {
    throw new Error('無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。')
  }

  if (workbook.worksheets.length === 0) {
    throw new Error('範本檔案中沒有任何工作表。')
  }

  return workbook.worksheets.map((ws) => ws.name)
}

export interface WorkbookPreviewCell {
  readonly column: string
  readonly rowNumber: number
  readonly text: string
  readonly headerText?: string
  readonly structureType?: PreviewCellStructureType
}

export interface WorkbookPreviewRow {
  readonly rowNumber: number
  readonly isHidden: boolean
  readonly cells: readonly WorkbookPreviewCell[]
}

export interface WorkbookPreviewColumn {
  readonly column: string
  readonly isHidden: boolean
}

export interface WorkbookWorksheetPreview {
  readonly name: string
  readonly isHidden: boolean
  readonly isProtected: boolean
  readonly hasImages: boolean
  readonly columns: readonly WorkbookPreviewColumn[]
  readonly rows: readonly WorkbookPreviewRow[]
}

export interface WorkbookPreview {
  readonly worksheets: readonly WorkbookWorksheetPreview[]
}

const WORKBOOK_PREVIEW_MAX_ROWS = 200
const WORKBOOK_PREVIEW_MAX_COLUMNS = 50
const WORKBOOK_PREVIEW_TRAILING_COLUMNS = 2

export async function getWorkbookPreview(
  fileData: ArrayBuffer | Uint8Array | Blob
): Promise<WorkbookPreview> {
  const buffer = await toArrayBuffer(fileData)
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as any)
  } catch {
    throw new Error('無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。')
  }

  if (workbook.worksheets.length === 0) {
    throw new Error('範本檔案中沒有任何工作表。')
  }

  return {
    worksheets: workbook.worksheets.map((worksheet) => {
      const previewRowCount = Math.min(worksheet.rowCount, WORKBOOK_PREVIEW_MAX_ROWS)
      const previewRows = Array.from({ length: previewRowCount }, (_, index) => {
        const rowNumber = index + 1
        return { rowNumber, row: worksheet.getRow(rowNumber) }
      })
      let rightmostValueColumn = 0
      let rightmostMergedColumn = 0

      for (const { row } of previewRows) {
        row.eachCell((cell) => {
          if (hasPreviewValue(cell) || isFormulaCell(cell) || cell.isMerged) {
            const columnNumber = Number(cell.col)
            rightmostValueColumn = Math.max(rightmostValueColumn, columnNumber)
            if (cell.isMerged && cell.master.address === cell.address) {
              rightmostMergedColumn = Math.max(rightmostMergedColumn, getMergedRangeEndColumn(cell))
            }
          }
        })
      }

      const visibleColumnCount = Math.min(
        WORKBOOK_PREVIEW_MAX_COLUMNS,
        rightmostValueColumn > 0
          ? Math.max(
              rightmostValueColumn + WORKBOOK_PREVIEW_TRAILING_COLUMNS,
              rightmostMergedColumn
            )
          : 0
      )
      const rows: WorkbookPreviewRow[] = []

      for (const { rowNumber, row } of previewRows) {
        const cells: WorkbookPreviewCell[] = []
        row.eachCell((cell) => {
          const columnNumber = Number(cell.col)
          if (
            columnNumber <= visibleColumnCount &&
            (hasPreviewValue(cell) || isMergedMember(cell) || isFormulaCell(cell) || cell.isMerged)
          ) {
            let structureType: PreviewCellStructureType = 'ordinary'
            if (isFormulaCell(cell)) {
              structureType = 'formula'
            } else if (cell.isMerged) {
              structureType = 'merged'
            }
            cells.push({
              column: columnNumberToLetter(columnNumber),
              rowNumber,
              text: previewCellText(cell),
              headerText: previewCellHeaderText(cell),
              structureType,
            })
          }
        })

        rows.push({ rowNumber, isHidden: row.hidden, cells })
      }

      return {
        name: worksheet.name,
        isHidden: worksheet.state !== 'visible',
        isProtected: Boolean(
          (worksheet as ExcelJS.Worksheet & { sheetProtection?: unknown }).sheetProtection
        ),
        hasImages:
          worksheet.getImages().length > 0 || worksheet.getBackgroundImageId() !== undefined,
        columns: Array.from({ length: visibleColumnCount }, (_, index) => {
          const columnNumber = index + 1
          return {
            column: columnNumberToLetter(columnNumber),
            isHidden: worksheet.getColumn(columnNumber).hidden,
          }
        }),
        rows,
      }
    }),
  }
}

async function toArrayBuffer(fileData: ArrayBuffer | Uint8Array | Blob): Promise<ArrayBuffer> {
  if (fileData instanceof Blob) {
    return fileData.arrayBuffer()
  }
  if (fileData instanceof Uint8Array) {
    return fileData.slice().buffer as ArrayBuffer
  }
  return fileData
}

function hasPreviewValue(cell: ExcelJS.Cell): boolean {
  return (
    cell.type !== ExcelJS.ValueType.Merge &&
    cell.value !== null &&
    cell.value !== undefined &&
    cell.value !== ''
  )
}

function isMergedMember(cell: ExcelJS.Cell): boolean {
  return cell.isMerged && cell.master.address !== cell.address
}

function previewCellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) {
    const formatted = formatExcelDateTime(cell.value, cell.numFmt)
    if (formatted) return formatted
  }

  if (isFormulaCell(cell)) {
    const result = cell.result as unknown
    if (result !== undefined && result !== null) {
      if (isCellErrorValue(result)) return `ƒ ${result.error}`
      if (result instanceof Date) {
        const formatted = formatExcelDateTime(result, cell.numFmt)
        if (formatted) return `ƒ ${formatted}`
      }
      if (typeof result === 'object') {
        if (cell.text && cell.text !== '[object Object]') return `ƒ ${cell.text}`
        const formula = cell.formula || formulaFromValue(cell.value)
        return `ƒ =${formula.replace(/^=/, '')}`
      }
      return `ƒ ${String(result)}`
    }

    const formula = cell.formula || formulaFromValue(cell.value)
    return `ƒ =${formula.replace(/^=/, '')}`
  }

  if (isMergedMember(cell)) {
    return `↖ merged ${getMergedRange(cell)}`
  }

  return cell.text || String(cell.value)
}

function previewCellHeaderText(cell: ExcelJS.Cell): string {
  const target = cell.isMerged ? cell.master : cell
  if (target.value instanceof Date) {
    const formatted = formatExcelDateTime(target.value, target.numFmt)
    if (formatted) return formatted
  }

  if (isFormulaCell(target)) {
    const result = target.result as unknown
    if (result !== undefined && result !== null) {
      if (isCellErrorValue(result)) return result.error
      if (result instanceof Date) {
        const formatted = formatExcelDateTime(result, target.numFmt)
        if (formatted) return formatted
      }
      if (typeof result === 'object') {
        if (target.text && target.text !== '[object Object]') return target.text
        return ''
      }
      return String(result)
    }
  }

  return target.text || (target.value !== null && target.value !== undefined ? String(target.value) : '')
}

function isCellErrorValue(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  )
}

function formulaFromValue(value: ExcelJS.CellValue): string {
  if (typeof value === 'object' && value !== null && 'formula' in value) {
    return value.formula || ''
  }
  return ''
}

function getMergedRange(cell: ExcelJS.Cell): string {
  const address = cell.master.address
  const range = cell.worksheet.model.merges.find((merge) => merge.startsWith(`${address}:`))
  return range || address
}

function getMergedRangeEndColumn(cell: ExcelJS.Cell): number {
  const endAddress = getMergedRange(cell).split(':').at(-1) || cell.master.address
  const match = /^\$?([A-Z]+)\$?\d+$/i.exec(endAddress)
  if (!match) return Number(cell.col)

  return match[1].toUpperCase().split('').reduce(
    (columnNumber, letter) => columnNumber * 26 + letter.charCodeAt(0) - 64,
    0
  )
}

function formatExcelDateTime(value: Date, numFmt: string | undefined): string | null {
  if (!numFmt) return null

  const format = numFmt
    .replace(/\[[^\]]*\]/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
  const timeMatch = /(h+)([:.])(m+)(?::(s+))?/i.exec(format)
  const dateFormat = timeMatch ? format.slice(0, timeMatch.index) : format
  const dateTokens = dateFormat.match(/y+|m+|d+/gi)
  const hasAmPm = /am\/pm/i.test(format)
  let result = ''

  if (dateTokens?.length) {
    const dateValues = dateTokens.map((token) => {
      const lowerToken = token.toLowerCase()
      if (lowerToken[0] === 'y') {
        const year = value.getUTCFullYear()
        return token.length >= 4 ? String(year) : String(year).slice(-2)
      }
      if (lowerToken[0] === 'm') {
        const month = value.getUTCMonth() + 1
        return token.length >= 2 ? String(month).padStart(2, '0') : String(month)
      }
      const day = value.getUTCDate()
      return token.length >= 2 ? String(day).padStart(2, '0') : String(day)
    })
    const separators = dateFormat.match(/[./-]/g) || []
    result = dateValues.reduce(
      (text, dateValue, index) => text + (index > 0 ? separators[index - 1] || '/' : '') + dateValue,
      ''
    )
  }

  if (timeMatch) {
    const [, hourToken, separator, minuteToken, secondToken] = timeMatch
    const rawHour = value.getUTCHours()
    const hour = hasAmPm ? rawHour % 12 || 12 : rawHour
    const time = `${hourToken.length >= 2 ? String(hour).padStart(2, '0') : hour}${separator}${String(
      value.getUTCMinutes()
    ).padStart(2, '0')}${secondToken ? `:${String(value.getUTCSeconds()).padStart(2, '0')}` : ''}`
    result += `${result ? ' ' : ''}${time}${hasAmPm ? (rawHour >= 12 ? ' PM' : ' AM') : ''}`
  }

  return result || null
}

function columnNumberToLetter(columnNumber: number): string {
  let column = columnNumber
  let letters = ''
  while (column > 0) {
    const remainder = (column - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    column = Math.floor((column - 1) / 26)
  }
  return letters
}

export interface UploadExportTemplateParams {
  userId: string
  contextId: string
  name: string
  file: File | Blob | Uint8Array | ArrayBuffer
}

export async function uploadExportTemplate({
  userId,
  contextId,
  name,
  file,
}: UploadExportTemplateParams): Promise<ExportTemplate> {
  // 1. Validate file extension and MIME
  validateXlsxFileInput(file)

  // 2. Validate workbook readability and non-empty sheets
  await getWorkbookWorksheetNames(file)

  const templateId = crypto.randomUUID()
  const storagePath = `${userId}/${contextId}/${templateId}/source.xlsx`

  let uploadBody: Blob | Uint8Array | ArrayBuffer
  if (file instanceof Blob || file instanceof Uint8Array || file instanceof ArrayBuffer) {
    uploadBody = file
  } else {
    uploadBody = file
  }

  const supabase = getSupabaseClient()
  const { error: uploadError } = await supabase.storage
    .from('export-templates')
    .upload(storagePath, uploadBody, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })

  if (uploadError) {
    throw uploadError
  }

  // Prepopulate default row mapping with date on column B
  const initialRowMapping: RowMappingEntry[] = [
    { sourceField: 'date', targetColumn: 'B' },
  ]

  const { data, error: insertError } = await supabase
    .from('export_templates')
    .insert({
      id: templateId,
      user_id: userId,
      context_id: contextId,
      name: name.trim(),
      storage_path: storagePath,
      month_worksheet_mapping: {},
      row_mapping: initialRowMapping,
      static_cell_mapping: [],
    })
    .select()
    .single()

  if (insertError) {
    // Best-effort cleanup storage object on insert failure
    try {
      await supabase.storage.from('export-templates').remove([storagePath])
    } catch {
      // preserve primary insertError
    }
    throw insertError
  }

  return data as ExportTemplate
}

export interface SaveExportTemplateMappingParams {
  userId: string
  templateId: string
  name: string
  monthWorksheetMapping: Record<string, string>
  rowMapping: RowMappingEntry[]
  staticCellMapping: StaticCellMappingEntry[]
}

export async function saveExportTemplateMapping({
  userId,
  templateId,
  name,
  monthWorksheetMapping,
  rowMapping,
  staticCellMapping,
}: SaveExportTemplateMappingParams): Promise<ExportTemplate> {
  const validation = validateExportTemplateConfig({
    name,
    monthWorksheetMapping,
    rowMapping,
    staticCellMapping,
  })

  if (!validation.isValid) {
    throw new Error(validation.errors.join('；'))
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('export_templates')
    .update({
      name: name.trim(),
      month_worksheet_mapping: monthWorksheetMapping,
      row_mapping: rowMapping,
      static_cell_mapping: staticCellMapping,
    })
    .eq('user_id', userId)
    .eq('id', templateId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ExportTemplate
}

export interface ReplaceExportTemplateParams {
  userId: string
  currentTemplate: ExportTemplate
  newFile: File | Blob | Uint8Array | ArrayBuffer
  newName?: string
}

export interface ReplaceExportTemplateResult {
  template: ExportTemplate
  warning?: string | null
}

export async function replaceExportTemplate({
  userId,
  currentTemplate,
  newFile,
  newName,
}: ReplaceExportTemplateParams): Promise<ReplaceExportTemplateResult> {
  // 1. Validate file extension and MIME
  validateXlsxFileInput(newFile)

  // 2. Validate current persisted row mapping configuration and require valid date locator
  const rowMappingValidation = validateRowMapping(currentTemplate.row_mapping || [])
  if (!rowMappingValidation.isValid) {
    throw new Error(`目前範本設定無效，無法執行替換：${rowMappingValidation.errors.join('；')}`)
  }

  const dateLocator = currentTemplate.row_mapping.find((e) => e.sourceField === 'date')
  if (!dateLocator || !dateLocator.targetColumn || !dateLocator.targetColumn.trim()) {
    throw new Error('目前範本缺少有效的日期定位欄位（date locator），無法替換。')
  }
  const dateCol = dateLocator.targetColumn.trim().toUpperCase()

  // 3. Validate new workbook readability and get sheets
  let buffer: ArrayBuffer
  if (newFile instanceof Blob) {
    buffer = await newFile.arrayBuffer()
  } else if (newFile instanceof Uint8Array) {
    buffer = newFile.slice().buffer as ArrayBuffer
  } else {
    buffer = newFile
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as any)
  } catch {
    throw new Error('無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。')
  }

  if (workbook.worksheets.length === 0) {
    throw new Error('範本檔案中沒有任何工作表。')
  }

  // 4. Compatibility Validation against current persisted configuration
  const configuredMonths = Object.entries(currentTemplate.month_worksheet_mapping || {})

  for (const [month, sheetName] of configuredMonths) {
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) {
      throw new Error(
        `新範本檔案缺少目前已設定的月份工作表「${sheetName}」（對應月份 ${month}），無法替換。請先調整月份對應或提供包含該工作表的檔案。`
      )
    }

    const seenDates = new Set<string>()
    let foundDatesCount = 0
    const rowCount = Math.max(worksheet.rowCount, 100)

    for (let r = 1; r <= rowCount; r++) {
      const cell = worksheet.getCell(`${dateCol}${r}`)
      const parsedDate = parseDateCellValue(cell.value, month)
      if (parsedDate && parsedDate.startsWith(month)) {
        if (seenDates.has(parsedDate)) {
          throw new Error(
            `新範本工作表「${sheetName}」在欄位 ${dateCol} 出現重複日期「${parsedDate}」，無法替換。`
          )
        }
        seenDates.add(parsedDate)
        foundDatesCount++
      }
    }

    if (foundDatesCount === 0) {
      throw new Error(
        `新範本工作表「${sheetName}」在欄位 ${dateCol} 未找到任何對應月份 ${month} 的日期資料，無法替換。請確認日期定位欄位或工作表內容。`
      )
    }
  }

  // 4. Upload to new storage path
  const newTemplateFileId = crypto.randomUUID()
  const newStoragePath = `${userId}/${currentTemplate.context_id}/${newTemplateFileId}/source.xlsx`

  let uploadBody: Blob | Uint8Array | ArrayBuffer
  if (newFile instanceof Blob || newFile instanceof Uint8Array || newFile instanceof ArrayBuffer) {
    uploadBody = newFile
  } else {
    uploadBody = newFile
  }

  const supabase = getSupabaseClient()
  const { error: uploadError } = await supabase.storage
    .from('export-templates')
    .upload(newStoragePath, uploadBody, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })

  if (uploadError) {
    throw uploadError
  }

  // 5. Update DB metadata
  const { data, error: updateError } = await supabase
    .from('export_templates')
    .update({
      name: newName ? newName.trim() : currentTemplate.name,
      storage_path: newStoragePath,
    })
    .eq('user_id', userId)
    .eq('id', currentTemplate.id)
    .select()
    .single()

  if (updateError) {
    // Best-effort cleanup of new file; preserve original DB record and old storage file
    try {
      await supabase.storage.from('export-templates').remove([newStoragePath])
    } catch {
      // preserve primary updateError
    }
    throw updateError
  }

  // 6. Remove old storage object after successful DB update
  const { error: removeOldError } = await supabase.storage
    .from('export-templates')
    .remove([currentTemplate.storage_path])

  let warning: string | null = null
  if (removeOldError) {
    console.warn(`Old template storage object removal warning: ${removeOldError.message}`)
    warning = `舊範本檔案清理失敗：${removeOldError.message || 'Storage error'}`
  }

  return {
    template: data as ExportTemplate,
    warning,
  }
}

export async function deleteExportTemplate(
  userId: string,
  template: ExportTemplate
): Promise<void> {
  const supabase = getSupabaseClient()
  const { error: deleteError } = await supabase
    .from('export_templates')
    .delete()
    .eq('user_id', userId)
    .eq('id', template.id)

  if (deleteError) {
    throw deleteError
  }

  const { error: removeError } = await supabase.storage
    .from('export-templates')
    .remove([template.storage_path])

  if (removeError) {
    throw new Error(
      `範本資料庫紀錄已刪除，但儲存庫檔案清理失敗：${removeError.message || 'Storage error'}`
    )
  }
}

export async function downloadExportTemplateFile(
  storagePath: string
): Promise<ArrayBuffer> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.storage
    .from('export-templates')
    .download(storagePath)

  if (error || !data) {
    throw error || new Error('下載範本檔案失敗。')
  }

  return await data.arrayBuffer()
}
