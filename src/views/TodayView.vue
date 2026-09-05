<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  calculateAttendanceSummary,
  type AttendanceCalculationResult,
} from '../domain/attendance/calculate-attendance-summary'
import {
  clockInToday,
  clockOutToday,
  getTodayAttendanceReadiness,
  getTodayAttendanceRecord,
  type AttendanceRecord,
  type TodayAttendanceReadiness,
} from '../lib/attendance'
import type { WorkPolicy } from '../lib/settings'
import { getTaipeiToday } from '../lib/work-policy'

type Action = 'clock-in' | 'clock-out'
type PolicySummary = {
  name: string
  standard_start_time: string | null
  work_minutes: number | null
  fixed_break_minutes: number | null
}
const now = ref(new Date())
const record = ref<AttendanceRecord | null>(null)
const policy = ref<TodayAttendanceReadiness['policy']>(null)
const isLoading = ref(true)
const readiness = ref<TodayAttendanceReadiness | null>(null)
const action = ref<Action | null>(null)
const loadError = ref('')
const actionError = ref('')
const successMessage = ref('')
const loadErrorRegion = ref<HTMLElement | null>(null)
const actionErrorRegion = ref<HTMLElement | null>(null)
let clockTimer: ReturnType<typeof setInterval> | undefined

const dateTime = computed(() => now.value.toISOString())
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(now.value))
const currentTimeLabel = computed(() => formatTime(now.value.toISOString()))
const viewState = computed(() => {
  if (!record.value) return 'preview'
  return record.value.actual_clock_out_at ? 'complete' : 'clocked-in'
})
const stateLabel = computed(() => ({
  preview: '尚未打卡',
  'clocked-in': '已上班',
  complete: '已完成',
}[viewState.value]))
const displayedPolicy = computed<PolicySummary | null>(() => {
  if (record.value) return policySummaryFromSnapshot(record.value.policy_snapshot)
  if (!policy.value) return null
  return policySummaryFromPolicy(policy.value)
})
const previewSummary = computed<AttendanceCalculationResult | null>(() => {
  if (record.value || !policy.value) return null

  return calculateAttendanceSummary({
    actual_clock_in_at: now.value.toISOString(),
    policy: policy.value,
  })
})
const currentSummary = computed(() => {
  if (!record.value) return previewSummary.value

  return {
    actual_clock_in_at: record.value.actual_clock_in_at,
    actual_clock_out_at: record.value.actual_clock_out_at,
    effective_clock_in_at: record.value.effective_clock_in_at,
    effective_clock_out_at: record.value.effective_clock_out_at,
    expected_clock_out_at: record.value.expected_clock_out_at,
    actual_elapsed_minutes: record.value.actual_elapsed_minutes,
    net_worked_minutes: record.value.net_worked_minutes,
    regular_minutes: record.value.regular_minutes,
    overtime_minutes: record.value.overtime_minutes,
  }
})
const isBusy = computed(() => action.value !== null)
const settingsHref = computed(() => readiness.value?.assignmentId
  ? `/settings?assignment_id=${encodeURIComponent(readiness.value.assignmentId)}#policies`
  : '/settings')

