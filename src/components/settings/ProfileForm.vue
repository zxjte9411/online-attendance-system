<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { saveProfile, type Profile } from '../../lib/settings'

const props = defineProps<{
  userId: string
  profile: Profile | null
  onboarding?: boolean
}>()

const emit = defineEmits<{ saved: [profile: Profile] }>()
const displayName = ref(props.profile?.display_name ?? '')
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const errorRegion = ref<HTMLElement | null>(null)

watch(() => props.profile?.display_name ?? '', (value) => {
  displayName.value = value
}, { immediate: true })

async function submit() {
  if (isSaving.value) return

  errorMessage.value = ''
  successMessage.value = ''

  if (!displayName.value.trim()) {
    errorMessage.value = '請填寫顯示名稱。'
    await nextTick()
    errorRegion.value?.focus()
    return
  }

  isSaving.value = true

  try {
    const profile = await saveProfile(props.userId, displayName.value.trim())
    emit('saved', profile)
    successMessage.value = '個人資料已儲存。'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '個人資料儲存失敗，請稍後再試。'
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
      <label class="font-semibold" for="profile-display-name">顯示名稱 <span class="text-accent" aria-hidden="true">*</span></label>
      <input id="profile-display-name" v-model="displayName" class="min-h-12 rounded-[0.625rem] border border-line bg-canvas px-3.5 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" name="display_name" autocomplete="name" maxlength="100" required :aria-describedby="errorMessage ? 'profile-display-name-help profile-error' : 'profile-display-name-help'" :aria-invalid="errorMessage ? 'true' : undefined">
      <span id="profile-display-name-help" class="text-sm text-muted">這個名稱會顯示在你的工作頁面。</span>
    </div>

    <div class="grid gap-1.5">
      <span class="font-semibold" id="profile-timezone-label">時區</span>
      <output class="flex min-h-12 items-center rounded-[0.625rem] border border-line bg-surface-soft px-3.5 font-mono text-sm" aria-labelledby="profile-timezone-label">Asia/Taipei</output>
      <span class="text-sm text-muted">目前產品固定使用 Asia/Taipei，不提供修改。</span>
    </div>

    <p v-if="errorMessage" id="profile-error" ref="errorRegion" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-sm text-[var(--error-ink)]" role="alert" tabindex="-1">{{ errorMessage }}</p>
    <p v-if="successMessage" class="rounded-[0.625rem] border border-accent-soft bg-accent-soft px-3.5 py-3 text-sm text-ink" role="status" aria-live="polite">{{ successMessage }}</p>

    <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" type="submit" :disabled="isSaving" :aria-busy="isSaving">
      {{ isSaving ? '儲存中…' : (onboarding ? '儲存並繼續' : '儲存個人資料') }}
    </button>
  </form>
</template>
