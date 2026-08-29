<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  buildMonthlyReport,
  type MonthlyReport,
} from '../domain/report/monthly-report'
import { exportReportToCsv } from '../domain/report/csv-export'
import {
  getCurrentUserId,
  listWorkContexts,
  listWorkPolicies,
  type WorkContext,
  type WorkPolicy,
} from '../lib/settings'
import {
  getMonthAttendanceRecords,
  type AttendanceRecord,
} from '../lib/attendance'
import {
  getDayStatusesForMonth,
  getCalendarOverridesForMonth,
  type DayStatus,
  type CalendarOverride,
} from '../lib/day-status-calendar'
import type { DgpaCalendarRow } from '../domain/dgpa-calendar/resolver'
import { getDgpaCalendarForMonth } from '../lib/dgpa-calendar'
import { getTaipeiToday } from '../lib/work-policy'
import { presentErrorMessage } from '../lib/error-presentation'

type LoadedScopeData = {
  month: string
  contextId: string
  context: WorkContext
  policies: WorkPolicy[]
  records: AttendanceRecord[]
  statuses: DayStatus[]
  overrides: CalendarOverride[]
  dgpas: DgpaCalendarRow[]
}

const currentMonth = ref(getTaipeiToday().slice(0, 7))
const contexts = ref<WorkContext[]>([])
const selectedContextId = ref<string>('')
const loadedScope = ref<LoadedScopeData | null>(null)

const isLoading = ref(true)
const loadError = ref('')

let currentRequestId = 0

const report = computed<MonthlyReport | null>(() => {
  if (!loadedScope.value) return null
  if (
    loadedScope.value.month !== currentMonth.value ||
    loadedScope.value.contextId !== selectedContextId.value
  ) {
    return null
  }

  const { month, context, policies, records, statuses, overrides, dgpas } = loadedScope.value
  const contextRecords = records.filter((r) => r.context_id === context.id)
  const otherContextDates = new Set<string>()
  for (const r of records) {
    if (r.context_id !== context.id && r.work_date) {
      otherContextDates.add(r.work_date)
    }
  }

  return buildMonthlyReport({
    yearMonth: month,
    context,
    workPolicies: policies,
    attendanceRecords: contextRecords,
    otherContextAttendanceDates: otherContextDates,
    dayStatuses: statuses,
    calendarOverrides: overrides,
    dgpaRows: dgpas,
  })
})

const monthLabel = computed(() => {
  const [yearStr, monthStr] = currentMonth.value.split('-')
  return `${yearStr} 年 ${Number(monthStr)} 月`
})

onMounted(async () => {
  await initContexts()
})

watch([currentMonth, selectedContextId], async () => {
  if (selectedContextId.value) {
    await loadMonthData()
  }
})

async function initContexts() {
  isLoading.value = true
  loadError.value = ''
  try {
    const userId = await getCurrentUserId()
    const list = await listWorkContexts(userId)
    contexts.value = list
    if (list.length > 0) {
      const defaultCtx = list.find((c) => c.active && c.is_default) ?? list[0]
      selectedContextId.value = defaultCtx.id
    }
  } catch (err) {
    loadError.value = presentErrorMessage(err, '載入工作情境失敗，請稍後再試。')
    isLoading.value = false
  }
}

async function loadMonthData() {
  const requestId = ++currentRequestId
  const requestedMonth = currentMonth.value
  const requestedContextId = selectedContextId.value

  isLoading.value = true
  loadError.value = ''
  loadedScope.value = null

  try {
    const userId = await getCurrentUserId()
    const [policies, records, statuses, overrides, dgpas] = await Promise.all([
      listWorkPolicies(userId, requestedContextId),
      getMonthAttendanceRecords(requestedMonth),
      getDayStatusesForMonth(requestedMonth),
      getCalendarOverridesForMonth(requestedMonth),
      getDgpaCalendarForMonth(requestedMonth),
    ])

    if (requestId !== currentRequestId) return

    const matchedContext = contexts.value.find((c) => c.id === requestedContextId)
    if (!matchedContext) return

    loadedScope.value = {
      month: requestedMonth,
      contextId: requestedContextId,
      context: matchedContext,
      policies,
      records,
      statuses,
      overrides,
      dgpas,
    }
  } catch (err) {
    if (requestId !== currentRequestId) return
    loadedScope.value = null
    loadError.value = presentErrorMessage(err, '載入月報表資料失敗，請稍後再試。')
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
}

function handleNextMonth() {
  const [y, m] = currentMonth.value.split('-').map(Number)
  const nextDate = new Date(Date.UTC(y, m, 1))
  currentMonth.value = nextDate.toISOString().slice(0, 7)
}

function handleDownloadCsv() {
  if (!report.value || report.value.hasConfigurationError || isLoading.value) return

  const csvContent = exportReportToCsv(report.value)
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-report-${report.value.context.company_identifier || 'export'}-${currentMonth.value}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0 && mins === 0) return '0 分'
  if (hours === 0) return `${mins} 分`
  if (mins === 0) return `${hours} 小時`
  return `${hours} 小時 ${mins} 分`
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString))
}

