import type { WorkbookWorksheetPreview } from '../../lib/export-templates'
import type { ReportModelSourceField } from './mapping-validator'

export interface HeaderReferenceRange {
  startRow: number
  endRow: number
}

export function isValidHeaderRange(range: unknown): range is HeaderReferenceRange {
  if (!range || typeof range !== 'object') return false
  const r = range as { startRow?: unknown; endRow?: unknown }
  return (
    typeof r.startRow === 'number' &&
    typeof r.endRow === 'number' &&
    Number.isInteger(r.startRow) &&
    Number.isInteger(r.endRow) &&
    r.startRow >= 1 &&
    r.endRow >= r.startRow
  )
}

/**
 * Derives header labels for all columns in a worksheet preview within the specified range.
 * Returns a map of column letter (e.g. 'A') -> derived label string (e.g. '出勤時數統計 / 上班' or '' if empty).
 */
export function deriveColumnHeaderLabels(
  worksheet: WorkbookWorksheetPreview | null | undefined,
  range: HeaderReferenceRange | null | undefined
): Map<string, string> {
  const result = new Map<string, string>()
  if (!worksheet || !worksheet.columns) return result

  if (!isValidHeaderRange(range)) {
    for (const col of worksheet.columns) {
      result.set(col.column, '')
    }
    return result
  }

  const rowsInRange = (worksheet.rows || [])
    .filter((row) => row.rowNumber >= range.startRow && row.rowNumber <= range.endRow)
    .slice()
    .sort((a, b) => a.rowNumber - b.rowNumber)

  for (const col of worksheet.columns) {
    const colKey = col.column
    const labels: string[] = []

    for (const row of rowsInRange) {
      const cell = row.cells.find((c) => c.column === colKey)
      const rawText = cell?.headerText ?? cell?.text ?? ''
      const trimmed = rawText.trim()
      if (trimmed && !labels.includes(trimmed)) {
        labels.push(trimmed)
      }
    }

    result.set(colKey, labels.join(' / '))
  }

  return result
}

export function formatColumnPickerLabel(column: string, headerLabel?: string | null): string {
  const trimmed = (headerLabel || '').trim()
  return trimmed ? `${column} — ${trimmed}` : column
}

export interface HeaderConsistencyWarning {
  column: string
  sourceField: ReportModelSourceField
  sheetHeaders: Array<{ sheetName: string; headerLabel: string }>
}

export function checkHeaderConsistency(params: {
  monthWorksheetMapping: Record<string, string> | Array<{ month: string; worksheet: string }>
  rowMappings: Array<{ sourceField: ReportModelSourceField; targetColumn: string }>
  worksheetPreviews: readonly WorkbookWorksheetPreview[]
  worksheetHeaderRanges: Record<string, HeaderReferenceRange | undefined>
}): HeaderConsistencyWarning[] {
  const { monthWorksheetMapping, rowMappings, worksheetPreviews, worksheetHeaderRanges } = params

  const referencedSheetNames = Array.from(
    new Set(
      (Array.isArray(monthWorksheetMapping)
        ? monthWorksheetMapping.map((m) => m.worksheet)
        : Object.values(monthWorksheetMapping)
      )
        .map((s) => s?.trim())
        .filter(Boolean)
    )
  )

  if (referencedSheetNames.length <= 1) {
    return []
  }

  const eligibleSheets = referencedSheetNames.filter((sheetName) => {
    const range = worksheetHeaderRanges[sheetName]
    return (
      isValidHeaderRange(range) &&
      worksheetPreviews.some((ws) => ws.name === sheetName)
    )
  })

  if (eligibleSheets.length <= 1) {
    return []
  }

  const warnings: HeaderConsistencyWarning[] = []

  for (const mapping of rowMappings) {
    const col = mapping.targetColumn?.trim().toUpperCase()
    if (!col) continue

    const sheetHeaders: Array<{ sheetName: string; headerLabel: string }> = []

    for (const sheetName of eligibleSheets) {
      const preview = worksheetPreviews.find((ws) => ws.name === sheetName)
      if (!preview) continue

      const hasColumn = preview.columns.some((c) => c.column === col)
      if (!hasColumn) {
        continue
      }

      const range = worksheetHeaderRanges[sheetName]!
      const labelMap = deriveColumnHeaderLabels(preview, range)
      const label = labelMap.get(col)

      if (label && label.trim()) {
        sheetHeaders.push({
          sheetName,
          headerLabel: label.trim(),
        })
      }
    }

    if (sheetHeaders.length >= 2) {
      const firstLabel = sheetHeaders[0].headerLabel
      const isConsistent = sheetHeaders.every((sheetHeader) => sheetHeader.headerLabel === firstLabel)
      if (!isConsistent) {
        warnings.push({
          column: col,
          sourceField: mapping.sourceField,
          sheetHeaders,
        })
      }
    }
  }

  return warnings
}
