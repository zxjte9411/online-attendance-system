<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  createWorkAssignment,
  updateWorkAssignment,
} from '../../lib/work-assignment'
import {
  isUninterruptedRenewal,
  validateWorkAssignmentInput,
  type WorkAssignment,
  type WorkAssignmentInput,
} from '../../domain/work-assignment/work-assignment'

const props = defineProps<{
  userId: string
  assignment?: WorkAssignment | null
  existingAssignments?: WorkAssignment[]
  hasAttendance?: boolean
  onboarding?: boolean
}>()

const emit = defineEmits<{
  saved: [assignments: WorkAssignment[], message: string]
  cancel: []
}>()

const staffingEmployer = ref('')
const clientCompany = ref('')
const project = ref('')
const effectiveFrom = ref('')
const effectiveTo = ref('')
const isSaving = ref(false)
const errorMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)

watch(
  () => props.assignment,
  (current) => {
    staffingEmployer.value = current?.staffing_employer ?? ''
    clientCompany.value = current?.client_company ?? ''
    project.value = current?.project ?? ''
    effectiveFrom.value = current?.effective_from ?? ''
    effectiveTo.value = current?.effective_to ?? ''
    errorMessage.value = ''
  },
  { immediate: true }
)

async function submit() {
  if (isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''

  try {
    const input: WorkAssignmentInput = {
      staffing_employer: staffingEmployer.value.trim(),
      client_company: clientCompany.value.trim(),
      project: project.value.trim(),
      effective_from: effectiveFrom.value.trim(),
      effective_to: effectiveTo.value.trim() ? effectiveTo.value.trim() : null,
    }

    const validation = validateWorkAssignmentInput(
      input,
      props.existingAssignments ?? [],
      {
        editingId: props.assignment?.id,
        hasAttendance: props.hasAttendance,
        originalAssignment: props.assignment ?? undefined,
      }
    )

    if (!validation.valid) {
      errorMessage.value = validation.error || '工作派駐資料不完整，請檢查後重試。'
      await nextTick()
      errorRegion.value?.focus()
      return
    }

    if (props.assignment) {
      const updatedList = await updateWorkAssignment(props.userId, props.assignment.id, input)
      emit('saved', updatedList, '工作派駐已儲存。')
    } else {
      const isRenewal = (props.existingAssignments ?? []).some((other) =>
        isUninterruptedRenewal(other, input)
      )
      const { assignments } = await createWorkAssignment(props.userId, input)
      const message = isRenewal ? '工作派駐已成功續約並延長期間。' : '工作派駐已建立。'
      emit('saved', assignments, message)
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '工作派駐儲存失敗，請確認資料後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <form class="grid gap-5" @submit.prevent="submit">
    <div v-if="props.assignment && props.hasAttendance" class="rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm text-ink">
      <span class="font-semibold">注意：</span>此工作派駐已有出勤紀錄，派遣雇主、派駐客戶與專案識別已鎖定；如需調整請修改派駐期間，或建立新的工作派駐。
    </div>

    <div class="grid gap-1.5">
      <label class="font-semibold" for="assignment-staffing-employer">
        派遣雇主（Staffing Employer） <span class="text-accent" aria-hidden="true">*</span>
      </label>
      <input
        id="assignment-staffing-employer"
        v-model="staffingEmployer"
        class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
        name="staffing_employer"
        maxlength="100"
        required
        :disabled="Boolean(props.assignment && props.hasAttendance)"
        :aria-describedby="errorMessage ? 'assignment-error' : undefined"
        :aria-invalid="errorMessage ? 'true' : undefined"
      />
    </div>

    <div class="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
      <div class="grid gap-1.5">
        <label class="font-semibold" for="assignment-client-company">
          派駐客戶（Client Company） <span class="text-accent" aria-hidden="true">*</span>
        </label>
        <input
          id="assignment-client-company"
          v-model="clientCompany"
          class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          name="client_company"
          maxlength="150"
          required
          :disabled="Boolean(props.assignment && props.hasAttendance)"
          :aria-describedby="errorMessage ? 'assignment-error' : undefined"
          :aria-invalid="errorMessage ? 'true' : undefined"
        />
      </div>
      <div class="grid gap-1.5">
        <label class="font-semibold" for="assignment-project">
          專案（Project） <span class="text-accent" aria-hidden="true">*</span>
        </label>
        <input
          id="assignment-project"
          v-model="project"
          class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          name="project"
          maxlength="150"
          required
          :disabled="Boolean(props.assignment && props.hasAttendance)"
          :aria-describedby="errorMessage ? 'assignment-error' : undefined"
          :aria-invalid="errorMessage ? 'true' : undefined"
        />
      </div>
    </div>

    <div class="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
      <div class="grid gap-1.5">
        <label class="font-semibold" for="assignment-effective-from">
          生效起日 <span class="text-accent" aria-hidden="true">*</span>
        </label>
        <input
          id="assignment-effective-from"
          v-model="effectiveFrom"
          class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          name="effective_from"
          type="date"
          required
          :aria-describedby="errorMessage ? 'assignment-error' : undefined"
          :aria-invalid="errorMessage ? 'true' : undefined"
        />
      </div>
      <div class="grid gap-1.5">
        <label class="font-semibold" for="assignment-effective-to">
          最後有效日（選填）
        </label>
        <input
          id="assignment-effective-to"
          v-model="effectiveTo"
          class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          name="effective_to"
          type="date"
          :min="effectiveFrom || undefined"
          :aria-describedby="errorMessage ? 'assignment-error' : undefined"
          :aria-invalid="errorMessage ? 'true' : undefined"
        />
        <span class="text-xs text-muted">留空表示目前尚無已確認的最後有效日。</span>
      </div>
    </div>

    <p
      v-if="errorMessage"
      id="assignment-error"
      ref="errorRegion"
      class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm text-[var(--error-ink)]"
      role="alert"
      tabindex="-1"
    >
      {{ errorMessage }}
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <button
        class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
        type="submit"
        :disabled="isSaving"
        :aria-busy="isSaving"
      >
        {{ isSaving ? '儲存中…' : (props.onboarding ? '儲存並繼續' : (props.assignment ? '儲存工作派駐' : '新增工作派駐')) }}
      </button>
      <button
        v-if="!props.onboarding"
        class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-line bg-surface px-4 py-2 font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0"
        type="button"
        @click="emit('cancel')"
      >
        取消
      </button>
    </div>
  </form>
</template>
