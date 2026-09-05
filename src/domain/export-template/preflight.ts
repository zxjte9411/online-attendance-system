import type { WorkbookWorksheetPreview } from '../../lib/export-templates'
import {
  validateExportTemplateConfig,
  type RowMappingEntry,
  type StaticCellMappingEntry,
  type ReportModelSourceField,
  type StaticSourceField,
} from './mapping-validator'
import { parseDateCellValue } from './xlsx-export'
import { parseA1Address } from './header-reference'
import type { MonthlyReport } from '../report/monthly-report'

export const MAPPING_FIELD_DISPLAY_LABELS: Record<string, string> = {
  date: '日期（定位欄位）',
  weekday: '星期',
  actual_clock_in_at: '實際上班時間',
  effective_clock_in_at: '生效上班時間',
  actual_clock_out_at: '實際下班時間',
  effective_clock_out_at: '生效下班時間',
  expected_clock_out_at: '預計下班時間',
  scheduled_minutes: '應工作分鐘',
  actual_elapsed_minutes: '實際在場分鐘',
  net_worked_minutes: '總工時分鐘',
  regular_minutes: '正常工時分鐘',
  overtime_minutes: '加班工時分鐘',
  leave_minutes: '請假工時分鐘',
  absence_minutes: '缺勤工時分鐘',
  created_source: '打卡來源',
  manually_adjusted: '手動修改標記',
  calculation_version: '計算版本',
  status: '特殊狀態',
  note: '備註',
  year_month: '報表月份 (YYYY-MM)',
  company_identifier: '公司識別碼',
  project_identifier: '專案識別碼',
}

export interface FormulaTargetWarning {
  kind: 'row_mapping' | 'static_mapping'
  target: string
  sourceField: ReportModelSourceField | StaticSourceField
  worksheet: string
  firstCellAddress?: string
  message: string
}

export function checkFormulaTargetWarnings(params: {
  monthWorksheetMapping?: Record<string, string> | Array<{ month: string; worksheet: string }>
  rowMappings?: Array<{ sourceField: ReportModelSourceField; targetColumn: string }>
  staticMappings?: Array<{ sourceField: StaticSourceField; targetCell: string }>
  worksheetPreviews?: readonly WorkbookWorksheetPreview[]
  selectedWorksheetName?: string
}): FormulaTargetWarning[] {
  const {
    monthWorksheetMapping,
    rowMappings = [],
    staticMappings = [],
    worksheetPreviews = [],
    selectedWorksheetName,
  } = params

  if (!worksheetPreviews.length) return []

  // Determine which worksheets to inspect
  let targetSheetNames: string[] = []
  if (monthWorksheetMapping) {
    const rawList = Array.isArray(monthWorksheetMapping)
      ? monthWorksheetMapping.map((m) => m.worksheet)
      : Object.values(monthWorksheetMapping)
    targetSheetNames = Array.from(new Set(rawList.map((s) => s?.trim()).filter(Boolean)))
  }

  if (targetSheetNames.length === 0) {
    if (selectedWorksheetName) {
      targetSheetNames = [selectedWorksheetName]
    } else {
      targetSheetNames = worksheetPreviews.map((ws) => ws.name)
    }
  }

  const warnings: FormulaTargetWarning[] = []

  for (const sheetName of targetSheetNames) {
    const ws = worksheetPreviews.find((w) => w.name === sheetName)
    if (!ws) continue

    // 1. Check Row Mappings
    for (const r of rowMappings) {
      const col = (r.targetColumn || '').trim().toUpperCase()
      if (!col) continue

      const formulaCell = ws.rows
        .flatMap((row) => row.cells)
        .find((cell) => cell.column === col && cell.structureType === 'formula')

      if (formulaCell) {
        const fieldName = MAPPING_FIELD_DISPLAY_LABELS[r.sourceField] || r.sourceField
        const cellAddr = `${formulaCell.column}${formulaCell.rowNumber}`
        warnings.push({
          kind: 'row_mapping',
          target: col,
          sourceField: r.sourceField,
          worksheet: sheetName,
          firstCellAddress: cellAddr,
          message: `目標欄位「${col}」（${fieldName}）在工作表「${sheetName}」中包含公式（如 ${cellAddr}）。匯出器為避免破壞公式會拒絕覆寫，請確認此欄位是否不需 Mapping。`,
        })
      }
    }

    // 2. Check Static Mappings
    for (const s of staticMappings) {
      const cellStr = (s.targetCell || '').trim().toUpperCase()
      if (!cellStr) continue

      const parsed = parseA1Address(cellStr)
      if (!parsed) continue

      const cell = ws.rows
        .find((row) => row.rowNumber === parsed.rowNumber)
        ?.cells.find((c) => c.column === parsed.column)

      if (cell && cell.structureType === 'formula') {
        const fieldName = MAPPING_FIELD_DISPLAY_LABELS[s.sourceField] || s.sourceField
        warnings.push({
          kind: 'static_mapping',
          target: cellStr,
          sourceField: s.sourceField,
          worksheet: sheetName,
          firstCellAddress: cellStr,
          message: `目標靜態儲存格「${cellStr}」（${fieldName}）在工作表「${sheetName}」中包含公式。匯出器為避免破壞公式會拒絕覆寫。`,
        })
      }
    }
  }

  return warnings
}

