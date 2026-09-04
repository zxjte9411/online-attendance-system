<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ProfileForm from '../components/settings/ProfileForm.vue'
import WorkAssignmentForm from '../components/settings/WorkAssignmentForm.vue'
import WorkContextForm from '../components/settings/WorkContextForm.vue'
import WorkPolicyForm from '../components/settings/WorkPolicyForm.vue'
import ExportTemplateSection from '../components/settings/ExportTemplateSection.vue'
import {
  formatWorkAssignmentPeriod,
  formatWorkAssignmentStatus,
  getWorkAssignmentStatus,
  type WorkAssignment,
} from '../domain/work-assignment/work-assignment'
import {
  hasAttendanceRecordsForAssignment,
  listWorkAssignments,
} from '../lib/work-assignment'
import { getWorkPolicyStatus } from '../lib/work-policy'
import {
  getCurrentUserId,
  getProfile,
  hasAttendanceRecordsForWorkPolicy,
  listWorkContexts,
  listWorkPolicies,
  setDefaultWorkContext,
  type Profile,
  type WorkContext,
  type WorkPolicy,
} from '../lib/settings'

type AssignmentPolicy = WorkPolicy & { assignment_id: string }

const route = useRoute()
const userId = ref('')
const profile = ref<Profile | null>(null)
const assignments = ref<WorkAssignment[]>([])
const editingAssignment = ref<WorkAssignment | null>(null)
const editingAssignmentHasAttendance = ref(false)
const showAssignmentForm = ref(false)
const contexts = ref<WorkContext[]>([])
const policies = ref<AssignmentPolicy[]>([])
const selectedAssignmentId = ref('')
const editingPolicy = ref<AssignmentPolicy | null>(null)
const editingPolicyHasAttendance = ref(false)
const checkingPolicyId = ref('')
const selectedContextId = ref('')
let policyRequestToken = 0
const isLoadingPolicies = ref(false)
const policyError = ref('')
const editingContext = ref<WorkContext | null>(null)
const showContextForm = ref(false)
const showPolicyForm = ref(false)
const isLoading = ref(true)
const isSettingDefault = ref(false)
const pageError = ref('')
const actionMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)

const selectedContext = computed(() => contexts.value.find((context) => context.id === selectedContextId.value) ?? null)
const defaultContext = computed(() => contexts.value.find((context) => context.active && context.is_default) ?? null)
const selectedAssignment = computed(() => assignments.value.find((assignment) => assignment.id === selectedAssignmentId.value) ?? null)
const selectedTemplateAssignmentId = ref('')
const selectedTemplateAssignment = computed(() => assignments.value.find((assignment) => assignment.id === selectedTemplateAssignmentId.value) ?? null)

onMounted(load)

async function load() {
  isLoading.value = true
  pageError.value = ''

  try {
    userId.value = await getCurrentUserId()
    const [savedProfile, savedAssignments, savedContexts] = await Promise.all([
      getProfile(userId.value),
      listWorkAssignments(userId.value),
      listWorkContexts(userId.value),
    ])
    profile.value = savedProfile
    assignments.value = savedAssignments
    contexts.value = savedContexts
    const requestedAssignmentId = typeof route.query.assignment_id === 'string'
      ? route.query.assignment_id
      : ''
    selectedAssignmentId.value = savedAssignments.some((assignment) => assignment.id === requestedAssignmentId)
      ? requestedAssignmentId
      : savedAssignments[0]?.id ?? ''
    selectedTemplateAssignmentId.value = selectedAssignmentId.value || savedAssignments[0]?.id || ''
    const nextContext = savedContexts.find((context) => context.active && context.is_default)
      ?? savedContexts.find((context) => context.active)
      ?? savedContexts[0]
    selectedContextId.value = nextContext?.id ?? ''
    await loadPolicies()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '設定資料載入失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isLoading.value = false
  }
}