function formatExceptionFlagLabel(flag: string): string {
  switch (flag) {
    case 'HOLIDAY_WITH_ATTENDANCE':
      return '假日出勤'
    case 'LEAVE_WITH_ATTENDANCE':
      return '請假但出勤'
    case 'OTHER_CONTEXT_ATTENDANCE':
      return '其他情境出勤'
    default:
      return flag
  }
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <section class="grid max-w-[39rem] gap-4" aria-labelledby="page-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
        <span class="h-px w-6 bg-current" aria-hidden="true"></span>
        <span>報表</span>
      </span>
      <h1 id="page-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">
        月出勤統計與匯出
      </h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">
        依日曆、特殊狀態與 Work Policy 彙總整月工時，並提供 Excel 相容之 CSV 檔案下載。
      </p>
    </section>

    <!-- Context & Month Navigation Controls -->
    <section class="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)] sm:p-6" aria-label="報表控制項">
      <div class="flex flex-wrap items-center gap-4">
        <div class="grid gap-1">
          <label for="context-select" class="text-xs font-bold text-muted">工作情境</label>
          <select
            id="context-select"
            v-model="selectedContextId"
            data-test="context-select"
            class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <option v-for="ctx in contexts" :key="ctx.id" :value="ctx.id">
              {{ ctx.name }} ({{ ctx.company_identifier }} / {{ ctx.project_identifier }})
            </option>
          </select>
        </div>

        <div class="grid gap-1">
          <label for="month-input" class="text-xs font-bold text-muted">月份選擇</label>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-test="prev-month-button"
              class="grid min-h-11 min-w-11 place-items-center rounded-[0.625rem] border border-line bg-surface text-sm font-bold text-ink hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label="上個月"
              @click="handlePrevMonth"
            >
              ‹
            </button>
            <input
              id="month-input"
              v-model="currentMonth"
              type="month"
              data-test="month-input"
              class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3 py-2 font-mono text-sm font-bold text-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
            />
            <button
              type="button"
              data-test="next-month-button"
              class="grid min-h-11 min-w-11 place-items-center rounded-[0.625rem] border border-line bg-surface text-sm font-bold text-ink hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label="下個月"
              @click="handleNextMonth"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-test="download-csv-button"
          :disabled="!report || report.hasConfigurationError || isLoading"
          class="inline-flex min-h-11 items-center gap-2 rounded-[0.625rem] bg-accent px-4 py-2 text-sm font-bold text-surface transition-[opacity,transform] duration-200 enabled:hover:-translate-y-px enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent"
          @click="handleDownloadCsv"
        >
          <span>下載 CSV</span>
        </button>
      </div>
    </section>

    <!-- Error / Configuration Warning Banners -->
    <div
      v-if="loadError"
      data-test="load-error-banner"
      class="mt-4 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] p-4 text-sm text-[var(--error-ink)]"
      role="alert"
    >
      {{ loadError }}
    </div>

    <div
      v-if="report?.hasConfigurationError"
      data-test="configuration-error-banner"
      class="mt-4 rounded-[0.625rem] border border-amber-400 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200"
      role="alert"
    >
      <strong class="font-bold">制度設定不完整：</strong>
      <span>
        目前工作情境在此月份部分工作日缺少適用的 Work Policy（缺少日期：{{ report.missingPolicyDates.slice(0, 5).join(', ') }}{{ report.missingPolicyDates.length > 5 ? ' 等' : '' }}）。已暫停 CSV 匯出，請至設定頁面補齊工作制度。
      </span>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      data-test="loading-indicator"
      class="mt-6 rounded-2xl border border-line bg-surface p-8 text-center"
    >
      <p class="font-display text-base font-semibold text-muted">載入報表中…</p>
    </div>

    <!-- Summary Cards -->
    <section v-else-if="report" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="月份工時摘要">
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-scheduled">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">應工作工時</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-ink">{{ formatMinutes(report.summary.scheduled_minutes) }}</strong>
      </div>
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-regular">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">正常工時</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-ink">{{ formatMinutes(report.summary.regular_minutes) }}</strong>
      </div>
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-leave">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">請假工時</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-ink">{{ formatMinutes(report.summary.leave_minutes) }}</strong>
      </div>
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-overtime">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">加班工時</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-accent">{{ formatMinutes(report.summary.overtime_minutes) }}</strong>
      </div>
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-absence">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">缺勤工時</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-ink">{{ formatMinutes(report.summary.absence_minutes) }}</strong>
      </div>
      <div class="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]" data-test="summary-incomplete">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">未完成打卡</span>
        <strong class="font-mono text-xl font-bold tabular-nums text-ink">{{ report.summary.incomplete_count }} 筆</strong>
      </div>
    </section>

    <!-- Daily Rows Table -->
    <section v-if="!isLoading && report" class="mt-8 rounded-2xl border border-line bg-surface shadow-[var(--shadow)] overflow-hidden" aria-label="逐日出勤報表">
      <div class="border-b border-line px-5 py-4 flex items-center justify-between">
        <h2 class="font-display text-lg font-bold">{{ monthLabel }} 逐日報表明細</h2>
        <span class="text-xs text-muted font-mono">{{ report.rows.length }} 日</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm border-collapse">
          <thead>
            <tr class="border-b border-line bg-surface-soft text-[0.75rem] font-bold text-muted">
              <th class="py-3 px-4">日期</th>
              <th class="py-3 px-4">日曆 / 狀態</th>
              <th class="py-3 px-4">實際上班 / 下班</th>
              <th class="py-3 px-4">有效上班 / 下班</th>
              <th class="py-3 px-4 text-right">應工作</th>
              <th class="py-3 px-4 text-right">正常</th>
              <th class="py-3 px-4 text-right">加班</th>
              <th class="py-3 px-4 text-right">請假</th>
              <th class="py-3 px-4 text-right">缺勤</th>
              <th class="py-3 px-4">例外 / 備註</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr
              v-for="row in report.rows"
              :key="row.date"
              data-test="report-row"
              class="hover:bg-surface-soft/60 transition-colors"
            >
              <td class="py-3 px-4 whitespace-nowrap font-mono font-semibold">
                {{ row.date }}
                <span class="text-xs text-muted font-normal ms-1">{{ row.weekdayLabel }}</span>
              </td>
              <td class="py-3 px-4 whitespace-nowrap">
                <span
                  class="inline-block rounded px-2 py-0.5 text-xs font-bold me-1.5"
                  :class="row.calendar_day_type === 'WORKDAY' ? 'bg-surface-soft text-ink' : 'bg-line/40 text-muted'"
                >
                  {{ row.calendar_day_type === 'WORKDAY' ? '工作日' : '假日' }}
                </span>
                <span
                  v-if="row.status"
                  class="inline-block rounded px-2 py-0.5 text-xs font-bold"
                  :class="{
                    'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200': row.status === 'LEAVE',
                    'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200': row.status === 'REMOTE',
                    'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200': row.status === 'BUSINESS_TRIP',
                    'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200': row.status === 'ABSENT',
                  }"
                >
                  {{ row.status === 'LEAVE' ? '請假' : row.status === 'REMOTE' ? '遠端' : row.status === 'BUSINESS_TRIP' ? '出差' : '缺勤' }}
                </span>
              </td>
              <td class="py-3 px-4 whitespace-nowrap font-mono text-xs">
                {{ formatTime(row.actual_clock_in_at) }} / {{ formatTime(row.actual_clock_out_at) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap font-mono text-xs">
                {{ formatTime(row.effective_clock_in_at) }} / {{ formatTime(row.effective_clock_out_at) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums">
                {{ formatMinutes(row.scheduled_minutes) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums font-semibold">
                {{ formatMinutes(row.regular_minutes) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums text-accent font-semibold">
                {{ formatMinutes(row.overtime_minutes) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums text-amber-700 dark:text-amber-300">
                {{ formatMinutes(row.leave_minutes) }}
              </td>
              <td class="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums text-rose-700 dark:text-rose-300">
                {{ formatMinutes(row.absence_minutes) }}
              </td>
              <td class="py-3 px-4 text-xs">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span
                    v-if="row.is_incomplete"
                    class="rounded bg-rose-100 dark:bg-rose-950 px-1.5 py-0.5 font-bold text-rose-700 dark:text-rose-300"
                  >
                    未完成
                  </span>
                  <span
                    v-for="flag in row.exception_flags"
                    :key="flag"
                    class="rounded bg-accent/10 px-1.5 py-0.5 font-bold text-accent"
                  >
                    {{ formatExceptionFlagLabel(flag) }}
                    <span class="sr-only">{{ flag }}</span>
                  </span>
                  <span v-if="row.note" class="text-muted truncate max-w-[12rem]" :title="row.note">
                    {{ row.note }}
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Empty Context State -->
    <div
      v-else-if="!isLoading && contexts.length === 0"
      class="mt-8 rounded-2xl border border-line bg-surface p-8 text-center"
    >
      <p class="font-display text-lg font-bold text-ink">尚未設定任何工作情境</p>
      <p class="mt-1 text-sm text-muted">請先至設定頁面建立您的第一個工作情境與工作制度。</p>
    </div>
  </div>
</template>
