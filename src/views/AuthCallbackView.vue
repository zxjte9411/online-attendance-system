<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { safeRedirect } from '../lib/redirect'

const route = useRoute()

const failed = computed(() => route.query.error === 'oauth_callback_failed')
const mainRegion = ref<HTMLElement | null>(null)
const errorRegion = ref<HTMLElement | null>(null)
const redirect = computed(() => safeRedirect(route.query.redirect))
const loginTarget = computed(() => ({
  name: 'login',
  query: redirect.value === '/' ? undefined : { redirect: redirect.value },
}))

onMounted(async () => {
  await nextTick()
  mainRegion.value?.focus()

  if (failed.value) {
    await nextTick()
    errorRegion.value?.focus()
  }
})

watch(failed, async (isFailed) => {
  if (!isFailed) return

  await nextTick()
  errorRegion.value?.focus()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas px-5 py-5 text-ink sm:px-10 lg:px-16">
    <a class="fixed start-3 top-3 z-10 -translate-y-[180%] rounded-[0.5rem] bg-ink px-3 py-2 text-surface transition-transform duration-200 focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:focus-visible:translate-y-0" href="#callback-main">跳至主要內容</a>

    <header class="mx-auto flex min-h-12 w-full max-w-[80rem] items-center justify-between gap-4">
      <RouterLink class="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-[-0.035em]" to="/" aria-label="線上出勤首頁">
        <span class="grid size-8 place-items-center rounded-[0.625rem] bg-accent text-sm tracking-normal text-surface" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </RouterLink>
      <span class="text-[0.75rem] font-bold tracking-[0.08em] text-muted">登入驗證</span>
    </header>

    <main ref="mainRegion" id="callback-main" tabindex="-1" class="mx-auto grid w-full max-w-[68rem] flex-1 place-items-center py-12 sm:py-16 lg:py-20">
      <section v-if="failed" class="grid w-full max-w-[32rem] gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="callback-error-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">登入驗證</p>
        <h1 id="callback-error-title" class="max-w-[16ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.05em] text-balance">登入沒有完成。</h1>
        <p class="text-[0.9375rem] leading-relaxed text-muted text-pretty">Google 沒有成功回傳登入結果，請回到登入頁重新嘗試。</p>
        <p ref="errorRegion" tabindex="-1" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-[0.875rem] text-[var(--error-ink)] forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]" role="alert">oauth_callback_failed</p>
        <RouterLink class="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]" :to="loginTarget">回到登入頁</RouterLink>
      </section>

      <section v-else class="grid w-full max-w-[32rem] gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="callback-loading-title" aria-busy="true">
        <span class="mt-1 size-8 rounded-full border-2 border-accent-soft border-t-accent motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true"></span>
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">登入驗證</p>
        <h1 id="callback-loading-title" class="max-w-[16ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.05em] text-balance">正在確認登入狀態。</h1>
        <p class="text-[0.9375rem] leading-relaxed text-muted text-pretty" role="status" aria-live="polite">請稍候，完成後會自動回到原本的頁面。</p>
      </section>
    </main>
  </div>
</template>
