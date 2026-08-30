// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SetupView from './SetupView.vue'
import { getCurrentUserId, getSetupStatus, saveProfile } from '../lib/settings'

vi.mock('../lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/settings')>()),
  getCurrentUserId: vi.fn(),
  getSetupStatus: vi.fn(),
  saveProfile: vi.fn(),
}))

const profile = {
  id: 'user-1',
  display_name: '小明',
  timezone: 'Asia/Taipei',
}

type SetupStatus = Awaited<ReturnType<typeof getSetupStatus>>

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/setup', name: 'setup', component: SetupView },
      { path: '/', name: 'today', component: { template: '<div>today</div>' } },
    ],
  })
}

async function mountSetup(status: SetupStatus = {
  profile: null,
  contexts: [],
  defaultContext: null,
  policies: [],
  complete: false,
} as SetupStatus) {
  vi.mocked(getCurrentUserId).mockResolvedValue('user-1')
  vi.mocked(getSetupStatus).mockResolvedValue(status as never)
  const router = createTestRouter()
  await router.push('/setup')
  await router.isReady()

  const wrapper = mount(SetupView, {
    global: {
      plugins: [router],
      stubs: {
        WorkContextForm: true,
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

    expect(wrapper.text()).toContain('工作情境')
    expect(router.currentRoute.value.name).toBe('setup')
    wrapper.unmount()
  })

  it('完整設定資料不會讓 Setup 自動跳離', async () => {
    const { wrapper, router } = await mountSetup({
      profile,
      contexts: [{ id: 'context-1', active: true, is_default: true, name: '主要工作' }],
      defaultContext: { id: 'context-1', active: true, is_default: true, name: '主要工作' },
      policies: [{ id: 'policy-1' }],
      complete: true,
    } as SetupStatus)

    expect(router.currentRoute.value.name).toBe('setup')
    expect(wrapper.text()).toContain('確認你的工作制度')
    wrapper.unmount()
  })
})
