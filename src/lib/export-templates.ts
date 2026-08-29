import ExcelJS from 'exceljs'
import { getSupabaseClient } from './supabase'
import {
  validateExportTemplateConfig,
  type RowMappingEntry,
  type StaticCellMappingEntry,
} from '../domain/export-template/mapping-validator'

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
  // Validate workbook readability and non-empty sheets
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
    // Cleanup storage object on insert failure
    await supabase.storage.from('export-templates').remove([storagePath])
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

export async function replaceExportTemplate({
  userId,
  currentTemplate,
  newFile,
  newName,
}: ReplaceExportTemplateParams): Promise<ExportTemplate> {
  // 1. Validate new workbook readability
  await getWorkbookWorksheetNames(newFile)

  // 2. Upload to new storage path
  const newTemplateFileId = crypto.randomUUID()
  const newStoragePath = `${userId}/${currentTemplate.context_id}/${newTemplateFileId}/source.xlsx`

  const supabase = getSupabaseClient()
  const { error: uploadError } = await supabase.storage
    .from('export-templates')
    .upload(newStoragePath, newFile, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })

  if (uploadError) {
    throw uploadError
  }

  // 3. Update DB metadata
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
    // Clean up newly uploaded file if DB update failed; preserve old file!
    await supabase.storage.from('export-templates').remove([newStoragePath])
    throw updateError
  }

  // 4. Remove old storage object after successful DB update
  await supabase.storage.from('export-templates').remove([currentTemplate.storage_path])

  return data as ExportTemplate
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

  await supabase.storage.from('export-templates').remove([template.storage_path])
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
