import { ALLOWED_TRANSFORMS, type TransformConfig } from './transforms'

export const REPORT_MODEL_SOURCE_FIELDS = [
  'date',
  'weekday',
  'actual_clock_in_at',
  'effective_clock_in_at',
  'actual_clock_out_at',
  'effective_clock_out_at',
  'expected_clock_out_at',
  'scheduled_minutes',
  'actual_elapsed_minutes',
  'net_worked_minutes',
  'regular_minutes',
  'overtime_minutes',
  'leave_minutes',
  'absence_minutes',
  'created_source',
  'manually_adjusted',
  'calculation_version',
  'status',
  'note',
] as const

export type ReportModelSourceField = (typeof REPORT_MODEL_SOURCE_FIELDS)[number]

export const STATIC_SOURCE_FIELDS = [
  'year_month',
  'company_identifier',
  'project_identifier',
] as const

export type StaticSourceField = (typeof STATIC_SOURCE_FIELDS)[number]

export interface RowMappingEntry {
  sourceField: ReportModelSourceField
  targetColumn: string
  transforms?: TransformConfig[]
}

export interface StaticCellMappingEntry {
  sourceField: StaticSourceField
  targetCell: string
  transforms?: TransformConfig[]
}

export interface ExportTemplateConfig {
  name: string
  monthWorksheetMapping: Record<string, string>
  rowMapping: RowMappingEntry[]
  staticCellMapping: StaticCellMappingEntry[]
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

const COLUMN_REGEX = /^[A-Za-z]+$/
const CELL_A1_REGEX = /^[A-Za-z]+[1-9][0-9]*$/
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/

export function validateMonthWorksheetMapping(
  mapping: Record<string, string>
): ValidationResult {
  const errors: string[] = []
  if (!mapping || typeof mapping !== 'object') {
    return { isValid: false, errors: ['月份對應設定必須為物件。'] }
  }

  const entries = Object.entries(mapping)
  for (const [key, sheetName] of entries) {
    if (!MONTH_KEY_REGEX.test(key)) {
      errors.push(`月份格式錯誤：「${key}」，必須為 YYYY-MM（例如 2026-08）。`)
    }
    if (!sheetName || !sheetName.trim()) {
      errors.push(`月份「${key}」未設定工作表名稱。`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function validateRowMapping(
  entries: RowMappingEntry[]
): ValidationResult {
  const errors: string[] = []
  if (!Array.isArray(entries)) {
    return { isValid: false, errors: ['Row mapping 必須為陣列。'] }
  }

  const dateLocators = entries.filter((e) => e.sourceField === 'date')
  if (dateLocators.length === 0) {
    errors.push('Row mapping 必須包含一個 date 日期定位欄位。')
  } else if (dateLocators.length > 1) {
    errors.push('Row mapping 只能設定一個 date 日期定位欄位。')
  }

  const seenColumns = new Set<string>()

  for (const entry of entries) {
    if (!REPORT_MODEL_SOURCE_FIELDS.includes(entry.sourceField)) {
      errors.push(`不支援的欄位：「${entry.sourceField}」。`)
    }

    const col = (entry.targetColumn || '').trim().toUpperCase()
    if (!COLUMN_REGEX.test(col)) {
      errors.push(`無效的欄位代號：「${entry.targetColumn}」，必須為英文字母（如 A, B, AA）。`)
    } else {
      if (seenColumns.has(col)) {
        errors.push(`目標欄位「${col}」重複設定。`)
      }
      seenColumns.add(col)
    }

    if (entry.transforms) {
      for (const t of entry.transforms) {
        if (!ALLOWED_TRANSFORMS.includes(t.type)) {
          errors.push(`不支援的轉換規則：「${t.type}」。`)
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function validateStaticCellMapping(
  entries: StaticCellMappingEntry[]
): ValidationResult {
  const errors: string[] = []
  if (!Array.isArray(entries)) {
    return { isValid: false, errors: ['Static cell mapping 必須為陣列。'] }
  }

  const seenCells = new Set<string>()

  for (const entry of entries) {
    if (!STATIC_SOURCE_FIELDS.includes(entry.sourceField)) {
      errors.push(`不支援的靜態欄位：「${entry.sourceField}」。`)
    }

    const cell = (entry.targetCell || '').trim().toUpperCase()
    if (!CELL_A1_REGEX.test(cell)) {
      errors.push(`無效的儲存格位置：「${entry.targetCell}」，必須為 A1 格式（如 B2, C10）。`)
    } else {
      if (seenCells.has(cell)) {
        errors.push(`目標儲存格「${cell}」重複設定。`)
      }
      seenCells.add(cell)
    }

    if (entry.transforms) {
      for (const t of entry.transforms) {
        if (!ALLOWED_TRANSFORMS.includes(t.type)) {
          errors.push(`不支援的轉換規則：「${t.type}」。`)
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function validateExportTemplateConfig(
  config: ExportTemplateConfig
): ValidationResult {
  const errors: string[] = []

  if (!config.name || !config.name.trim()) {
    errors.push('請填寫範本名稱。')
  }

  const monthRes = validateMonthWorksheetMapping(config.monthWorksheetMapping)
  errors.push(...monthRes.errors)

  const rowRes = validateRowMapping(config.rowMapping)
  errors.push(...rowRes.errors)

  const staticRes = validateStaticCellMapping(config.staticCellMapping)
  errors.push(...staticRes.errors)

  return {
    isValid: errors.length === 0,
    errors,
  }
}
