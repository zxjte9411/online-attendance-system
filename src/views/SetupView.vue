<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ProfileForm from '../components/settings/ProfileForm.vue'
import WorkAssignmentForm from '../components/settings/WorkAssignmentForm.vue'
import WorkPolicyForm from '../components/settings/WorkPolicyForm.vue'
import {
  getCurrentUserId,
  getSetupStatus,
  listWorkPolicies,
  type Profile,
  type WorkPolicy,
} from '../lib/settings'
import type { WorkAssignment } from '../domain/work-assignment/work-assignment'

type AssignmentPolicy = WorkPolicy & { assignment_id: string }

const router = useRouter()
const mainRegion = ref<HTMLElement | null>(null)
const errorRegion = ref<HTMLElement | null>(null)
const userId = ref('')
const profile = ref<Profile | null>(null)
const assignments = ref<WorkAssignment[]>([])
const selectedAssignmentId = ref('')
const policies = ref<AssignmentPolicy[]>([])
const step = ref<1 | 2 | 3>(1)
const isLoading = ref(true)
const errorMessage = ref('')
const showProfileSaveActions = ref(false)
const isLoadingPolicies = ref(false)

const steps = [
  { number: 1, label: '個人資料' },
  { number: 2, label: '工作派駐' },
  { number: 3, label: 'Work Policy' },
] as const

onMounted(async () => {
  await nextTick()
  mainRegion.value?.focus()
  await loadSetup()
})

async function loadSetup() {
  isLoading.value = true
  errorMessage.value = ''
  showProfileSaveActions.value = false

  try {
    userId.value = await getCurrentUserId()
    const status = await getSetupStatus(userId.value)
    profile.value = status.profile
    assignments.value = status.assignments ?? []
    selectedAssignmentId.value = status.currentAssignment?.id ?? assignments.value[0]?.id ?? ''
    policies.value = []
    await loadPolicies()

    step.value = !status.profile?.display_name?.trim()
      ? 1
      : !selectedAssignmentId.value
        ? 2
        : 3
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '設定資料載入失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isLoading.value = false
  }
}

function canVisitStep(target: 1 | 2 | 3) {
  if (target === 1) return true
  if (target === 2) return Boolean(profile.value?.display_name?.trim())
  return Boolean(profile.value?.display_name?.trim() && selectedAssignmentId.value)
}

function isStepComplete(target: 1 | 2 | 3) {
  if (target === 1) return Boolean(profile.value?.display_name?.trim())
  if (target === 2) return assignments.value.length > 0
  return Boolean(selectedAssignmentId.value && policies.value.length > 0)
}

function handleProfileSaved(savedProfile: Profile) {
  profile.value = savedProfile
  showProfileSaveActions.value = true
}

async function enterSystem() {
  await router.replace({ name: 'today' })
}

function continueSetup() {
  showProfileSaveActions.value = false
  step.value = 2
}

async function loadPolicies() {
  const requestAssignmentId = selectedAssignmentId.value
  if (!userId.value || !requestAssignmentId) {
    policies.value = []
    return
  }

  policies.value = []
  isLoadingPolicies.value = true
  try {
    const loadedPolicies = await listWorkPolicies(userId.value, requestAssignmentId) as AssignmentPolicy[]
    if (requestAssignmentId === selectedAssignmentId.value) {
      policies.value = loadedPolicies
    }
  } finally {
    if (requestAssignmentId === selectedAssignmentId.value) {
      isLoadingPolicies.value = false
    }
  }
}

async function handleAssignmentSaved(savedAssignments: WorkAssignment[]) {
  const previousIds = new Set(assignments.value.map((assignment) => assignment.id))
  assignments.value = savedAssignments
  const createdAssignment = savedAssignments.find((assignment) => !previousIds.has(assignment.id))
  selectedAssignmentId.value = createdAssignment?.id
    ?? (savedAssignments.some((assignment) => assignment.id === selectedAssignmentId.value)
      ? selectedAssignmentId.value
      : savedAssignments[0]?.id ?? '')
  try {
    await loadPolicies()
    step.value = 3
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Work Policy 載入失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  }
}

