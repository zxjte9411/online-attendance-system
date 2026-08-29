import type { WorkPolicy } from './settings'

const TAIPEI_TIME_ZONE = 'Asia/Taipei'

export type WorkPolicyStatus = '尚未生效' | '目前適用' | '已結束'

export function getTaipeiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))

  return `${values.year}-${values.month}-${values.day}`
}

export function getWorkPolicyStatus(policy: Pick<WorkPolicy, 'effective_from' | 'effective_to'>, today = getTaipeiToday()): WorkPolicyStatus {
  if (today < policy.effective_from) return '尚未生效'
  if (policy.effective_to && today > policy.effective_to) return '已結束'
  return '目前適用'
}
