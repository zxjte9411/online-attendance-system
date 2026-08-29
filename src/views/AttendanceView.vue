<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  createManualAttendance,
  deleteAttendanceRecord,
  editAttendanceRecord,
  getMonthAttendanceRecords,
  type AttendanceRecord,
} from '../lib/attendance'
import {
  getCurrentUserId,
  getSetupStatus,
  type WorkContext,
} from '../lib/settings'
import { getTaipeiToday } from '../lib/work-policy'

const currentMonth = ref(getTaipeiToday().slice(0, 7))
const records = ref<AttendanceRecord[]>([])
const contexts = ref<WorkContext[]>([])
const isLoading = ref(true)
const loadError = ref('')
const selectedRecord = ref<AttendanceRecord | null>(null)
const isDetailOpen = ref(false)
const isFormOpen = ref(false)
const isEditMode = ref(false)
const recordToDelete = ref<AttendanceRecord | null>(null)
const deleteError = ref('')
const isDeleting = ref(false)

// Stale request race protection
let currentRequestId = 0

// Form state
const formRecordId = ref('')
const formWorkDate = ref('')
const formContextId = ref('')
const formClockInTime = ref('')
const formClockOutTime = ref('')
const formStatusNote = ref('')
const formError = ref('')
const isSubmitting = ref(false)

const monthLabel = computed(() => {
  const [yearStr, monthStr] = currentMonth.value.split('-')
  return `${yearStr} 年 ${Number(monthStr)} 月`
})

const completedCount = computed(() => records.value.filter((r) => r.actual_clock_out_at !== null).length)
const incompleteCount = computed(() => records.value.filter((r) => r.actual_clock_out_at === null).length)
const adjustedCount = computed(() => records.value.filter((r) => r.manually_adjusted).length)

onMounted(async () => {
  await loadContexts()
  await loadMonth()
})

async function loadContexts() {
  try {
    const userId = await getCurrentUserId()
    const setup = await getSetupStatus(userId)
    contexts.value = setup.contexts
    if (!formContextId.value && setup.defaultContext) {
      formContextId.value = setup.defaultContext.id
    } else if (!formContextId.value && setup.contexts.length > 0) {
      formContextId.value = setup.contexts[0].id
    }
  } catch {
    // Non-blocking for contexts
  }
}

async function loadMonth() {
  const requestId = ++currentRequestId
  const requestedMonth = currentMonth.value
  isLoading.value = true
  loadError.value = ''

  try {
    const data = await getMonthAttendanceRecords(requestedMonth)
    if (requestId !== currentRequestId) return
    records.value = data
  } catch (err) {
    if (requestId !== currentRequestId) return
    loadError.value = err instanceof Error && err.message ? err.message : '載入出勤資料失敗，請稍後再試。'
  } finally {
    if (requestId === currentRequestId) {
      isLoading.value = false
    }
  }
}

function handlePrevMonth() {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const prevDate = new Date(Date.UTC(y, m - 2, 1))
  currentMonth.value = prevDate.toISOString().slice(0, 7)
  void loadMonth()
}

function handleNextMonth() {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, m, 1))
  currentMonth.value = nextDate.toISOString().slice(0, 7)
  void loadMonth()
}

function handleCurrentMonth() {
  currentMonth.value = getTaipeiToday().slice(0, 7)
  void loadMonth()
}

function openDetail(record: AttendanceRecord) {
  isFormOpen.value = false
  recordToDelete.value = null
  selectedRecord.value = record
  isDetailOpen.value = true
}

function closeDetail() {
  isDetailOpen.value = false
  selectedRecord.value = null
}

function openCreateForm() {
  isDetailOpen.value = false
  recordToDelete.value = null
  selectedRecord.value = null
  isEditMode.value = false
  formRecordId.value = ''
  formWorkDate.value = getTaipeiToday()
  formContextId.value = contexts.value.find((c) => c.is_default)?.id || contexts.value[0]?.id || ''
  formClockInTime.value = ''
  formClockOutTime.value = ''
  formStatusNote.value = ''
  formError.value = ''
  isFormOpen.value = true
}

