<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { createSupabaseAuth } from './lib/auth'
import SettingsView from './views/SettingsView.vue'

const route = useRoute()
const router = useRouter()
const isSigningOut = ref(false)
const logoutError = ref('')
const now = ref(new Date())
let clockTimeout: ReturnType<typeof setTimeout> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined

const navItems = [
  { label: '今日', href: '/', routeName: 'today' },
  { label: '出勤', href: '/attendance', routeName: 'attendance' },
  { label: '日曆／狀態', href: '/leave', routeName: 'leave' },
  { label: '報表', href: '/reports', routeName: 'reports' },
  { label: '設定', href: '/settings', routeName: 'settings' },
]

const currentDateLabel = computed(() => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(now.value))

const currentTimeLabel = computed(() => new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(now.value))

const currentDateTime = computed(() => now.value.toISOString())

const page = computed(() => {
  const current = navItems.find((item) => item.routeName === route.name)

  if (current?.routeName === 'attendance') {
    return {
      label: '出勤',
      title: '沿著時間軸，查看今天的出勤。',
      description: '先看見事件順序與目前狀態；這個工作面只提供讀取預覽。',
      summary: '預覽資料：今天不提供可供修改的出勤紀錄。',
      nextStep: '下一步：確認工作日後，再開始第一個打卡動作。',
      previewStatus: '預覽：尚未記錄',
    }
  }

  if (current?.routeName === 'leave') {
    return {
      label: '日曆／狀態',
      title: '分開看日曆分類與當日狀態。',
      description: '日曆回答「這天是哪一類」；狀態回答「這天怎麼工作」。',
      summary: '預覽資料：兩組資訊各自保留，避免把週末、假日與請假混在一起。',
      nextStep: '下一步：先確認日曆分類，再檢視當天的工作狀態。',
      previewStatus: '預覽：狀態分開呈現',
    }
  }

  if (current?.routeName === 'reports') {
    return {
      label: '報表',
      title: '用一個摘要，回顧工作日。',
      description: '把日期區間、紀錄概況與待確認事項放在同一個讀取畫面。',
      summary: '預覽資料：目前顯示的是報表結構，不代表已產生正式統計。',
      nextStep: '下一步：選定報表區間後，再查看整理完成的出勤摘要。',
      previewStatus: '預覽：摘要',
    }
  }

  if (current?.routeName === 'settings') {
    return {
      label: '設定',
      title: '先確認系統固定的工作環境。',
      description: '這裡只顯示系統固定值與狀態規則，不提供可變更的偏好。',
      summary: '預覽資料：系統時區固定，不會更新帳號、狀態顯示或任何出勤資料。',
      nextStep: '下一步：查看系統時區與狀態顯示規則；目前沒有可設定的偏好。',
      previewStatus: '預覽：設定',
    }
  }

  return {
    label: '今日',
    title: '先看今天，再開始工作。',
    description: '把目前時間、出勤預覽與下一個打卡位置放在最前面。',
    summary: '預覽資料：目前是只讀預覽，不會送出打卡，也不會建立出勤紀錄。',
    nextStep: '下一步：確認今天的工作安排，再進行未來的打卡動作。',
    previewStatus: '預覽：只讀',
  }
})

onMounted(() => {
  const millisecondsToNextMinute = 60_000 - (Date.now() % 60_000)

  clockTimeout = setTimeout(() => {
    now.value = new Date()
    clockTimer = setInterval(() => {
      now.value = new Date()
    }, 60_000)
  }, millisecondsToNextMinute)
})

