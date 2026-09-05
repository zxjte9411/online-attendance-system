<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
  ClockInRoundingMode,
  ClockOutRoundingMode,
  EarlyArrivalPolicy,
  WorkPolicy,
  WorkPolicyInput,
  WorkingDay,
} from '../../lib/settings'
import { createWorkPolicy, updateWorkPolicy } from '../../lib/settings'
import type { WorkAssignment } from '../../domain/work-assignment/work-assignment'

type AssignmentPolicy = WorkPolicy & { assignment_id: string }

const props = defineProps<{
  assignmentId: string
  policies: AssignmentPolicy[]
  policy?: AssignmentPolicy | null
  assignment?: WorkAssignment | null
  hasAttendance?: boolean
  onboarding?: boolean
}>()

const emit = defineEmits<{ saved: [policy: AssignmentPolicy] }>()
const name = ref('')
const standardStartTime = ref('09:00')
const workMinutes = ref(480)
const fixedBreakMinutes = ref(60)
const earlyArrivalPolicy = ref<EarlyArrivalPolicy>('STANDARD_START')
const clockInRoundingMode = ref<ClockInRoundingMode>('NONE')
const clockInRoundingMinutes = ref(30)
const clockOutRoundingMode = ref<ClockOutRoundingMode>('NONE')
const clockOutRoundingMinutes = ref(30)
const workingDays = ref<WorkingDay[]>(['1', '2', '3', '4', '5'])
const effectiveFrom = ref('')
const effectiveTo = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)
const dayOptions: ReadonlyArray<readonly [WorkingDay, string]> = [
  ['1', '週一'], ['2', '週二'], ['3', '週三'], ['4', '週四'],
  ['5', '週五'], ['6', '週六'], ['0', '週日'],
] as const

const isEditing = computed(() => Boolean(props.policy))
const isUsed = computed(() => isEditing.value && props.hasAttendance === true)

watch(() => props.policy, (policy) => {
  name.value = policy?.name ?? ''
  standardStartTime.value = policy?.standard_start_time ?? '09:00'
  workMinutes.value = policy?.work_minutes ?? 480
  fixedBreakMinutes.value = policy?.fixed_break_minutes ?? 60
  earlyArrivalPolicy.value = policy?.early_arrival_policy ?? 'STANDARD_START'
  clockInRoundingMode.value = policy?.clock_in_rounding_mode ?? 'NONE'
  clockInRoundingMinutes.value = policy?.clock_in_rounding_minutes ?? 30
  clockOutRoundingMode.value = policy?.clock_out_rounding_mode ?? 'NONE'
  clockOutRoundingMinutes.value = policy?.clock_out_rounding_minutes ?? 30
  workingDays.value = [...(policy?.working_days ?? ['1', '2', '3', '4', '5'])]
  effectiveFrom.value = policy?.effective_from ?? ''
  effectiveTo.value = policy?.effective_to ?? ''
  errorMessage.value = ''
  successMessage.value = ''
}, { immediate: true })

function overlapsExistingPolicy() {
  const start = effectiveFrom.value
  const end = effectiveTo.value || '9999-12-31'

  return props.policies.some((policy) => {
    if (policy.id === props.policy?.id) return false
    const policyEnd = policy.effective_to || '9999-12-31'
    return start <= policyEnd && policy.effective_from <= end
  })
}

function isOutsideAssignmentPeriod() {
  const assignment = props.assignment
  if (!assignment) return false
  return effectiveFrom.value < assignment.effective_from
    || Boolean(assignment.effective_to && effectiveFrom.value > assignment.effective_to)
    || Boolean(effectiveTo.value && (effectiveTo.value < assignment.effective_from
      || (assignment.effective_to && effectiveTo.value > assignment.effective_to)))
}

function getInput(): WorkPolicyInput {
  return {
    name: name.value.trim(),
    standard_start_time: standardStartTime.value,
    work_minutes: Number(workMinutes.value),
    fixed_break_minutes: Number(fixedBreakMinutes.value),
    early_arrival_policy: earlyArrivalPolicy.value,
    clock_in_rounding_mode: clockInRoundingMode.value,
    clock_in_rounding_minutes: clockInRoundingMode.value === 'NONE' ? null : Number(clockInRoundingMinutes.value),
    clock_out_rounding_mode: clockOutRoundingMode.value,
    clock_out_rounding_minutes: clockOutRoundingMode.value === 'NONE' ? null : Number(clockOutRoundingMinutes.value),
    working_days: workingDays.value,
    effective_from: effectiveFrom.value,
    effective_to: effectiveTo.value || null,
    timezone: 'Asia/Taipei',
  }
}