onMounted(() => {
  void load()
  clockTimer = setInterval(() => {
    const previousDate = getTaipeiToday(now.value)
    now.value = new Date()
    if (getTaipeiToday(now.value) !== previousDate) void load()
  }, 30_000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

async function load() {
  isLoading.value = true
  record.value = null
  policy.value = null
  readiness.value = null
  loadError.value = ''
  successMessage.value = ''

  try {
    const todayRecord = await getTodayAttendanceRecord()
    record.value = todayRecord
    actionError.value = ''
    if (todayRecord) return

    const resolved = await getTodayAttendanceReadiness()
    if (resolved.resolution === 'RESOLVED' && !resolved.policy) {
      throw new Error('今日工作制度解析結果無效，請稍後再試。')
    }

    readiness.value = resolved
    policy.value = resolved.policy
  } catch (error) {
    if (actionError.value) {
      await focusError('action')
      return
    }

    loadError.value = getErrorMessage(error, '今日出勤資料載入失敗，請稍後再試。')
    await focusError('load')
  } finally {
    isLoading.value = false
  }
}

async function handleClockIn() {
  if (isBusy.value || record.value) return

  await runClockAction('clock-in', clockInToday, '已記錄上班時間。')
}

async function handleClockOut() {
  if (isBusy.value || !record.value || record.value.actual_clock_out_at) return

  await runClockAction('clock-out', clockOutToday, '今日出勤已完成。')
}

async function runClockAction(
  nextAction: Action,
  clock: typeof clockInToday | typeof clockOutToday,
  message: string,
) {
  action.value = nextAction
  loadError.value = ''
  actionError.value = ''
  successMessage.value = ''

  try {
    record.value = await clock()
    successMessage.value = message
  } catch (error) {
    if (nextAction === 'clock-in' && isUnavailableError(error)) {
      await load()
      return
    }

    actionError.value = '無法確認這次打卡是否完成，請重新載入今日狀態確認。'
    await focusError('action')
  } finally {
    action.value = null
  }
}

async function focusError(kind: 'load' | 'action') {
  await nextTick()
  if (kind === 'load') loadErrorRegion.value?.focus()
  else actionErrorRegion.value?.focus()
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && error.message
  ) {
    return error.message
  }

  return fallback
}

function isUnavailableError(error: unknown) {
  const message = getErrorMessage(error, '')
  return message === 'NO_ASSIGNMENT' || message === 'MISSING_POLICY'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatMinutes(minutes: number | null) {
  if (minutes == null) return '尚未計算'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder} 分鐘`
  if (!remainder) return `${hours} 小時`
  return `${hours} 小時 ${remainder} 分鐘`
}

function policySummaryFromPolicy(source: WorkPolicy): PolicySummary {
  return {
    name: source.name,
    standard_start_time: source.standard_start_time,
    work_minutes: source.work_minutes,
    fixed_break_minutes: source.fixed_break_minutes,
  }
}

function policySummaryFromSnapshot(snapshot: Record<string, unknown>): PolicySummary {
  return {
    name: typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name : '歷史工作制度',
    standard_start_time: typeof snapshot.standard_start_time === 'string' ? snapshot.standard_start_time : null,
    work_minutes: typeof snapshot.work_minutes === 'number' && Number.isFinite(snapshot.work_minutes)
      ? snapshot.work_minutes
      : null,
    fixed_break_minutes: typeof snapshot.fixed_break_minutes === 'number' && Number.isFinite(snapshot.fixed_break_minutes)
      ? snapshot.fixed_break_minutes
      : null,
  }
}

function formatStartTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : '時間未提供'
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <section class="grid max-w-[43rem] gap-4" aria-labelledby="today-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
        <span class="h-px w-6 bg-current" aria-hidden="true"></span>
        <span>今日 / ASIA-TAIPEI</span>
      </span>
      <h1 id="today-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">今天，先把狀態記清楚。</h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">從目前時間開始預覽，實際打卡時間由伺服器保存。</p>
    </section>

    <section class="mt-8 grid gap-4 border-y border-line py-4 sm:grid-cols-[1.25fr_0.75fr_0.8fr] sm:gap-0" aria-label="今日摘要">
      <div class="grid gap-1 border-line sm:border-e sm:pe-5">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">日期</span>
        <time class="font-display text-lg font-semibold" :datetime="dateTime">{{ dateLabel }}</time>
      </div>
      <div class="grid gap-1 pt-4 sm:border-e sm:border-line sm:px-5 sm:pt-0">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">目前時間</span>
        <time class="font-mono text-2xl font-bold tabular-nums tracking-[-0.04em]" :datetime="dateTime">{{ currentTimeLabel }}</time>
      </div>
      <div class="grid gap-1 pt-4 sm:pt-0 sm:ps-5">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">今日狀態</span>
        <strong>{{ stateLabel }}</strong>
        <span class="text-[0.8125rem] text-muted">Asia/Taipei</span>
      </div>
    </section>

    <p v-if="loadError" ref="loadErrorRegion" class="mt-5 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert" tabindex="-1">
      {{ loadError }}
    </p>
    <p v-if="actionError" ref="actionErrorRegion" class="mt-5 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert" tabindex="-1">
      {{ actionError }}
    </p>
    <p v-if="successMessage" class="mt-5 rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm" role="status" aria-live="polite">
      {{ successMessage }}
    </p>

    <div v-if="isLoading" class="mt-6 grid gap-4" role="status" aria-busy="true" aria-label="正在載入今日出勤資料">
      <span class="h-56 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-36 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
    </div>

    <div v-else-if="loadError" class="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="today-retry-title">
      <div class="grid gap-2">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">需要再試一次</span>
        <h2 id="today-retry-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">今日資料還沒載入。</h2>
        <p class="text-sm leading-relaxed text-muted">確認網路連線後重試；這次失敗不會建立或修改出勤資料。</p>
      </div>
      <button data-action="retry-load" class="inline-flex min-h-12 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit" type="button" :disabled="isLoading" :aria-busy="isLoading" @click="load">重新載入</button>
    </div>

    <section v-if="actionError && !isLoading && !loadError" class="mt-6 grid gap-4 rounded-2xl border border-[var(--error-line)] bg-[var(--error-surface)] p-5 sm:p-6" aria-labelledby="action-error-title">
      <div class="grid gap-2">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-[var(--error-ink)]">打卡結果待確認</span>
        <h2 id="action-error-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">先確認今日狀態。</h2>
        <p class="text-sm leading-relaxed text-[var(--error-ink)]">打卡請求可能已由伺服器完成；重新讀取後，再決定下一步。</p>
      </div>
      <button data-action="reload-status" class="inline-flex min-h-12 w-full items-center justify-center rounded-[0.625rem] border border-[var(--error-ink)] bg-surface px-4 py-2 font-semibold text-[var(--error-ink)] transition duration-200 ease-out hover:-translate-y-px hover:bg-canvas active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit" type="button" :disabled="isLoading" :aria-busy="isLoading" @click="load">重新確認今日狀態</button>
    </section>

    <section v-else-if="readiness?.resolution === 'NO_ASSIGNMENT'" class="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="today-no-assignment-title" data-state="unavailable-no-assignment">
      <div class="grid gap-2">
        <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">今日不可打卡</span>
        <h2 id="today-no-assignment-title" class="font-display text-2xl font-semibold tracking-[-0.04em]">今天沒有工作派駐。</h2>
        <p class="text-sm leading-relaxed text-muted">目前沒有可用的工作派駐，完成設定後才能開始今天的出勤。</p>
      </div>
      <a data-action="settings" class="inline-flex min-h-12 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit" href="/settings">前往工作設定</a>
    </section>

    <section v-else-if="readiness?.resolution === 'MISSING_POLICY'" class="mt-6 grid gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="today-missing-policy-title" data-state="unavailable-missing-policy">
      <div class="grid gap-2">
        <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">今日不可打卡</span>
        <h2 id="today-missing-policy-title" class="font-display text-2xl font-semibold tracking-[-0.04em]">今天沒有適用的工作制度。</h2>
        <p class="text-sm leading-relaxed text-muted">今天的工作派駐已解析，但沒有涵蓋今天日期的制度。請補上適用的工作制度。</p>
      </div>
      <a data-action="settings" class="inline-flex min-h-12 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit" :href="settingsHref">前往工作制度設定</a>
    </section>

    <div v-else-if="record || (readiness?.resolution === 'RESOLVED' && policy)" class="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]">
      <section v-if="viewState === 'preview'" class="grid gap-6 rounded-2xl border border-accent bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="preview-title" data-state="preview">
        <div class="flex flex-wrap items-start justify-between gap-5 border-b border-line pb-5">
          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">CLIENT-TIME PREVIEW</span>
            <h2 id="preview-title" class="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.05em]">準備開始工作</h2>
          </div>
          <time class="font-mono text-4xl font-bold leading-none tabular-nums tracking-[-0.06em] text-accent" :datetime="dateTime">{{ currentTimeLabel }}</time>
        </div>

        <dl class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-1 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]">
            <dt class="text-[0.75rem] text-muted">預計下班</dt>
            <dd class="font-mono text-2xl font-bold tabular-nums">{{ formatTime(currentSummary!.expected_clock_out_at) }}</dd>
          </div>
          <div class="grid gap-1 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]">
            <dt class="text-[0.75rem] text-muted">預計工作時間</dt>
            <dd class="font-semibold">{{ formatMinutes(policy!.work_minutes) }} 工作 + {{ formatMinutes(policy!.fixed_break_minutes) }} 休息</dd>
          </div>
        </dl>

        <div class="grid gap-3 border-s-4 border-accent ps-4">
          <p class="text-sm leading-relaxed text-muted">目前只用瀏覽器時間預覽，不會寫入資料。按下按鈕後，才會由伺服器記錄實際上班時間。</p>
          <button data-action="clock-in" class="inline-flex min-h-14 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-5 py-3 text-base font-bold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="button" :disabled="isBusy || Boolean(actionError)" :aria-busy="action === 'clock-in'" @click="handleClockIn">
            {{ action === 'clock-in' ? '正在記錄…' : '開始上班打卡' }}
          </button>
        </div>
      </section>

      <section v-else-if="viewState === 'clocked-in'" class="grid gap-6 rounded-2xl border border-accent bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="clocked-in-title" data-state="clocked-in">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">WORKING NOW</span>
            <h2 id="clocked-in-title" class="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.05em]">已上班，工作計時中。</h2>
          </div>
          <span class="rounded-[0.375rem] border border-accent-soft bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">進行中</span>
        </div>

        <dl class="grid gap-4 sm:grid-cols-3">
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">實際上班</dt><dd class="font-mono text-2xl font-bold tabular-nums">{{ formatTime(currentSummary!.actual_clock_in_at) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">有效上班</dt><dd class="font-mono text-2xl font-bold tabular-nums">{{ formatTime(currentSummary!.effective_clock_in_at) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">預計下班</dt><dd class="font-mono text-2xl font-bold tabular-nums text-accent">{{ formatTime(currentSummary!.expected_clock_out_at) }}</dd></div>
        </dl>

        <div class="grid gap-3 border-t border-line pt-5">
          <p class="text-sm leading-relaxed text-muted">下班時按下按鈕，系統會補齊同一筆今日出勤紀錄。</p>
          <button data-action="clock-out" class="inline-flex min-h-14 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-5 py-3 text-base font-bold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 sm:w-fit forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="button" :disabled="isBusy || Boolean(actionError)" :aria-busy="action === 'clock-out'" @click="handleClockOut">
            {{ action === 'clock-out' ? '正在記錄…' : '完成下班打卡' }}
          </button>
        </div>
      </section>

      <section v-else class="grid gap-6 rounded-2xl border border-accent bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="complete-title" data-state="complete">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">DAY COMPLETE</span>
            <h2 id="complete-title" class="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.05em]">今天的出勤已完成。</h2>
          </div>
          <span class="rounded-[0.375rem] border border-accent-soft bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">{{ currentSummary!.overtime_minutes ? '加班' : '正常' }}</span>
        </div>

        <dl class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">實際上班</dt><dd class="font-mono text-lg font-bold tabular-nums">{{ formatTime(currentSummary!.actual_clock_in_at) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">實際下班</dt><dd class="font-mono text-lg font-bold tabular-nums">{{ formatTime(currentSummary!.actual_clock_out_at!) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">有效上班</dt><dd class="font-mono text-lg font-bold tabular-nums">{{ formatTime(currentSummary!.effective_clock_in_at) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">有效下班</dt><dd class="font-mono text-lg font-bold tabular-nums">{{ formatTime(currentSummary!.effective_clock_out_at!) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">預計下班</dt><dd class="font-mono text-lg font-bold tabular-nums">{{ formatTime(currentSummary!.expected_clock_out_at) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">正常工時</dt><dd class="font-semibold">{{ formatMinutes(currentSummary!.regular_minutes) }}</dd></div>
          <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">自動加班</dt><dd class="font-semibold text-accent">{{ formatMinutes(currentSummary!.overtime_minutes) }}</dd></div>
        </dl>

        <details class="border-t border-line pt-4">
          <summary class="cursor-pointer font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">詳細資訊</summary>
          <dl class="mt-4 grid gap-4 sm:grid-cols-2">
            <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">實際經過</dt><dd class="font-semibold">{{ formatMinutes(currentSummary!.actual_elapsed_minutes) }}</dd></div>
            <div class="grid gap-1"><dt class="text-[0.75rem] text-muted">有效工時（扣除固定休息）</dt><dd class="font-semibold">{{ formatMinutes(currentSummary!.net_worked_minutes) }}</dd></div>
          </dl>
        </details>
      </section>

      <aside class="grid content-start gap-4 rounded-2xl border border-line bg-surface-soft p-5 sm:p-6 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]" aria-labelledby="policy-title">
        <div class="grid gap-1">
          <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">工作制度</span>
          <h2 id="policy-title" class="font-display text-xl font-semibold tracking-[-0.035em]">今天套用的制度</h2>
        </div>
        <div class="grid gap-1 border-t border-line pt-4">
          <strong>{{ displayedPolicy?.name }}</strong>
          <span class="text-sm leading-relaxed text-muted">{{ formatStartTime(displayedPolicy?.standard_start_time) }} 開始 · {{ formatMinutes(displayedPolicy?.work_minutes ?? null) }} 工作</span>
        </div>
        <p class="border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">實際時間與計算結果由伺服器保存；此頁不提供日曆、假勤或手動修正。</p>
      </aside>
    </div>
  </div>
</template>
