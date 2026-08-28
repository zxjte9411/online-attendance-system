import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { signInWithGoogle, signOut, type AuthAdapter } from './lib/auth'
import { createAppRouter } from './router'

function mockAuth(session: object | null = null): AuthAdapter {
  return {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: null }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  } as unknown as AuthAdapter
}

function createTestRouter(auth: AuthAdapter) {
  return createAppRouter({ auth, history: createMemoryHistory() })
}

describe('認證路由核心', () => {
  it('未登入時將既有路由導向登入，並保留完整路徑與 query', async () => {
    const router = createTestRouter(mockAuth())

    await router.push('/attendance/calendar?month=2026-08')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/attendance/calendar?month=2026-08')
  })

  it('OAuth callback 以 code 換取 session 後回到原請求', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    const router = createTestRouter(auth)

    await router.push('/auth/callback?code=oauth-code&redirect=/reports?month=2026-08')

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code')
    expect(router.currentRoute.value.fullPath).toBe('/reports?month=2026-08')
  })

  it('已登入進入登入頁時回到原請求，沒有原請求則回首頁', async () => {
    const router = createTestRouter(mockAuth({ user: { id: 'user-1' } }))

    await router.push('/login?redirect=/settings?section=account')
    expect(router.currentRoute.value.fullPath).toBe('/settings?section=account')

    await router.push('/login')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('Google 登入使用 callback URL 啟用 PKCE 流程', async () => {
    const auth = mockAuth()

    await signInWithGoogle(auth, '/leave?month=2026-08', 'http://localhost:5173')

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:5173/auth/callback?redirect=%2Fleave%3Fmonth%3D2026-08',
      },
    })
  })

  it('登出 helper await 並傳遞 Supabase Auth 的結果', async () => {
    const auth = mockAuth()

    const result = await signOut(auth)

    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(result).toEqual({ error: null })
  })
})
