import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouterHistory,
} from 'vue-router'
import {
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'
import AppShell from './AppShell.vue'
import { createSupabaseAuth, type AuthAdapter } from './lib/auth'
import { safeRedirect } from './lib/redirect'
import { getProfile } from './lib/settings'
import AccountUnavailableView from './views/AccountUnavailableView.vue'
import AuthCallbackView from './views/AuthCallbackView.vue'
import LoginView from './views/LoginView.vue'
import PrivacyView from './views/PrivacyView.vue'
import SetupView from './views/SetupView.vue'
import SupportView from './views/SupportView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackView },
  { path: '/privacy', name: 'privacy', component: PrivacyView },
  { path: '/support', name: 'support', component: SupportView },
  { path: '/setup', name: 'setup', component: SetupView, meta: { requiresAuth: true } },
  { path: '/account-unavailable', name: 'account-unavailable', component: AccountUnavailableView, meta: { requiresAuth: true } },
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

function isTerminalAuthError(error: unknown) {
  if (isAuthSessionMissingError(error)) return true
  if (!isAuthApiError(error)) return false

  return typeof error.code === 'string'
    && [
      'session_not_found',
      'user_not_found',
      'session_expired',
      'refresh_token_not_found',
      'refresh_token_already_used',
      'bad_jwt',
    ].includes(error.code)
}

export function createAppRouter(options: AppRouterOptions = {}) {
  let auth = options.auth
  const hasAuthConfig = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
  const getAuth = () => {
    if (!auth) auth = createSupabaseAuth()
    return auth
  }
  const history = options.history ?? (typeof window === 'undefined'
    ? createMemoryHistory()
    : createWebHistory())

  const router = createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })

  let navigationToken = 0
  let skipNextAccountReadiness = false

  router.beforeEach(async (to) => {
    const callbackToken = ++navigationToken
    const skipReadiness = to.name === 'account-unavailable' && skipNextAccountReadiness
    if (skipReadiness) skipNextAccountReadiness = false

    if (to.name === 'auth-callback') {
      if (to.query.error === 'oauth_callback_failed') return true

      const code = typeof to.query.code === 'string' ? to.query.code : null

      if (!code) {
        return callbackErrorLocation(to.query.redirect)
      }

      const stopAfterEach = router.afterEach((confirmedTo) => {
        if (callbackToken !== navigationToken || confirmedTo.fullPath !== to.fullPath) {
          stopAfterEach()
          return
        }

        stopAfterEach()
        void (async () => {
          let location

          try {
            const { data, error } = await getAuth().exchangeCodeForSession(code)
            location = error || !data.session
              ? callbackErrorLocation(to.query.redirect)
              : safeRedirect(to.query.redirect)
          } catch {
            location = callbackErrorLocation(to.query.redirect)
          }

          if (callbackToken !== navigationToken || router.currentRoute.value.fullPath !== to.fullPath) return

          await router.replace(location)
        })()
      })

      return true
    }

    if (to.name !== 'login' && !to.meta.requiresAuth) return true

    if (!options.auth && !hasAuthConfig) {
      return to.name === 'login'
        ? true
        : { name: 'login', query: { redirect: safeRedirect(to.fullPath) } }
    }

    const originalTarget = to.name === 'account-unavailable'
      ? safeRedirect(to.query.redirect)
      : safeRedirect(to.fullPath)
    const loginLocation = () => to.name === 'login'
      ? true
      : originalTarget === '/'
        ? { name: 'login' }
        : { name: 'login', query: { redirect: originalTarget } }
    const unavailableLocation = () => {
      if (to.name === 'account-unavailable') return true
      skipNextAccountReadiness = true
      return { name: 'account-unavailable', query: { redirect: originalTarget } }
    }
    const signOutAndLogin = async () => {
      try {
        await getAuth().signOut({ scope: 'local' })
      } catch {
        // The local session is invalid regardless of sign-out response.
      }
      return loginLocation()
    }

    let isLoggedIn = false
    let userId = ''
    try {
      const { data, error } = await getAuth().getSession()
      if (error) {
        if (isTerminalAuthError(error)) return signOutAndLogin()
        return unavailableLocation()
      }
      isLoggedIn = Boolean(data.session)
    } catch (error) {
      if (isTerminalAuthError(error)) return signOutAndLogin()
      return unavailableLocation()
    }

    if (to.meta.requiresAuth && !isLoggedIn) {
      return { name: 'login', query: { redirect: safeRedirect(to.fullPath) } }
    }

    if (isLoggedIn) {
      try {
        const { data, error } = await getAuth().getUser()
        if (error || !data.user) {
          if (isTerminalAuthError(error)) {
            return signOutAndLogin()
          }

          return unavailableLocation()
        }

        userId = data.user.id
      } catch (error) {
        if (isTerminalAuthError(error)) {
          return signOutAndLogin()
        }

        return unavailableLocation()
      }
    }

    if (skipReadiness) return true

    if (to.name === 'login') {
      return isLoggedIn ? safeRedirect(to.query.redirect) : true
    }

    if (to.meta.requiresAuth && (hasAuthConfig || options.auth) && userId) {
      try {
        const profile = await getProfile(userId)

        if (!profile?.display_name?.trim()) return to.name === 'setup' ? true : { name: 'setup' }
        if (to.name === 'account-unavailable') return originalTarget
        if (to.name === 'setup') return true
      } catch {
        return unavailableLocation()
      }
    }

    return true
  })

  return router
}
