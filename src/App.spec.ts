import { createMemoryHistory } from 'vue-router'
import { AuthSessionMissingError } from '@supabase/auth-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseAuth, signInWithGoogle, type AuthAdapter } from './lib/auth'
import { safeRedirect } from './lib/redirect'
import { getProfile, getSetupStatus } from './lib/settings'
import { createAppRouter } from './router'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

vi.mock('./lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/settings')>()),
  getProfile: vi.fn(),
  getSetupStatus: vi.fn(),
}))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  vi.mocked(getProfile).mockResolvedValue({ display_name: '測試使用者' } as never)
})

function mockAuth(session: object | null = null): AuthAdapter {
  const user = session && 'user' in session ? session.user : null

  return {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: null }, error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  } as unknown as AuthAdapter
}

type ExchangeResult = Awaited<ReturnType<AuthAdapter['exchangeCodeForSession']>>

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function createTestRouter(auth: AuthAdapter) {
  return createAppRouter({ auth, history: createMemoryHistory() })
}

describe('認證路由核心', () => {
  it('未設定 Supabase 時未注入 auth 也可抵達公開路由', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const router = createAppRouter({ history: createMemoryHistory() })

    for (const path of ['/privacy', '/support', '/login']) {
      await router.push(path)
      expect(router.currentRoute.value.fullPath).toBe(path)
    }
  })

  it('未登入可抵達公開靜態頁', async () => {
    const router = createTestRouter(mockAuth())

    for (const path of ['/privacy', '/support']) {
      await router.push(path)
      expect(router.currentRoute.value.fullPath).toBe(path)
    }
  })

  it('未登入時將既有路由導向登入，並保留完整路徑與 query', async () => {
    const router = createTestRouter(mockAuth())

    await router.push('/attendance/calendar?month=2026-08')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/attendance/calendar?month=2026-08')
  })

  it('本機 session 的 user 已不存在時清除本機 session 並回登入', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: new AuthSessionMissingError(),
    })) as unknown as AuthAdapter['getUser']
    const router = createTestRouter(auth)

    await router.push('/attendance')

    expect(router.currentRoute.value.name).toBe('login')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('Auth server 暫時失敗時保留本機 session 並導向帳號狀態頁', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    auth.getUser = vi.fn(async () => ({
      data: { user: null },
      error: { code: 'network_error' },
    })) as unknown as AuthAdapter['getUser']
    const router = createTestRouter(auth)

    await router.push('/reports')

    expect(router.currentRoute.value.name).toBe('account-unavailable')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('Profile 缺失時導向設定，但不要求工作情境或制度完整', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.mocked(getProfile).mockResolvedValue(null)
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: { display_name: '已完成資料' } as never,
      contexts: [],
      defaultContext: null,
      policies: [],
      complete: true,
    })

    const router = createTestRouter(mockAuth({ user: { id: 'user-1' } }))

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('setup')
  })

  it('Profile 顯示名稱只有空白時導向設定', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.mocked(getProfile).mockResolvedValue({ display_name: '   ' } as never)

    const router = createTestRouter(mockAuth({ user: { id: 'user-1' } }))

    await router.push('/leave')

    expect(router.currentRoute.value.name).toBe('setup')
  })

  it('Profile Ready 時不因工作情境或制度未完成而阻擋受保護路由', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.mocked(getProfile).mockResolvedValue({ display_name: '  王小明  ' } as never)

    const router = createTestRouter(mockAuth({ user: { id: 'user-1' } }))

    for (const path of ['/', '/attendance', '/leave', '/reports', '/settings']) {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(path)
    }
  })

  it('Profile 讀取失敗時導向帳號狀態頁，該頁仍會驗證 session 但不重複讀 Profile', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.mocked(getProfile).mockRejectedValue(new Error('profile unavailable'))
    const auth = mockAuth({ user: { id: 'user-1' } })
    const router = createTestRouter(auth)

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('account-unavailable')
    expect(auth.getUser).toHaveBeenCalled()
    expect(getProfile).toHaveBeenCalledOnce()
  })

  it('OAuth callback 以 code 換取 session 後回到原請求', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    const exchange = deferred<ExchangeResult>()
    auth.exchangeCodeForSession = vi.fn(() => exchange.promise) as unknown as AuthAdapter['exchangeCodeForSession']
    const router = createTestRouter(auth)

    const navigation = router.push('/auth/callback?code=oauth-code&redirect=/reports?month=2026-08')
    await navigation

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('oauth-code')
    expect(router.currentRoute.value.fullPath).toBe('/auth/callback?code=oauth-code&redirect=/reports?month=2026-08')

    exchange.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null } as ExchangeResult)
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/reports?month=2026-08'))
  })

  it('OAuth callback exchange 尚未完成時離開，完成後不回到 callback 目的地', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    const exchange = deferred<ExchangeResult>()
    auth.exchangeCodeForSession = vi.fn(() => exchange.promise) as unknown as AuthAdapter['exchangeCodeForSession']
    const router = createTestRouter(auth)

    await router.push('/auth/callback?code=oauth-code&redirect=/reports?month=2026-08')
    await router.push('/privacy')

    expect(router.currentRoute.value.fullPath).toBe('/privacy')

    exchange.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null } as ExchangeResult)
    await Promise.resolve()
    await Promise.resolve()
    expect(router.currentRoute.value.fullPath).toBe('/privacy')
  })

  it('OAuth callback 沒有 code 時停留在錯誤狀態並保留安全 redirect', async () => {
    const router = createTestRouter(mockAuth())

    await router.push('/auth/callback?redirect=/reports?month=2026-08')

    expect(router.currentRoute.value.name).toBe('auth-callback')
    expect(router.currentRoute.value.query.error).toBe('oauth_callback_failed')
    expect(router.currentRoute.value.query.redirect).toBe('/reports?month=2026-08')
  })

  it('Supabase callback 回傳 error 時停留在 callback 錯誤路由', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    auth.exchangeCodeForSession = vi.fn(async () => ({
      data: { session: null },
      error: new Error('oauth denied'),
    })) as unknown as AuthAdapter['exchangeCodeForSession']
    const router = createTestRouter(auth)

    await router.push('/auth/callback?code=bad-code&redirect=/settings?section=account')

    await vi.waitFor(() => expect(router.currentRoute.value.query.error).toBe('oauth_callback_failed'))
    expect(router.currentRoute.value.name).toBe('auth-callback')
    expect(router.currentRoute.value.query.error).toBe('oauth_callback_failed')
    expect(router.currentRoute.value.query.redirect).toBe('/settings?section=account')
  })

  it('Supabase callback 拋出例外時停留在 callback 錯誤路由', async () => {
    const auth = mockAuth()
    auth.exchangeCodeForSession = vi.fn(async () => {
      throw new Error('network failure')
    }) as unknown as AuthAdapter['exchangeCodeForSession']
    const router = createTestRouter(auth)

    await router.push('/auth/callback?code=network-error&redirect=/attendance/calendar')

    await vi.waitFor(() => expect(router.currentRoute.value.query.error).toBe('oauth_callback_failed'))
    expect(router.currentRoute.value.name).toBe('auth-callback')
    expect(router.currentRoute.value.query.error).toBe('oauth_callback_failed')
  })

  it('已登入進入登入頁時回到原請求，沒有原請求則回首頁', async () => {
    const auth = mockAuth({ user: { id: 'user-1' } })
    const router = createTestRouter(auth)

    await router.push('/login?redirect=/settings?section=account')
    expect(router.currentRoute.value.fullPath).toBe('/settings?section=account')

    await router.push('/login')
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(auth.getUser).toHaveBeenCalled()
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

  it('建立 Supabase client 時停用 URL 自動交換，保留 router 手動 callback exchange', () => {
    const auth = mockAuth()
    createClient.mockReturnValue({ auth })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    createSupabaseAuth()

    expect(createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      { auth: { flowType: 'pkce', detectSessionInUrl: false } },
    )
  })

  it('safeRedirect 只接受站內絕對路徑', () => {
    expect(safeRedirect('/attendance/calendar?month=2026-08')).toBe('/attendance/calendar?month=2026-08')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example/path')).toBe('/')
  })
})
