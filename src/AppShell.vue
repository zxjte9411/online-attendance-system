<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { createSupabaseAuth, signOut } from './lib/auth'

const route = useRoute()
const router = useRouter()
const isSigningOut = ref(false)
const logoutError = ref('')

const navItems = [
  { label: '今日', href: '/', routeName: 'today' },
  { label: '出勤', href: '/attendance', routeName: 'attendance' },
  { label: '假勤', href: '/leave', routeName: 'leave' },
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
      label: '假勤',
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
    const { error } = await signOut(createSupabaseAuth())

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
  <div class="app-shell" data-shell="attendance">
    <a class="skip-link" href="#main-content">跳至主要內容</a>

    <header class="app-header">
      <div class="header-inner">
        <RouterLink class="wordmark" to="/" aria-label="線上出勤首頁">
          <span class="wordmark-mark" aria-hidden="true">出</span>
          <span>線上出勤</span>
        </RouterLink>
        <div class="header-actions">
          <p class="header-note">個人工作日誌</p>
          <button
            class="sign-out-button"
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

    <p v-if="logoutError" class="shell-error" role="alert">{{ logoutError }}</p>

    <div class="app-layout">
      <aside class="sidebar" aria-label="應用程式導覽">
        <div class="sidebar-heading">
          <span class="sidebar-title">我的工作日</span>
        </div>

        <nav class="primary-nav" aria-label="主要導覽">
          <RouterLink
            v-for="item in navItems"
            :key="item.routeName"
            class="nav-link"
            :class="{ 'nav-link-current': isCurrent(item) }"
            :to="item.href"
            :aria-current="isCurrent(item) ? 'page' : undefined"
          >
            <span class="nav-index" aria-hidden="true">{{ String(navItems.indexOf(item) + 1).padStart(2, '0') }}</span>
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <p class="sidebar-footer">清楚記下每一個工作日</p>
      </aside>

      <main id="main-content" class="main-content">
        <div class="content-wrap">
          <section class="intro" aria-labelledby="page-title">
            <span class="section-marker">{{ page.label }}</span>
            <h1 id="page-title">{{ page.title }}</h1>
            <p>{{ page.description }}</p>
          </section>

          <section class="preview-panel" aria-labelledby="preview-title">
            <div class="preview-heading">
              <span class="preview-dot" aria-hidden="true"></span>
              <span>介面預覽</span>
            </div>
            <div class="preview-body">
              <div>
                <p class="preview-label">{{ page.label }}頁面</p>
                <h2 id="preview-title">準備好了，從這裡開始。</h2>
              </div>
              <p class="preview-copy">目前只呈現應用程式介面，不會自動建立或修改任何資料。</p>
            </div>
            <div class="preview-rule" aria-hidden="true"></div>
            <p class="preview-footnote">保持簡單，讓每天的開始更明確。</p>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
