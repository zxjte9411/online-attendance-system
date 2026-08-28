import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type AuthAdapter = Pick<
  SupabaseClient['auth'],
  'getSession' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut'
>

export type SignOutResult = Awaited<ReturnType<AuthAdapter['signOut']>>

export function createSupabaseAuth(): AuthAdapter {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required')
  }

  return createClient(url, anonKey, { auth: { flowType: 'pkce' } }).auth
}

export function authCallbackUrl(
  redirect: string,
  origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
) {
  const url = new URL('/auth/callback', origin)
  url.searchParams.set('redirect', redirect)
  return url.toString()
}

export function signInWithGoogle(
  auth: AuthAdapter,
  redirect = '/',
  origin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
) {
  return auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authCallbackUrl(redirect, origin) },
  })
}

export async function signOut(auth: AuthAdapter): Promise<SignOutResult> {
  return await auth.signOut()
}
