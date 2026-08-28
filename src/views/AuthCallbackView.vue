<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

function safeRedirect(value: unknown) {
  if (
    typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.startsWith('/\\')
  ) {
    return value
  }

  return '/'
}

const failed = computed(() => route.query.error === 'oauth_callback_failed')
const redirect = computed(() => safeRedirect(route.query.redirect))
const loginTarget = computed(() => ({
  name: 'login',
  query: redirect.value === '/' ? undefined : { redirect: redirect.value },
}))
</script>

<template>
  <div class="auth-page callback-page">
    <a class="skip-link" href="#callback-main">跳至主要內容</a>

    <header class="auth-header">
      <RouterLink class="wordmark" to="/" aria-label="線上出勤首頁">
        <span class="wordmark-mark" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="auth-header-label">登入驗證</span>
    </header>

    <main id="callback-main" class="callback-main">
      <section v-if="failed" class="auth-panel callback-panel" aria-labelledby="callback-error-title">
        <p class="auth-panel-label">登入驗證</p>
        <h1 id="callback-error-title">登入沒有完成。</h1>
        <p class="auth-panel-copy">Google 沒有成功回傳登入結果，請回到登入頁重新嘗試。</p>
        <p class="auth-error" role="alert">oauth_callback_failed</p>
        <RouterLink class="callback-link" :to="loginTarget">回到登入頁</RouterLink>
      </section>

      <section v-else class="auth-panel callback-panel" aria-labelledby="callback-loading-title" aria-busy="true">
        <span class="callback-loader" aria-hidden="true"></span>
        <p class="auth-panel-label">登入驗證</p>
        <h1 id="callback-loading-title">正在確認登入狀態。</h1>
        <p class="auth-panel-copy" role="status" aria-live="polite">請稍候，完成後會自動回到原本的頁面。</p>
      </section>
    </main>
  </div>
</template>
