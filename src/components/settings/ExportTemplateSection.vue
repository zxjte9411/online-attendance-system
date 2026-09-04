<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getExportTemplate,
  uploadExportTemplate,
  saveExportTemplateMapping,
  replaceExportTemplate,
  deleteExportTemplate,
  downloadExportTemplateFile,
  getWorkbookWorksheetNames,
  getWorkbookPreview,
  validateXlsxFileInput,
  type ExportTemplate,
  type WorkbookPreviewRow,
  type WorkbookWorksheetPreview,
} from '../../lib/export-templates'
import {
  REPORT_MODEL_SOURCE_FIELDS,
  STATIC_SOURCE_FIELDS,
  SOURCE_FIELD_DATA_TYPES,
  TRANSFORM_CONTRACTS,
  type ReportModelSourceField,
  type StaticSourceField,
  type RowMappingEntry,
  type StaticCellMappingEntry,
} from '../../domain/export-template/mapping-validator'
import {
  ALLOWED_TRANSFORMS,
  type TransformType,
  type TransformConfig,
  type ValueMapOptions,
} from '../../domain/export-template/transforms'
import {
  deriveColumnHeaderLabels,
  formatColumnPickerLabel,
  checkHeaderConsistency,
  checkStaticCellConsistency,
  isValidHeaderRange,
  toggleSelectionTarget,
  clearSelectionTarget,
  type HeaderReferenceRange,
  type PreviewSelectionTarget,
  type PreviewCellStructureType,
} from '../../domain/export-template/header-reference'

const props = defineProps<{
  userId: string
  assignmentId?: string
  assignmentName?: string
  contextId?: string
  contextName?: string
}>()

const effectiveTargetId = computed(() => props.assignmentId || props.contextId || '')
const effectiveTargetName = computed(() => props.assignmentName || props.contextName || '')

const FIELD_LABELS: Record<ReportModelSourceField, string> = {
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
  status: '特殊狀態 (LEAVE/REMOTE等)',
  note: '備註',
}

const STATIC_FIELD_LABELS: Record<StaticSourceField, string> = {
  year_month: '報表月份 (YYYY-MM)',
  company_identifier: '公司識別碼',
  project_identifier: '專案識別碼',
}

const TRANSFORM_LABELS: Record<TransformType, string> = {
  TIME_HH_MM: '時間格式 (HH:mm)',
  MINUTES_TO_DECIMAL_HOURS: '分鐘轉小數小時 (如 480 -> 8)',
  DATE_YYYY_MM_DD: '日期格式 (YYYY-MM-DD)',
  WEEKDAY_ZH_TW: '中文星期 (週一..週日)',
  ROC_YEAR_MONTH: '民國年月 (115 年 08 月)',
  EMPTY_IF_ZERO: '若為 0 則保持空白',
  ZERO_IF_EMPTY: '若為空則補 0',
  VALUE_MAP: '值映射 (Value Map)',
}

interface RowMappingUiItem {
  sourceField: ReportModelSourceField
  targetColumn: string
  transformType: string
  transforms: TransformConfig[]
  valueMapText: string
  valueMapFallback: 'keep' | 'error'
}

interface StaticMappingUiItem {
  sourceField: StaticSourceField
  targetCell: string
  transformType: string
  transforms: TransformConfig[]
  valueMapText: string
  valueMapFallback: 'keep' | 'error'
}

const template = ref<ExportTemplate | null>(null)
const availableWorksheets = ref<string[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const isUploading = ref(false)
const isReplacing = ref(false)
const isDeleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)

// Form states
const uploadName = ref('')
const uploadFileInput = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)

const showReplaceForm = ref(false)
const replaceFileInput = ref<HTMLInputElement | null>(null)
const replaceFile = ref<File | null>(null)
const replaceName = ref('')

const editingName = ref('')
const monthMappings = ref<Array<{ month: string; worksheet: string }>>([])
const rowMappings = ref<RowMappingUiItem[]>([])
const staticMappings = ref<StaticMappingUiItem[]>([])

// Committed Template Preview state
const previewWorksheets = ref<WorkbookWorksheetPreview[]>([])
const selectedPreviewWorksheetName = ref('')
const previewVisibleRowCount = ref(20)
const previewError = ref('')
const hasManualPreviewSelection = ref(false)
const showHiddenWorksheets = ref(false)
const showHiddenPreviewRowsAndColumns = ref(false)

// Candidate Preview state (for uncommitted upload or replacement)
const candidatePreviewWorksheets = ref<WorkbookWorksheetPreview[]>([])
const candidateSelectedPreviewWorksheetName = ref('')
const candidatePreviewVisibleRowCount = ref(20)
const candidatePreviewError = ref('')
const candidateShowHiddenWorksheets = ref(false)
const candidateShowHiddenPreviewRowsAndColumns = ref(false)
const candidateRequestId = ref(0)

const isCandidatePreviewActive = computed(() =>
  Boolean(uploadFile.value || (template.value && showReplaceForm.value && replaceFile.value))
)

const activePreviewWorksheets = computed(() =>
  isCandidatePreviewActive.value
    ? candidatePreviewWorksheets.value
    : previewWorksheets.value
)

const activePreviewError = computed(() =>
  isCandidatePreviewActive.value
    ? candidatePreviewError.value
    : previewError.value
)

const activeShowHiddenWorksheets = computed({
  get: () =>
    isCandidatePreviewActive.value
      ? candidateShowHiddenWorksheets.value
      : showHiddenWorksheets.value,
  set: (val: boolean) => {
    if (isCandidatePreviewActive.value) {
      candidateShowHiddenWorksheets.value = val
    } else {
      showHiddenWorksheets.value = val
    }
  },
})

const activeShowHiddenPreviewRowsAndColumns = computed({
  get: () =>
    isCandidatePreviewActive.value
      ? candidateShowHiddenPreviewRowsAndColumns.value
      : showHiddenPreviewRowsAndColumns.value,
  set: (val: boolean) => {
    if (isCandidatePreviewActive.value) {
      candidateShowHiddenPreviewRowsAndColumns.value = val
    } else {
      showHiddenPreviewRowsAndColumns.value = val
    }
  },
})

const activeSelectedPreviewWorksheetName = computed({
  get: () =>
    isCandidatePreviewActive.value
      ? candidateSelectedPreviewWorksheetName.value
      : selectedPreviewWorksheetName.value,
  set: (val: string) => {
    if (isCandidatePreviewActive.value) {
      candidateSelectedPreviewWorksheetName.value = val
    } else {
      selectedPreviewWorksheetName.value = val
    }
  },
})

const activePreviewVisibleRowCount = computed({
  get: () =>
    isCandidatePreviewActive.value
      ? candidatePreviewVisibleRowCount.value
      : previewVisibleRowCount.value,
  set: (val: number) => {
    if (isCandidatePreviewActive.value) {
      candidatePreviewVisibleRowCount.value = val
    } else {
      previewVisibleRowCount.value = val
    }
  },
})

const selectablePreviewWorksheets = computed(() =>
  activePreviewWorksheets.value.filter(
    (worksheet) => activeShowHiddenWorksheets.value || !worksheet.isHidden
  )
)

const hasHiddenPreviewWorksheets = computed(() =>
  activePreviewWorksheets.value.some((worksheet) => worksheet.isHidden)
)

const selectedPreviewWorksheet = computed(() =>
  selectablePreviewWorksheets.value.find(
    (worksheet) => worksheet.name === activeSelectedPreviewWorksheetName.value
  )
)

const hasHiddenPreviewRowsOrColumns = computed(() => {
  const worksheet = selectedPreviewWorksheet.value
  return Boolean(
    worksheet?.rows.some((row) => row.isHidden) ||
      worksheet?.columns.some((column) => column.isHidden)
  )
})