onUnmounted(() => {
  if (clockTimeout) clearTimeout(clockTimeout)
  if (clockTimer) clearInterval(clockTimer)
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
            <li v-for="(item, index) in navItems" :key="item.routeName" class="shrink-0">
              <RouterLink
                class="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[0.625rem] border border-transparent px-3 py-2 text-[0.9375rem] text-muted transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-px hover:border-line hover:text-ink active:translate-y-px focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0 md:justify-start md:px-3.5"
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
        <SettingsView v-if="route.name === 'settings'" />
        <div v-else class="w-full max-w-6xl">
          <section class="grid max-w-[39rem] gap-4" aria-labelledby="page-title">
            <span class="inline-flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-accent">
              <span class="h-px w-6 bg-current" aria-hidden="true"></span>
              <span>{{ page.label }}</span>
            </span>
            <h1 id="page-title" class="max-w-[13ch] font-display text-[clamp(2.25rem,8vw,4.5rem)] font-semibold leading-[1.12] tracking-[-0.055em] text-balance">{{ page.title }}</h1>
            <p class="max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] text-muted text-pretty">{{ page.description }}</p>
          </section>

          <section class="mt-10 grid gap-4 border-y border-line py-4 sm:grid-cols-[1fr_1fr_1.2fr] sm:gap-0" aria-label="目前工作面摘要">
            <div class="grid gap-1 border-line sm:border-e sm:pe-5">
              <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">日期</span>
              <time class="font-display text-lg font-semibold" :datetime="currentDateTime">{{ currentDateLabel }}</time>
            </div>
            <div class="grid gap-1 border-line sm:border-e sm:px-5">
              <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-accent">目前時間</span>
              <time class="font-mono text-2xl font-bold tabular-nums tracking-[-0.04em]" :datetime="currentDateTime">{{ currentTimeLabel }}</time>
            </div>
            <div class="grid gap-1 pt-4 sm:pt-0 sm:ps-5">
              <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">狀態</span>
              <strong class="text-base">{{ page.previewStatus }}</strong>
              <span class="text-[0.8125rem] text-muted">只讀預覽，不會寫入資料</span>
            </div>
          </section>

          <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.75fr)]">
            <section v-if="route.name !== 'attendance' && route.name !== 'leave' && route.name !== 'reports' && route.name !== 'settings'" class="grid gap-6 rounded-2xl border border-accent bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="today-preview-title">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="grid gap-1">
                  <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">今日出勤預覽資料</span>
                  <h2 id="today-preview-title" class="font-display text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.05em]">先確認，再打卡</h2>
                </div>
                <div class="text-end">
                  <span class="block text-[0.6875rem] font-bold tracking-[0.14em] text-muted">目前時間</span>
                  <time class="font-mono text-4xl font-bold leading-none tabular-nums tracking-[-0.06em] text-accent" :datetime="currentDateTime">{{ currentTimeLabel }}</time>
                </div>
              </div>
              <div class="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                <div class="grid gap-1">
                  <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">Calendar classification</span>
                  <strong class="text-lg">範例：工作日</strong>
                  <span class="text-[0.8125rem] text-muted">日曆分類，不等同工作狀態</span>
                </div>
                <div class="grid gap-1">
                  <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">Day Status</span>
                  <strong class="text-lg">範例：遠端</strong>
                  <span class="text-[0.8125rem] text-muted">工作安排狀態，獨立呈現</span>
                </div>
              </div>
              <div class="grid gap-3 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <span class="text-[0.6875rem] font-bold tracking-[0.14em] text-muted">下一個動作</span>
                  <span class="font-mono text-[0.6875rem] font-bold tracking-[0.1em] text-accent">預覽 · 尚未啟用</span>
                </div>
                <strong class="font-display text-xl tracking-[-0.03em]">預覽：開始上班打卡</strong>
                <p class="max-w-[48ch] text-[0.875rem] leading-relaxed text-muted">這裡只展示未來動作的位置，不會送出打卡或建立 Attendance Record。</p>
              </div>
            </section>

            <section v-else-if="route.name === 'attendance'" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="attendance-preview-title">
              <div class="flex items-start justify-between gap-4 border-b border-line pb-5">
                <div class="grid gap-1">
                  <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">出勤時間軸 · 預覽資料</span>
                  <h2 id="attendance-preview-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">今日事件順序</h2>
                </div>
                <span class="rounded-[0.375rem] border border-line px-2 py-1 font-mono text-[0.6875rem] font-bold text-muted">只讀預覽</span>
              </div>
              <ol class="grid divide-y divide-line">
                <li class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-4 first:pt-0 last:pb-0">
                  <time class="font-mono text-sm font-bold tabular-nums text-accent" datetime="09:00">範例：09:00</time>
                  <div class="grid gap-0.5"><strong>範例事件：開始工作</strong><span class="text-[0.8125rem] text-muted">預覽資料，非實際紀錄</span></div>
                </li>
                <li class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-4 first:pt-0 last:pb-0">
                  <time class="font-mono text-sm font-bold tabular-nums text-muted" datetime="18:00">範例：18:00</time>
                  <div class="grid gap-0.5"><strong>範例事件：結束工作</strong><span class="text-[0.8125rem] text-muted">預覽資料，非實際紀錄</span></div>
                </li>
              </ol>
            </section>

            <div v-else-if="route.name === 'leave'" class="grid gap-4 lg:grid-cols-2">
              <section class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-7 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="calendar-classification-title">
                <div class="grid gap-1 border-b border-line pb-4">
                  <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">Calendar classification</span>
                  <h2 id="calendar-classification-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">日曆分類</h2>
                  <p class="text-[0.8125rem] text-muted">回答這一天是哪一類。</p>
                </div>
                <dl class="grid divide-y divide-line">
                  <div class="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">本日</dt><dd class="font-semibold">範例：工作日</dd></div>
                  <div class="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">週末</dt><dd class="font-semibold">範例：週六、週日</dd></div>
                  <div class="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">假日</dt><dd class="font-semibold">範例：未標記</dd></div>
                </dl>
              </section>
              <section class="grid gap-5 rounded-2xl border border-accent bg-surface p-5 shadow-[var(--shadow)] sm:p-7 forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="day-status-title">
                <div class="grid gap-1 border-b border-line pb-4">
                  <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">Day Status</span>
                  <h2 id="day-status-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">工作狀態</h2>
                  <p class="text-[0.8125rem] text-muted">回答這一天怎麼工作。</p>
                </div>
                <dl class="grid divide-y divide-line">
                  <div class="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">目前狀態</dt><dd class="font-semibold text-accent">範例：遠端</dd></div>
                  <div class="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">請假</dt><dd class="font-semibold">範例：未設定</dd></div>
                  <div class="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-baseline"><dt class="text-sm text-muted">資料用途</dt><dd class="font-semibold">只讀預覽</dd></div>
                </dl>
              </section>
            </div>

            <section v-else-if="route.name === 'reports'" class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="reports-preview-title">
              <div class="grid gap-1 border-b border-line pb-5">
                <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">報表摘要</span>
                <h2 id="reports-preview-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">本週工作日概況 · 預覽資料</h2>
              </div>
              <dl class="grid gap-3 sm:grid-cols-3">
                <div class="grid gap-1 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]"><dt class="text-[0.75rem] text-muted">日期區間</dt><dd class="font-semibold">本週預覽</dd></div>
                <div class="grid gap-1 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]"><dt class="text-[0.75rem] text-muted">工作日</dt><dd class="font-mono text-2xl font-bold tabular-nums">範例：5 日</dd></div>
                <div class="grid gap-1 rounded-[0.625rem] border border-line bg-surface-soft p-4 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]"><dt class="text-[0.75rem] text-muted">已記錄</dt><dd class="font-mono text-2xl font-bold tabular-nums">範例：0 筆</dd></div>
              </dl>
              <p class="border-s-4 border-accent ps-4 text-[0.875rem] leading-relaxed text-muted">這是報表結構預覽，不代表已產生正式統計，也不會修改任何資料。</p>
            </section>

            <section v-else class="grid gap-5 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] sm:p-8 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:shadow-none" aria-labelledby="settings-preview-title">
              <div class="grid gap-1 border-b border-line pb-5">
                <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">設定預覽</span>
                <h2 id="settings-preview-title" class="font-display text-2xl font-semibold tracking-[-0.045em]">系統固定值與顯示規則</h2>
              </div>
              <dl class="grid divide-y divide-line">
                <div class="grid gap-1 py-4 first:pt-0 sm:grid-cols-[minmax(8rem,0.7fr)_1fr] sm:items-baseline"><dt class="text-sm text-muted">登入方式（固定）</dt><dd class="font-semibold">預覽：Google 帳號（固定）</dd></div>
                <div class="grid gap-1 py-4 sm:grid-cols-[minmax(8rem,0.7fr)_1fr] sm:items-baseline"><dt class="text-sm text-muted">系統時區</dt><dd class="font-mono text-sm font-semibold">Asia/Taipei（固定）</dd></div>
                <div class="grid gap-1 py-4 last:pb-0 sm:grid-cols-[minmax(8rem,0.7fr)_1fr] sm:items-baseline"><dt class="text-sm text-muted">狀態顯示規則</dt><dd class="font-semibold">預覽：Calendar classification 與 Day Status 分開</dd></div>
              </dl>
              <p class="rounded-[0.625rem] border border-line bg-surface-soft p-4 text-[0.875rem] leading-relaxed text-muted forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]">以上是系統固定值與顯示規則，僅供預覽；沒有可寫入的設定控制。</p>
            </section>

            <aside class="grid content-start gap-4 rounded-2xl border border-line bg-surface-soft p-5 sm:p-6 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]" aria-labelledby="next-step-title">
              <div class="grid gap-1">
                <span class="text-[0.6875rem] font-bold tracking-[0.16em] text-accent">下一步提示</span>
                <h2 id="next-step-title" class="font-display text-xl font-semibold tracking-[-0.035em]">往下一個可用狀態</h2>
              </div>
              <p class="text-[0.9375rem] leading-relaxed">{{ page.nextStep }}</p>
              <div class="border-t border-line pt-4 text-[0.8125rem] leading-relaxed text-muted">
                {{ page.summary }}
              </div>
              <p class="font-mono text-[0.6875rem] font-bold tracking-[0.1em] text-muted">PREVIEW ONLY · READ ONLY</p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
