<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  buildMonthOverview,
  formatDayStatusLabel,
  formatCalendarOverrideLabel,
  type DailyOverview,
  type DayStatus,
  type CalendarOverride,
  type DayStatusType,
  type CalendarDayType,
} from '../domain/calendar-status/overview'
import {
  getDayStatusesForMonth,
  getCalendarOverridesForMonth,
  getMonthAttendanceDates,
  upsertDayStatus,
  deleteDayStatus,
  upsertCalendarOverride,
  deleteCalendarOverride,
} from '../lib/day-status-calendar'
import { getTaipeiToday } from '../lib/work-policy'

const currentMonth = ref(getTaipeiToday().slice(0, 7))
const isLoading = ref(true)
const loadError = ref('')
const dayStatuses = ref<DayStatus[]>([])
const calendarOverrides = ref<CalendarOverride[]>([])
const attendanceDates = ref<Set<string>>(new Set())

const editingDay = ref<DailyOverview | null>(null)
const isSaving = ref(false)
const modalError = ref('')

const formCalendarOverrideType = ref<'NONE' | CalendarDayType>('NONE')
const formCalendarOverrideName = ref('')
const formCalendarOverrideNote = ref('')
const formDayStatusType = ref<'NONE' | DayStatusType>('NONE')
const formDayStatusNote = ref('')

const monthLabel = computed(() => {
  const [year, month] = currentMonth.value.split('-')
  return `${year} 年 ${month} 月`
})

const overviewDays = computed(() => {
  return buildMonthOverview({
    yearMonth: currentMonth.value,
    dayStatuses: dayStatuses.value,
    calendarOverrides: calendarOverrides.value,
    attendanceDates: attendanceDates.value,
  })
})

onMounted(() => {
  void loadMonth(currentMonth.value)
})

watch(currentMonth, (newMonth) => {
  void loadMonth(newMonth)
})

async function loadMonth(yearMonth: string) {
  isLoading.value = true
  loadError.value = ''

  try {
    const [statuses, overrides, attendances] = await Promise.all([
      getDayStatusesForMonth(yearMonth),
      getCalendarOverridesForMonth(yearMonth),
      getMonthAttendanceDates(yearMonth),
    ])

    dayStatuses.value = statuses
    calendarOverrides.value = overrides
    attendanceDates.value = attendances
  } catch (error) {
    loadError.value = error instanceof Error && error.message ? error.message : '日曆與狀態資料載入失敗，請稍後再試。'
  } finally {
    isLoading.value = false
  }
}

function handlePrevMonth() {
  const [yearStr, monthStr] = currentMonth.value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const prevDate = new Date(Date.UTC(year, month - 2, 1))
  currentMonth.value = prevDate.toISOString().slice(0, 7)
}

function handleNextMonth() {
  const [yearStr, monthStr] = currentMonth.value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const nextDate = new Date(Date.UTC(year, month, 1))
  currentMonth.value = nextDate.toISOString().slice(0, 7)
}

function handleThisMonth() {
  currentMonth.value = getTaipeiToday().slice(0, 7)
}

function openEditModal(day: DailyOverview) {
  editingDay.value = day
  modalError.value = ''

  if (day.calendarOverride) {
    formCalendarOverrideType.value = day.calendarOverride.day_type
    formCalendarOverrideName.value = day.calendarOverride.name ?? ''
    formCalendarOverrideNote.value = day.calendarOverride.note ?? ''
  } else {
    formCalendarOverrideType.value = 'NONE'
    formCalendarOverrideName.value = ''
    formCalendarOverrideNote.value = ''
  }

  if (day.dayStatus) {
    formDayStatusType.value = day.dayStatus.status
    formDayStatusNote.value = day.dayStatus.note ?? ''
  } else {
    formDayStatusType.value = 'NONE'
    formDayStatusNote.value = ''
  }
}

function closeEditModal() {
  if (isSaving.value) return
  editingDay.value = null
  modalError.value = ''
}

