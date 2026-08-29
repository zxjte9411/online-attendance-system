<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  getExportTemplate,
  uploadExportTemplate,
  saveExportTemplateMapping,
  replaceExportTemplate,
  deleteExportTemplate,
  downloadExportTemplateFile,
  getWorkbookWorksheetNames,
  validateXlsxFileInput,
  type ExportTemplate,
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

const props = defineProps<{
  userId: string
  contextId: string
  contextName: string
}>()

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
  valueMapFallback: 'keep' | 'empty' | 'error'
}

interface StaticMappingUiItem {
  sourceField: StaticSourceField
  targetCell: string
  transformType: string
  transforms: TransformConfig[]
  valueMapText: string
  valueMapFallback: 'keep' | 'empty' | 'error'
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

watch(
  () => [props.userId, props.contextId],
  () => {
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
): { text: string; fallback: 'keep' | 'empty' | 'error' } {
  const vm = transforms?.find((t) => t.type === 'VALUE_MAP')
  const opts = vm?.options as ValueMapOptions | undefined
  const text = Object.entries(opts?.map || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const fallback = opts?.unmappedBehavior || 'keep'
  return { text, fallback }
}

async function loadTemplate() {
  if (!props.userId || !props.contextId) {
    template.value = null
    isLoading.value = false
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const loaded = await getExportTemplate(props.userId, props.contextId)
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

      // Download file to inspect available worksheets
      try {
        const fileBuffer = await downloadExportTemplateFile(loaded.storage_path)
        availableWorksheets.value = await getWorkbookWorksheetNames(fileBuffer)
      } catch {
        availableWorksheets.value = []
      }
    } else {
      uploadName.value = `${props.contextName} 出勤範本`
      uploadFile.value = null
      availableWorksheets.value = []
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '載入範本資料失敗。'
  } finally {
    isLoading.value = false
  }
}

function handleUploadFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    try {
      validateXlsxFileInput(target.files[0])
      uploadFile.value = target.files[0]
      errorMessage.value = ''
    } catch (err) {
      uploadFile.value = null
      target.value = ''
      errorMessage.value = err instanceof Error ? err.message : '檔案格式無效。'
    }
  }
}

function handleReplaceFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    try {
      validateXlsxFileInput(target.files[0])
      replaceFile.value = target.files[0]
      errorMessage.value = ''
    } catch (err) {
      replaceFile.value = null
      target.value = ''
      errorMessage.value = err instanceof Error ? err.message : '檔案格式無效。'
    }
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
      contextId: props.contextId,
      name: uploadName.value.trim(),
      file: uploadFile.value,
    })
    template.value = created
    successMessage.value = 'XLSX 範本上傳成功。'
    await loadTemplate()
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
    template.value = result.template
    showReplaceForm.value = false
    replaceFile.value = null
    if (result.warning) {
      successMessage.value = `XLSX 範本檔案已成功更換，但舊檔案清理未完成：${result.warning}`
    } else {
      successMessage.value = 'XLSX 範本檔案已成功更換。'
    }
    await loadTemplate()
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
    template.value = null
    availableWorksheets.value = []
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
  valueMapFallback: 'keep' | 'empty' | 'error'
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
      v-else-if="!template"
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
            @click="showReplaceForm = !showReplaceForm"
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
              @click="showReplaceForm = false"
            >
              取消
            </button>
          </div>
        </form>
      </div>

      <!-- Mapping Form -->
      <form data-test="mapping-form" class="grid gap-8" @submit.prevent="handleSaveMapping">
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

          <div class="grid gap-3">
            <div
              v-for="(item, idx) in rowMappings"
              :key="idx"
              class="grid gap-3 rounded-lg border border-line bg-surface p-3"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="grid gap-1 min-w-[200px] flex-1">
                  <label :for="`row-source-${idx}`" class="text-xs font-semibold text-muted">報表資料欄位</label>
                  <select
                    :id="`row-source-${idx}`"
                    v-model="item.sourceField"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  >
                    <option v-for="f in REPORT_MODEL_SOURCE_FIELDS" :key="f" :value="f">
                      {{ FIELD_LABELS[f] || f }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1 w-24">
                  <label :for="`row-col-${idx}`" class="text-xs font-semibold text-muted">目標欄位</label>
                  <input
                    :id="`row-col-${idx}`"
                    v-model="item.targetColumn"
                    type="text"
                    placeholder="例如: B"
                    maxlength="3"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 font-mono text-xs uppercase text-ink"
                    required
                  />
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
                    <option value="empty">輸出空白 (empty)</option>
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

          <div v-if="staticMappings.length" class="grid gap-3">
            <div
              v-for="(item, idx) in staticMappings"
              :key="idx"
              class="grid gap-3 rounded-lg border border-line bg-surface p-3"
            >
              <div class="flex flex-wrap items-center gap-3">
                <div class="grid gap-1 min-w-[200px] flex-1">
                  <label :for="`static-source-${idx}`" class="text-xs font-semibold text-muted">全域資料欄位</label>
                  <select
                    :id="`static-source-${idx}`"
                    v-model="item.sourceField"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 text-xs text-ink"
                  >
                    <option v-for="f in STATIC_SOURCE_FIELDS" :key="f" :value="f">
                      {{ STATIC_FIELD_LABELS[f] || f }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1 w-28">
                  <label :for="`static-cell-${idx}`" class="text-xs font-semibold text-muted">目標儲存格 (A1)</label>
                  <input
                    :id="`static-cell-${idx}`"
                    v-model="item.targetCell"
                    type="text"
                    placeholder="例如: B2"
                    maxlength="6"
                    class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-2.5 font-mono text-xs uppercase text-ink"
                    required
                  />
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
                    <option value="empty">輸出空白 (empty)</option>
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
  </div>
</template>
