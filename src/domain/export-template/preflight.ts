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

function normalizeMonthMap(
  mapping: Record<string, string> | Array<{ month?: string; worksheet?: string }> | undefined
): Record<string, string> {
  const result: Record<string, string> = {}
  if (Array.isArray(mapping)) {
    for (const item of mapping) {
      if (item.month?.trim() && item.worksheet?.trim()) {
        result[item.month.trim()] = item.worksheet.trim()
      }
    }
  } else if (mapping && typeof mapping === 'object') {
    for (const [k, v] of Object.entries(mapping)) {
      if (k.trim() && v?.trim()) {
        result[k.trim()] = v.trim()
      }
    }
  }
  return result
}

export function checkFormulaTargetWarnings(params: {
  monthWorksheetMapping?: Record<string, string> | Array<{ month?: string; worksheet?: string }>
  rowMappings?: Array<{ sourceField: ReportModelSourceField; targetColumn: string }>
  staticMappings?: Array<{ sourceField: StaticSourceField; targetCell: string }>
  worksheetPreviews?: readonly WorkbookWorksheetPreview[]
  selectedWorksheetName?: string
  targetMonth?: string
  report?: MonthlyReport | null
}): FormulaTargetWarning[] {
  const {
    monthWorksheetMapping,
    rowMappings = [],
    staticMappings = [],
    worksheetPreviews = [],
    selectedWorksheetName,
    targetMonth,
    report,
  } = params

  if (!worksheetPreviews.length) return []

  // Normalize monthWorksheetMapping
  const monthMapObj = normalizeMonthMap(monthWorksheetMapping)

  // Determine target worksheet inspections with associated applicable months
  const targets: Array<{ sheetName: string; months: string[] }> = []

  if (targetMonth) {
    const sheetName = monthMapObj[targetMonth]
    if (sheetName) {
      targets.push({ sheetName, months: [targetMonth] })
    }
  } else if (selectedWorksheetName) {
    const mappedMonths = Object.entries(monthMapObj)
      .filter(([_, wsName]) => wsName === selectedWorksheetName)
      .map(([m]) => m)
    targets.push({ sheetName: selectedWorksheetName, months: mappedMonths })
  } else if (Object.keys(monthMapObj).length > 0) {
    const sheetToMonths = new Map<string, string[]>()
    for (const [m, wsName] of Object.entries(monthMapObj)) {
      if (!sheetToMonths.has(wsName)) {
        sheetToMonths.set(wsName, [])
      }
      sheetToMonths.get(wsName)!.push(m)
    }
    for (const [sheetName, months] of sheetToMonths.entries()) {
      targets.push({ sheetName, months })
    }
  } else {
    for (const ws of worksheetPreviews) {
      targets.push({ sheetName: ws.name, months: [] })
    }
  }

  const warnings: FormulaTargetWarning[] = []
  const dateLocator = rowMappings.find((r) => r.sourceField === 'date')?.targetColumn?.trim().toUpperCase()

  for (const { sheetName, months } of targets) {
    const ws = worksheetPreviews.find((w) => w.name === sheetName)
    if (!ws) continue

    // Collect daily date rows where date matches applicable months (or active report dates)
    const activeDates = report && targetMonth && months.includes(targetMonth)
      ? new Set(report.rows.map((r) => r.date))
      : null

    const dailyDateRowNumbers = new Set<number>()
    if (dateLocator) {
      for (const row of ws.rows) {
        const dateCell = row.cells.find((c) => c.column === dateLocator)
        if (dateCell) {
          if (months.length > 0) {
            for (const m of months) {
              const parsed = parseDateCellValue(dateCell.text, m)
              if (parsed && parsed.startsWith(m)) {
                if (activeDates === null || activeDates.has(parsed)) {
                  dailyDateRowNumbers.add(row.rowNumber)
                }
              }
            }
          } else {
            // No specific month mapped: parse cell text across full date formats
            const parsed = parseDateCellValue(dateCell.text, '')
            if (parsed) {
              dailyDateRowNumbers.add(row.rowNumber)
            }
          }
        }
      }
    }

    // 1. Check Row Mappings ONLY against actual daily date rows
    for (const r of rowMappings) {
      const col = (r.targetColumn || '').trim().toUpperCase()
      if (!col) continue

      // Look only at rows identified as daily date rows
      const formulaCell = ws.rows
        .filter((row) => dailyDateRowNumbers.has(row.rowNumber))
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
          message: `目標欄位「${col}」（${fieldName}）在工作表「${sheetName}」之每日資料列中包含公式（如 ${cellAddr}）。匯出器為避免破壞公式會拒絕覆寫，請確認此欄位是否不需 Mapping。`,
        })
      }
    }

    // 2. Check Static Mappings against exact A1 address
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