async function selectAssignment(assignmentId: string) {
  const requestAssignmentId = assignmentId
  selectedAssignmentId.value = assignmentId
  errorMessage.value = ''
  try {
    await loadPolicies()
  } catch (error) {
    if (requestAssignmentId !== selectedAssignmentId.value) return
    errorMessage.value = error instanceof Error ? error.message : 'Work Policy 載入失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  }
}

function handlePolicySaved(savedPolicy: AssignmentPolicy) {
  policies.value = [...policies.value, savedPolicy]
  step.value = 3
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas px-5 py-5 text-ink sm:px-10 lg:px-16">
    <a class="fixed start-3 top-3 z-10 -translate-y-[180%] rounded-[0.5rem] bg-ink px-3 py-2 text-surface transition-transform duration-200 focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:focus-visible:translate-y-0" href="#setup-main">跳至主要內容</a>

    <header class="mx-auto flex min-h-12 w-full max-w-[80rem] items-center justify-between gap-4">
      <span class="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-[-0.035em]" aria-label="線上出勤">
        <span class="grid size-8 place-items-center rounded-[0.625rem] bg-accent text-sm tracking-normal text-surface" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </span>
      <span class="text-[0.75rem] font-bold tracking-[0.08em] text-muted">首次設定</span>
    </header>

    <main id="setup-main" ref="mainRegion" tabindex="-1" class="mx-auto grid w-full max-w-[68rem] flex-1 items-start gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(13rem,0.65fr)_minmax(0,1.35fr)] lg:gap-20 lg:py-20">
      <section class="grid content-start gap-5 border-t border-accent pt-5" aria-labelledby="setup-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">準備你的工作日</p>
        <h1 id="setup-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,6vw,4.25rem)] font-semibold leading-[1.08] tracking-[-0.055em] text-balance">先設定一次，再開始記錄。</h1>
        <p class="max-w-[32rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-relaxed text-muted text-pretty">完成個人資料後即可進入系統；工作派駐與工作制度可以之後補齊。</p>

        <nav class="mt-3" aria-label="首次設定進度">
          <ol class="grid gap-2">
            <li v-for="item in steps" :key="item.number">
              <button
                class="flex min-h-12 w-full items-center gap-3 rounded-[0.625rem] border px-3.5 py-2 text-start transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-px active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                :class="step === item.number ? 'border-accent bg-accent-soft font-bold text-accent' : canVisitStep(item.number) ? 'border-line bg-surface text-ink' : 'border-line bg-canvas text-muted'"
                type="button"
                :disabled="!canVisitStep(item.number)"
                :aria-current="step === item.number ? 'step' : undefined"
                @click="step = item.number"
              >
                <span class="font-mono text-sm tabular-nums" aria-hidden="true">{{ String(item.number).padStart(2, '0') }}</span>
                <span>{{ item.label }}</span>
                <span v-if="isStepComplete(item.number) && step !== item.number" class="ms-auto text-sm text-muted" aria-hidden="true">已完成</span>
              </button>
            </li>
          </ol>
        </nav>
      </section>

      <section class="w-full max-w-[38rem] rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-live="polite">
        <div v-if="isLoading" class="grid gap-4" aria-busy="true">
          <span class="h-4 w-24 rounded bg-surface-soft" aria-hidden="true"></span>
          <span class="h-9 w-3/4 rounded bg-surface-soft" aria-hidden="true"></span>
          <span class="h-12 w-full rounded bg-surface-soft" aria-hidden="true"></span>
          <p class="text-sm text-muted">正在載入你的設定…</p>
        </div>

        <div v-else-if="errorMessage" class="grid gap-4" aria-labelledby="setup-error-title">
          <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">首次設定</p>
          <h2 id="setup-error-title" class="font-display text-2xl font-semibold tracking-[-0.04em]">目前無法載入設定。</h2>
          <p ref="errorRegion" tabindex="-1" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm text-[var(--error-ink)]" role="alert">{{ errorMessage }}</p>
          <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="loadSetup">重新載入</button>
        </div>

        <div v-else-if="step === 1" class="grid gap-5" aria-labelledby="profile-step-title">
          <div class="grid gap-1 border-b border-line pb-5">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">01 / 個人資料</p>
            <h2 id="profile-step-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">你希望怎麼被稱呼？</h2>
            <p class="text-sm leading-relaxed text-muted">只需要一個顯示名稱；時區目前固定為 Asia/Taipei。</p>
          </div>
          <ProfileForm v-if="userId" :user-id="userId" :profile="profile" @saved="handleProfileSaved" />
          <section v-if="showProfileSaveActions" class="grid gap-3 rounded-[0.625rem] border border-accent-soft bg-accent-soft px-4 py-4" aria-labelledby="profile-saved-title" role="status">
            <div class="grid gap-1">
              <h3 id="profile-saved-title" class="font-semibold">個人資料已儲存</h3>
              <p class="text-sm leading-relaxed text-muted">你的帳號現在可以進入系統，也可以繼續補齊工作設定。</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="enterSystem">進入系統</button>
              <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-line bg-surface px-4 py-2 font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="continueSetup">繼續設定</button>
            </div>
          </section>
        </div>

        <div v-else-if="step === 2" class="grid gap-5" aria-labelledby="assignment-step-title">
          <div class="grid gap-1 border-b border-line pb-5">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">02 / 工作派駐</p>
            <h2 id="assignment-step-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">這份工作屬於哪個派駐？</h2>
            <p class="text-sm leading-relaxed text-muted">先建立或選定工作派駐，再為它設定依日期生效的制度。</p>
          </div>
          <div v-if="assignments.length" class="grid gap-3 rounded-[0.625rem] border border-accent-soft bg-accent-soft px-4 py-4">
            <label class="font-semibold" for="setup-assignment">選擇工作派駐</label>
            <select id="setup-assignment" v-model="selectedAssignmentId" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="assignment_id" @change="selectAssignment(selectedAssignmentId)">
              <option v-for="assignment in assignments" :key="assignment.id" :value="assignment.id">{{ assignment.staffing_employer }} · {{ assignment.client_company }} · {{ assignment.project }}</option>
            </select>
            <button class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="selectAssignment(selectedAssignmentId)">使用這個工作派駐</button>
          </div>
          <WorkAssignmentForm v-if="userId" :user-id="userId" :existing-assignments="assignments" onboarding @saved="handleAssignmentSaved" />
          <button v-if="canVisitStep(1)" class="min-h-11 justify-self-start font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" @click="step = 1">回到上一步</button>
        </div>

        <div v-else class="grid gap-5" aria-labelledby="policy-step-title">
          <div class="grid gap-1 border-b border-line pb-5">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">03 / Work Policy</p>
            <h2 id="policy-step-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">為這筆派駐設定制度。</h2>
            <p class="text-sm leading-relaxed text-muted">可建立過去、目前或未來的制度；日期不必涵蓋今天。</p>
          </div>
          <div class="grid gap-1 rounded-[0.625rem] border border-accent-soft bg-accent-soft px-4 py-3 text-sm">
            <label class="text-muted" for="setup-policy-assignment">工作派駐</label>
            <select id="setup-policy-assignment" v-model="selectedAssignmentId" class="min-h-11 rounded-[0.5rem] border border-line bg-canvas px-3 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="policy_assignment_id" @change="selectAssignment(selectedAssignmentId)">
              <option v-for="assignment in assignments" :key="assignment.id" :value="assignment.id">{{ assignment.staffing_employer }} · {{ assignment.client_company }} · {{ assignment.project }}</option>
            </select>
            <span class="font-mono text-xs text-muted">{{ assignments.find((assignment) => assignment.id === selectedAssignmentId)?.effective_from }} 至 {{ assignments.find((assignment) => assignment.id === selectedAssignmentId)?.effective_to || '未定' }}</span>
          </div>
          <p v-if="isLoadingPolicies" class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted" role="status" aria-live="polite">正在載入這筆派駐的 Work Policy…</p>
          <WorkPolicyForm v-else-if="userId && selectedAssignmentId" :assignment-id="selectedAssignmentId" :assignment="assignments.find((assignment) => assignment.id === selectedAssignmentId)" :policies="policies" onboarding @saved="handlePolicySaved" />
          <button v-if="canVisitStep(2)" class="min-h-11 justify-self-start font-semibold text-accent underline decoration-[0.1em] underline-offset-[0.2em] transition duration-200 ease-out hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" @click="step = 2">回到上一步</button>
        </div>
      </section>
    </main>
  </div>
</template>
