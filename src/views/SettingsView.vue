<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import ProfileForm from '../components/settings/ProfileForm.vue'
import WorkContextForm from '../components/settings/WorkContextForm.vue'
import WorkPolicyForm from '../components/settings/WorkPolicyForm.vue'
import {
  getCurrentUserId,
  getProfile,
  listWorkContexts,
  listWorkPolicies,
  setDefaultWorkContext,
  updateWorkPolicyEffectiveTo,
  type Profile,
  type WorkContext,
  type WorkPolicy,
} from '../lib/settings'

const userId = ref('')
const profile = ref<Profile | null>(null)
const contexts = ref<WorkContext[]>([])
const policies = ref<WorkPolicy[]>([])
const selectedContextId = ref('')
const editingContext = ref<WorkContext | null>(null)
const showContextForm = ref(false)
const showPolicyForm = ref(false)
const isLoading = ref(true)
const isSettingDefault = ref(false)
const pageError = ref('')
const actionMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)
const endingPolicyId = ref('')
const endingPolicyDate = ref('')
const endingPolicyMessage = ref('')
const isEndingPolicy = ref(false)
const policyEndInput = ref<HTMLInputElement | null>(null)
const policyEndErrorRegion = ref<HTMLElement | null>(null)

const selectedContext = computed(() => contexts.value.find((context) => context.id === selectedContextId.value) ?? null)
const defaultContext = computed(() => contexts.value.find((context) => context.active && context.is_default) ?? null)

onMounted(load)

