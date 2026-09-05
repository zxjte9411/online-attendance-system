import { describe, expect, it } from 'vitest'
import { getTaipeiToday, getWorkPolicyStatus } from './lib/work-policy'

describe('工作制度 Asia/Taipei 狀態', () => {
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