async function handleSaveDay() {
  if (!editingDay.value || isSaving.value) return

  isSaving.value = true
  modalError.value = ''

  const date = editingDay.value.date
  const currentStatus = editingDay.value.dayStatus
  const currentOverride = editingDay.value.calendarOverride

  try {
    // 1. Handle Calendar Override mutation
    if (formCalendarOverrideType.value === 'NONE') {
      if (currentOverride) {
        await deleteCalendarOverride(currentOverride.id)
      }
    } else {
      await upsertCalendarOverride({
        calendar_date: date,
        day_type: formCalendarOverrideType.value,
        name: formCalendarOverrideName.value || null,
        note: formCalendarOverrideNote.value || null,
      })
    }

    // 2. Handle Day Status mutation
    if (formDayStatusType.value === 'NONE') {
      if (currentStatus) {
        await deleteDayStatus(currentStatus.id)
      }
    } else {
      await upsertDayStatus({
        work_date: date,
        status: formDayStatusType.value,
        note: formDayStatusNote.value || null,
      })
    }

    // Reload month to refresh
    await loadMonth(currentMonth.value)
    editingDay.value = null
  } catch (error) {
    modalError.value = error instanceof Error && error.message ? error.message : '儲存失敗，請稍後再試。'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <section class="grid max-w-[43rem] gap-4" aria-labelledby="leave-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
        <span class="h-px w-6 bg-current" aria-hidden="true"></span>
        <span>日曆／狀態 / ASIA-TAIPEI</span>
      </span>
      <h1 id="leave-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">
        分開看日曆分類與當日狀態。
      </h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">
        日曆回答「這天是哪一類」；狀態回答「這天怎麼工作」。兩組資訊各自保留，並顯示例外提示。
      </p>
    </section>

    <!-- Month Navigation -->
    <section class="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4" aria-label="月份導覽">
      <div class="flex items-center gap-3">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">檢視月份</span>
        <strong class="font-display text-xl font-semibold">{{ monthLabel }}</strong>
      </div>
      <div class="flex items-center gap-2">
        <button
          data-action="prev-month"
          class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition duration-200 ease-out hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          type="button"
          @click="handlePrevMonth"
        >
          上個月
        </button>
        <button
          data-action="this-month"
          class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition duration-200 ease-out hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          type="button"
          @click="handleThisMonth"
        >
          本月
        </button>
        <button
          data-action="next-month"
          class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition duration-200 ease-out hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          type="button"
          @click="handleNextMonth"
        >
          下個月
        </button>
      </div>
    </section>

    <!-- Error Alert -->
    <p v-if="loadError" class="mt-5 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert">
      {{ loadError }}
      <button
        data-action="retry-load"
        class="ms-3 font-bold underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
        type="button"
        @click="loadMonth(currentMonth)"
      >
        重試
      </button>
    </p>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="mt-6 grid gap-3" role="status" aria-busy="true" aria-label="正在載入日曆與狀態資料">
      <span class="h-16 rounded-xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-16 rounded-xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-16 rounded-xl bg-surface-soft" aria-hidden="true"></span>
    </div>

    <!-- Days List Table -->
    <div v-else class="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow)]">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm" aria-label="月份日曆與狀態表">
          <thead class="border-b border-line bg-surface-soft text-[0.6875rem] font-bold tracking-[0.1em] text-muted">
            <tr>
              <th scope="col" class="px-4 py-3 sm:px-6">日期</th>
              <th scope="col" class="px-4 py-3 sm:px-6">日曆分類（覆寫）</th>
              <th scope="col" class="px-4 py-3 sm:px-6">當日安排（狀態）</th>
              <th scope="col" class="px-4 py-3 sm:px-6">出勤</th>
              <th scope="col" class="px-4 py-3 sm:px-6 text-end">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr
              v-for="d in overviewDays"
              :key="d.date"
              :data-testid="`day-row-${d.date}`"
              class="transition-colors hover:bg-surface-soft/60"
              :class="d.isWeekend ? 'bg-surface-soft/30' : ''"
            >
              <!-- Date Column -->
              <td class="px-4 py-4 sm:px-6 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-base font-semibold tabular-nums" :class="d.isWeekend ? 'text-muted' : 'text-ink'">
                    {{ d.date.slice(5) }}
                  </span>
                  <span class="text-xs text-muted">({{ d.dayOfWeekLabel }})</span>
                </div>
              </td>

              <!-- Calendar Override Column -->
              <td class="px-4 py-4 sm:px-6" :data-testid="`calendar-cell-${d.date}`">
                <div v-if="d.calendarOverride" class="grid gap-0.5">
                  <span
                    class="w-fit rounded-[0.375rem] px-2 py-0.5 text-xs font-bold"
                    :class="d.calendarOverride.day_type === 'HOLIDAY' ? 'border border-amber-300 bg-amber-50 text-amber-800' : 'border border-blue-300 bg-blue-50 text-blue-800'"
                  >
                    {{ formatCalendarOverrideLabel(d.calendarOverride.day_type) }}
                  </span>
                  <span v-if="d.calendarOverride.name" class="font-medium text-xs">{{ d.calendarOverride.name }}</span>
                  <span v-if="d.calendarOverride.note" class="text-xs text-muted">{{ d.calendarOverride.note }}</span>
                </div>
                <span v-else class="text-xs text-muted">未覆寫</span>
              </td>

              <!-- Day Status Column -->
              <td class="px-4 py-4 sm:px-6" :data-testid="`status-cell-${d.date}`">
                <div v-if="d.dayStatus" class="grid gap-0.5">
                  <span
                    class="w-fit rounded-[0.375rem] px-2 py-0.5 text-xs font-bold"
                    :class="d.dayStatus.status === 'LEAVE' ? 'border border-rose-300 bg-rose-50 text-rose-800' : d.dayStatus.status === 'REMOTE' ? 'border border-teal-300 bg-teal-50 text-teal-800' : 'border border-purple-300 bg-purple-50 text-purple-800'"
                  >
                    {{ formatDayStatusLabel(d.dayStatus.status) }}
                  </span>
                  <span v-if="d.dayStatus.note" class="text-xs text-muted">{{ d.dayStatus.note }}</span>
                </div>
                <span v-else class="text-xs text-muted">未設定</span>
              </td>

              <!-- Attendance & Exception Column -->
              <td class="px-4 py-4 sm:px-6" :data-testid="`attendance-cell-${d.date}`">
                <div class="grid gap-1">
                  <span v-if="d.hasAttendance" class="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                    <span class="size-2 rounded-full bg-emerald-500" aria-hidden="true"></span>
                    已有出勤
                  </span>
                  <span v-else class="text-xs text-muted">無出勤</span>

                  <!-- Exception Warning -->
                  <div
                    v-if="d.hasException"
                    :data-testid="`exception-badge-${d.date}`"
                    class="rounded-[0.375rem] border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                    role="note"
                  >
                    ⚠️ {{ d.exceptionHint }}
                  </div>
                </div>
              </td>

              <!-- Action Column -->
              <td class="px-4 py-4 sm:px-6 text-end">
                <button
                  data-action="edit-day"
                  class="rounded-[0.5rem] border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink transition hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  type="button"
                  @click="openEditModal(d)"
                >
                  設定
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal Dialog -->
    <div
      v-if="editingDay"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div class="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]">
        <div class="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">單日日曆與狀態設定</span>
            <h2 id="modal-title" class="font-display text-xl font-semibold">
              {{ editingDay.date }} ({{ editingDay.dayOfWeekLabel }})
            </h2>
          </div>
          <button
            class="text-muted hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            type="button"
            :disabled="isSaving"
            aria-label="關閉對話框"
            @click="closeEditModal"
          >
            ✕
          </button>
        </div>

        <!-- Attendance Retention Notice -->
        <div
          v-if="editingDay.hasAttendance"
          data-testid="attendance-retention-notice"
          class="mt-4 rounded-[0.625rem] border border-blue-200 bg-blue-50 p-3.5 text-xs leading-relaxed text-blue-950"
          role="note"
        >
          <strong>出勤紀錄保留提示：</strong>此日已有出勤紀錄。儲存變更不會修改、刪除或重算出勤紀錄。
        </div>

        <form class="mt-4 grid gap-5" @submit.prevent="handleSaveDay">
          <!-- Section 1: Calendar Classification -->
          <fieldset class="grid gap-3 rounded-[0.625rem] border border-line p-4">
            <legend class="px-1 text-xs font-bold tracking-[0.08em] text-accent">
              1. 日曆分類（人工覆寫）
            </legend>
            <div class="grid gap-1.5">
              <label class="text-xs font-semibold text-muted" for="cal-override-type">覆寫類別</label>
              <select
                id="cal-override-type"
                v-model="formCalendarOverrideType"
                data-testid="calendar-override-type"
                class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <option value="NONE">無覆寫（依未來預設日曆）</option>
                <option value="WORKDAY">人工工作日 (WORKDAY)</option>
                <option value="HOLIDAY">人工假日 (HOLIDAY)</option>
              </select>
            </div>

            <div v-if="formCalendarOverrideType !== 'NONE'" class="grid gap-1.5">
              <label class="text-xs font-semibold text-muted" for="cal-override-name">名稱（可選）</label>
              <input
                id="cal-override-name"
                v-model="formCalendarOverrideName"
                data-testid="calendar-override-name"
                type="text"
                placeholder="例如：廠慶、補班"
                class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>

            <div v-if="formCalendarOverrideType !== 'NONE'" class="grid gap-1.5">
              <label class="text-xs font-semibold text-muted" for="cal-override-note">日曆備註（可選）</label>
              <input
                id="cal-override-note"
                v-model="formCalendarOverrideNote"
                data-testid="calendar-override-note"
                type="text"
                placeholder="說明或備註"
                class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          </fieldset>

          <!-- Section 2: Special Day Status -->
          <fieldset class="grid gap-3 rounded-[0.625rem] border border-line p-4">
            <legend class="px-1 text-xs font-bold tracking-[0.08em] text-accent">
              2. 特殊狀態（當日安排）
            </legend>
            <div class="grid gap-1.5">
              <label class="text-xs font-semibold text-muted" for="day-status-type">狀態類別</label>
              <select
                id="day-status-type"
                v-model="formDayStatusType"
                data-testid="day-status-type"
                class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <option value="NONE">無特殊狀態</option>
                <option value="LEAVE">請假 (LEAVE)</option>
                <option value="REMOTE">遠端 (REMOTE)</option>
                <option value="BUSINESS_TRIP">出差 (BUSINESS_TRIP)</option>
              </select>
            </div>

            <div v-if="formDayStatusType !== 'NONE'" class="grid gap-1.5">
              <label class="text-xs font-semibold text-muted" for="day-status-note">狀態備註（可選）</label>
              <input
                id="day-status-note"
                v-model="formDayStatusNote"
                data-testid="day-status-note"
                type="text"
                placeholder="例如：特休、客戶端開會"
                class="min-h-10 rounded-[0.5rem] border border-line bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>
          </fieldset>

          <!-- Modal Error Alert -->
          <p v-if="modalError" class="rounded-[0.5rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-2.5 text-xs text-[var(--error-ink)]" role="alert">
            {{ modalError }}
          </p>

          <div class="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button
              data-action="cancel-edit"
              class="min-h-10 rounded-[0.625rem] border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
              type="button"
              :disabled="isSaving"
              @click="closeEditModal"
            >
              取消
            </button>
            <button
              data-action="save-day"
              class="min-h-10 rounded-[0.625rem] border border-accent bg-accent px-5 py-2 text-sm font-bold text-canvas transition hover:border-ink hover:bg-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
              type="submit"
              :disabled="isSaving"
              :aria-busy="isSaving"
              @click.prevent="handleSaveDay"
            >
              {{ isSaving ? '儲存中…' : '儲存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
