<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { createSupabaseAuth, signInWithGoogle } from '../lib/auth'
import { safeRedirect } from '../lib/redirect'

const route = useRoute()
const isSigningIn = ref(false)
const apiError = ref('')
const errorRegion = ref<HTMLElement | null>(null)
const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
)

const redirect = computed(() => safeRedirect(route.query.redirect))
const callbackFailed = computed(() => route.query.error === 'oauth_callback_failed')
const errorMessage = computed(() => {
  if (apiError.value) return apiError.value
  if (callbackFailed.value) return 'Google 登入沒有完成，請再試一次。'
  return ''
})

watch(errorMessage, async (message) => {
  if (!message) return

  await nextTick()
  errorRegion.value?.focus()
}, { immediate: true })

async function handleGoogleSignIn() {
  if (isSigningIn.value) return

  isSigningIn.value = true
  apiError.value = ''

  try {
    const { error } = await signInWithGoogle(createSupabaseAuth(), redirect.value)

    if (error) {
      apiError.value = error.message || 'Google 登入目前無法使用，請稍後再試。'
    }
  } catch {
    apiError.value = 'Google 登入目前無法使用，請稍後再試。'
  } finally {
    isSigningIn.value = false
  }
}
</script>

<template>
  <div class="login-page flex min-h-dvh flex-col bg-canvas px-5 py-5 text-ink sm:px-10 lg:px-16">
    <a class="skip-link" href="#auth-main">跳至主要內容</a>

    <header class="mx-auto flex min-h-12 w-full max-w-[80rem] items-center justify-between gap-4">
      <RouterLink class="wordmark" to="/" aria-label="線上出勤首頁">
        <span class="wordmark-mark" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="text-[0.75rem] font-bold tracking-[0.08em] text-muted">登入入口</span>
    </header>

    <main
      id="auth-main"
      class="mx-auto grid w-full max-w-[68rem] flex-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.8fr)] lg:gap-24 lg:py-20"
    >
      <section class="grid max-w-[39rem] gap-5 border-t border-accent pt-5" aria-labelledby="login-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">線上出勤 / 個人工作日誌</p>
        <h1 id="login-title" class="max-w-[16ch] font-display text-[clamp(2.35rem,6vw,4.4rem)] font-semibold leading-[1.06] tracking-[-0.055em] text-balance">
          從今天開始，清楚記下每個工作日。
        </h1>
        <p class="max-w-[32rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-relaxed text-muted text-pretty">使用 Google 帳號登入，接著回到你原本要前往的頁面。</p>
      </section>

      <section class="grid w-full max-w-[28rem] justify-self-end gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="auth-panel-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">帳號登入</p>
        <h2 id="auth-panel-title" class="max-w-[16ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.05em] text-balance">登入線上出勤</h2>
        <p class="text-[0.9375rem] leading-relaxed text-muted text-pretty">僅使用 Google 身分驗證，不會在登入時建立或修改出勤資料。</p>

        <p
          v-if="errorMessage"
          ref="errorRegion"
          class="login-error rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-[0.875rem] text-[var(--error-ink)]"
          role="alert"
          tabindex="-1"
        >
          {{ errorMessage }}
        </p>

        <button
          v-if="isSupabaseConfigured"
          class="google-button mt-2 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-3 rounded-[0.625rem] border border-accent bg-accent px-4 py-3 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68]"
          type="button"
          :disabled="isSigningIn"
          :aria-busy="isSigningIn"
          @click="handleGoogleSignIn"
        >
          <span class="google-mark grid size-6 place-items-center rounded-full bg-surface font-display text-xs font-extrabold text-accent" aria-hidden="true">G</span>
          <span>{{ isSigningIn ? '正在前往 Google…' : '使用 Google 帳號登入' }}</span>
          <span class="ms-auto text-lg leading-none" aria-hidden="true">↗</span>
        </button>

        <div v-else class="login-preview-state mt-2 grid gap-1.5 rounded-[0.625rem] border border-line border-s-accent border-s-4 bg-surface-soft px-4 py-4" role="status">
          <span class="font-mono text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">Preview</span>
          <strong class="text-[0.9375rem]">Google 登入尚未開放</strong>
          <p class="text-[0.875rem] leading-relaxed text-muted text-pretty">目前環境尚未設定 Supabase 公開設定，因此這裡只提供介面預覽，沒有可操作的登入按鈕。</p>
        </div>

        <p v-if="isSupabaseConfigured" class="text-center text-[0.8125rem] text-muted">登入後會返回原本請求的頁面。</p>
      </section>
    </main>

    <footer class="mx-auto w-full max-w-[68rem] border-t border-line pt-4 text-[0.8125rem] text-muted">只在需要時記下，讓每天的開始更明確。</footer>
  </div>
</template>
