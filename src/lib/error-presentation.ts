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

  // 4. Custom business / RPC errors or clean Chinese messages
  if (rawMessage) {
    if (lowerMsg.includes('no_assignment') || lowerMsg.includes('missing_policy')) {
      return normalizeTerminology(rawMessage)
    }

    if (!lowerMsg.includes('error') && !lowerMsg.includes('violates') && !lowerMsg.includes('constraint') && !lowerMsg.includes('null') && !lowerMsg.includes('undefined')) {
      if (/[\u4e00-\u9fa5]/.test(rawMessage)) {
        return normalizeTerminology(rawMessage)
      }
    }
  }

  return fallbackMessage
}

export function normalizeTerminology(message: string): string {
  return message
    .replace(/(?<=[\u4e00-\u9fa5])\s*Work Assignment\b/g, '工作派駐')
    .replace(/\bWork Assignment\b/g, '工作派駐')
    .replace(/(?<=[\u4e00-\u9fa5])\s*Work Policy\b/g, '工作制度')
    .replace(/\bWork Policy\b/g, '工作制度')
}
