<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { createSupabaseAuth } from './lib/auth'

const route = useRoute()
const router = useRouter()
const isSigningOut = ref(false)
const logoutError = ref('')

const navItems = [
  { label: '今日', href: '/', routeName: 'today' },
  { label: '出勤', href: '/attendance', routeName: 'attendance' },
  { label: '日曆／狀態', href: '/leave', routeName: 'leave' },
  { label: '報表', href: '/reports', routeName: 'reports' },
  { label: '設定', href: '/settings', routeName: 'settings' },
]

const page = computed(() => {
  const current = navItems.find((item) => item.routeName === route.name)

  if (current?.routeName === 'attendance') {
    return {
      label: '出勤',
      title: '把每天的出勤，留在清楚的脈絡裡。',
      description: '從同一個入口整理工作日，讓每一次查看都保持簡單。',
    }
  }

  if (current?.routeName === 'leave') {
    return {
      label: '日曆／狀態',
      title: '需要休息的日子，也值得被好好安排。',
      description: '在這裡保留未來的工作節奏，畫面先維持清楚而安靜。',
    }
  }

  if (current?.routeName === 'reports') {
    return {
      label: '報表',
      title: '用一眼看懂的方式，回顧工作日。',
      description: '報表入口已就緒，日後可從這裡檢視整理後的資訊。',
    }
  }

  if (current?.routeName === 'settings') {
    return {
      label: '設定',
      title: '先把重要的選項，放在容易找到的地方。',
      description: '這個入口保留給之後的偏好調整，現在只呈現介面。',
    }
  }

  return {
    label: '今日',
    title: '把今天的出勤，留在同一個地方。',
    description: '從今日開始，清楚看見接下來要處理的工作日。',
  }
})

function isCurrent(item: (typeof navItems)[number]) {
  return item.routeName === route.name
}

async function handleSignOut() {
  if (isSigningOut.value) return

  isSigningOut.value = true
  logoutError.value = ''

  try {
    const { error } = await createSupabaseAuth().signOut()

    if (error) {
      logoutError.value = error.message || '登出失敗，請稍後再試。'
      return
    }

    await router.push({ name: 'login' })
  } catch {
    logoutError.value = '登出失敗，請稍後再試。'
  } finally {
    isSigningOut.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink" data-shell="attendance">
    <a
      class="fixed start-3 top-3 z-10 -translate-y-[180%] rounded-[0.5rem] bg-ink px-3 py-2 text-surface transition-transform duration-200 focus-visible:translate-y-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:focus-visible:translate-y-0"
      href="#main-content"
    >
      跳至主要內容
    </a>

    <header class="border-b border-line bg-canvas/90">
      <div class="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-10 lg:px-16">
        <RouterLink class="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-[-0.035em] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent" to="/" aria-label="線上出勤首頁">
          <span class="grid size-8 place-items-center rounded-[0.625rem] bg-accent text-sm text-surface" aria-hidden="true">出</span>
          <span>線上出勤</span>
        </RouterLink>
        <div class="flex items-center justify-end gap-2 sm:gap-4">
          <p class="hidden whitespace-nowrap text-[0.8125rem] text-muted sm:block">個人工作日誌</p>
          <button
            class="min-h-11 shrink-0 rounded-[0.625rem] border border-line bg-surface px-3.5 py-2 text-sm font-bold text-ink transition-[background-color,border-color,color,transform] duration-200 ease-out enabled:hover:-translate-y-px enabled:hover:border-accent enabled:hover:text-accent active:translate-y-px focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-[0.62] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText]"
            type="button"
            :disabled="isSigningOut"
            :aria-busy="isSigningOut"
            @click="handleSignOut"
          >
            {{ isSigningOut ? '登出中…' : '登出' }}
          </button>
        </div>
      </div>
    </header>

    <p
      v-if="logoutError"
      class="fixed inset-x-5 top-[5.25rem] z-10 max-w-sm rounded-[0.625rem] border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm text-[var(--error-ink)] sm:inset-x-auto sm:end-16 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
      role="alert"
    >
      {{ logoutError }}
    </p>

    <div class="mx-auto grid max-w-7xl min-h-[calc(100dvh-4.5rem)] grid-cols-1 md:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
      <aside class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b border-line px-5 py-4 sm:px-10 md:flex md:flex-col md:items-stretch md:gap-12 md:border-b-0 md:border-e md:px-8 md:py-12" aria-label="應用程式導覽">
        <div class="hidden gap-1.5 md:grid">
          <span class="font-bold">我的工作日</span>
        </div>

        <nav class="min-w-0" aria-label="主要導覽">
          <ul class="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-5 md:grid md:content-start md:overflow-visible motion-reduce:scroll-auto">
            <li v-for="(item, index) in navItems" :key="item.routeName">
              <RouterLink
                class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[0.625rem] border border-transparent px-3 py-2 text-[0.9375rem] text-muted transition-[background-color,border-color,color,transform] duration-200 ease-out enabled:hover:-translate-y-px enabled:hover:border-line enabled:hover:text-ink active:translate-y-px focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 md:justify-start md:px-3.5"
                :class="isCurrent(item) ? 'border-accent-soft bg-accent-soft font-bold text-accent forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:[forced-color-adjust:none]' : ''"
                :to="item.href"
                :aria-current="isCurrent(item) ? 'page' : undefined"
              >
                <span class="hidden font-mono text-[0.6875rem] tabular-nums tracking-[0.08em] md:inline" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                <span>{{ item.label }}</span>
              </RouterLink>
            </li>
          </ul>
        </nav>

        <p class="hidden max-w-[12ch] text-sm leading-[1.7] text-muted md:mt-auto md:block">清楚記下每一個工作日</p>
      </aside>

      <main id="main-content" tabindex="-1" class="grid items-start px-5 py-10 pb-16 sm:px-10 md:py-12 md:pb-24 lg:px-16">
        <div class="w-full max-w-3xl">
          <section class="grid max-w-[39rem] gap-4" aria-labelledby="page-title">
            <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
              <span class="h-px w-6 bg-current" aria-hidden="true"></span>
              <span>{{ page.label }}</span>
            </span>
            <h1 id="page-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">{{ page.title }}</h1>
            <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">{{ page.description }}</p>
          </section>

          <section class="mt-[clamp(3rem,9vw,6.5rem)] grid gap-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="preview-title">
            <div class="flex items-center gap-2.5 text-[0.6875rem] font-bold tracking-[0.16em] text-accent">
              <span class="size-2 rounded-full bg-current" aria-hidden="true"></span>
              <span>介面預覽</span>
            </div>
            <div class="grid items-end gap-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] md:gap-12">
              <div>
                <p class="mb-3 text-xs tracking-[0.08em] text-muted">{{ page.label }}頁面</p>
                <h2 id="preview-title" class="max-w-[16ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.2] tracking-[-0.055em] text-balance">準備好了，從這裡開始。</h2>
              </div>
              <p class="max-w-[28ch] text-muted text-pretty">目前只呈現應用程式介面，不會自動建立或修改任何資料。</p>
            </div>
            <div class="h-px w-full bg-line" aria-hidden="true"></div>
            <p class="text-[0.8125rem] text-muted">保持簡單，讓每天的開始更明確。</p>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
