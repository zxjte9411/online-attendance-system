import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

export type AuthAdapter = Pick<
  SupabaseClient['auth'],
  'getSession' | 'getUser' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut'
>

export function createSupabaseAuth(): AuthAdapter {
  return getSupabaseClient().auth
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