async function handleEditAssignment(assignment: WorkAssignment) {
  pageError.value = ''
  actionMessage.value = ''
  try {
    const hasAttendance = await hasAttendanceRecordsForAssignment(userId.value, assignment.id)
    editingAssignment.value = assignment
    editingAssignmentHasAttendance.value = hasAttendance
    showAssignmentForm.value = true
  } catch {
    editingAssignment.value = null
    showAssignmentForm.value = false
    pageError.value = '無法確認此工作派駐是否已有出勤紀錄，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  }
}

async function handleAssignmentSaved(savedAssignments: WorkAssignment[], message: string) {
  const previousIds = new Set(assignments.value.map((assignment) => assignment.id))
  assignments.value = savedAssignments
  showAssignmentForm.value = false
  editingAssignment.value = null
  editingAssignmentHasAttendance.value = false
  const createdAssignment = savedAssignments.find((assignment) => !previousIds.has(assignment.id))
  selectedAssignmentId.value = createdAssignment?.id
    ?? (savedAssignments.some((assignment) => assignment.id === selectedAssignmentId.value)
      ? selectedAssignmentId.value
      : savedAssignments[0]?.id ?? '')
  if (!savedAssignments.some((assignment) => assignment.id === selectedTemplateAssignmentId.value)) {
    selectedTemplateAssignmentId.value = selectedAssignmentId.value || savedAssignments[0]?.id || ''
  }
  actionMessage.value = message
  await loadPolicies()
}

async function loadPolicies() {
  const requestToken = ++policyRequestToken
  const assignmentId = selectedAssignmentId.value
  const assignmentName = selectedAssignment.value
    ? `${selectedAssignment.value.staffing_employer} · ${selectedAssignment.value.client_company} · ${selectedAssignment.value.project}`
    : assignmentId

  if (!userId.value || !assignmentId) {
    policies.value = []
    policyError.value = ''
    isLoadingPolicies.value = false
    return
  }

  policies.value = []
  policyError.value = ''
  isLoadingPolicies.value = true

  try {
    const loadedPolicies = await listWorkPolicies(userId.value, assignmentId)
    if (requestToken !== policyRequestToken || assignmentId !== selectedAssignmentId.value) return
    policies.value = loadedPolicies as AssignmentPolicy[]
  } catch {
    if (requestToken !== policyRequestToken || assignmentId !== selectedAssignmentId.value) return
    policies.value = []
    policyError.value = `無法載入「${assignmentName}」的 Work Policy，請稍後再試。`
  } finally {
    if (requestToken === policyRequestToken && assignmentId === selectedAssignmentId.value) {
      isLoadingPolicies.value = false
    }
  }
}

async function handleContextSaved(savedContexts: WorkContext[]) {
  contexts.value = savedContexts
  showContextForm.value = false
  editingContext.value = null
  actionMessage.value = '工作情境已更新。'
  if (!selectedContextId.value) selectedContextId.value = savedContexts[0]?.id ?? ''
}

async function handleSetDefault(contextId: string) {
  if (isSettingDefault.value) return

  isSettingDefault.value = true
  pageError.value = ''
  actionMessage.value = ''

  try {
    contexts.value = await setDefaultWorkContext(userId.value, contextId)
    actionMessage.value = '預設工作情境已切換。'
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '預設工作情境切換失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSettingDefault.value = false
  }
}

async function handlePolicySaved() {
  const wasEditing = Boolean(editingPolicy.value)
  showPolicyForm.value = false
  editingPolicy.value = null
  editingPolicyHasAttendance.value = false
  actionMessage.value = wasEditing ? 'Work Policy 已更新。' : 'Work Policy 已新增。'
  await loadPolicies()
}

async function handleEditPolicy(policy: AssignmentPolicy) {
  if (checkingPolicyId.value) return
  if (editingPolicy.value?.id === policy.id) {
    editingPolicy.value = null
    editingPolicyHasAttendance.value = false
    showPolicyForm.value = false
    return
  }

  pageError.value = ''
  actionMessage.value = ''
  checkingPolicyId.value = policy.id
  try {
    editingPolicyHasAttendance.value = await hasAttendanceRecordsForWorkPolicy(policy.id)
    editingPolicy.value = policy
    showPolicyForm.value = true
  } catch (error) {
    pageError.value = error instanceof Error
      ? error.message
      : '無法確認此 Work Policy 是否已有出勤紀錄，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    checkingPolicyId.value = ''
  }
}

async function selectAssignment(assignmentId: string) {
  selectedAssignmentId.value = assignmentId
  showPolicyForm.value = false
  editingPolicy.value = null
  editingPolicyHasAttendance.value = false
  await loadPolicies()
}

function selectContext(contextId: string) {
  selectedContextId.value = contextId
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <section class="grid max-w-[42rem] gap-4" aria-labelledby="settings-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent"><span class="h-px w-6 bg-current" aria-hidden="true"></span>設定</span>
      <h1 id="settings-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">把工作環境留在手邊。</h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">管理個人資料、工作派駐、工作情境與依日期生效的 Work Policy。</p>
    </section>

    <div class="mt-8 grid gap-3 border-y border-line py-4 sm:grid-cols-[1fr_1fr] sm:gap-0">
      <div class="grid gap-1 border-line sm:border-e sm:pe-5">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">目前預設</span>
        <strong class="font-display text-lg font-semibold">{{ defaultContext?.name || '尚未設定' }}</strong>
      </div>
      <div class="grid gap-1 pt-4 sm:pt-0 sm:ps-5">
        <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">時區</span>
        <span class="font-mono text-sm font-semibold">Asia/Taipei（固定）</span>
      </div>
    </div>

    <p v-if="pageError" ref="errorRegion" class="mt-5 rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert" tabindex="-1">{{ pageError }}</p>
    <p v-if="actionMessage" class="mt-5 rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm" role="status" aria-live="polite">{{ actionMessage }}</p>

    <div v-if="isLoading" class="mt-6 grid gap-4" aria-busy="true">
      <span class="h-32 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
      <span class="h-48 rounded-2xl bg-surface-soft" aria-hidden="true"></span>
    </div>

    <div v-else class="mt-6 grid gap-5">
      <section id="profile" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-profile-title">
        <div class="grid gap-1 border-b border-line pb-5">
          <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">01 / 個人資料</p>
          <h2 id="settings-profile-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">個人資料</h2>
        </div>
        <ProfileForm v-if="userId" :user-id="userId" :profile="profile" @saved="profile = $event" />
      </section>

      <section id="assignments" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-assignments-title">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">02 / 工作派駐</p>
            <h2 id="settings-assignments-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">工作派駐</h2>
            <p class="text-sm leading-relaxed text-muted">包含派遣雇主、派駐客戶與專案，適用期間不得與其他派駐重疊。</p>
          </div>
          <button class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="editingAssignment = null; editingAssignmentHasAttendance = false; showAssignmentForm = !showAssignmentForm">{{ showAssignmentForm ? '取消新增' : '新增工作派駐' }}</button>
        </div>

        <ul v-if="assignments.length" class="grid divide-y divide-line" aria-label="工作派駐列表">
          <li v-for="assignment in assignments" :key="assignment.id" class="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div class="grid gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <strong>{{ assignment.staffing_employer }}</strong>
                <span class="rounded-[0.375rem] border px-2 py-0.5 text-xs font-semibold" :class="getWorkAssignmentStatus(assignment) === 'CURRENT' ? 'border-accent-soft bg-accent-soft text-accent' : 'border-line text-muted'">{{ formatWorkAssignmentStatus(getWorkAssignmentStatus(assignment)) }}</span>
              </div>
              <span class="text-sm text-muted">{{ assignment.client_company }} · {{ assignment.project }}</span>
              <span class="font-mono text-xs text-muted">{{ assignment.effective_from }} 至 {{ assignment.effective_to || '未定' }}</span>
            </div>
            <div class="flex flex-wrap gap-2 sm:justify-end">
              <button class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="handleEditAssignment(assignment)">編輯</button>
            </div>
          </li>
        </ul>
        <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">還沒有建立工作派駐。新增派駐後即可設定適用期間與工作歸屬。</p>

        <div v-if="showAssignmentForm" class="border-t border-line pt-5">
          <WorkAssignmentForm
            :user-id="userId"
            :assignment="editingAssignment"
            :existing-assignments="assignments"
            :has-attendance="editingAssignmentHasAttendance"
            @saved="handleAssignmentSaved"
            @cancel="showAssignmentForm = false"
          />
        </div>
      </section>

      <section id="contexts" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-contexts-title">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">03 / 工作情境</p>
            <h2 id="settings-contexts-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">工作情境</h2>
            <p class="text-sm leading-relaxed text-muted">只有 active 情境可以成為預設。</p>
          </div>
          <button class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="editingContext = null; showContextForm = !showContextForm">{{ showContextForm ? '取消新增' : '新增工作情境' }}</button>
        </div>

        <ul v-if="contexts.length" class="grid divide-y divide-line" aria-label="工作情境列表">
          <li v-for="context in contexts" :key="context.id" class="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div class="grid gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <strong>{{ context.name }}</strong>
                <span v-if="context.is_default" class="rounded-[0.375rem] border border-accent-soft bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">目前預設</span>
                <span class="rounded-[0.375rem] border border-line px-2 py-0.5 text-xs text-muted">{{ context.active ? '啟用中' : '已停用' }}</span>
              </div>
              <span class="text-sm text-muted">{{ context.company_identifier }} · {{ context.project_identifier }}</span>
            </div>
            <div class="flex flex-wrap gap-2 sm:justify-end">
              <button class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="editingContext = context; showContextForm = true">編輯</button>
              <button v-if="context.active && !context.is_default" class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 disabled:cursor-wait disabled:opacity-60" type="button" :disabled="isSettingDefault" :aria-busy="isSettingDefault" @click="handleSetDefault(context.id)">設為預設</button>
            </div>
          </li>
        </ul>
        <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">還沒有工作情境。新增一筆 active 情境後，它會自動成為預設。</p>

        <div v-if="showContextForm" class="border-t border-line pt-5">
          <WorkContextForm :user-id="userId" :context="editingContext" @saved="handleContextSaved" />
        </div>
      </section>

      <section id="policies" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-policies-title">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">04 / Work Policy</p>
            <h2 id="settings-policies-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">Work Policy 版本</h2>
            <p class="text-sm leading-relaxed text-muted">每筆制度都屬於一筆工作派駐；同一派駐的生效日期不可重疊。</p>
          </div>
          <button class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="!selectedAssignment || isLoadingPolicies || Boolean(policyError)" @click="editingPolicy = null; editingPolicyHasAttendance = false; showPolicyForm = !showPolicyForm">{{ showPolicyForm ? '取消' : '新增 Work Policy' }}</button>
        </div>

        <div class="grid gap-1.5">
          <label class="font-semibold" for="policy-assignment">選擇工作派駐</label>
          <select id="policy-assignment" v-model="selectedAssignmentId" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="assignment_id" @change="selectAssignment(selectedAssignmentId)">
            <option v-for="assignment in assignments" :key="assignment.id" :value="assignment.id">{{ assignment.staffing_employer }} · {{ assignment.client_company }} · {{ assignment.project }}</option>
          </select>
        </div>

        <div v-if="selectedAssignment" class="grid gap-3">
          <p class="text-sm text-muted">派駐期間：<span class="font-mono">{{ selectedAssignment.effective_from }} 至 {{ selectedAssignment.effective_to || '未定' }}</span></p>
          <p v-if="isLoadingPolicies" class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted" role="status" aria-live="polite">正在載入這筆派駐的 Work Policy…</p>
          <p v-else-if="policyError" class="border-s-4 border-[var(--error-line)] ps-4 text-sm leading-relaxed text-[var(--error-ink)]" role="alert">{{ policyError }}</p>
          <template v-else>
            <ul v-if="policies.length" class="grid divide-y divide-line border-y border-line" aria-label="Work Policy 版本列表">
              <li v-for="policy in policies" :key="policy.id" class="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div class="grid gap-1">
                  <strong>{{ policy.name }}</strong>
                  <span class="text-sm text-muted">{{ policy.effective_from }} 至 {{ policy.effective_to || '未定' }} · {{ policy.standard_start_time }} 開始 · {{ policy.work_minutes }} 分鐘工作</span>
                </div>
                <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span class="text-xs font-semibold text-muted">{{ getWorkPolicyStatus(policy) }}</span>
                  <button class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px disabled:cursor-wait disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" :disabled="Boolean(checkingPolicyId)" :aria-busy="checkingPolicyId === policy.id" @click="handleEditPolicy(policy)">{{ checkingPolicyId === policy.id ? '確認中…' : (editingPolicy?.id === policy.id ? '取消編輯' : '編輯') }}</button>
                </div>
              </li>
            </ul>
            <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">這筆工作派駐還沒有 Work Policy。可以先建立過去、目前或未來的制度。</p>
          </template>
        </div>
        <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">請先建立工作派駐，再設定 Work Policy。</p>

        <div v-if="showPolicyForm && selectedAssignment && !isLoadingPolicies && !policyError" class="border-t border-line pt-5">
          <WorkPolicyForm :assignment-id="selectedAssignment.id" :assignment="selectedAssignment" :policies="policies" :policy="editingPolicy" :has-attendance="editingPolicyHasAttendance" @saved="handlePolicySaved" />
        </div>
      </section>

      <section id="export-templates" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-export-templates-title">
        <div class="grid gap-1 border-b border-line pb-5">
          <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">05 / XLSX 匯出範本</p>
          <h2 id="settings-export-templates-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">XLSX 匯出範本</h2>
          <p class="text-sm leading-relaxed text-muted">為各工作派駐上傳專屬的 Excel 範本並配置欄位對應，即可在報表匯出填妥的檔案。</p>
        </div>

        <div class="grid gap-1.5">
          <label class="font-semibold" for="template-assignment">選擇工作派駐</label>
          <select id="template-assignment" v-model="selectedTemplateAssignmentId" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="template_assignment_id">
            <option v-for="assignment in assignments" :key="assignment.id" :value="assignment.id">{{ assignment.staffing_employer }} · {{ assignment.client_company }} · {{ assignment.project }} ({{ formatWorkAssignmentPeriod(assignment) }})</option>
          </select>
        </div>

        <div v-if="selectedTemplateAssignment" class="grid gap-4">
          <ExportTemplateSection
            :user-id="userId"
            :assignment-id="selectedTemplateAssignment.id"
            :assignment-name="`${selectedTemplateAssignment.staffing_employer} · ${selectedTemplateAssignment.client_company} · ${selectedTemplateAssignment.project}`"
          />
        </div>
        <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">請先建立工作派駐以設定匯出範本。</p>
      </section>
    </div>
  </div>
</template>