function openEditForm(record: AttendanceRecord) {
  // Ensure detail modal is closed so only a single dialog is open
  isDetailOpen.value = false
  selectedRecord.value = null
  recordToDelete.value = null

  isEditMode.value = true
  formRecordId.value = record.id
  formWorkDate.value = record.work_date
  formContextId.value = record.context_id
  formClockInTime.value = formatTimeForInput(record.actual_clock_in_at)
  formClockOutTime.value = record.actual_clock_out_at ? formatTimeForInput(record.actual_clock_out_at) : ''
  formStatusNote.value = record.status_note || ''
  formError.value = ''
  isFormOpen.value = true
}

function closeForm() {
  isFormOpen.value = false
  formError.value = ''
}

async function handleFormSubmit() {
  formError.value = ''

  if (!formWorkDate.value) {
    formError.value = '請選擇工作日。'
    return
  }
  if (!formContextId.value) {
    formError.value = '請選擇工作環境 (Work Context)。'
    return
  }
  if (!formClockInTime.value) {
    formError.value = '請填寫上班時間。'
    return
  }
  if (formClockOutTime.value && formClockOutTime.value < formClockInTime.value) {
    formError.value = '下班時間不可早於上班時間。'
    return
  }

  isSubmitting.value = true
  try {
    if (isEditMode.value) {
      await editAttendanceRecord({
        id: formRecordId.value,
        context_id: formContextId.value,
        actual_clock_in_time: formClockInTime.value,
        actual_clock_out_time: formClockOutTime.value || null,
        status_note: formStatusNote.value || null,
      })
    } else {
      await createManualAttendance({
        work_date: formWorkDate.value,
        context_id: formContextId.value,
        actual_clock_in_time: formClockInTime.value,
        actual_clock_out_time: formClockOutTime.value || null,
        status_note: formStatusNote.value || null,
      })
    }

    closeForm()
    await loadMonth()
  } catch (err) {
    formError.value = err instanceof Error && err.message ? err.message : '儲存出勤紀錄失敗，請檢查輸入。'
  } finally {
    isSubmitting.value = false
  }
}

function openDeleteConfirm(record: AttendanceRecord) {
  isDetailOpen.value = false
  isFormOpen.value = false
  selectedRecord.value = null
  recordToDelete.value = record
  deleteError.value = ''
}

function closeDeleteConfirm() {
  recordToDelete.value = null
  deleteError.value = ''
}

async function handleConfirmDelete() {
  if (!recordToDelete.value) return

  isDeleting.value = true
  deleteError.value = ''
  try {
    await deleteAttendanceRecord(recordToDelete.value.id)
    closeDeleteConfirm()
    await loadMonth()
  } catch (err) {
    deleteError.value = err instanceof Error && err.message ? err.message : '刪除失敗，請稍後再試。'
  } finally {
    isDeleting.value = false
  }
}

function formatTime(isoString: string | null | undefined) {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString))
}

function formatDateTime(isoString: string | null | undefined) {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(isoString))
}

function formatTimeForInput(isoString: string | null | undefined) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDateDisplay(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 4))
  const weekday = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(date)
  return `${dateStr} (${weekday})`
}

