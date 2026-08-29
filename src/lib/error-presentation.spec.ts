import { describe, expect, it, vi } from 'vitest'
import { presentErrorMessage } from './error-presentation'

describe('presentErrorMessage', () => {
  it('maps PostgREST RLS / permission denied error to friendly message', () => {
    const rawRlsError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "day_statuses"',
      details: 'Failing row contains (null, ...)',
      hint: null,
    }
    expect(presentErrorMessage(rawRlsError)).toBe('權限不足，無法執行此操作。')

    const pgrstError = {
      code: 'PGRST301',
      message: 'JWT expired',
    }
    expect(presentErrorMessage(pgrstError)).toBe('權限不足，無法執行此操作。')
  })

  it('maps unique constraint / conflict error to friendly message', () => {
    const rawConflictError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "day_statuses_user_id_work_date_key"',
      details: 'Key (user_id, work_date)=(...) already exists.',
    }
    expect(presentErrorMessage(rawConflictError)).toBe('資料發生衝突，同一日期已有重複設定。')
  })

  it('maps network / fetch errors to friendly message', () => {
    const networkError = new TypeError('Failed to fetch')
    expect(presentErrorMessage(networkError)).toBe('網路連線異常，請檢查網路連線後再試。')

    const connRefused = new Error('connect ECONNREFUSED 127.0.0.1:54321')
    expect(presentErrorMessage(connRefused)).toBe('網路連線異常，請檢查網路連線後再試。')
  })

  it('preserves clean Chinese messages', () => {
    const customError = new Error('請先登入。')
    expect(presentErrorMessage(customError)).toBe('請先登入。')
  })

  it('falls back to custom fallback message on unknown technical error', () => {
    const unknownError = new Error('syntax error at or near "SELECT"')
    expect(presentErrorMessage(unknownError, '載入失敗，請稍後再試。')).toBe('載入失敗，請稍後再試。')
  })
})
