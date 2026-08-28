<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { createSupabaseAuth, signInWithGoogle } from '../lib/auth'
import { safeRedirect } from '../lib/redirect'

const route = useRoute()
const isSigningIn = ref(false)
const apiError = ref('')
const errorRegion = ref<HTMLElement | null>(null)

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
  <div class="auth-page">
    <a class="skip-link" href="#auth-main">跳至主要內容</a>

    <header class="auth-header">
      <RouterLink class="wordmark" to="/" aria-label="線上出勤首頁">
        <span class="wordmark-mark" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="auth-header-label">登入入口</span>
    </header>

    <main id="auth-main" class="auth-layout">
      <section class="auth-intro" aria-labelledby="login-title">
        <p class="auth-kicker">線上出勤 / 個人工作日誌</p>
        <h1 id="login-title">從今天開始，清楚記下每個工作日。</h1>
        <p class="auth-intro-copy">使用 Google 帳號登入，接著回到你原本要前往的頁面。</p>
      </section>

      <section class="auth-panel" aria-labelledby="auth-panel-title">
        <p class="auth-panel-label">帳號登入</p>
        <h2 id="auth-panel-title">登入線上出勤</h2>
        <p class="auth-panel-copy">僅使用 Google 身分驗證，不會在登入時建立或修改出勤資料。</p>

        <p
          v-if="errorMessage"
          ref="errorRegion"
          class="auth-error"
          role="alert"
          tabindex="-1"
        >
          {{ errorMessage }}
        </p>

        <button
          class="google-button"
          type="button"
          :disabled="isSigningIn"
          :aria-busy="isSigningIn"
          @click="handleGoogleSignIn"
        >
          <span class="google-mark" aria-hidden="true">G</span>
          <span>{{ isSigningIn ? '正在前往 Google…' : '使用 Google 帳號登入' }}</span>
          <span class="button-arrow" aria-hidden="true">↗</span>
        </button>

        <p class="auth-note">登入後會返回原本請求的頁面。</p>
      </section>
    </main>

    <footer class="auth-footer">只在需要時記下，讓每天的開始更明確。</footer>
  </div>
</template>