const previewRows = computed(() => {
  const rows = selectedPreviewWorksheet.value?.rows || []
  return rows.filter((row) => activeShowHiddenPreviewRowsAndColumns.value || !row.isHidden)
})

const visiblePreviewColumns = computed(() => {
  const worksheet = selectedPreviewWorksheet.value
  return (
    worksheet?.columns
      .slice(0, 50)
      .filter(
        (column) =>
          activeShowHiddenPreviewRowsAndColumns.value || !column.isHidden
      ) || []
  )
})

const visiblePreviewRows = computed(() =>
  previewRows.value.slice(0, activePreviewVisibleRowCount.value)
)

const worksheetHeaderRanges = ref<Record<string, HeaderReferenceRange>>({})
const hasAskedApplyAll = ref(false)
const currentRangeStart = ref<number | null>(null)
const currentRangeEnd = ref<number | null>(null)
const currentRangeError = ref('')

const activeSelectionTarget = ref<PreviewSelectionTarget>(null)
const focusedRowIndex = ref<number | null>(null)
const focusedStaticIndex = ref<number | null>(null)

function resetPreviewSelection() {
  hasManualPreviewSelection.value = false
  selectedPreviewWorksheetName.value = ''
  showHiddenWorksheets.value = false
  showHiddenPreviewRowsAndColumns.value = false
  worksheetHeaderRanges.value = {}
  hasAskedApplyAll.value = false
  activeSelectionTarget.value = null
  focusedRowIndex.value = null
  focusedStaticIndex.value = null
  currentRangeStart.value = null
  currentRangeEnd.value = null
  currentRangeError.value = ''
}

watch(selectablePreviewWorksheets, (worksheets) => {
  if (!worksheets.some((worksheet) => worksheet.name === activeSelectedPreviewWorksheetName.value)) {
    activeSelectedPreviewWorksheetName.value = worksheets[0]?.name || ''
  }
})

watch(selectedPreviewWorksheetName, (sheetName) => {
  const existing = worksheetHeaderRanges.value[sheetName]
  currentRangeStart.value = existing ? existing.startRow : null
  currentRangeEnd.value = existing ? existing.endRow : null
  currentRangeError.value = ''
})

function applyHeaderRange() {
  const sheetName = selectedPreviewWorksheetName.value
  if (!sheetName) return
  currentRangeError.value = ''

  if (
    currentRangeStart.value === null ||
    currentRangeEnd.value === null ||
    currentRangeStart.value === undefined ||
    currentRangeEnd.value === undefined ||
    String(currentRangeStart.value).trim() === '' ||
    String(currentRangeEnd.value).trim() === ''
  ) {
    currentRangeError.value = '請輸入起始列與結束列。'
    return
  }

  const startNum = Number(currentRangeStart.value)
  const endNum = Number(currentRangeEnd.value)
  const range = { startRow: startNum, endRow: endNum }

  if (!isValidHeaderRange(range)) {
    currentRangeError.value = '請輸入有效且連續的列號範圍（起始列需大於等於 1，結束列需大於等於起始列）。'
    return
  }

  const updated = { ...worksheetHeaderRanges.value, [sheetName]: range }

  if (!hasAskedApplyAll.value && previewWorksheets.value.length > 1) {
    hasAskedApplyAll.value = true
    const applyAll =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('是否將此標題參考範圍套用到所有工作表？（後續仍可個別調整）')
        : false
    if (applyAll) {
      for (const ws of previewWorksheets.value) {
        updated[ws.name] = { ...range }
      }
    }
  }

  worksheetHeaderRanges.value = updated
}

function clearHeaderRange() {
  const sheetName = selectedPreviewWorksheetName.value
  if (sheetName) {
    const updated = { ...worksheetHeaderRanges.value }
    delete updated[sheetName]
    worksheetHeaderRanges.value = updated
  }
  currentRangeStart.value = null
  currentRangeEnd.value = null
  currentRangeError.value = ''
}

const currentSheetDerivedLabels = computed(() => {
  if (isCandidatePreviewActive.value) return new Map<string, string>()
  const ws = selectedPreviewWorksheet.value
  const range = ws ? worksheetHeaderRanges.value[ws.name] : undefined
  return deriveColumnHeaderLabels(ws, range)
})

const columnPickerOptions = computed(() => {
  const ws =
    previewWorksheets.value.find((w) => w.name === selectedPreviewWorksheetName.value) ||
    previewWorksheets.value[0]
  if (!ws || !ws.columns) return []
  const range = ws ? worksheetHeaderRanges.value[ws.name] : undefined
  const derived = deriveColumnHeaderLabels(ws, range)
  return ws.columns.map((c) => {
    const label = derived.get(c.column) || ''
    return {
      column: c.column,
      label,
      displayLabel: formatColumnPickerLabel(c.column, label),
    }
  })
})

function isRowMappingSelectionActive(index: number): boolean {
  return (
    activeSelectionTarget.value?.kind === 'row_mapping' &&
    activeSelectionTarget.value.index === index
  )
}

function isStaticMappingSelectionActive(index: number): boolean {
  return (
    activeSelectionTarget.value?.kind === 'static_mapping' &&
    activeSelectionTarget.value.index === index
  )
}

function toggleRowMappingSelection(index: number) {
  activeSelectionTarget.value = toggleSelectionTarget(activeSelectionTarget.value, {
    kind: 'row_mapping',
    index,
  })
  if (activeSelectionTarget.value) {
    focusedRowIndex.value = index
    focusedStaticIndex.value = null
  }
}

function toggleStaticMappingSelection(index: number) {
  activeSelectionTarget.value = toggleSelectionTarget(activeSelectionTarget.value, {
    kind: 'static_mapping',
    index,
  })
  if (activeSelectionTarget.value) {
    focusedStaticIndex.value = index
    focusedRowIndex.value = null
  }
}

function cancelSelection() {
  activeSelectionTarget.value = clearSelectionTarget()
}

function selectPreviewColumn(col: string) {
  if (!activeSelectionTarget.value) return
  if (activeSelectionTarget.value.kind === 'row_mapping') {
    const item = rowMappings.value[activeSelectionTarget.value.index]
    if (item) {
      item.targetColumn = col.toUpperCase()
    }
  }
  activeSelectionTarget.value = clearSelectionTarget()
}

function selectPreviewCell(column: string, rowNumber: number) {
  if (!activeSelectionTarget.value) return
  if (activeSelectionTarget.value.kind === 'static_mapping') {
    const item = staticMappings.value[activeSelectionTarget.value.index]
    if (item) {
      item.targetCell = `${column.toUpperCase()}${rowNumber}`
    }
  }
  activeSelectionTarget.value = clearSelectionTarget()
}

function onColumnSelectChange(event: Event, item: RowMappingUiItem) {
  const target = event.target as HTMLSelectElement
  if (target.value) {
    item.targetColumn = target.value.toUpperCase()
  }
}

const activeSelectionFieldLabel = computed(() => {
  if (activeSelectionTarget.value?.kind === 'row_mapping') {
    const item = rowMappings.value[activeSelectionTarget.value.index]
    if (item) {
      return FIELD_LABELS[item.sourceField] || item.sourceField
    }
  }
  if (activeSelectionTarget.value?.kind === 'static_mapping') {
    const item = staticMappings.value[activeSelectionTarget.value.index]
    if (item) {
      return STATIC_FIELD_LABELS[item.sourceField] || item.sourceField
    }
  }
  return ''
})

const highlightedTargetColumn = computed(() => {
  if (isCandidatePreviewActive.value) return null
  if (activeSelectionTarget.value?.kind === 'row_mapping') {
    return rowMappings.value[activeSelectionTarget.value.index]?.targetColumn?.trim().toUpperCase() || null
  }
  if (focusedRowIndex.value !== null) {
    return rowMappings.value[focusedRowIndex.value]?.targetColumn?.trim().toUpperCase() || null
  }
  return null
})

