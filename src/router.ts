import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouterHistory,
} from 'vue-router'
import AppShell from './AppShell.vue'
import { createSupabaseAuth, type AuthAdapter } from './lib/auth'
import { safeRedirect } from './lib/redirect'
import AuthCallbackView from './views/AuthCallbackView.vue'
import LoginView from './views/LoginView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackView },
  { path: '/', name: 'today', component: AppShell, meta: { requiresAuth: true } },
  { path: '/attendance/:pathMatch(.*)*', name: 'attendance', component: AppShell, meta: { requiresAuth: true } },
  { path: '/leave/:pathMatch(.*)*', name: 'leave', component: AppShell, meta: { requiresAuth: true } },
  { path: '/reports/:pathMatch(.*)*', name: 'reports', component: AppShell, meta: { requiresAuth: true } },
  { path: '/settings/:pathMatch(.*)*', name: 'settings', component: AppShell, meta: { requiresAuth: true } },
  { path: '/:pathMatch(.*)*', name: 'fallback', component: AppShell, meta: { requiresAuth: true } },
]

export type AppRouterOptions = {
  auth?: AuthAdapter
  history?: RouterHistory
}

function callbackErrorLocation(redirect: unknown) {
  const target = safeRedirect(redirect)

  return {
    name: 'auth-callback',
    query: {
      ...(target === '/' ? {} : { redirect: target }),
      error: 'oauth_callback_failed',
    },
  }
}

export function createAppRouter(options: AppRouterOptions = {}) {
  const auth = options.auth ?? createSupabaseAuth()
  const history = options.history ?? (typeof window === 'undefined'
    ? createMemoryHistory()
    : createWebHistory())

  const router = createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach(async (to) => {
    if (to.name === 'auth-callback') {
      if (to.query.error === 'oauth_callback_failed') return true

      const code = typeof to.query.code === 'string' ? to.query.code : null

      if (!code) {
        return callbackErrorLocation(to.query.redirect)
      }

      try {
        const { data, error } = await auth.exchangeCodeForSession(code)

        if (error || !data.session) {
          return callbackErrorLocation(to.query.redirect)
        }
      } catch {
        return callbackErrorLocation(to.query.redirect)
      }

      return safeRedirect(to.query.redirect)
    }

    const { data } = await auth.getSession()
    const isLoggedIn = Boolean(data.session)

    if (to.name === 'login') {
      return isLoggedIn ? safeRedirect(to.query.redirect) : true
    }

    if (to.meta.requiresAuth && !isLoggedIn) {
      return { name: 'login', query: { redirect: safeRedirect(to.fullPath) } }
    }

    return true
  })

  return router
}
