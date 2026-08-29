export type SupabaseLikeError = {
  message?: string
  code?: string | number
  details?: string | null
  hint?: string | null
  status?: number
}

/**
 * Maps raw database, Supabase/PostgREST, and network errors to friendly Traditional Chinese (Taiwan) messages.
 */
export function presentErrorMessage(error: unknown, fallbackMessage = '操作失敗，請稍後再試。'): string {
  if (!error) return fallbackMessage

  // Log raw technical details to console for debugging
  console.error('[Error Details]', error)

  const errObj = typeof error === 'object' && error !== null ? (error as SupabaseLikeError) : {}
  const rawCode = errObj.code ? String(errObj.code) : ''
  const status = errObj.status
  const rawMessage = typeof error === 'string' ? error : (errObj.message || (error instanceof Error ? error.message : ''))
  const lowerMsg = rawMessage.toLowerCase()

  // 1. RLS / Permission Denied
  if (
    rawCode === '42501' ||
    rawCode === 'PGRST301' ||
    status === 401 ||
    status === 403 ||
    lowerMsg.includes('row-level security') ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('insufficient_privilege') ||
    lowerMsg.includes('not authorized')
  ) {
    return '權限不足，無法執行此操作。'
  }

  // 2. Unique Constraint / Duplicate / Conflict
  if (
    rawCode === '23505' ||
    rawCode === '409' ||
    status === 409 ||
    lowerMsg.includes('unique constraint') ||
    lowerMsg.includes('duplicate key') ||
    lowerMsg.includes('already exists') ||
    lowerMsg.includes('conflict')
  ) {
    return '資料發生衝突，同一日期已有重複設定。'
  }

  // 3. Network / Connection / Timeout
  if (
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('network error') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('connection refused') ||
    lowerMsg.includes('econnrefused')
  ) {
    return '網路連線異常，請檢查網路連線後再試。'
  }

  // 4. Clean user-facing custom error (e.g. '請先登入。')
  if (rawMessage && !lowerMsg.includes('error') && !lowerMsg.includes('violates') && !lowerMsg.includes('constraint') && !lowerMsg.includes('null') && !lowerMsg.includes('undefined')) {
    if (/[\u4e00-\u9fa5]/.test(rawMessage)) {
      return rawMessage
    }
  }

  return fallbackMessage
}