async function submit() {
  if (isSaving.value) return

  errorMessage.value = ''
  successMessage.value = ''

  if (!name.value.trim()) {
    errorMessage.value = '請填寫制度名稱。'
  } else if (!effectiveFrom.value) {
    errorMessage.value = '請填寫制度生效起日。'
  } else if (effectiveTo.value && effectiveTo.value < effectiveFrom.value) {
    errorMessage.value = '生效迄日不能早於生效起日。'
  } else if (isOutsideAssignmentPeriod()) {
    errorMessage.value = '工作制度必須完整落在工作派駐期間內。'
  } else if (!workingDays.value.length) {
    errorMessage.value = '請至少選擇一個工作日。'
  } else if (overlapsExistingPolicy()) {
    errorMessage.value = '這個生效區間與目前工作派駐的既有工作制度重疊，請改用不重疊的日期。'
  }

  if (errorMessage.value) {
    await nextTick()
    errorRegion.value?.focus()
    return
  }

  isSaving.value = true

  try {
    const input = getInput()
    const savedPolicy = props.policy
      ? await updateWorkPolicy(
        props.policy.id,
        input,
      )
      : await createWorkPolicy(props.assignmentId, input)
    emit('saved', savedPolicy)
    successMessage.value = props.policy ? '工作制度已更新。' : '工作制度已儲存。'
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : '工作制度儲存失敗，請確認日期區間後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <form class="grid gap-6" @submit.prevent="submit">
    <p v-if="isUsed" id="policy-lock-help" class="rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm leading-relaxed text-muted" role="note">
      此工作制度已有出勤紀錄使用。為保留歷史計算依據，只有制度名稱與生效迄日可以調整；生效迄日可清空恢復為持續生效。
    </p>

    <fieldset class="grid gap-4" :aria-describedby="isUsed ? 'policy-lock-help' : undefined">
      <legend class="font-display text-xl font-semibold tracking-[-0.03em]">基本規則</legend>
      <div class="grid gap-1.5">
        <label class="font-semibold" for="policy-name">制度名稱 <span class="text-accent" aria-hidden="true">*</span></label>
        <input id="policy-name" v-model="name" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="name" maxlength="100" required :aria-describedby="errorMessage ? 'policy-error' : undefined" :aria-invalid="errorMessage ? 'true' : undefined" :disabled="false">
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="grid gap-1.5">
          <label class="font-semibold" for="policy-start">標準上班時間 <span class="text-accent" aria-hidden="true">*</span></label>
          <input id="policy-start" v-model="standardStartTime" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="standard_start_time" type="time" required :disabled="isUsed">
        </div>
        <div class="grid gap-1.5">
          <label class="font-semibold" for="policy-work-minutes">每日工作分鐘 <span class="text-accent" aria-hidden="true">*</span></label>
          <input id="policy-work-minutes" v-model.number="workMinutes" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="work_minutes" type="number" min="0" max="1440" step="1" inputmode="numeric" required :disabled="isUsed">
        </div>
        <div class="grid gap-1.5">
          <label class="font-semibold" for="policy-break-minutes">固定休息分鐘 <span class="text-accent" aria-hidden="true">*</span></label>
          <input id="policy-break-minutes" v-model.number="fixedBreakMinutes" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="fixed_break_minutes" type="number" min="0" max="1440" step="1" inputmode="numeric" required :disabled="isUsed">
        </div>
      </div>
    </fieldset>

    <fieldset class="grid gap-3 border-t border-line pt-5" :disabled="isUsed" :aria-describedby="isUsed ? 'policy-lock-help' : undefined">
      <legend class="font-display text-xl font-semibold tracking-[-0.03em]">早到規則</legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="earlyArrivalPolicy" class="size-5 accent-accent" type="radio" name="early_arrival_policy" value="STANDARD_START"><span>以標準上班時間計算</span></label>
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="earlyArrivalPolicy" class="size-5 accent-accent" type="radio" name="early_arrival_policy" value="ACTUAL"><span>以實際到班時間計算</span></label>
      </div>
    </fieldset>

    <fieldset class="grid gap-4 border-t border-line pt-5" :disabled="isUsed" :aria-describedby="isUsed ? 'policy-lock-help' : undefined">
      <legend class="font-display text-xl font-semibold tracking-[-0.03em]">上班取整</legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="clockInRoundingMode" class="size-5 accent-accent" type="radio" name="clock_in_rounding_mode" value="NONE"><span>不取整</span></label>
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="clockInRoundingMode" class="size-5 accent-accent" type="radio" name="clock_in_rounding_mode" value="CEIL"><span>向上取整</span></label>
      </div>
      <div v-if="clockInRoundingMode !== 'NONE'" class="grid gap-1.5 sm:max-w-xs">
        <label class="font-semibold" for="policy-clock-in-rounding">上班取整分鐘</label>
        <input id="policy-clock-in-rounding" v-model.number="clockInRoundingMinutes" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="clock_in_rounding_minutes" type="number" min="1" max="1440" step="1" inputmode="numeric" required>
      </div>
    </fieldset>

    <fieldset class="grid gap-4 border-t border-line pt-5" :disabled="isUsed" :aria-describedby="isUsed ? 'policy-lock-help' : undefined">
      <legend class="font-display text-xl font-semibold tracking-[-0.03em]">下班取整</legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="clockOutRoundingMode" class="size-5 accent-accent" type="radio" name="clock_out_rounding_mode" value="NONE"><span>不取整</span></label>
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="clockOutRoundingMode" class="size-5 accent-accent" type="radio" name="clock_out_rounding_mode" value="CEIL"><span>向上取整</span></label>
        <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="clockOutRoundingMode" class="size-5 accent-accent" type="radio" name="clock_out_rounding_mode" value="FLOOR"><span>向下取整</span></label>
      </div>
      <div v-if="clockOutRoundingMode !== 'NONE'" class="grid gap-1.5 sm:max-w-xs">
        <label class="font-semibold" for="policy-clock-out-rounding">下班取整分鐘</label>
        <input id="policy-clock-out-rounding" v-model.number="clockOutRoundingMinutes" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="clock_out_rounding_minutes" type="number" min="1" max="1440" step="1" inputmode="numeric" required>
      </div>
    </fieldset>

    <fieldset class="grid gap-4 border-t border-line pt-5" :aria-describedby="isUsed ? 'policy-lock-help' : undefined">
      <legend class="font-display text-xl font-semibold tracking-[-0.03em]">工作日與版本期間</legend>
      <div class="grid gap-2" :class="{ 'opacity-60': isUsed }">
        <span class="font-semibold">工作日 <span class="text-accent" aria-hidden="true">*</span></span>
        <div class="grid gap-2 sm:grid-cols-4">
          <label v-for="[value, label] in dayOptions" :key="value" class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5"><input v-model="workingDays" class="size-5 accent-accent" type="checkbox" name="working_days" :value="value" :disabled="isUsed"><span>{{ label }}</span></label>
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 sm:grid-rows-[auto_auto_auto] sm:gap-x-4 sm:gap-y-1.5">
        <div class="grid gap-1.5 sm:row-span-3 sm:grid-rows-subgrid">
          <label class="font-semibold" for="policy-effective-from">生效起日 <span class="text-accent" aria-hidden="true">*</span></label>
          <input id="policy-effective-from" v-model="effectiveFrom" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="effective_from" type="date" :min="assignment?.effective_from" :max="assignment?.effective_to || undefined" required :disabled="isUsed" :aria-describedby="errorMessage ? 'policy-error' : undefined" :aria-invalid="errorMessage ? 'true' : undefined">
        </div>
        <div class="grid gap-1.5 sm:row-span-3 sm:grid-rows-subgrid">
          <label class="font-semibold" for="policy-effective-to">生效迄日 <span class="text-sm font-normal text-muted">（選填）</span></label>
          <input id="policy-effective-to" v-model="effectiveTo" :min="effectiveFrom || assignment?.effective_from" :max="assignment?.effective_to || undefined" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="effective_to" type="date" aria-describedby="policy-effective-help" :disabled="false">
          <span id="policy-effective-help" class="text-sm text-muted">日期區間含首含尾；留白代表持續生效。</span>
        </div>
      </div>
      <div class="grid gap-1.5">
        <span class="font-semibold" id="policy-timezone-label">時區</span>
        <output class="min-h-12 rounded-[0.625rem] border border-line bg-surface-soft px-3.5 py-3 font-mono text-sm" aria-labelledby="policy-timezone-label">Asia/Taipei（固定）</output>
      </div>
    </fieldset>

    <p v-if="errorMessage" id="policy-error" ref="errorRegion" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert" tabindex="-1">{{ errorMessage }}</p>
    <p v-if="successMessage" class="rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm text-ink" role="status" aria-live="polite">{{ successMessage }}</p>
    <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="submit" :disabled="isSaving" :aria-busy="isSaving">
      {{ isSaving ? '儲存中…' : (policy ? '儲存工作制度' : (onboarding ? '儲存並完成設定' : '新增工作制度')) }}
    </button>
  </form>
</template>