async function load() {
  isLoading.value = true
  pageError.value = ''

  try {
    userId.value = await getCurrentUserId()
    const [savedProfile, savedContexts] = await Promise.all([
      getProfile(userId.value),
      listWorkContexts(userId.value),
    ])
    profile.value = savedProfile
    contexts.value = savedContexts
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

async function loadPolicies() {
  if (!userId.value || !selectedContextId.value) {
    policies.value = []
    return
  }

  policies.value = await listWorkPolicies(userId.value, selectedContextId.value)
}

async function handleContextSaved(savedContexts: WorkContext[]) {
  contexts.value = savedContexts
  showContextForm.value = false
  editingContext.value = null
  actionMessage.value = '工作情境已更新。'
  if (!selectedContextId.value) selectedContextId.value = savedContexts[0]?.id ?? ''
  await loadPolicies()
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
  showPolicyForm.value = false
  resetPolicyEnding()
  actionMessage.value = 'Work Policy 已新增。'
  await loadPolicies()
}

function resetPolicyEnding() {
  endingPolicyId.value = ''
  endingPolicyDate.value = ''
  endingPolicyMessage.value = ''
}

function setPolicyEndInput(element: unknown) {
  policyEndInput.value = element as HTMLInputElement | null
}

async function toggleEndingPolicy(policy: WorkPolicy) {
  if (endingPolicyId.value === policy.id) {
    resetPolicyEnding()
    return
  }

  endingPolicyId.value = policy.id
  endingPolicyDate.value = policy.effective_to ?? ''
  endingPolicyMessage.value = ''
  actionMessage.value = ''
  await nextTick()
  policyEndInput.value?.focus()
}

async function handleEndPolicy(policy: WorkPolicy) {
  if (isEndingPolicy.value) return

  endingPolicyMessage.value = ''

  if (!endingPolicyDate.value) {
    endingPolicyMessage.value = '請選擇制度結束日期。'
    await nextTick()
    policyEndErrorRegion.value?.focus()
    return
  }

  if (endingPolicyDate.value < policy.effective_from) {
    endingPolicyMessage.value = '制度結束日期不能早於生效起日。'
    await nextTick()
    policyEndErrorRegion.value?.focus()
    return
  }

  isEndingPolicy.value = true

  try {
    await updateWorkPolicyEffectiveTo(userId.value, policy.id, endingPolicyDate.value)
    await loadPolicies()
    resetPolicyEnding()
    actionMessage.value = 'Work Policy 已結束。'
  } catch (error) {
    endingPolicyMessage.value = error instanceof Error
      ? error.message
      : 'Work Policy 更新失敗，請確認日期區間後再試。'
    await nextTick()
    policyEndErrorRegion.value?.focus()
  } finally {
    isEndingPolicy.value = false
  }
}

async function selectContext(contextId: string) {
  selectedContextId.value = contextId
  showPolicyForm.value = false
  resetPolicyEnding()
  await loadPolicies()
}
</script>

<template>
  <div class="w-full max-w-6xl">
    <section class="grid max-w-[42rem] gap-4" aria-labelledby="settings-title">
      <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent"><span class="h-px w-6 bg-current" aria-hidden="true"></span>設定</span>
      <h1 id="settings-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">把工作環境留在手邊。</h1>
      <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">管理個人資料、工作情境與依日期生效的 Work Policy。</p>
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

      <section id="contexts" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8" aria-labelledby="settings-contexts-title">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div class="grid gap-1">
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">02 / 工作情境</p>
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
            <p class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">03 / Work Policy</p>
            <h2 id="settings-policies-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">Work Policy 版本</h2>
            <p class="text-sm leading-relaxed text-muted">同一工作情境的生效日期不可重疊；歷史關聯會保留。</p>
          </div>
          <button class="inline-flex min-h-11 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="!selectedContext" @click="showPolicyForm = !showPolicyForm">{{ showPolicyForm ? '取消新增' : '新增 Work Policy' }}</button>
        </div>

        <div class="grid gap-1.5">
          <label class="font-semibold" for="policy-context">選擇工作情境</label>
          <select id="policy-context" v-model="selectedContextId" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="context_id" @change="selectContext(selectedContextId)">
            <option v-for="context in contexts" :key="context.id" :value="context.id">{{ context.name }}{{ context.is_default ? '（目前預設）' : '' }}</option>
          </select>
        </div>

        <div v-if="selectedContext" class="grid gap-3">
          <ul v-if="policies.length" class="grid divide-y divide-line border-y border-line" aria-label="Work Policy 版本列表">
            <li v-for="policy in policies" :key="policy.id" class="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="grid gap-1">
                <strong>{{ policy.name }}</strong>
                <span class="text-sm text-muted">{{ policy.effective_from }} 至 {{ policy.effective_to || '未定' }} · {{ policy.standard_start_time }} 開始 · {{ policy.work_minutes }} 分鐘工作</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                <span class="text-xs font-semibold text-muted">{{ policy.effective_to ? '已結束' : '目前版本' }}</span>
                <button v-if="!policy.effective_to" class="min-h-11 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="toggleEndingPolicy(policy)">
                  {{ endingPolicyId === policy.id ? '取消' : '結束版本' }}
                </button>
              </div>
              <form v-if="endingPolicyId === policy.id" class="col-span-full grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end" :aria-label="`結束 ${policy.name} 版本`" @submit.prevent="handleEndPolicy(policy)">
                <div class="grid gap-1.5">
                  <label class="font-semibold" :for="`policy-end-${policy.id}`">結束日期</label>
                  <input :id="`policy-end-${policy.id}`" :ref="setPolicyEndInput" v-model="endingPolicyDate" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 font-mono text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="effective_to" type="date" :min="policy.effective_from" :aria-describedby="endingPolicyMessage ? `policy-end-help-${policy.id} policy-end-error-${policy.id}` : `policy-end-help-${policy.id}`" :aria-invalid="endingPolicyMessage ? 'true' : undefined" required>
                  <span :id="`policy-end-help-${policy.id}`" class="text-sm text-muted">不可早於生效起日 {{ policy.effective_from }}。</span>
                </div>
                <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="submit" :disabled="isEndingPolicy" :aria-busy="isEndingPolicy">{{ isEndingPolicy ? '儲存中…' : '儲存結束日期' }}</button>
                <p v-if="endingPolicyMessage" :id="`policy-end-error-${policy.id}`" ref="policyEndErrorRegion" class="col-span-full rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm leading-relaxed text-[var(--error-ink)]" role="alert" tabindex="-1">{{ endingPolicyMessage }}</p>
              </form>
            </li>
          </ul>
          <p v-else class="border-s-4 border-accent ps-4 text-sm leading-relaxed text-muted">這個工作情境還沒有 Work Policy。新增後，今日頁才會有可套用的制度。</p>
        </div>

        <div v-if="showPolicyForm && selectedContext" class="border-t border-line pt-5">
          <WorkPolicyForm :user-id="userId" :context-id="selectedContext.id" :policies="policies" @saved="handlePolicySaved" />
        </div>
      </section>
    </div>
  </div>
</template>