export type PreflightStatus = 'pass' | 'warning' | 'error' | 'info'
export type PreflightCategory =
  | 'date_locator'
  | 'worksheet_mapping'
  | 'formula_target'
  | 'collision'
  | 'mapping_config'
  | 'unmapped_preservation'

export interface PreflightCheckItem {
  id: string
  category: PreflightCategory
  status: PreflightStatus
  message: string
  detail?: string
}

export interface PreflightResult {
  canExport: boolean
  hasErrors: boolean
  hasWarnings: boolean
  items: PreflightCheckItem[]
}

export interface RunExportPreflightParams {
  targetMonth?: string
  monthWorksheetMapping: Record<string, string> | Array<{ month: string; worksheet: string }>
  rowMapping: RowMappingEntry[]
  staticCellMapping?: StaticCellMappingEntry[]
  worksheetPreviews?: readonly WorkbookWorksheetPreview[]
  report?: MonthlyReport | null
}

export function runExportPreflight(params: RunExportPreflightParams): PreflightResult {
  const {
    targetMonth,
    monthWorksheetMapping,
    rowMapping,
    staticCellMapping = [],
    worksheetPreviews = [],
    report,
  } = params

  const items: PreflightCheckItem[] = []

  // Convert monthWorksheetMapping to normalized Record
  const monthMapObj: Record<string, string> = {}
  if (Array.isArray(monthWorksheetMapping)) {
    for (const item of monthWorksheetMapping) {
      if (item.month?.trim() && item.worksheet?.trim()) {
        monthMapObj[item.month.trim()] = item.worksheet.trim()
      }
    }
  } else if (monthWorksheetMapping && typeof monthWorksheetMapping === 'object') {
    for (const [k, v] of Object.entries(monthWorksheetMapping)) {
      if (k.trim() && v?.trim()) {
        monthMapObj[k.trim()] = v.trim()
      }
    }
  }

  // 1. Check Date Locator
  const dateLocator = rowMapping.find((e) => e.sourceField === 'date')
  if (!dateLocator || !dateLocator.targetColumn?.trim()) {
    items.push({
      id: 'date-locator-missing',
      category: 'date_locator',
      status: 'error',
      message: '缺少必要「日期（定位欄位）」Row Mapping。系統需要此欄位定位各日期的列位置。',
    })
  } else {
    const dateCol = dateLocator.targetColumn.trim().toUpperCase()
    items.push({
      id: 'date-locator-present',
      category: 'date_locator',
      status: 'pass',
      message: `日期定位：${dateCol} 欄（必要定位欄位已設定）`,
    })
  }

  // 2. Check Target Month Worksheet Mapping
  if (targetMonth) {
    const mappedSheetName = monthMapObj[targetMonth]
    if (!mappedSheetName) {
      items.push({
        id: 'worksheet-mapping-missing',
        category: 'worksheet_mapping',
        status: 'error',
        message: `尚未設定月份「${targetMonth}」對應的工作表名稱。`,
      })
    } else {
      if (worksheetPreviews.length > 0) {
        const wsExists = worksheetPreviews.some((w) => w.name === mappedSheetName)
        if (!wsExists) {
          items.push({
            id: 'worksheet-not-found',
            category: 'worksheet_mapping',
            status: 'error',
            message: `範本中找不到名為「${mappedSheetName}」的工作表。`,
          })
        } else {
          items.push({
            id: 'worksheet-mapping-pass',
            category: 'worksheet_mapping',
            status: 'pass',
            message: `工作表對應：${targetMonth} → ${mappedSheetName}`,
          })
        }
      } else {
        items.push({
          id: 'worksheet-mapping-pass',
          category: 'worksheet_mapping',
          status: 'pass',
          message: `工作表對應：${targetMonth} → ${mappedSheetName}`,
        })
      }
    }
  }

  // 3. Check Formula Target Overwrite
  const formulaWarnings = checkFormulaTargetWarnings({
    monthWorksheetMapping: monthMapObj,
    rowMappings: rowMapping,
    staticMappings: staticCellMapping,
    worksheetPreviews,
  })

  if (formulaWarnings.length > 0) {
    for (const w of formulaWarnings) {
      items.push({
        id: `formula-overwrite-${w.worksheet}-${w.target}-${w.sourceField}`,
        category: 'formula_target',
        status: 'error',
        message: w.message,
      })
    }
  }

  // 4. Check Collisions (Static vs Daily rows if date cells are known in target worksheet)
  if (targetMonth && monthMapObj[targetMonth] && worksheetPreviews.length > 0) {
    const ws = worksheetPreviews.find((w) => w.name === monthMapObj[targetMonth])
    if (ws && dateLocator?.targetColumn) {
      const dateCol = dateLocator.targetColumn.trim().toUpperCase()
      const dateRowNumbers = new Set<number>()
      for (const row of ws.rows) {
        const cell = row.cells.find((c) => c.column === dateCol)
        if (cell) {
          const parsedDate = parseDateCellValue(cell.text, targetMonth)
          if (parsedDate && parsedDate.startsWith(targetMonth)) {
            dateRowNumbers.add(row.rowNumber)
          }
        }
      }

      const rowTargetCols = new Set(rowMapping.map((r) => r.targetColumn.trim().toUpperCase()))
      for (const s of staticCellMapping) {
        const parsed = parseA1Address(s.targetCell)
        if (parsed && rowTargetCols.has(parsed.column) && dateRowNumbers.has(parsed.rowNumber)) {
          items.push({
            id: `collision-${s.targetCell}`,
            category: 'collision',
            status: 'error',
            message: `靜態儲存格「${s.targetCell.toUpperCase()}」與每日列目標位置衝突。`,
          })
        }
      }
    }
  }

  // 5. Config validation
  const validation = validateExportTemplateConfig({
    name: 'preflight-check',
    monthWorksheetMapping: monthMapObj,
    rowMapping,
    staticCellMapping,
  })
  if (!validation.isValid) {
    for (const err of validation.errors) {
      // Avoid duplicate date locator errors already added above
      if (!err.includes('date 日期定位欄位')) {
        items.push({
          id: `config-error-${err}`,
          category: 'mapping_config',
          status: 'error',
          message: err,
        })
      }
    }
  }

  // 6. Unmapped formula & content preservation notice (Always helpful info)
  items.push({
    id: 'unmapped-preservation',
    category: 'unmapped_preservation',
    status: 'info',
    message: '未 Mapping 的公式與原始內容會保留（Excel 自行計算的公式欄位不需 Mapping）。',
  })

  const hasErrors = items.some((i) => i.status === 'error')
  const hasWarnings = items.some((i) => i.status === 'warning')

  return {
    canExport: !hasErrors,
    hasErrors,
    hasWarnings,
    items,
  }
}