export type PreflightStatus = 'pass' | 'warning' | 'error' | 'not_verified' | 'info'
export type PreflightCategory =
  | 'date_locator'
  | 'worksheet_mapping'
  | 'date_row_locator'
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
  isFullyVerified: boolean
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
  const monthMapObj = normalizeMonthMap(monthWorksheetMapping)

  // 1. Check Date Locator in configuration
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

  // 2. Check Worksheet Mapping & Worksheet existence in workbook
  if (targetMonth) {
    const mappedSheetName = monthMapObj[targetMonth]
    if (!mappedSheetName) {
      items.push({
        id: 'worksheet-mapping-missing',
        category: 'worksheet_mapping',
        status: 'error',
        message: `尚未設定月份「${targetMonth}」對應的工作表名稱。`,
      })
    } else if (worksheetPreviews.length > 0) {
      const wsExists = worksheetPreviews.some((w) => w.name === mappedSheetName)
      if (!wsExists) {
        items.push({
          id: `worksheet-not-found-${mappedSheetName}`,
          category: 'worksheet_mapping',
          status: 'error',
          message: `範本中找不到名為「${mappedSheetName}」的工作表。`,
        })
      } else {
        items.push({
          id: 'worksheet-mapping-pass',
          category: 'worksheet_mapping',
          status: 'pass',
          message: `工作表對應已驗證：${targetMonth} → ${mappedSheetName}`,
        })
      }
    } else {
      items.push({
        id: 'worksheet-mapping-unverified',
        category: 'worksheet_mapping',
        status: 'not_verified',
        message: `工作表對應已設定（${targetMonth} → ${mappedSheetName}），尚未取得範本檔案進行工作表存在性驗證。`,
      })
    }
  } else if (worksheetPreviews.length > 0) {
    const availableNames = new Set(worksheetPreviews.map((w) => w.name))
    const mappedEntries = Object.entries(monthMapObj)
    if (mappedEntries.length === 0) {
      items.push({
        id: 'worksheet-mapping-none',
        category: 'worksheet_mapping',
        status: 'info',
        message: '尚未設定月份工作表對應。',
      })
    } else {
      let missingCount = 0
      for (const [m, sheetName] of mappedEntries) {
        if (sheetName && !availableNames.has(sheetName)) {
          missingCount++
          items.push({
            id: `worksheet-not-found-${sheetName}`,
            category: 'worksheet_mapping',
            status: 'error',
            message: `月份「${m}」對應之工作表「${sheetName}」不存在於範本中。`,
          })
        }
      }
      if (missingCount === 0) {
        items.push({
          id: 'worksheet-mapping-overview-pass',
          category: 'worksheet_mapping',
          status: 'pass',
          message: `工作表對應已驗證：已設定之 ${mappedEntries.length} 個月份工作表皆存在於範本中`,
        })
      }
    }
  } else {
    items.push({
      id: 'worksheet-mapping-unverified',
      category: 'worksheet_mapping',
      status: 'not_verified',
      message: '月份工作表對應尚未取得範本檔案進行存在性驗證。',
    })
  }

  // 3. Check Date Row Locator in worksheet
  if (targetMonth && monthMapObj[targetMonth]) {
    const sheetName = monthMapObj[targetMonth]
    if (worksheetPreviews.length > 0) {
      const ws = worksheetPreviews.find((w) => w.name === sheetName)
      if (ws && dateLocator?.targetColumn) {
        const dateCol = dateLocator.targetColumn.trim().toUpperCase()
        const activeDates = report
          ? report.rows.map((r) => r.date)
          : null

        const foundDates = new Set<string>()
        for (const row of ws.rows) {
          const cell = row.cells.find((c) => c.column === dateCol)
          if (cell) {
            const parsed = parseDateCellValue(cell.text, targetMonth)
            if (parsed && parsed.startsWith(targetMonth)) {
              foundDates.add(parsed)
            }
          }
        }

        if (activeDates && activeDates.length > 0) {
          const missingDate = activeDates.find((d) => !foundDates.has(d))
          if (missingDate) {
            items.push({
              id: `date-row-missing-${missingDate}`,
              category: 'date_row_locator',
              status: 'error',
              message: `在工作表「${sheetName}」欄位 ${dateCol} 找不到日期「${missingDate}」對應的列。`,
            })
          } else {
            items.push({
              id: 'date-row-locator-pass',
              category: 'date_row_locator',
              status: 'pass',
              message: `日期列定位已驗證：已於「${sheetName}」找到 ${activeDates.length} 個出勤日期的對應列`,
            })
          }
        } else if (foundDates.size > 0) {
          items.push({
            id: 'date-row-locator-pass',
            category: 'date_row_locator',
            status: 'pass',
            message: `日期列定位已驗證：已於「${sheetName}」找到 ${foundDates.size} 個 ${targetMonth} 日期列`,
          })
        } else {
          items.push({
            id: 'date-row-none-found',
            category: 'date_row_locator',
            status: 'error',
            message: `在工作表「${sheetName}」欄位 ${dateCol} 找不到屬於月份「${targetMonth}」的日期列。`,
          })
        }
      }
    } else {
      items.push({
        id: 'date-row-locator-unverified',
        category: 'date_row_locator',
        status: 'not_verified',
        message: '尚未取得範本預覽，無法預先驗證日期列定位（將於匯出時進行最終檢查）。',
      })
    }
  }

  // 4. Check Formula Target Overwrite
  if (worksheetPreviews.length > 0) {
    const formulaWarnings = checkFormulaTargetWarnings({
      monthWorksheetMapping: monthMapObj,
      rowMappings: rowMapping,
      staticMappings: staticCellMapping,
      worksheetPreviews,
      targetMonth,
      report,
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
    } else {
      items.push({
        id: 'formula-target-pass',
        category: 'formula_target',
        status: 'pass',
        message: '公式覆寫檢查通過：目標寫入欄位與儲存格未包含公式',
      })
    }
  } else {
    items.push({
      id: 'formula-target-unverified',
      category: 'formula_target',
      status: 'not_verified',
      message: '尚未取得範本預覽，無法預先檢查目標儲存格是否包含公式（將於匯出時進行最終保護檢查）。',
    })
  }

  // 5. Check Collisions (Static vs Daily rows if date cells are known in worksheet)
  if (worksheetPreviews.length > 0 && dateLocator?.targetColumn) {
    const dateCol = dateLocator.targetColumn.trim().toUpperCase()
    const rowTargetCols = new Set(
      rowMapping.map((r) => r.targetColumn?.trim().toUpperCase()).filter(Boolean)
    )

    const monthsToCheck = targetMonth
      ? [targetMonth]
      : Object.keys(monthMapObj)

    const checkedWorksheets = new Set<string>()
    let collisionFound = false

    for (const m of monthsToCheck) {
      const sheetName = monthMapObj[m]
      if (!sheetName || checkedWorksheets.has(sheetName)) continue
      checkedWorksheets.add(sheetName)

      const ws = worksheetPreviews.find((w) => w.name === sheetName)
      if (!ws) continue

      const activeDates = report && targetMonth === m
        ? new Set(report.rows.filter((r) => r.in_assignment_period !== false).map((r) => r.date))
        : null

      const dateRowNumbers = new Set<number>()
      for (const row of ws.rows) {
        const cell = row.cells.find((c) => c.column === dateCol)
        if (cell) {
          const parsedDate = parseDateCellValue(cell.text, m)
          if (parsedDate && parsedDate.startsWith(m)) {
            if (activeDates === null || activeDates.has(parsedDate)) {
              dateRowNumbers.add(row.rowNumber)
            }
          }
        }
      }

      for (const s of staticCellMapping) {
        const parsed = parseA1Address(s.targetCell)
        if (parsed && rowTargetCols.has(parsed.column) && dateRowNumbers.has(parsed.rowNumber)) {
          collisionFound = true
          const collisionId = `collision-${sheetName}-${s.targetCell.toUpperCase()}`
          if (!items.some((i) => i.id === collisionId)) {
            items.push({
              id: collisionId,
              category: 'collision',
              status: 'error',
              message: `靜態儲存格「${s.targetCell.toUpperCase()}」在工作表「${sheetName}」與每日列目標位置衝突。`,
            })
          }
        }
      }
    }

    if (!collisionFound) {
      items.push({
        id: 'collision-pass',
        category: 'collision',
        status: 'pass',
        message: '儲存格位置檢查通過：未發現每日列與靜態儲存格位置衝突',
      })
    }
  } else if (worksheetPreviews.length === 0) {
    items.push({
      id: 'collision-unverified',
      category: 'collision',
      status: 'not_verified',
      message: '尚未取得範本預覽，無法預先檢查儲存格位置衝突（將於匯出時進行最終檢查）。',
    })
  }

  // 6. Config validation
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

  // 7. Unmapped formula & content preservation notice (Always helpful info)
  items.push({
    id: 'unmapped-preservation',
    category: 'unmapped_preservation',
    status: 'info',
    message: '未 Mapping 的公式與原始內容會保留（Excel 自行計算的公式欄位不需 Mapping）。',
  })

  const hasErrors = items.some((i) => i.status === 'error')
  const hasWarnings = items.some((i) => i.status === 'warning')
  const isFullyVerified =
    worksheetPreviews.length > 0 &&
    !hasErrors &&
    items.some((i) => i.status === 'pass') &&
    !items.some((i) => i.status === 'not_verified')

  return {
    canExport: !hasErrors,
    hasErrors,
    hasWarnings,
    isFullyVerified,
    items,
  }
}