const highlightedTargetCell = computed(() => {
  if (isCandidatePreviewActive.value) return null
  if (activeSelectionTarget.value?.kind === 'static_mapping') {
    return staticMappings.value[activeSelectionTarget.value.index]?.targetCell?.trim().toUpperCase() || null
  }
  if (focusedStaticIndex.value !== null) {
    return staticMappings.value[focusedStaticIndex.value]?.targetCell?.trim().toUpperCase() || null
  }
  return null
})

const headerWarnings = computed(() => {
  return checkHeaderConsistency({
    monthWorksheetMapping: monthMappings.value,
    rowMappings: rowMappings.value,
    worksheetPreviews: previewWorksheets.value,
    worksheetHeaderRanges: worksheetHeaderRanges.value,
  })
})

const staticWarnings = computed(() => {
  return checkStaticCellConsistency({
    monthWorksheetMapping: monthMappings.value,
    staticMappings: staticMappings.value,
    worksheetPreviews: previewWorksheets.value,
  })
})

function formatStructureTypeLabel(type: PreviewCellStructureType): string {
  if (type === 'formula') return '公式'
  if (type === 'merged') return '合併儲存格'
  return '一般儲存格'
}

function handleGlobalKeyDown(event: KeyboardEvent) {
  if (
    event.key === 'Escape' &&
    !isCandidatePreviewActive.value &&
    activeSelectionTarget.value !== null
  ) {
    cancelSelection()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
})

watch(
  () => [props.userId, effectiveTargetId.value],
  () => {
    cancelCandidatePreview()
    uploadFile.value = null
    replaceFile.value = null
    showReplaceForm.value = false
    resetPreviewSelection()
    loadTemplate()
  }
)

onMounted(loadTemplate)

function getAvailableTransformsForField(
  field: ReportModelSourceField | StaticSourceField
): TransformType[] {
  const fieldType = SOURCE_FIELD_DATA_TYPES[field]
  if (!fieldType) return [...ALLOWED_TRANSFORMS]
  return (ALLOWED_TRANSFORMS as readonly TransformType[]).filter((tType) => {
    const contract = TRANSFORM_CONTRACTS[tType]
    return (
      contract.allowedInputs.includes(fieldType) ||
      contract.allowedInputs.includes('ANY')
    )
  })
}

function parseValueMapOptions(
  transforms?: TransformConfig[]
): { text: string; fallback: 'keep' | 'error' } {
  const vm = transforms?.find((t) => t.type === 'VALUE_MAP')
  const opts = vm?.options as ValueMapOptions | undefined
  const text = Object.entries(opts?.map || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const fallback = opts?.unmappedBehavior === 'error' ? 'error' : 'keep'
  return { text, fallback }
}

function initializeDefaultWorksheetSelection() {
  const worksheetNames = new Set(
    previewWorksheets.value.filter((ws) => showHiddenWorksheets.value || !ws.isHidden).map((ws) => ws.name)
  )
  if (!hasManualPreviewSelection.value || !worksheetNames.has(selectedPreviewWorksheetName.value)) {
    selectedPreviewWorksheetName.value =
      monthMappings.value.find((mapping) => worksheetNames.has(mapping.worksheet))?.worksheet ||
      previewWorksheets.value.find((ws) => showHiddenWorksheets.value || !ws.isHidden)?.name ||
      previewWorksheets.value[0]?.name ||
      ''
  }
}

async function loadTemplatePreview(savedTemplate: ExportTemplate) {
  availableWorksheets.value = []
  previewWorksheets.value = []
  previewError.value = ''
  let fileBuffer: ArrayBuffer | undefined
  try {
    fileBuffer = await downloadExportTemplateFile(savedTemplate.storage_path)
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '下載範本預覽檔案失敗。'
    return
  }

  if (fileBuffer) {
    try {
      availableWorksheets.value = await getWorkbookWorksheetNames(fileBuffer)
    } catch {
      availableWorksheets.value = []
    }

    try {
      const preview = await getWorkbookPreview(fileBuffer)
      previewWorksheets.value = [...preview.worksheets]
      previewVisibleRowCount.value = 20
      initializeDefaultWorksheetSelection()
    } catch (err) {
      previewWorksheets.value = []
      previewError.value = err instanceof Error ? err.message : '無法載入範本預覽。'
    }
  }
}

function cancelCandidatePreview() {
  candidateRequestId.value++
  candidatePreviewWorksheets.value = []
  candidatePreviewError.value = ''
  candidateSelectedPreviewWorksheetName.value = ''
  candidateShowHiddenWorksheets.value = false
  candidateShowHiddenPreviewRowsAndColumns.value = false
  candidatePreviewVisibleRowCount.value = 20
}

async function loadCandidatePreview(file: File) {
  const currentReq = ++candidateRequestId.value
  candidatePreviewError.value = ''
  candidatePreviewWorksheets.value = []
  candidateSelectedPreviewWorksheetName.value = ''
  candidateShowHiddenWorksheets.value = false
  candidateShowHiddenPreviewRowsAndColumns.value = false
  candidatePreviewVisibleRowCount.value = 20

  try {
    const preview = await getWorkbookPreview(file)
    if (candidateRequestId.value !== currentReq) return
    candidatePreviewWorksheets.value = [...preview.worksheets]
    const firstVisible = preview.worksheets.find((w) => !w.isHidden) || preview.worksheets[0]
    candidateSelectedPreviewWorksheetName.value = firstVisible?.name || ''
  } catch (err) {
    if (candidateRequestId.value !== currentReq) return
    candidatePreviewWorksheets.value = []
    candidatePreviewError.value = err instanceof Error ? err.message : '無法載入範本預覽。'
  }
}

async function loadTemplate() {
  showHiddenWorksheets.value = false
  showHiddenPreviewRowsAndColumns.value = false

  if (!props.userId || !effectiveTargetId.value) {
    template.value = null
    uploadFile.value = null
    replaceFile.value = null
    showReplaceForm.value = false
    cancelCandidatePreview()
    resetPreviewSelection()
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  previewError.value = ''
  previewWorksheets.value = []
  previewVisibleRowCount.value = 20

  try {
    const previousTemplateId = template.value?.id || null
    const loaded = await getExportTemplate(props.userId, effectiveTargetId.value, {
      by: props.assignmentId ? 'assignment_id' : 'context_id',
    })
    if (previousTemplateId !== (loaded?.id || null)) {
      resetPreviewSelection()
    }
    template.value = loaded

    if (loaded) {
      editingName.value = loaded.name
      monthMappings.value = Object.entries(loaded.month_worksheet_mapping || {}).map(
        ([month, worksheet]) => ({ month, worksheet })
      )
      rowMappings.value = (loaded.row_mapping || []).map((m) => {
        const vmInfo = parseValueMapOptions(m.transforms)
        return {
          sourceField: m.sourceField,
          targetColumn: m.targetColumn,
          transformType: m.transforms?.[0]?.type || '',
          transforms: m.transforms ? [...m.transforms] : [],
          valueMapText: vmInfo.text,
          valueMapFallback: vmInfo.fallback,
        }
      })

      staticMappings.value = (loaded.static_cell_mapping || []).map((m) => {
        const vmInfo = parseValueMapOptions(m.transforms)
        return {
          sourceField: m.sourceField,
          targetCell: m.targetCell,
          transformType: m.transforms?.[0]?.type || '',
          transforms: m.transforms ? [...m.transforms] : [],
          valueMapText: vmInfo.text,
          valueMapFallback: vmInfo.fallback,
        }
      })

      await loadTemplatePreview(loaded)
    } else {
      uploadName.value = `${effectiveTargetName.value} 出勤範本`
      uploadFile.value = null
      replaceFile.value = null
      showReplaceForm.value = false
      availableWorksheets.value = []
      previewWorksheets.value = []
      cancelCandidatePreview()
      resetPreviewSelection()
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '載入範本資料失敗。'
  } finally {
    isLoading.value = false
  }
}

function handlePreviewWorksheetChange() {
  if (!isCandidatePreviewActive.value) {
    hasManualPreviewSelection.value = true
  }
  activePreviewVisibleRowCount.value = 20
}

function loadMorePreviewRows() {
  activePreviewVisibleRowCount.value = Math.min(activePreviewVisibleRowCount.value + 20, 200)
}

function getPreviewCellValue(row: WorkbookPreviewRow, column: string): string {
  return row.cells.find((cell) => cell.column === column)?.text || ''
}

async function handleUploadFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    try {
      validateXlsxFileInput(target.files[0])
      uploadFile.value = target.files[0]
      errorMessage.value = ''
      await loadCandidatePreview(target.files[0])
    } catch (err) {
      uploadFile.value = null
      target.value = ''
      cancelCandidatePreview()
      errorMessage.value = err instanceof Error ? err.message : '檔案格式無效。'
    }
  } else {
    uploadFile.value = null
    cancelCandidatePreview()
  }
}

async function handleReplaceFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    try {
      validateXlsxFileInput(target.files[0])
      replaceFile.value = target.files[0]
      errorMessage.value = ''
      await loadCandidatePreview(target.files[0])
    } catch (err) {
      replaceFile.value = null
      target.value = ''
      cancelCandidatePreview()
      errorMessage.value = err instanceof Error ? err.message : '檔案格式無效。'
    }
  } else {
    replaceFile.value = null
    cancelCandidatePreview()
  }
}

