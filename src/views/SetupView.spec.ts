// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SetupView from './SetupView.vue'
import WorkPolicyForm from '../components/settings/WorkPolicyForm.vue'
import { getCurrentUserId, getSetupStatus, listWorkPolicies, saveProfile } from '../lib/settings'

vi.mock('../lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/settings')>()),
  getCurrentUserId: vi.fn(),
  getSetupStatus: vi.fn(),
  listWorkPolicies: vi.fn(),
  saveProfile: vi.fn(),
}))

const profile = {
  id: 'user-1',
  display_name: '小明',
  timezone: 'Asia/Taipei',
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/setup', name: 'setup', component: SetupView },
      { path: '/', name: 'today', component: { template: '<div>today</div>' } },
    ],
  })
}

async function mountSetup(savedProfile: typeof profile | null = null, assignments: unknown[] = [], policies: unknown[] = [], loadedPolicies: unknown[] = policies) {
  vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
  vi.mocked(getSetupStatus).mockResolvedValue({
    profile: savedProfile,
    assignments: assignments as never,
    currentAssignment: (assignments[0] as never) ?? null,
    policies: policies as never,
    contexts: [],
    defaultContext: null,
    complete: Boolean(savedProfile && assignments.length && policies.length),
  })
  vi.mocked(listWorkPolicies).mockResolvedValue(loadedPolicies as never)
  const router = createTestRouter()
  await router.push('/setup')
  await router.isReady()

  const wrapper = mount(SetupView, {
    global: {
      plugins: [router],
      stubs: {
        WorkContextForm: true,
        WorkAssignmentForm: true,
        WorkPolicyForm: true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('SetupView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(saveProfile).mockResolvedValue(profile as never)
    vi.mocked(getSetupStatus).mockResolvedValue({
      profile: null,
      assignments: [],
      currentAssignment: null,
      policies: [],
      contexts: [],
      defaultContext: null,
      complete: false,
    })
    vi.mocked(listWorkPolicies).mockResolvedValue([])
  })

  it('Profile 成功後可選擇進入系統', async () => {
    const { wrapper, router } = await mountSetup()

    await wrapper.get('#profile-display-name').setValue('小明')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('進入系統')
    const enterButton = wrapper.findAll('button').find((button) => button.text() === '進入系統')
    await enterButton!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('today')
    wrapper.unmount()
  })

  it('Profile 成功後可繼續補齊設定', async () => {
    const { wrapper, router } = await mountSetup()

    await wrapper.get('#profile-display-name').setValue('小明')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const continueButton = wrapper.findAll('button').find((button) => button.text() === '繼續設定')
    await continueButton!.trigger('click')

    expect(wrapper.text()).toContain('工作派駐')
    expect(router.currentRoute.value.name).toBe('setup')
    wrapper.unmount()
  })

  it('完整設定資料不會讓 Setup 自動跳離', async () => {
    const { wrapper, router } = await mountSetup(
      profile,
      [{ id: 'assignment-1', user_id: 'user-1', staffing_employer: '雇主', client_company: '客戶', project: '專案', effective_from: '2026-01-01', effective_to: null }],
      [{ id: 'policy-1', assignment_id: 'assignment-1' }],
    )

    expect(router.currentRoute.value.name).toBe('setup')
    expect(wrapper.text()).toContain('為這筆派駐設定制度')
    wrapper.unmount()
  })

  it('always loads policies for the selected assignment instead of using setup status policies', async () => {
    const assignment = { id: 'assignment-1', user_id: 'user-1', staffing_employer: '雇主', client_company: '客戶', project: '專案', effective_from: '2026-01-01', effective_to: null }
    const { wrapper } = await mountSetup(profile, [assignment], [{ id: 'legacy-policy' }], [{ id: 'assignment-policy' }])
    const selectedPolicies = wrapper.findComponent(WorkPolicyForm).props('policies')

    expect(listWorkPolicies).toHaveBeenCalledWith('user-1', 'assignment-1')
    expect(selectedPolicies).toEqual([{ id: 'assignment-policy' }])
    wrapper.unmount()
  })
})
