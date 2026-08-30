import type { WorkbookWorksheetPreview } from '../../lib/export-templates'
import type { ReportModelSourceField, StaticSourceField } from './mapping-validator'

export interface HeaderReferenceRange {
  startRow: number
  endRow: number
}

export type PreviewCellStructureType = 'formula' | 'merged' | 'ordinary'

export type PreviewSelectionTarget =
  | { readonly kind: 'row_mapping'; readonly index: number }
  | { readonly kind: 'static_mapping'; readonly index: number }
  | null

export function isSameSelectionTarget(
  a: PreviewSelectionTarget,
  b: PreviewSelectionTarget
): boolean {
  if (a === null || b === null) return a === b
  if (a.kind === 'row_mapping' && b.kind === 'row_mapping') {
    return a.index === b.index
  }
  if (a.kind === 'static_mapping' && b.kind === 'static_mapping') {
    return a.index === b.index
  }
  return false
}

export function toggleSelectionTarget(
  current: PreviewSelectionTarget,
  next: NonNullable<PreviewSelectionTarget>
): PreviewSelectionTarget {
  return isSameSelectionTarget(current, next) ? null : next
}

export function clearSelectionTarget(): PreviewSelectionTarget {
  return null
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

export function parseA1Address(address: string): { column: string; rowNumber: number } | null {
  const match = /^([A-Za-z]+)([1-9][0-9]*)$/.exec(address.trim())
  if (!match) return null
  return {
    column: match[1].toUpperCase(),
    rowNumber: parseInt(match[2], 10),
  }
}

export function getStaticCellStructure(
  worksheet: WorkbookWorksheetPreview | null | undefined,
  targetCell: string
): PreviewCellStructureType | null {
  if (!worksheet) return null
  const parsed = parseA1Address(targetCell)
  if (!parsed) return null
  const { column, rowNumber } = parsed

  const hasColumn = worksheet.columns.some((c) => c.column === column)
  if (!hasColumn) return null

  const row = worksheet.rows.find((r) => r.rowNumber === rowNumber)
  if (!row) return null

  const cell = row.cells.find((c) => c.column === column)
  if (cell) {
    return cell.structureType || 'ordinary'
  }

  return 'ordinary'
}

export interface StaticCellConsistencyWarning {
  cell: string
  sourceField: StaticSourceField
  sheetStructures: Array<{ sheetName: string; structureType: PreviewCellStructureType }>
}

export function checkStaticCellConsistency(params: {
  monthWorksheetMapping: Record<string, string> | Array<{ month: string; worksheet: string }>
  staticMappings: Array<{ sourceField: StaticSourceField; targetCell: string }>
  worksheetPreviews: readonly WorkbookWorksheetPreview[]
}): StaticCellConsistencyWarning[] {
  const { monthWorksheetMapping, staticMappings, worksheetPreviews } = params

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

  const warnings: StaticCellConsistencyWarning[] = []

  for (const mapping of staticMappings) {
    const cell = mapping.targetCell?.trim().toUpperCase()
    if (!cell) continue

    const sheetStructures: Array<{ sheetName: string; structureType: PreviewCellStructureType }> = []

    for (const sheetName of referencedSheetNames) {
      const preview = worksheetPreviews.find((ws) => ws.name === sheetName)
      if (!preview) continue

      const structure = getStaticCellStructure(preview, cell)
      if (structure !== null) {
        sheetStructures.push({
          sheetName,
          structureType: structure,
        })
      }
    }

    if (sheetStructures.length >= 2) {
      const firstStructure = sheetStructures[0].structureType
      const isConsistent = sheetStructures.every((s) => s.structureType === firstStructure)
      if (!isConsistent) {
        warnings.push({
          cell,
          sourceField: mapping.sourceField,
          sheetStructures,
        })
      }
    }
  }

  return warnings
}