function cancelReplace() {
  showReplaceForm.value = false
  replaceFile.value = null
  if (replaceFileInput.value) {
    replaceFileInput.value.value = ''
  }
  cancelCandidatePreview()
}

function toggleReplaceForm() {
  if (showReplaceForm.value) {
    cancelReplace()
  } else {
    showReplaceForm.value = true
  }
}

async function handleUpload() {
  if (isUploading.value) return
  errorMessage.value = ''
  successMessage.value = ''

  if (!uploadName.value.trim()) {
    errorMessage.value = '請輸入範本名稱。'
    await nextTick()
    errorRegion.value?.focus()
    return
  }

  if (!uploadFile.value) {
    errorMessage.value = '請選擇 .xlsx 活頁簿檔案。'
    await nextTick()
    errorRegion.value?.focus()
    return
  }

  isUploading.value = true

  try {
    const created = await uploadExportTemplate({
      userId: props.userId,
      assignmentId: props.assignmentId,
      contextId: props.contextId,
      name: uploadName.value.trim(),
      file: uploadFile.value,
    })
    cancelCandidatePreview()
    uploadFile.value = null
    template.value = created
    resetPreviewSelection()
    await loadTemplate()
    successMessage.value = 'XLSX 範本上傳成功。'
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '上傳範本失敗。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isUploading.value = false
  }
}

async function handleReplace() {
  if (isReplacing.value || !template.value) return
  errorMessage.value = ''
  successMessage.value = ''

  if (!replaceFile.value) {
    errorMessage.value = '請選擇要替換的 .xlsx 活頁簿檔案。'
    await nextTick()
    errorRegion.value?.focus()
    return
  }

  isReplacing.value = true

  try {
    const result = await replaceExportTemplate({
      userId: props.userId,
      currentTemplate: template.value,
      newFile: replaceFile.value,
      newName: replaceName.value.trim() || undefined,
    })
    cancelCandidatePreview()
    showReplaceForm.value = false
    replaceFile.value = null
    resetPreviewSelection()
    await loadTemplate()
    if (result.warning) {
      successMessage.value = `XLSX 範本檔案已成功更換，但舊檔案清理未完成：${result.warning}`
    } else {
      successMessage.value = 'XLSX 範本檔案已成功更換。'
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '更換範本檔案失敗。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isReplacing.value = false
  }
}

async function handleDelete() {
  if (isDeleting.value || !template.value) return
  if (!window.confirm(`確定要刪除「${template.value.name}」範本嗎？`)) return

  isDeleting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await deleteExportTemplate(props.userId, template.value)
    cancelCandidatePreview()
    template.value = null
    uploadFile.value = null
    replaceFile.value = null
    showReplaceForm.value = false
    availableWorksheets.value = []
    previewWorksheets.value = []
    resetPreviewSelection()
    previewVisibleRowCount.value = 20
    successMessage.value = '範本已成功刪除。'
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '刪除範本失敗。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isDeleting.value = false
  }
}

async function handleDownloadSource() {
  if (!template.value) return
  try {
    const buffer = await downloadExportTemplateFile(template.value.storage_path)
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.value.name}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '下載範本失敗。'
  }
}

function addMonthMapping() {
  const currentMonthStr = new Date().toISOString().slice(0, 7)
  monthMappings.value.push({
    month: currentMonthStr,
    worksheet: availableWorksheets.value[0] || '',
  })
}

function removeMonthMapping(index: number) {
  monthMappings.value.splice(index, 1)
}

function addRowMapping() {
  rowMappings.value.push({
    sourceField: 'actual_clock_in_at',
    targetColumn: 'C',
    transformType: 'TIME_HH_MM',
    transforms: [{ type: 'TIME_HH_MM' }],
    valueMapText: '',
    valueMapFallback: 'keep',
  })
}

function removeRowMapping(index: number) {
  if (activeSelectionTarget.value?.kind === 'row_mapping') {
    if (activeSelectionTarget.value.index === index) {
      activeSelectionTarget.value = null
    } else if (activeSelectionTarget.value.index > index) {
      activeSelectionTarget.value = {
        kind: 'row_mapping',
        index: activeSelectionTarget.value.index - 1,
      }
    }
  }
  if (focusedRowIndex.value === index) {
    focusedRowIndex.value = null
  } else if (focusedRowIndex.value !== null && focusedRowIndex.value > index) {
    focusedRowIndex.value -= 1
  }
  rowMappings.value.splice(index, 1)
}

function addStaticMapping() {
  staticMappings.value.push({
    sourceField: 'year_month',
    targetCell: 'B2',
    transformType: 'ROC_YEAR_MONTH',
    transforms: [{ type: 'ROC_YEAR_MONTH' }],
    valueMapText: '',
    valueMapFallback: 'keep',
  })
}

function removeStaticMapping(index: number) {
  if (activeSelectionTarget.value?.kind === 'static_mapping') {
    if (activeSelectionTarget.value.index === index) {
      activeSelectionTarget.value = null
    } else if (activeSelectionTarget.value.index > index) {
      activeSelectionTarget.value = {
        kind: 'static_mapping',
        index: activeSelectionTarget.value.index - 1,
      }
    }
  }
  if (focusedStaticIndex.value === index) {
    focusedStaticIndex.value = null
  } else if (focusedStaticIndex.value !== null && focusedStaticIndex.value > index) {
    focusedStaticIndex.value -= 1
  }
  staticMappings.value.splice(index, 1)
}

function parseValueMapFromText(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of (text || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim()
      if (k) map[k] = v
    }
  }
  return map
}

