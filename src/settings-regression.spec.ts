import { describe, expect, it } from 'vitest'
import { getSetupContextForStep } from './lib/setup'
import {
  getTaipeiToday,
  getWorkPolicyStatus,
  isCurrentPolicyRequest,
} from './lib/work-policy'
import type { WorkContext } from './lib/settings'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('設定回歸行為', () => {
  it('Setup 從 Work Policy 回到工作情境時保留既有 defaultContext', () => {
    const defaultContext: WorkContext = {
      id: 'context-1', user_id: 'user-1', name: '主要工作',
      company_identifier: 'company', project_identifier: 'project',
      active: true, is_default: true,
    }

    expect(getSetupContextForStep(2, defaultContext)).toBe(defaultContext)
  })

  it('Work Policy 載入以最後一次 A→B 選擇為準', async () => {
    const a = deferred<string[]>()
    const b = deferred<string[]>()
    let currentRequestToken = 0

    function loadPolicies(contextId: string, response: Promise<string[]>) {
      const requestToken = ++currentRequestToken
      return response.then((policies) => (
        isCurrentPolicyRequest(contextId, 'context-b', requestToken, currentRequestToken)
          ? policies
          : null
      ))
    }

    const policiesA = loadPolicies('context-a', a.promise)
    const policiesB = loadPolicies('context-b', b.promise)
    b.resolve(['B policy'])
    a.resolve(['A policy'])

    await expect(policiesB).resolves.toEqual(['B policy'])
    await expect(policiesA).resolves.toBeNull()
  })
})

describe('Work Policy Asia/Taipei 狀態', () => {
  const today = '2026-08-29'

  it('future finite 顯示尚未生效', () => {
    expect(getWorkPolicyStatus({ effective_from: '2026-09-01', effective_to: '2026-12-31' }, today)).toBe('尚未生效')
  })

  it('future open 顯示尚未生效', () => {
    expect(getWorkPolicyStatus({ effective_from: '2026-09-01', effective_to: null }, today)).toBe('尚未生效')
  })

  it('生效起迄日含今日且 open 都顯示目前適用', () => {
    expect(getWorkPolicyStatus({ effective_from: today, effective_to: today }, today)).toBe('目前適用')
    expect(getWorkPolicyStatus({ effective_from: '2026-01-01', effective_to: today }, today)).toBe('目前適用')
    expect(getWorkPolicyStatus({ effective_from: '2026-01-01', effective_to: null }, today)).toBe('目前適用')
  })

  it('晚於 effective_to 顯示已結束', () => {
    expect(getWorkPolicyStatus({ effective_from: '2026-01-01', effective_to: '2026-08-28' }, today)).toBe('已結束')
  })

  it('今日使用 Asia/Taipei 日期', () => {
    expect(getTaipeiToday(new Date('2026-08-28T16:30:00.000Z'))).toBe('2026-08-29')
  })
})
