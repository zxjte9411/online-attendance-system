import ExcelJS from 'exceljs'
import { getSupabaseClient } from './supabase'
import {
  validateExportTemplateConfig,
  validateRowMapping,
  type RowMappingEntry,
  type StaticCellMappingEntry,
} from '../domain/export-template/mapping-validator'
import { parseDateCellValue } from '../domain/export-template/xlsx-export'

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
  let buffer: ArrayBuffer
  if (fileData instanceof Blob) {
    buffer = await fileData.arrayBuffer()
  } else if (fileData instanceof Uint8Array) {
    buffer = fileData.slice().buffer as ArrayBuffer
  } else {
    buffer = fileData
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

  return workbook.worksheets.map((ws) => ws.name)
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