function formatMinutes(minutes: number | null | undefined) {
  if (minutes == null) return '—'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder} 分鐘`
  if (!remainder) return `${hours} 小時`
  return `${hours} 小時 ${remainder} 分鐘`
}

function formatRounding(mode: unknown, minutes: unknown) {
  if (!mode || mode === 'NONE') return '無進退位'
  const mins = minutes ? `${minutes} 分鐘` : ''
  if (mode === 'CEIL') return `無條件進位 (${mins})`
  if (mode === 'FLOOR') return `無條件捨去 (${mins})`
  return `${mode} (${mins})`
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <!-- Header -->
    <section class="grid max-w-[43rem] gap-4" aria-labelledby="attendance-page-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
        <span class="h-px w-6 bg-current" aria-hidden="true"></span>
        <span>出勤 / ASIA-TAIPEI</span>
      </span>
      <h1 id="attendance-page-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">
        出勤月檢視與明細
      </h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">
        查看各月份出勤紀錄、歷史快照，並支援手動補登與單日修正。
      </p>
    </section>

    <!-- Month Control & Action Bar -->
    <section class="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4" aria-label="月份選擇與操作">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1 rounded-[0.625rem] border border-line bg-surface p-1">
          <button
            data-action="prev-month"
            class="flex size-9 items-center justify-center rounded-[0.375rem] border border-transparent text-sm font-bold text-ink transition hover:border-line hover:bg-surface-soft active:translate-y-px focus-visible:outline-2 focus-visible:outline-accent"
            type="button"
            aria-label="上一月"
            @click="handlePrevMonth"
          >
            ‹
          </button>
          <span class="px-3 font-display text-lg font-bold tabular-nums">{{ monthLabel }}</span>
          <button
            data-action="next-month"
            class="flex size-9 items-center justify-center rounded-[0.375rem] border border-transparent text-sm font-bold text-ink transition hover:border-line hover:bg-surface-soft active:translate-y-px focus-visible:outline-2 focus-visible:outline-accent"
            type="button"
            aria-label="下一月"
            @click="handleNextMonth"
          >
            ›
          </button>
        </div>
        <button
          data-action="current-month"
          class="rounded-[0.625rem] border border-line bg-surface px-3 py-2 text-xs font-bold text-muted transition hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          type="button"
          @click="handleCurrentMonth"
        >
          本月
        </button>
      </div>

      <div class="flex items-center gap-4">
        <div class="hidden text-xs text-muted sm:flex sm:gap-3">
          <span>共 {{ records.length }} 筆</span>
          <span>·</span>
          <span>已完成 {{ completedCount }}</span>
          <span>·</span>
          <span>未完成 {{ incompleteCount }}</span>
          <span v-if="adjustedCount > 0">· 已修正 {{ adjustedCount }}</span>
        </div>
        <button
          data-action="open-create"
          class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 text-sm font-bold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
          type="button"
          @click="openCreateForm"
        >
          + 補登出勤
        </button>
      </div>
    </section>

    <!-- Error Alert -->
    <p v-if="loadError" class="mt-5 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert">
      {{ loadError }}
      <button data-action="retry-load" class="ms-3 underline font-bold" type="button" @click="loadMonth">重試</button>
    </p>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="mt-6 grid gap-3" role="status" aria-busy="true" aria-label="正在載入出勤資料">
      <span class="h-20 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-20 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-20 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
    </div>

    <!-- Empty State -->
    <div v-else-if="records.length === 0" class="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow)]">
      <h2 class="font-display text-xl font-semibold">這個月份尚無出勤紀錄</h2>
      <p class="text-sm text-muted">目前月份沒有打卡或補登資料。你可以點擊下方按鈕進行手動補登。</p>
      <div class="mt-2 flex justify-center">
        <button
          data-action="open-create"
          class="rounded-[0.625rem] border border-accent bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-ink"
          type="button"
          @click="openCreateForm"
        >
          補登出勤
        </button>
      </div>
    </div>

    <!-- Records List -->
    <div v-else class="mt-6 grid gap-4">
      <article
        v-for="rec in records"
        :key="rec.id"
        :data-record-id="rec.id"
        :data-record-date="rec.work_date"
        class="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition hover:border-accent/40 sm:p-6"
      >
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="font-display text-lg font-bold tabular-nums">
              {{ formatDateDisplay(rec.work_date) }}
            </h2>
            <span
              class="rounded-[0.375rem] border px-2 py-0.5 text-xs font-bold"
              :class="rec.actual_clock_out_at ? 'border-accent-soft bg-accent-soft text-accent' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'"
            >
              {{ rec.actual_clock_out_at ? '已完成' : '未完成' }}
            </span>
            <span class="rounded-[0.375rem] border border-line bg-surface-soft px-2 py-0.5 text-xs text-muted">
              {{ rec.created_source === 'MANUAL' ? '手動補登' : '打卡' }}
            </span>
            <span
              v-if="rec.manually_adjusted"
              class="rounded-[0.375rem] border border-line bg-surface-soft px-2 py-0.5 text-xs font-medium text-accent"
            >
              已人工修正
            </span>
            <span v-if="rec.manually_adjusted && rec.last_manual_edit_at" class="text-xs text-muted">
              最後修正：{{ formatDateTime(rec.last_manual_edit_at) }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              data-action="view-detail"
              class="rounded-[0.5rem] border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              type="button"
              @click="openDetail(rec)"
            >
              檢視明細
            </button>
            <button
              data-action="edit-record"
              class="rounded-[0.5rem] border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              type="button"
              @click="openEditForm(rec)"
            >
              修改
            </button>
            <button
              data-action="delete-record"
              class="rounded-[0.5rem] border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-[var(--error-ink)] transition hover:border-[var(--error-line)] hover:bg-[var(--error-surface)] focus-visible:outline-2 focus-visible:outline-accent"
              type="button"
              @click="openDeleteConfirm(rec)"
            >
              刪除
            </button>
          </div>
        </div>

        <!-- Times & Metrics Grid -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">實際打卡 (ACTUAL)</span>
            <div class="font-mono text-sm font-semibold tabular-nums">
              <span>{{ formatTime(rec.actual_clock_in_at) }}</span>
              <span class="mx-1.5 text-muted">→</span>
              <span>{{ formatTime(rec.actual_clock_out_at) }}</span>
            </div>
            <span class="text-xs text-muted">經過：{{ formatMinutes(rec.actual_elapsed_minutes) }}</span>
          </div>

          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">有效打卡 (EFFECTIVE)</span>
            <div class="font-mono text-sm font-semibold tabular-nums">
              <span>{{ formatTime(rec.effective_clock_in_at) }}</span>
              <span class="mx-1.5 text-muted">→</span>
              <span>{{ formatTime(rec.effective_clock_out_at) }}</span>
            </div>
            <span class="text-xs text-muted">預計下班：{{ formatTime(rec.expected_clock_out_at) }}</span>
          </div>

          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">有效工時 (NET WORKED)</span>
            <div class="font-semibold text-base">
              {{ formatMinutes(rec.net_worked_minutes) }}
            </div>
            <span class="text-xs text-muted">
              正常 {{ formatMinutes(rec.regular_minutes) }}
              <template v-if="rec.overtime_minutes"> · <span class="text-accent font-bold">加班 {{ formatMinutes(rec.overtime_minutes) }}</span></template>
            </span>
          </div>

          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">Context 快照 / 備註</span>
            <div class="truncate text-sm font-medium" :title="`${rec.context_snapshot?.name || '—'} (${rec.context_snapshot?.company_identifier || '—'} / ${rec.context_snapshot?.project_identifier || '—'})`">
              {{ rec.context_snapshot?.name || '—' }}
              <span class="text-xs text-muted">({{ rec.context_snapshot?.company_identifier || '—' }} / {{ rec.context_snapshot?.project_identifier || '—' }})</span>
            </div>
            <p v-if="rec.status_note" class="truncate text-xs text-muted" :title="rec.status_note">
              備註：{{ rec.status_note }}
            </p>
            <p v-else class="text-xs text-muted">無備註</p>
          </div>
        </div>
      </article>
    </div>

    <!-- Detail Modal -->
    <div
      v-if="isDetailOpen && selectedRecord"
      data-testid="detail-modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div class="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:p-8">
        <div class="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">出勤明細快照</span>
            <h2 id="detail-modal-title" class="font-display text-2xl font-bold">
              {{ formatDateDisplay(selectedRecord.work_date) }}
            </h2>
          </div>
          <button
            class="rounded-[0.5rem] border border-line px-3 py-1.5 text-sm font-bold text-muted hover:text-ink"
            type="button"
            @click="closeDetail"
          >
            關閉
          </button>
        </div>

        <div class="mt-6 grid gap-6">
          <!-- Summary Info -->
          <div class="grid gap-3 rounded-xl border border-line bg-surface-soft p-4">
            <h3 class="text-xs font-bold tracking-wider text-muted">出勤狀態與時間</h3>
            <dl class="grid gap-3 sm:grid-cols-2">
              <div><dt class="text-xs text-muted">完成狀態</dt><dd class="font-bold">{{ selectedRecord.actual_clock_out_at ? '已完成' : '未完成' }}</dd></div>
              <div><dt class="text-xs text-muted">建立來源</dt><dd class="font-bold">{{ selectedRecord.created_source === 'MANUAL' ? '手動補登' : '打卡' }}</dd></div>
              <div><dt class="text-xs text-muted">實際上班 / 下班</dt><dd class="font-mono font-bold">{{ formatTime(selectedRecord.actual_clock_in_at) }} / {{ formatTime(selectedRecord.actual_clock_out_at) }}</dd></div>
              <div><dt class="text-xs text-muted">有效上班 / 下班</dt><dd class="font-mono font-bold">{{ formatTime(selectedRecord.effective_clock_in_at) }} / {{ formatTime(selectedRecord.effective_clock_out_at) }}</dd></div>
              <div><dt class="text-xs text-muted">預計下班時間</dt><dd class="font-mono font-bold">{{ formatTime(selectedRecord.expected_clock_out_at) }}</dd></div>
              <div><dt class="text-xs text-muted">實際經過時間</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.actual_elapsed_minutes) }}</dd></div>
              <div><dt class="text-xs text-muted">有效工時 (Net)</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.net_worked_minutes) }}</dd></div>
              <div><dt class="text-xs text-muted">正常 / 加班</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.regular_minutes) }} / {{ formatMinutes(selectedRecord.overtime_minutes) }}</dd></div>
              <div><dt class="text-xs text-muted">人工修正狀態</dt><dd class="font-semibold">{{ selectedRecord.manually_adjusted ? '已人工修正' : '未經修正' }}</dd></div>
              <div><dt class="text-xs text-muted">最後修正時間</dt><dd class="font-mono text-xs">{{ selectedRecord.last_manual_edit_at ? formatDateTime(selectedRecord.last_manual_edit_at) : '—' }}</dd></div>
              <div class="sm:col-span-2"><dt class="text-xs text-muted">出勤備註</dt><dd class="text-sm font-medium">{{ selectedRecord.status_note || '無備註' }}</dd></div>
            </dl>
          </div>

          <!-- Context Snapshot -->
          <div class="grid gap-3 rounded-xl border border-line bg-surface-soft p-4">
            <h3 class="text-xs font-bold tracking-wider text-muted">保存的 Context 快照</h3>
            <dl class="grid gap-2 sm:grid-cols-3">
              <div><dt class="text-xs text-muted">名稱</dt><dd class="font-bold">{{ selectedRecord.context_snapshot.name || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">公司代碼</dt><dd class="font-mono font-semibold">{{ selectedRecord.context_snapshot.company_identifier || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">專案代碼</dt><dd class="font-mono font-semibold">{{ selectedRecord.context_snapshot.project_identifier || '—' }}</dd></div>
            </dl>
          </div>

          <!-- Policy Snapshot -->
          <div class="grid gap-3 rounded-xl border border-line bg-surface-soft p-4">
            <h3 class="text-xs font-bold tracking-wider text-muted">保存的 Work Policy 快照</h3>
            <dl class="grid gap-2 sm:grid-cols-2">
              <div><dt class="text-xs text-muted">制度名稱</dt><dd class="font-bold">{{ selectedRecord.policy_snapshot.name || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">標準上班時間</dt><dd class="font-mono font-bold">{{ selectedRecord.policy_snapshot.standard_start_time || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">規定工時 / 固定休息</dt><dd class="font-semibold">{{ formatMinutes(selectedRecord.policy_snapshot.work_minutes as number) }} / {{ formatMinutes(selectedRecord.policy_snapshot.fixed_break_minutes as number) }}</dd></div>
              <div><dt class="text-xs text-muted">早到規則</dt><dd class="font-semibold">{{ selectedRecord.policy_snapshot.early_arrival_policy || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">上班進位規則</dt><dd class="font-semibold">{{ formatRounding(selectedRecord.policy_snapshot.clock_in_rounding_mode, selectedRecord.policy_snapshot.clock_in_rounding_minutes) }}</dd></div>
              <div><dt class="text-xs text-muted">下班進退位規則</dt><dd class="font-semibold">{{ formatRounding(selectedRecord.policy_snapshot.clock_out_rounding_mode, selectedRecord.policy_snapshot.clock_out_rounding_minutes) }}</dd></div>
              <div><dt class="text-xs text-muted">生效區間</dt><dd class="font-mono text-xs">{{ selectedRecord.policy_snapshot.effective_from || '—' }} ~ {{ selectedRecord.policy_snapshot.effective_to || '持續適用' }}</dd></div>
              <div><dt class="text-xs text-muted">時區</dt><dd class="font-mono font-semibold">{{ selectedRecord.policy_snapshot.timezone || 'Asia/Taipei' }}</dd></div>
            </dl>
          </div>

          <!-- Calculation Snapshot -->
          <div class="grid gap-3 rounded-xl border border-line bg-surface-soft p-4">
            <h3 class="text-xs font-bold tracking-wider text-muted">計算引擎快照</h3>
            <dl class="grid gap-2 sm:grid-cols-3">
              <div><dt class="text-xs text-muted">計算狀態</dt><dd class="font-mono font-bold">{{ selectedRecord.calculation_snapshot.state || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">版本</dt><dd class="font-mono font-bold">{{ selectedRecord.calculation_snapshot.calculation_version || 'v1' }}</dd></div>
              <div><dt class="text-xs text-muted">計算時間</dt><dd class="font-mono text-xs">{{ formatDateTime(selectedRecord.calculation_snapshot.calculated_at as string) }}</dd></div>
              <div><dt class="text-xs text-muted">快照有效工時</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.calculation_snapshot.net_worked_minutes as number) }}</dd></div>
              <div><dt class="text-xs text-muted">快照正常 / 加班</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.calculation_snapshot.regular_minutes as number) }} / {{ formatMinutes(selectedRecord.calculation_snapshot.overtime_minutes as number) }}</dd></div>
              <div><dt class="text-xs text-muted">快照經過時間</dt><dd class="font-bold">{{ formatMinutes(selectedRecord.calculation_snapshot.actual_elapsed_minutes as number) }}</dd></div>
            </dl>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-4">
          <button
            data-action="close-detail"
            class="rounded-[0.625rem] border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-soft"
            type="button"
            @click="closeDetail"
          >
            關閉
          </button>
          <button
            data-action="delete-from-detail"
            class="rounded-[0.625rem] border border-[var(--error-line)] bg-surface px-4 py-2 text-sm font-semibold text-[var(--error-ink)] hover:bg-[var(--error-surface)]"
            type="button"
            @click="openDeleteConfirm(selectedRecord)"
          >
            刪除此紀錄
          </button>
          <button
            data-action="edit-from-detail"
            class="rounded-[0.625rem] border border-accent bg-accent px-4 py-2 text-sm font-bold text-canvas hover:bg-ink"
            type="button"
            @click="openEditForm(selectedRecord)"
          >
            修改此紀錄
          </button>
        </div>
      </div>
    </div>

    <!-- Create / Edit Form Modal -->
    <div
      v-if="isFormOpen"
      data-testid="form-modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="isEditMode ? 'edit-modal-title' : 'create-modal-title'"
    >
      <div class="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl sm:p-8">
        <div class="border-b border-line pb-4">
          <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">{{ isEditMode ? 'EDIT RECORD' : 'MANUAL ENTRY' }}</span>
          <h2 :id="isEditMode ? 'edit-modal-title' : 'create-modal-title'" class="font-display text-2xl font-bold">
            {{ isEditMode ? '修改出勤紀錄' : '補登出勤紀錄' }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ isEditMode ? '修改時間將重新依該日 Work Policy 進行工時計算。工作日不可直接修改。' : '手動補登出勤紀錄，將依工作日與選擇的環境套用對應制度。' }}
          </p>
        </div>

        <form class="mt-6 grid gap-4" @submit.prevent="handleFormSubmit">
          <p v-if="formError" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] p-3 text-sm text-[var(--error-ink)]" role="alert">
            {{ formError }}
          </p>

          <!-- Work Date -->
          <div class="grid gap-1.5">
            <label class="text-xs font-bold tracking-wider text-muted" for="form-work-date">工作日 (Asia/Taipei)</label>
            <input
              id="form-work-date"
              v-model="formWorkDate"
              name="work_date"
              type="date"
              required
              :disabled="isEditMode"
              class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 text-sm font-semibold disabled:bg-surface-soft disabled:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          <!-- Work Context -->
          <div class="grid gap-1.5">
            <label class="text-xs font-bold tracking-wider text-muted" for="form-context-id">工作環境 (Work Context)</label>
            <select
              id="form-context-id"
              v-model="formContextId"
              name="context_id"
              required
              class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option v-for="ctx in contexts" :key="ctx.id" :value="ctx.id">
                {{ ctx.name }} ({{ ctx.company_identifier }} / {{ ctx.project_identifier }})
              </option>
            </select>
          </div>

          <!-- Times -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid gap-1.5">
              <label class="text-xs font-bold tracking-wider text-muted" for="form-clock-in">實際上班時間</label>
              <input
                id="form-clock-in"
                v-model="formClockInTime"
                name="actual_clock_in_time"
                type="time"
                required
                class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 font-mono text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
            <div class="grid gap-1.5">
              <label class="text-xs font-bold tracking-wider text-muted" for="form-clock-out">實際下班時間 (選填)</label>
              <input
                id="form-clock-out"
                v-model="formClockOutTime"
                name="actual_clock_out_time"
                type="time"
                class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 font-mono text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
          </div>

          <!-- Status Note -->
          <div class="grid gap-1.5">
            <label class="text-xs font-bold tracking-wider text-muted" for="form-note">出勤備註 (選填)</label>
            <input
              id="form-note"
              v-model="formStatusNote"
              name="status_note"
              type="text"
              placeholder="例如：忘記打卡、時間修正說明"
              class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          <div class="mt-4 flex justify-end gap-3 border-t border-line pt-4">
            <button
              class="rounded-[0.625rem] border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-soft"
              type="button"
              :disabled="isSubmitting"
              @click="closeForm"
            >
              取消
            </button>
            <button
              class="rounded-[0.625rem] border border-accent bg-accent px-5 py-2.5 text-sm font-bold text-canvas hover:bg-ink disabled:opacity-60"
              type="submit"
              :disabled="isSubmitting"
            >
              {{ isSubmitting ? '儲存中…' : '確認儲存' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div
      v-if="recordToDelete"
      data-testid="delete-confirm-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div class="w-full max-w-md rounded-2xl border border-[var(--error-line)] bg-surface p-6 shadow-2xl">
        <h2 id="delete-dialog-title" class="font-display text-xl font-bold text-[var(--error-ink)]">
          確認刪除出勤紀錄？
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-ink">
          確定要刪除 <strong>{{ recordToDelete.work_date }}</strong> 的出勤紀錄嗎？此動作無法復原。
        </p>

        <p v-if="deleteError" class="mt-3 rounded-[0.5rem] border border-[var(--error-line)] bg-[var(--error-surface)] p-2.5 text-xs text-[var(--error-ink)]" role="alert">
          {{ deleteError }}
        </p>

        <div class="mt-6 flex justify-end gap-3 border-t border-line pt-4">
          <button
            data-action="cancel-delete"
            class="rounded-[0.625rem] border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-soft"
            type="button"
            :disabled="isDeleting"
            @click="closeDeleteConfirm"
          >
            取消
          </button>
          <button
            data-action="confirm-delete"
            class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-2 text-sm font-bold text-[var(--error-ink)] hover:bg-[var(--error-line)]/20 disabled:opacity-60"
            type="button"
            :disabled="isDeleting"
            @click="handleConfirmDelete"
          >
            {{ isDeleting ? '刪除中…' : '確認刪除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
