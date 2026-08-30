<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createSupabaseAuth } from '../lib/auth'

const router = useRouter()
const mainRegion = ref<HTMLElement | null>(null)
const errorRegion = ref<HTMLElement | null>(null)
const isSigningOut = ref(false)
const logoutError = ref('')

onMounted(async () => {
  await nextTick()
  mainRegion.value?.focus()
})

function reloadPage() {
  window.location.reload()
}

async function handleSignOut() {
  if (isSigningOut.value) return

  isSigningOut.value = true
  logoutError.value = ''

  try {
    const { error } = await createSupabaseAuth().signOut({ scope: 'local' })

    if (error) {
      logoutError.value = error.message || '登出失敗，請稍後再試。'
      await nextTick()
      errorRegion.value?.focus()
      return
    }

    await router.replace({ name: 'login' })
  } catch {
    logoutError.value = '登出失敗，請稍後再試。'
    await nextTick()
    errorRegion.value?.focus()
  } finally {
    isSigningOut.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas px-5 py-5 text-ink sm:px-10 lg:px-16">
    <a class="fixed start-3 top-3 z-10 -translate-y-[180%] rounded-[0.5rem] bg-ink px-3 py-2 text-surface transition-transform duration-200 focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:focus-visible:translate-y-0" href="#account-unavailable-main">跳至主要內容</a>

    <header class="mx-auto flex min-h-12 w-full max-w-[80rem] items-center justify-between gap-4">
      <span class="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-[-0.035em]" aria-label="線上出勤">
        <span class="grid size-8 place-items-center rounded-[0.625rem] bg-accent text-sm tracking-normal text-surface" aria-hidden="true">出</span>
        <span>線上出勤</span>
      </span>
      <span class="text-[0.75rem] font-bold tracking-[0.08em] text-muted">帳號狀態</span>
    </header>

    <main id="account-unavailable-main" ref="mainRegion" tabindex="-1" class="mx-auto grid w-full max-w-[68rem] flex-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.8fr)] lg:gap-24 lg:py-20">
      <section class="grid max-w-[39rem] gap-5 border-t border-accent pt-5" aria-labelledby="account-unavailable-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">線上出勤 / 需要重新確認</p>
        <h1 id="account-unavailable-title" class="max-w-[15ch] font-display text-[clamp(2.35rem,6vw,4.4rem)] font-semibold leading-[1.06] tracking-[-0.055em] text-balance">目前無法確認帳號狀態。</h1>
        <p class="max-w-[32rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-relaxed text-muted text-pretty">暫時無法讀取你的 Profile 或登入狀態，這不代表你需要重新設定帳號。</p>
      </section>

      <section class="grid w-full max-w-[28rem] justify-self-end gap-4 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8" aria-labelledby="account-unavailable-panel-title">
        <p class="text-[0.75rem] font-bold tracking-[0.12em] text-accent">暫時無法判定</p>
        <h2 id="account-unavailable-panel-title" class="max-w-[16ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.05em] text-balance">請稍後再試。</h2>
        <p class="text-[0.9375rem] leading-relaxed text-muted text-pretty">可能是連線或服務暫時不穩定。你的本機登入狀態會保留，請重新載入確認。</p>

        <p v-if="logoutError" ref="errorRegion" class="rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-3.5 py-3 text-[0.875rem] text-[var(--error-ink)]" role="alert" tabindex="-1">{{ logoutError }}</p>

        <div class="grid gap-2 sm:grid-cols-2">
          <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-accent bg-accent px-4 py-2 font-semibold text-canvas transition duration-200 ease-out hover:-translate-y-px hover:border-ink hover:bg-ink active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" @click="reloadPage">重新載入</button>
          <button class="inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-line bg-surface px-4 py-2 font-semibold text-ink transition duration-200 ease-out hover:-translate-y-px hover:border-accent hover:text-accent active:translate-y-px disabled:cursor-wait disabled:opacity-[0.68] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0" type="button" :disabled="isSigningOut" :aria-busy="isSigningOut" @click="handleSignOut">{{ isSigningOut ? '登出中…' : '登出' }}</button>
        </div>
      </section>
    </main>

    <footer class="mx-auto w-full max-w-[68rem] border-t border-line pt-4 text-[0.8125rem] text-muted">若問題持續，請重新登入後再試。</footer>
  </div>
</template>
