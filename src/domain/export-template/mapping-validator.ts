import {
  ALLOWED_TRANSFORMS,
  type TransformConfig,
  type TransformType,
  type ValueMapOptions,
  type RocYearMonthOptions,
} from './transforms'

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

export type FieldDataType =
  | 'MINUTES'
  | 'DATETIME'
  | 'DATE'
  | 'WEEKDAY'
  | 'YEAR_MONTH'
  | 'STRING'
  | 'BOOLEAN'
  | 'NUMBER'
  | 'ANY'

export const SOURCE_FIELD_DATA_TYPES: Record<
  ReportModelSourceField | StaticSourceField,
  FieldDataType
> = {
  date: 'DATE',
  weekday: 'WEEKDAY',
  actual_clock_in_at: 'DATETIME',
  effective_clock_in_at: 'DATETIME',
  actual_clock_out_at: 'DATETIME',
  effective_clock_out_at: 'DATETIME',
  expected_clock_out_at: 'DATETIME',
  scheduled_minutes: 'MINUTES',
  actual_elapsed_minutes: 'MINUTES',
  net_worked_minutes: 'MINUTES',
  regular_minutes: 'MINUTES',
  overtime_minutes: 'MINUTES',
  leave_minutes: 'MINUTES',
  absence_minutes: 'MINUTES',
  created_source: 'STRING',
  manually_adjusted: 'BOOLEAN',
  calculation_version: 'STRING',
  status: 'STRING',
  note: 'STRING',
  year_month: 'YEAR_MONTH',
  company_identifier: 'STRING',
  project_identifier: 'STRING',
}

export interface TransformTypeContract {
  allowedInputs: FieldDataType[]
  outputType: (input: FieldDataType) => FieldDataType
}

export const TRANSFORM_CONTRACTS: Record<TransformType, TransformTypeContract> = {
  MINUTES_TO_DECIMAL_HOURS: {
    allowedInputs: ['MINUTES', 'NUMBER'],
    outputType: () => 'NUMBER',
  },
  TIME_HH_MM: {
    allowedInputs: ['DATETIME'],
    outputType: () => 'STRING',
  },
  DATE_YYYY_MM_DD: {
    allowedInputs: ['DATE', 'DATETIME'],
    outputType: () => 'DATE',
  },
  WEEKDAY_ZH_TW: {
    allowedInputs: ['WEEKDAY', 'DATE', 'DATETIME'],
    outputType: () => 'STRING',
  },
  ROC_YEAR_MONTH: {
    allowedInputs: ['YEAR_MONTH', 'DATE'],
    outputType: () => 'STRING',
  },
  EMPTY_IF_ZERO: {
    allowedInputs: ['MINUTES', 'NUMBER', 'STRING', 'BOOLEAN', 'ANY'],
    outputType: (input) => input,
  },
  ZERO_IF_EMPTY: {
    allowedInputs: ['MINUTES', 'NUMBER', 'STRING', 'BOOLEAN', 'ANY'],
    outputType: (input) => (input === 'MINUTES' ? 'MINUTES' : 'NUMBER'),
  },
  VALUE_MAP: {
    allowedInputs: [
      'MINUTES',
      'DATETIME',
      'DATE',
      'WEEKDAY',
      'YEAR_MONTH',
      'STRING',
      'BOOLEAN',
      'NUMBER',
      'ANY',
    ],
    outputType: () => 'STRING',
  },
}

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

export function validateTransformOptions(config: TransformConfig): string[] {
  const errors: string[] = []
  if (config.type === 'VALUE_MAP') {
    const opts = config.options as ValueMapOptions | undefined
    if (!opts || typeof opts !== 'object' || !opts.map || typeof opts.map !== 'object') {
      errors.push('VALUE_MAP 必須設定 map 對應表。')
    } else {
      const keys = Object.keys(opts.map)
      if (keys.length === 0) {
        errors.push('VALUE_MAP 必須設定至少一組鍵值對應。')
      }
      for (const [k, v] of Object.entries(opts.map)) {
        if (!k.trim()) {
          errors.push('VALUE_MAP 對應鍵（Key）不可為空白。')
        }
        if (typeof v !== 'string' && typeof v !== 'number') {
          errors.push(`VALUE_MAP「${k}」的值必須為字串或數字。`)
        }
      }
      if (opts.unmappedBehavior && !['keep', 'empty', 'error'].includes(opts.unmappedBehavior)) {
        errors.push('VALUE_MAP unmappedBehavior 無效，必須為 keep、empty 或 error。')
      }
    }
  } else if (config.type === 'ROC_YEAR_MONTH') {
    const opts = config.options as RocYearMonthOptions | undefined
    if (opts?.format && !['CHINESE', 'SLASH', 'COMPACT_ZH'].includes(opts.format)) {
      errors.push('ROC_YEAR_MONTH format 無效。')
    }
  }
  return errors
}

export function validateTransformPipeline(
  sourceField: ReportModelSourceField | StaticSourceField,
  pipeline?: TransformConfig[]
): string[] {
  const errors: string[] = []
  if (!pipeline || pipeline.length === 0) return errors

  let currentType: FieldDataType = SOURCE_FIELD_DATA_TYPES[sourceField] || 'ANY'

  for (let i = 0; i < pipeline.length; i++) {
    const t = pipeline[i]
    if (!ALLOWED_TRANSFORMS.includes(t.type)) {
      errors.push(`不支援的轉換規則：「${t.type}」。`)
      continue
    }

    const optErrors = validateTransformOptions(t)
    errors.push(...optErrors)

    const contract = TRANSFORM_CONTRACTS[t.type]
    if (contract) {
      if (
        !contract.allowedInputs.includes(currentType) &&
        !contract.allowedInputs.includes('ANY') &&
        currentType !== 'ANY'
      ) {
        errors.push(
          `欄位「${sourceField}」無法套用轉換「${t.type}」（型別 ${currentType} 不相容）。`
        )
      }
      currentType = contract.outputType(currentType)
    }
  }

  return errors
}

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
      continue
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
      const pipelineErrors = validateTransformPipeline(entry.sourceField, entry.transforms)
      errors.push(...pipelineErrors)
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
      continue
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
      const pipelineErrors = validateTransformPipeline(entry.sourceField, entry.transforms)
      errors.push(...pipelineErrors)
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
