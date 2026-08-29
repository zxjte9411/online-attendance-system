<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  activateWorkContext,
  createWorkContext,
  updateWorkContext,
  type WorkContext,
} from '../../lib/settings'

const props = defineProps<{
  userId: string
  context?: WorkContext | null
  onboarding?: boolean
}>()

const emit = defineEmits<{ saved: [contexts: WorkContext[]] }>()
const name = ref('')
const companyIdentifier = ref('')
const projectIdentifier = ref('')
const active = ref(true)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)

watch(() => props.context, (context) => {
  name.value = context?.name ?? ''
  companyIdentifier.value = context?.company_identifier ?? ''
  projectIdentifier.value = context?.project_identifier ?? ''
  active.value = context?.active ?? true
}, { immediate: true })

async function submit() {
  if (isSaving.value) return

  isSaving.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const input = {
      name: name.value.trim(),
      company_identifier: companyIdentifier.value.trim(),
      project_identifier: projectIdentifier.value.trim(),
      active: active.value,
    }

    if (!input.name || !input.company_identifier || !input.project_identifier) {
      errorMessage.value = '請填寫工作情境名稱、公司識別與專案識別。'
      await nextTick()
      errorRegion.value?.focus()
      return
    }

    const shouldActivate = Boolean(props.context && !props.context.active && input.active)
    let contexts = props.context
      ? shouldActivate
        ? await activateWorkContext(props.userId, props.context.id)
        : await updateWorkContext(props.userId, props.context.id, input)
      : await createWorkContext(props.userId, input)

    if (shouldActivate) {
      contexts = await updateWorkContext(props.userId, props.context!.id, input)
    }

    emit('saved', contexts)
    successMessage.value = props.context ? '工作情境已儲存。' : '工作情境已建立。'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工作情境儲存失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <form class="grid gap-5" @submit.prevent="submit">
    <div class="grid gap-1.5">
      <label class="font-semibold" for="context-name">工作情境名稱 <span class="text-accent" aria-hidden="true">*</span></label>
      <input id="context-name" v-model="name" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="name" maxlength="100" required :aria-describedby="errorMessage ? 'context-error' : undefined" :aria-invalid="errorMessage ? 'true' : undefined">
    </div>
    <div class="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
      <div class="grid gap-1.5">
        <label class="font-semibold" for="context-company">公司識別 <span class="text-accent" aria-hidden="true">*</span></label>
        <input id="context-company" v-model="companyIdentifier" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="company_identifier" maxlength="150" required :aria-describedby="errorMessage ? 'context-error' : undefined" :aria-invalid="errorMessage ? 'true' : undefined">
      </div>
      <div class="grid gap-1.5">
        <label class="font-semibold" for="context-project">專案識別 <span class="text-accent" aria-hidden="true">*</span></label>
        <input id="context-project" v-model="projectIdentifier" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="project_identifier" maxlength="150" required :aria-describedby="errorMessage ? 'context-error' : undefined" :aria-invalid="errorMessage ? 'true' : undefined">
      </div>
    </div>

    <label class="flex min-h-12 items-center gap-3 rounded-[0.625rem] border border-line bg-surface-soft px-3.5 font-semibold" :class="{ 'opacity-60': onboarding || context?.is_default }">
      <input v-model="active" class="size-5 accent-accent" name="active" type="checkbox" :disabled="onboarding || Boolean(context?.is_default)">
      <span>{{ active ? '啟用這個工作情境' : '停用這個工作情境' }}</span>
    </label>
    <p class="text-sm leading-relaxed text-muted">第一個啟用中的工作情境會自動成為預設。預設工作情境不能直接停用，請先切換到其他 active 情境。</p>

    <p v-if="errorMessage" id="context-error" ref="errorRegion" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm text-[var(--error-ink)]" role="alert" tabindex="-1">{{ errorMessage }}</p>
    <p v-if="successMessage" class="rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm text-ink" role="status" aria-live="polite">{{ successMessage }}</p>

    <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="submit" :disabled="isSaving" :aria-busy="isSaving">
      {{ isSaving ? '儲存中…' : (onboarding ? '儲存並繼續' : (context ? '儲存工作情境' : '新增工作情境')) }}
    </button>
  </form>
</template>