function buildTransformsForEntry(
  transformType: string,
  existingTransforms: TransformConfig[],
  valueMapText: string,
  valueMapFallback: 'keep' | 'error'
): TransformConfig[] | undefined {
  if (!transformType) {
    return undefined
  }

  const isPreservingTail =
    existingTransforms.length > 1 && existingTransforms[0].type === transformType

  let firstStage: TransformConfig
  if (transformType === 'VALUE_MAP') {
    const map = parseValueMapFromText(valueMapText)
    firstStage = {
      type: 'VALUE_MAP',
      options: {
        map,
        unmappedBehavior: valueMapFallback,
      },
    }
  } else {
    firstStage =
      existingTransforms.length > 0 && existingTransforms[0].type === transformType
        ? { ...existingTransforms[0] }
        : { type: transformType as TransformType }
  }

  if (isPreservingTail) {
    return [firstStage, ...existingTransforms.slice(1)]
  }

  return [firstStage]
}

async function handleSaveMapping() {
  if (isSaving.value || !template.value) return
  errorMessage.value = ''
  successMessage.value = ''

  const monthObj: Record<string, string> = {}
  for (const m of monthMappings.value) {
    if (m.month.trim() && m.worksheet.trim()) {
      monthObj[m.month.trim()] = m.worksheet.trim()
    }
  }

  const rowEntries: RowMappingEntry[] = rowMappings.value.map((r) => ({
    sourceField: r.sourceField,
    targetColumn: r.targetColumn.trim().toUpperCase(),
    transforms: buildTransformsForEntry(
      r.transformType,
      r.transforms,
      r.valueMapText,
      r.valueMapFallback
    ),
  }))

  const staticEntries: StaticCellMappingEntry[] = staticMappings.value.map((s) => ({
    sourceField: s.sourceField,
    targetCell: s.targetCell.trim().toUpperCase(),
    transforms: buildTransformsForEntry(
      s.transformType,
      s.transforms,
      s.valueMapText,
      s.valueMapFallback
    ),
  }))

  isSaving.value = true

  try {
    const updated = await saveExportTemplateMapping({
      userId: props.userId,
      templateId: template.value.id,
      name: editingName.value.trim(),
      monthWorksheetMapping: monthObj,
      rowMapping: rowEntries,
      staticCellMapping: staticEntries,
    })
    template.value = updated
    successMessage.value = '範本設定已儲存。'
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '儲存範本設定失敗。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="grid gap-6">
    <p
      v-if="errorMessage"
      ref="errorRegion"
      class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error-ink)]"
      role="alert"
      tabindex="-1"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="successMessage"
      class="rounded-[0.625rem] border border-line bg-surface-soft p-4 text-sm font-semibold text-accent"
      role="status"
    >
      {{ successMessage }}
    </p>

    <!-- Loading State -->
    <div v-if="isLoading" class="p-6 text-center text-sm text-muted">
      載入中…
    </div>

    <!-- Empty State: Upload Prompt -->
    <div
      v-if="!template"
      class="grid gap-4 rounded-xl border border-dashed border-line p-6 text-center sm:p-8"
    >
      <div class="mx-auto grid max-w-md gap-2">
        <h3 class="font-display text-lg font-semibold">尚未上傳 XLSX 匯出範本</h3>
        <p class="text-xs leading-relaxed text-muted">
          上傳包含工作表的 .xlsx 檔案，可自訂每月匯出時的欄位與儲存格對應。
        </p>
      </div>

      <form class="mx-auto mt-2 grid w-full max-w-sm gap-3" @submit.prevent="handleUpload">
        <div class="grid gap-1 text-left">
          <label for="upload-template-name" class="text-xs font-semibold text-muted">範本名稱</label>
          <input
            id="upload-template-name"
            v-model="uploadName"
            type="text"
            class="min-h-11 rounded-[0.625rem] border border-line bg-canvas px-3 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            placeholder="例如: 公司出勤月報表"
            required
          />
        </div>

        <div class="grid gap-1 text-left">
          <label for="upload-file-input" class="text-xs font-semibold text-muted">選擇 Excel 範本檔 (.xlsx)</label>
          <input
            id="upload-file-input"
            ref="uploadFileInput"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            class="min-h-11 rounded-[0.625rem] border border-line bg-canvas px-3 py-2 text-sm text-ink file:mr-3 file:rounded-[0.375rem] file:border-0 file:bg-surface-soft file:px-3 file:py-1 file:text-xs file:font-semibold"
            required
            @change="handleUploadFileChange"
          />
        </div>

        <button
          type="submit"
          data-test="upload-template-button"
          :disabled="isUploading || !uploadFile"
          class="mt-2 inline-flex min-h-11 items-center justify-center rounded-[0.625rem] bg-accent px-4 py-2 font-semibold text-surface transition duration-200 enabled:hover:-translate-y-px disabled:opacity-50"
        >
          {{ isUploading ? '上傳中…' : '上傳範本檔案' }}
        </button>
      </form>
    </div>

    <!-- Active Template Configuration UI -->
    <div v-else class="grid gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface-soft p-4">
        <div>
          <span class="text-xs font-bold text-accent">目前範本</span>
          <h3 class="font-display text-lg font-semibold text-ink">{{ template.name }}</h3>
          <p class="text-xs text-muted">
            建立時間：{{ new Date(template.created_at).toLocaleDateString('zh-TW') }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
            @click="handleDownloadSource"
          >
            下載原始範本
          </button>
          <button
            type="button"
            class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
            @click="toggleReplaceForm"
          >
            更換檔案
          </button>
          <button
            type="button"
            class="min-h-10 rounded-[0.625rem] border border-[var(--error-line)] bg-surface px-3 py-1.5 text-xs font-semibold text-[var(--error-ink)] hover:bg-[var(--error-surface)]"
            :disabled="isDeleting"
            @click="handleDelete"
          >
            刪除範本
          </button>
        </div>
      </div>

      <!-- Replace form if toggled -->
      <div v-if="showReplaceForm" class="rounded-xl border border-line p-4 sm:p-5">
        <h4 class="font-semibold text-sm">更換範本檔案</h4>
        <p class="text-xs text-muted mt-1">上傳新的 .xlsx 檔案，原有的欄位對應設定將會保留（新檔案需包含目前已設定的月份工作表）。</p>
        <form class="mt-3 grid gap-3 max-w-lg" @submit.prevent="handleReplace">
          <input
            ref="replaceFileInput"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            class="min-h-11 rounded-[0.625rem] border border-line bg-canvas px-3 py-2 text-sm text-ink file:mr-3 file:rounded-[0.375rem] file:border-0 file:bg-surface-soft file:px-3 file:py-1 file:text-xs file:font-semibold"
            required
            @change="handleReplaceFileChange"
          />
          <div class="flex gap-2">
            <button
              type="submit"
              :disabled="isReplacing || !replaceFile"
              class="min-h-10 rounded-[0.625rem] bg-accent px-4 py-1.5 text-xs font-semibold text-surface disabled:opacity-50"
            >
              {{ isReplacing ? '更換中…' : '確認更換' }}
            </button>
            <button
              type="button"
              class="min-h-10 rounded-[0.625rem] border border-line px-4 py-1.5 text-xs font-semibold text-muted"
              @click="cancelReplace"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Read-only workbook preview -->
    <section
      v-if="template || uploadFile || activePreviewWorksheets.length || activePreviewError"
      class="grid min-w-0 gap-3 border-t border-line pt-5"
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 class="font-semibold text-base">工作表預覽</h4>
          <p class="text-xs text-muted">唯讀檢視範本內容；不會修改或影響下方的對應設定。</p>
        </div>

        <div v-if="activePreviewWorksheets.length" class="flex flex-wrap items-end justify-end gap-3">
          <label
            v-if="hasHiddenPreviewWorksheets"
            for="show-hidden-worksheets"
            class="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-muted"
          >
            <input
              id="show-hidden-worksheets"
              v-model="activeShowHiddenWorksheets"
              type="checkbox"
              name="show-hidden-worksheets"
              class="h-4 w-4"
            />
            顯示隱藏工作表
          </label>

          <label
            v-if="hasHiddenPreviewRowsOrColumns"
            for="show-hidden-preview-rows-columns"
            class="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-muted"
          >
            <input
              id="show-hidden-preview-rows-columns"
              v-model="activeShowHiddenPreviewRowsAndColumns"
              type="checkbox"
              name="show-hidden-preview-rows-columns"
              class="h-4 w-4"
            />
            顯示隱藏列／欄
          </label>

          <div v-if="selectablePreviewWorksheets.length" class="grid min-w-[12rem] gap-1">
            <label for="preview-worksheet-select" class="text-xs font-semibold text-muted">預覽工作表</label>
            <select
              id="preview-worksheet-select"
              data-test="preview-worksheet-select"
              v-model="activeSelectedPreviewWorksheetName"
              class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              @change="handlePreviewWorksheetChange"
            >
              <option
                v-for="worksheet in selectablePreviewWorksheets"
                :key="worksheet.name"
                :value="worksheet.name"
              >
                {{ worksheet.name }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <p
        v-if="activePreviewError"
        data-test="preview-error"
        class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error-ink)]"
        role="alert"
      >
        預覽無法載入：{{ activePreviewError }}
      </p>

      <template v-else-if="selectedPreviewWorksheet">
        <p
          v-if="selectedPreviewWorksheet.isProtected"
          data-test="preview-protected-notice"
          class="rounded-[0.625rem] border border-line bg-surface-soft p-3 text-xs text-ink"
          role="status"
        >
          此工作表受保護，預覽為唯讀；仍可編輯對應設定。
        </p>

        <p
          v-if="selectedPreviewWorksheet.hasImages"
          data-test="preview-images-notice"
          class="rounded-[0.625rem] border border-line bg-surface-soft p-3 text-xs text-ink"
        >
          此工作表含圖片；Preview 不顯示圖片。
        </p>

        <!-- Header Reference Range Controls -->
        <div
          v-if="!isCandidatePreviewActive"
          class="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-xs"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-ink">欄位標題參考範圍：</span>
            <label for="header-range-start" class="text-muted">起始列</label>
            <input
              id="header-range-start"
              data-test="header-range-start"
              v-model.number="currentRangeStart"
              type="number"
              min="1"
              placeholder="例如: 4"
              class="w-16 min-h-8 rounded-[0.375rem] border border-line bg-canvas px-2 font-mono text-xs text-ink"
              @keydown.enter.prevent="applyHeaderRange"
            />
            <label for="header-range-end" class="text-muted">結束列</label>
            <input
              id="header-range-end"
              data-test="header-range-end"
              v-model.number="currentRangeEnd"
              type="number"
              min="1"
              placeholder="例如: 5"
              class="w-16 min-h-8 rounded-[0.375rem] border border-line bg-canvas px-2 font-mono text-xs text-ink"
              @keydown.enter.prevent="applyHeaderRange"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-test="apply-header-range-btn"
              class="min-h-8 rounded-[0.375rem] bg-accent px-2.5 py-1 text-xs font-semibold text-surface hover:opacity-90"
              @click="applyHeaderRange"
            >
              設定標題範圍
            </button>
            <button
              v-if="selectedPreviewWorksheet && worksheetHeaderRanges[selectedPreviewWorksheet.name]"
              type="button"
              data-test="clear-header-range-btn"
              class="min-h-8 rounded-[0.375rem] border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
              @click="clearHeaderRange"
            >
              清除
            </button>
            <span
              v-if="selectedPreviewWorksheet && worksheetHeaderRanges[selectedPreviewWorksheet.name]"
              data-test="current-header-range-info"
              class="text-accent font-semibold"
            >
              已設定：Row {{ worksheetHeaderRanges[selectedPreviewWorksheet.name].startRow }}–{{ worksheetHeaderRanges[selectedPreviewWorksheet.name].endRow }}
            </span>
          </div>
          <p v-if="currentRangeError" data-test="header-range-error" class="w-full text-xs text-[var(--error-ink)]">
            {{ currentRangeError }}
          </p>
        </div>

        <!-- Active Selection Banner -->
        <div
          v-if="!isCandidatePreviewActive && activeSelectionTarget !== null"
          data-test="preview-selection-active-banner"
          class="flex flex-wrap items-center justify-between gap-2 rounded-[0.625rem] border border-accent bg-surface-soft p-3 text-xs text-ink"
        >
          <span>
            正在為「<strong>{{ activeSelectionFieldLabel }}</strong>」選取目標{{ activeSelectionTarget.kind === 'row_mapping' ? '欄位' : '儲存格' }}。請點擊下方{{ activeSelectionTarget.kind === 'row_mapping' ? '欄位標題' : '儲存格' }}，或使用鍵盤 Enter / Space 完成選取。
          </span>
          <button
            type="button"
            data-test="cancel-preview-selection-button"
            class="min-h-8 rounded-[0.375rem] border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-accent"
            @click="cancelSelection"
          >
            取消選取 (Esc)
          </button>
        </div>

        <div class="min-w-0 overflow-x-auto rounded-[0.625rem] border border-line">
          <table class="min-w-max border-collapse text-left text-xs text-ink">
            <caption class="border-b border-line bg-surface-soft px-3 py-2 text-left font-semibold">
              工作表「{{ selectedPreviewWorksheet.name }}」內容預覽
            </caption>
            <thead class="bg-surface-soft">
              <tr>
                <th scope="col" class="sticky left-0 border-r border-line px-3 py-2 font-semibold">列</th>
                <th
                  v-for="column in visiblePreviewColumns"
                  :key="column.column"
                  scope="col"
                  :data-test="`preview-column-header-${column.column}`"
                  :class="[
                    'border-b border-line px-3 py-2 font-mono font-semibold transition-colors',
                    highlightedTargetColumn === column.column ? 'bg-accent/15 border-accent text-accent' : '',
                    !isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' ? 'cursor-pointer hover:bg-accent/25 focus-visible:outline-3 focus-visible:outline-accent' : ''
                  ]"
                  :tabindex="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' ? 0 : undefined"
                  :role="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' ? 'button' : undefined"
                  :aria-label="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' ? `選取目標欄位 ${column.column}` : undefined"
                  @click="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' && selectPreviewColumn(column.column)"
                  @keydown.enter.prevent="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' && selectPreviewColumn(column.column)"
                  @keydown.space.prevent="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'row_mapping' && selectPreviewColumn(column.column)"
                >
                  <div class="flex flex-col">
                    <span>
                      {{ column.column }}
                      <span v-if="column.isHidden">（隱藏欄）</span>
                    </span>
                    <span
                      v-if="!isCandidatePreviewActive && currentSheetDerivedLabels.get(column.column)"
                      class="font-sans font-normal text-[0.6875rem] text-muted truncate max-w-[10rem]"
                      :title="currentSheetDerivedLabels.get(column.column)"
                    >
                      {{ currentSheetDerivedLabels.get(column.column) }}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visiblePreviewRows" :key="row.rowNumber" class="border-t border-line">
                <th scope="row" class="sticky left-0 border-r border-line bg-surface-soft px-3 py-2 font-mono font-semibold">
                  {{ row.rowNumber }}
                  <span v-if="row.isHidden">（隱藏列）</span>
                </th>
                <td
                  v-for="column in visiblePreviewColumns"
                  :key="column.column"
                  :data-test="`preview-cell-${column.column}${row.rowNumber}`"
                  :class="[
                    'px-3 py-2 align-top transition-colors',
                    highlightedTargetColumn === column.column ? 'bg-accent/5' : '',
                    highlightedTargetCell === `${column.column}${row.rowNumber}` ? 'bg-accent/20 border-accent font-semibold text-accent' : '',
                    !isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' ? 'cursor-pointer hover:bg-accent/25 focus-visible:outline-3 focus-visible:outline-accent' : ''
                  ]"
                  :tabindex="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' ? 0 : undefined"
                  :role="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' ? 'button' : undefined"
                  :aria-label="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' ? `選取目標儲存格 ${column.column}${row.rowNumber}` : undefined"
                  @click="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' && selectPreviewCell(column.column, row.rowNumber)"
                  @keydown.enter.prevent="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' && selectPreviewCell(column.column, row.rowNumber)"
                  @keydown.space.prevent="!isCandidatePreviewActive && activeSelectionTarget?.kind === 'static_mapping' && selectPreviewCell(column.column, row.rowNumber)"
                >
                  <span
                    :title="getPreviewCellValue(row, column.column)"
                    :tabindex="!isCandidatePreviewActive && activeSelectionTarget === null ? 0 : undefined"
                    class="block max-w-[14rem] truncate rounded-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {{ getPreviewCellValue(row, column.column) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          v-if="previewRows.length > visiblePreviewRows.length && visiblePreviewRows.length < 200"
          type="button"
          data-test="preview-load-more"
          class="min-h-10 justify-self-start rounded-[0.5rem] border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="loadMorePreviewRows"
        >
          載入更多列（每次 20 列）
        </button>
      </template>

      <p v-else class="text-xs text-muted">目前沒有可顯示的工作表預覽。</p>
    </section>

    <!-- Mapping Form -->
    <form v-if="template" data-test="mapping-form" class="grid gap-8" @submit.prevent="handleSaveMapping">
        <div class="grid gap-1.5 max-w-md">
          <label for="template-name-input" class="font-semibold text-sm">範本名稱</label>
          <input
            id="template-name-input"
            v-model="editingName"
            type="text"
            class="min-h-11 rounded-[0.625rem] border border-line bg-canvas px-3 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            required
          />
        </div>

        <!-- Section A: Month Worksheet Mapping -->
        <section class="grid gap-3 border-t border-line pt-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="font-semibold text-base">月份工作表對應 (Month Worksheet Mapping)</h4>
              <p class="text-xs text-muted">指定各月份 (YYYY-MM) 匯出時要寫入的 Excel 工作表名稱。</p>
            </div>
            <button
              type="button"
              class="min-h-9 rounded-[0.5rem] border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
              @click="addMonthMapping"
            >
              + 新增月份對應
            </button>
          </div>

          <div v-if="monthMappings.length" class="grid gap-2">
            <div
              v-for="(item, idx) in monthMappings"
              :key="idx"
              class="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3"
            >
              <div class="grid gap-1 min-w-[140px]">
                <label :for="`month-key-${idx}`" class="text-xs font-semibold text-muted">月份 (YYYY-MM)</label>
                <input
                  :id="`month-key-${idx}`"
                  v-model="item.month"
                  type="month"
                  class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 font-mono text-xs text-ink"
                  required
                />
              </div>

              <div class="grid gap-1 flex-1 min-w-[180px]">
                <label :for="`month-sheet-${idx}`" class="text-xs font-semibold text-muted">對應工作表</label>
                <select
                  v-if="availableWorksheets.length"
                  :id="`month-sheet-${idx}`"
                  v-model="item.worksheet"
                  class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  required
                >
                  <option v-for="ws in availableWorksheets" :key="ws" :value="ws">
                    {{ ws }}
                  </option>
                </select>
                <input
                  v-else
                  :id="`month-sheet-${idx}`"
                  v-model="item.worksheet"
                  type="text"
                  placeholder="例如: 8月"
                  class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  required
                />
              </div>

              <button
                type="button"
                class="self-end min-h-10 px-2.5 text-xs text-[var(--error-ink)] hover:underline"
                @click="removeMonthMapping(idx)"
              >
                刪除
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-muted italic">尚未設定任何月份對應，請點擊上方按鈕新增。</p>
        </section>

        <!-- Section B: Daily Row Mapping -->
        <section class="grid gap-3 border-t border-line pt-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="font-semibold text-base">每日列欄位對應（Row Mapping）</h4>
              <p class="text-xs text-muted">設定報表欄位寫入工作表的英文字母欄位代號（如 A, B, C）。必須包含一個「日期」定位欄。</p>
            </div>
            <button
              type="button"
              class="min-h-9 rounded-[0.5rem] border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
              @click="addRowMapping"
            >
              + 新增欄位對應
            </button>
          </div>

          <!-- Cross-Worksheet Header Consistency Warning (Non-blocking) -->
          <div
            v-if="headerWarnings.length"
            data-test="header-consistency-warning"
            class="rounded-[0.625rem] border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200"
            role="status"
          >
            <div class="font-semibold mb-1">欄位標題一致性提示（非阻擋性）：</div>
            <ul class="list-disc list-inside space-y-0.5">
              <li v-for="w in headerWarnings" :key="w.column">
                目標欄位 <strong>{{ w.column }}</strong>（{{ FIELD_LABELS[w.sourceField] || w.sourceField }}）在不同月份工作表中的標題不同：
                <span v-for="(sheetHeader, index) in w.sheetHeaders" :key="sheetHeader.sheetName">
                  {{ sheetHeader.sheetName }}: 「{{ sheetHeader.headerLabel }}」{{ index < w.sheetHeaders.length - 1 ? '、' : '' }}
                </span>
              </li>
            </ul>
          </div>

          <div class="grid gap-3">
            <div
              v-for="(item, idx) in rowMappings"
              :key="idx"
              class="grid gap-3 rounded-lg border border-line bg-surface p-3"
              @click="focusedRowIndex = idx"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="grid gap-1 min-w-[200px] flex-1">
                  <label :for="`row-source-${idx}`" class="text-xs font-semibold text-muted">報表資料欄位</label>
                  <select
                    :id="`row-source-${idx}`"
                    v-model="item.sourceField"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                    @focus="focusedRowIndex = idx"
                  >
                    <option v-for="f in REPORT_MODEL_SOURCE_FIELDS" :key="f" :value="f">
                      {{ FIELD_LABELS[f] || f }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1 min-w-[220px]">
                  <label :for="`row-col-${idx}`" class="text-xs font-semibold text-muted">目標欄位</label>
                  <div class="flex items-center gap-1.5">
                    <select
                      v-if="columnPickerOptions.length"
                      :id="`row-col-select-${idx}`"
                      :data-test="`row-col-select-${idx}`"
                      :value="columnPickerOptions.some(opt => opt.column === item.targetColumn.trim().toUpperCase()) ? item.targetColumn.trim().toUpperCase() : ''"
                      class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2 text-xs text-ink flex-1"
                      @change="onColumnSelectChange($event, item)"
                      @focus="focusedRowIndex = idx"
                    >
                      <option value="" disabled>{{ item.targetColumn ? `自訂欄位 (${item.targetColumn})` : '選擇欄位…' }}</option>
                      <option
                        v-for="opt in columnPickerOptions"
                        :key="opt.column"
                        :value="opt.column"
                      >
                        {{ opt.displayLabel }}
                      </option>
                    </select>
                    <input
                      :id="`row-col-${idx}`"
                      :data-test="`row-col-input-${idx}`"
                      v-model="item.targetColumn"
                      type="text"
                      placeholder="例如: B"
                      maxlength="3"
                      class="w-16 min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 font-mono text-xs uppercase text-ink text-center"
                      required
                      @focus="focusedRowIndex = idx"
                    />
                    <button
                      type="button"
                      :data-test="`select-from-preview-btn-${idx}`"
                      :class="[
                        'min-h-10 px-2.5 py-1 text-xs font-semibold rounded-[0.5rem] border transition-colors whitespace-nowrap',
                        isRowMappingSelectionActive(idx)
                          ? 'bg-accent text-surface border-accent'
                          : 'bg-surface text-ink border-line hover:border-accent'
                      ]"
                      :aria-pressed="isRowMappingSelectionActive(idx)"
                      @click="toggleRowMappingSelection(idx)"
                    >
                      {{ isRowMappingSelectionActive(idx) ? '選取中…' : '從預覽選取' }}
                    </button>
                  </div>
                </div>

                <div class="grid gap-1 min-w-[180px] flex-1">
                  <label :for="`row-transform-${idx}`" class="text-xs font-semibold text-muted">資料轉換規則 (選填)</label>
                  <select
                    :id="`row-transform-${idx}`"
                    v-model="item.transformType"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  >
                    <option value="">無 (原值寫入)</option>
                    <option
                      v-for="tKey in getAvailableTransformsForField(item.sourceField)"
                      :key="tKey"
                      :value="tKey"
                    >
                      {{ TRANSFORM_LABELS[tKey] || tKey }}
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  class="self-end min-h-10 px-2.5 text-xs text-[var(--error-ink)] hover:underline"
                  @click="removeRowMapping(idx)"
                >
                  刪除
                </button>
              </div>

              <!-- Value Map Options if selected -->
              <div
                v-if="item.transformType === 'VALUE_MAP'"
                class="grid gap-2 rounded border border-line bg-canvas p-3 text-xs"
              >
                <div class="grid gap-1">
                  <label class="font-semibold text-muted">值映射設定 (每行一組 原值=目標值，如: WORK=出勤)</label>
                  <textarea
                    v-model="item.valueMapText"
                    rows="2"
                    placeholder="WORK=出勤&#10;LEAVE=請假"
                    class="rounded border border-line bg-surface p-2 font-mono text-xs text-ink"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <label class="font-semibold text-muted">未配對時處理：</label>
                  <select
                    v-model="item.valueMapFallback"
                    class="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="keep">保持原值 (keep)</option>
                    <option value="error">中斷並報錯 (error)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Section C: Static Cell Mapping -->
        <section class="grid gap-3 border-t border-line pt-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="font-semibold text-base">靜態儲存格對應（Static Cell Mapping）</h4>
              <p class="text-xs text-muted">將報表全域欄位（如月份、公司識別碼）填入指定 A1 儲存格（如 B2, D2）。</p>
            </div>
            <button
              type="button"
              class="min-h-9 rounded-[0.5rem] border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
              @click="addStaticMapping"
            >
              + 新增儲存格對應
            </button>
          </div>

          <!-- Cross-Worksheet Static Cell Consistency Warning (Non-blocking) -->
          <div
            v-if="staticWarnings.length"
            data-test="static-consistency-warning"
            class="rounded-[0.625rem] border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200"
            role="status"
          >
            <div class="font-semibold mb-1">儲存格結構一致性提示（非阻擋性）：</div>
            <ul class="list-disc list-inside space-y-0.5">
              <li v-for="w in staticWarnings" :key="w.cell">
                目標儲存格 <strong>{{ w.cell }}</strong>（{{ STATIC_FIELD_LABELS[w.sourceField] || w.sourceField }}）在不同月份工作表中的結構型態不同：
                <span v-for="(sheetStruct, index) in w.sheetStructures" :key="sheetStruct.sheetName">
                  {{ sheetStruct.sheetName }}: 「{{ formatStructureTypeLabel(sheetStruct.structureType) }}」{{ index < w.sheetStructures.length - 1 ? '、' : '' }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="staticMappings.length" class="grid gap-3">
            <div
              v-for="(item, idx) in staticMappings"
              :key="idx"
              class="grid gap-3 rounded-lg border border-line bg-surface p-3"
              @click="focusedStaticIndex = idx; focusedRowIndex = null"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="grid gap-1 min-w-[200px] flex-1">
                  <label :for="`static-source-${idx}`" class="text-xs font-semibold text-muted">全域資料欄位</label>
                  <select
                    :id="`static-source-${idx}`"
                    v-model="item.sourceField"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                    @focus="focusedStaticIndex = idx; focusedRowIndex = null"
                  >
                    <option v-for="f in STATIC_SOURCE_FIELDS" :key="f" :value="f">
                      {{ STATIC_FIELD_LABELS[f] || f }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1 min-w-[220px]">
                  <label :for="`static-cell-${idx}`" class="text-xs font-semibold text-muted">目標儲存格 (A1)</label>
                  <div class="flex items-center gap-1.5">
                    <input
                      :id="`static-cell-${idx}`"
                      :data-test="`static-cell-input-${idx}`"
                      v-model="item.targetCell"
                      type="text"
                      placeholder="例如: B2"
                      maxlength="6"
                      class="w-20 min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 font-mono text-xs uppercase text-ink text-center"
                      required
                      @focus="focusedStaticIndex = idx; focusedRowIndex = null"
                    />
                    <button
                      type="button"
                      :data-test="`select-static-from-preview-btn-${idx}`"
                      :class="[
                        'min-h-10 px-2.5 py-1 text-xs font-semibold rounded-[0.5rem] border transition-colors whitespace-nowrap',
                        isStaticMappingSelectionActive(idx)
                          ? 'bg-accent text-surface border-accent'
                          : 'bg-surface text-ink border-line hover:border-accent'
                      ]"
                      :aria-pressed="isStaticMappingSelectionActive(idx)"
                      @click="toggleStaticMappingSelection(idx)"
                    >
                      {{ isStaticMappingSelectionActive(idx) ? '選取中…' : '從預覽選取' }}
                    </button>
                  </div>
                </div>

                <div class="grid gap-1 min-w-[180px] flex-1">
                  <label :for="`static-transform-${idx}`" class="text-xs font-semibold text-muted">資料轉換規則 (選填)</label>
                  <select
                    :id="`static-transform-${idx}`"
                    v-model="item.transformType"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  >
                    <option value="">無 (原值寫入)</option>
                    <option
                      v-for="tKey in getAvailableTransformsForField(item.sourceField)"
                      :key="tKey"
                      :value="tKey"
                    >
                      {{ TRANSFORM_LABELS[tKey] || tKey }}
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  class="self-end min-h-10 px-2.5 text-xs text-[var(--error-ink)] hover:underline"
                  @click="removeStaticMapping(idx)"
                >
                  刪除
                </button>
              </div>

              <!-- Value Map Options if selected -->
              <div
                v-if="item.transformType === 'VALUE_MAP'"
                class="grid gap-2 rounded border border-line bg-canvas p-3 text-xs"
              >
                <div class="grid gap-1">
                  <label class="font-semibold text-muted">值映射設定 (每行一組 原值=目標值，如: ACME_CORP= Acme 企業)</label>
                  <textarea
                    v-model="item.valueMapText"
                    rows="2"
                    placeholder="ACME=公司名稱"
                    class="rounded border border-line bg-surface p-2 font-mono text-xs text-ink"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <label class="font-semibold text-muted">未配對時處理：</label>
                  <select
                    v-model="item.valueMapFallback"
                    class="rounded border border-line bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="keep">保持原值 (keep)</option>
                    <option value="error">中斷並報錯 (error)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-xs text-muted italic">尚未設定任何靜態儲存格對應，可點擊上方按鈕新增。</p>
        </section>

        <!-- Submit Button -->
        <div class="flex items-center gap-4">
          <button
            type="submit"
            data-test="save-mapping-button"
            :disabled="isSaving"
            class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] bg-accent px-6 py-2 font-semibold text-surface transition duration-200 enabled:hover:-translate-y-px disabled:opacity-50"
          >
            {{ isSaving ? '儲存中…' : '儲存對應設定' }}
          </button>
        </div>
      </form>
    </div>
  </template>
