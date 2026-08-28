import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouterHistory,
} from 'vue-router'
import AppShell from './AppShell.vue'
import { createSupabaseAuth, type AuthAdapter } from './lib/auth'
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

function redirectTarget(route: RouteLocationNormalized) {
  const redirect = route.query.redirect

  if (
    typeof redirect === 'string'
    && redirect.startsWith('/')
    && !redirect.startsWith('//')
    && !redirect.startsWith('/\\')
  ) {
    return redirect
  }

  return '/'
}

function loginLocation(redirect: string, error?: string) {
  return {
    name: 'login',
    query: {
      ...(redirect === '/' ? {} : { redirect }),
      ...(error ? { error } : {}),
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
      const code = typeof to.query.code === 'string' ? to.query.code : null

      if (!code) {
        return loginLocation(redirectTarget(to), 'oauth_callback_failed')
      }

      const { data, error } = await auth.exchangeCodeForSession(code)

      if (error || !data.session) {
        return loginLocation(redirectTarget(to), 'oauth_callback_failed')
      }

      return redirectTarget(to)
    }

    const { data } = await auth.getSession()
    const isLoggedIn = Boolean(data.session)

    if (to.name === 'login') {
      return isLoggedIn ? redirectTarget(to) : true
    }

    if (to.meta.requiresAuth && !isLoggedIn) {
      return loginLocation(to.fullPath)
    }

    return true
  })

  return router
}
