import type { WorkContext } from './settings'

export function getSetupContextForStep(step: 1 | 2 | 3, defaultContext: WorkContext | null) {
  return step === 2 ? defaultContext : null
}
