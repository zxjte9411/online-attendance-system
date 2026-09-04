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

  it('只有 profile 時只顯示個人資料完成 badge', async () => {
    const { wrapper } = await mountSetup(profile)
    const stepButtons = wrapper.find('nav[aria-label="首次設定進度"]').findAll('button')
    await stepButtons[1].trigger('click')

    expect(stepButtons[0].text()).toContain('已完成')
    expect(stepButtons[1].text()).not.toContain('已完成')
    expect(stepButtons[2].text()).not.toContain('已完成')
    wrapper.unmount()
  })

  it('有工作派駐但沒有制度時不顯示 Work Policy 完成 badge', async () => {
    const assignment = { id: 'assignment-1', user_id: 'user-1', staffing_employer: '雇主', client_company: '客戶', project: '專案', effective_from: '2026-01-01', effective_to: null }
    const { wrapper } = await mountSetup(profile, [assignment])
    const stepButtons = wrapper.find('nav[aria-label="首次設定進度"]').findAll('button')
    await stepButtons[0].trigger('click')

    expect(stepButtons[0].text()).not.toContain('已完成')
    expect(stepButtons[1].text()).toContain('已完成')
    expect(stepButtons[2].text()).not.toContain('已完成')
    wrapper.unmount()
  })

  it('選定派駐有過去、目前或未來的合法制度時顯示完成 badge', async () => {
    const assignment = { id: 'assignment-1', user_id: 'user-1', staffing_employer: '雇主', client_company: '客戶', project: '專案', effective_from: '2026-01-01', effective_to: null }
    const policies = [
      { id: 'past-policy', assignment_id: 'assignment-1', effective_from: '2026-01-01', effective_to: '2026-03-31' },
      { id: 'current-policy', assignment_id: 'assignment-1', effective_from: '2026-04-01', effective_to: null },
      { id: 'future-policy', assignment_id: 'assignment-1', effective_from: '2027-01-01', effective_to: '2027-12-31' },
    ]

    for (const policy of policies) {
      const { wrapper } = await mountSetup(profile, [assignment], [], [policy])
      const stepButtons = wrapper.find('nav[aria-label="首次設定進度"]').findAll('button')
      await stepButtons[0].trigger('click')

      expect(stepButtons[0].text()).not.toContain('已完成')
      expect(stepButtons[1].text()).toContain('已完成')
      expect(stepButtons[2].text()).toContain('已完成')
      wrapper.unmount()
    }
  })

  it('always loads policies for the selected assignment instead of using setup status policies', async () => {
    const assignment = { id: 'assignment-1', user_id: 'user-1', staffing_employer: '雇主', client_company: '客戶', project: '專案', effective_from: '2026-01-01', effective_to: null }
    const { wrapper } = await mountSetup(profile, [assignment], [{ id: 'legacy-policy' }], [{ id: 'assignment-policy' }])
    const selectedPolicies = wrapper.findComponent(WorkPolicyForm).props('policies')

    expect(listWorkPolicies).toHaveBeenCalledWith('user-1', 'assignment-1')
    expect(selectedPolicies).toEqual([{ id: 'assignment-policy' }])
    wrapper.unmount()
  })

  it('切換工作派駐時不會沿用前一筆 Work Policy', async () => {
    const assignmentA = { id: 'assignment-a', user_id: 'user-1', staffing_employer: '雇主 A', client_company: '客戶 A', project: '專案 A', effective_from: '2026-01-01', effective_to: null }
    const assignmentB = { id: 'assignment-b', user_id: 'user-1', staffing_employer: '雇主 B', client_company: '客戶 B', project: '專案 B', effective_from: '2026-01-01', effective_to: null }
    const { wrapper } = await mountSetup(
      profile,
      [assignmentA, assignmentB],
      [],
      [{ id: 'policy-a', assignment_id: 'assignment-a' }],
    )

    const stepButtons = wrapper.find('nav[aria-label="首次設定進度"]').findAll('button')
    await stepButtons[1].trigger('click')
    await wrapper.get('#setup-assignment').setValue('assignment-b')

    expect(stepButtons[2].text()).not.toContain('已完成')

    await stepButtons[2].trigger('click')
    const policyForm = wrapper.findComponent(WorkPolicyForm)
    expect(policyForm.props('assignmentId')).toBe('assignment-b')
    expect(policyForm.props('policies')).toEqual([])
    wrapper.unmount()
  })

  it('切換派駐後會忽略舊的 pending Work Policy 回應', async () => {
    const assignmentA = { id: 'assignment-a', user_id: 'user-1', staffing_employer: '雇主 A', client_company: '客戶 A', project: '專案 A', effective_from: '2026-01-01', effective_to: null }
    const assignmentB = { id: 'assignment-b', user_id: 'user-1', staffing_employer: '雇主 B', client_company: '客戶 B', project: '專案 B', effective_from: '2026-01-01', effective_to: null }
    const { wrapper } = await mountSetup(
      profile,
      [assignmentA, assignmentB],
      [],
      [{ id: 'policy-a', assignment_id: 'assignment-a' }],
    )
    let resolveA!: (policies: unknown[]) => void
    vi.mocked(listWorkPolicies).mockReturnValue(new Promise((resolve) => {
      resolveA = resolve
    }) as never)

    const stepButtons = wrapper.find('nav[aria-label="首次設定進度"]').findAll('button')
    await stepButtons[1].trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '使用這個工作派駐')!.trigger('click')
    await wrapper.get('#setup-assignment').setValue('assignment-b')
    resolveA([{ id: 'policy-a', assignment_id: 'assignment-a' }])
    await flushPromises()

    await stepButtons[2].trigger('click')
    expect(wrapper.text()).not.toContain('正在載入這筆派駐的 Work Policy')
    const policyForm = wrapper.findComponent(WorkPolicyForm)
    expect(policyForm.props('assignmentId')).toBe('assignment-b')
    expect(policyForm.props('policies')).toEqual([])
    wrapper.unmount()
  })
})
