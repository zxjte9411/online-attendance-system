// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsView from './SettingsView.vue'
import {
  getCurrentUserId,
  getProfile,
  hasAttendanceRecordsForWorkPolicy,
  listWorkContexts,
  listWorkPolicies,
} from '../lib/settings'
import {
  hasAttendanceRecordsForAssignment,
  listWorkAssignments,
} from '../lib/work-assignment'
import type { WorkAssignment } from '../domain/work-assignment/work-assignment'

vi.mock('../lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/settings')>()),
  getCurrentUserId: vi.fn(),
  getProfile: vi.fn(),
  listWorkContexts: vi.fn(),
  listWorkPolicies: vi.fn(),
  setDefaultWorkContext: vi.fn(),
  hasAttendanceRecordsForWorkPolicy: vi.fn(),
}))

vi.mock('../lib/work-assignment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/work-assignment')>()),
  listWorkAssignments: vi.fn(),
  createWorkAssignment: vi.fn(),
  updateWorkAssignment: vi.fn(),
  hasAttendanceRecordsForAssignment: vi.fn(),
}))

describe('SettingsView.vue with Work Assignments', () => {
  const userId = '00000000-0000-0000-0000-000000000001'

  const sampleAssignments: WorkAssignment[] = [
    {
      id: 'wa-1',
      user_id: userId,
      staffing_employer: '派遣雇主 H1',
      client_company: '派駐客戶 A',
      project: '專案 P1',
      effective_from: '2026-01-01',
      effective_to: null,
    },
    {
      id: 'wa-2',
      user_id: userId,
      staffing_employer: '派遣雇主 H2',
      client_company: '派駐客戶 B',
      project: '專案 P2',
      effective_from: '2025-01-01',
      effective_to: '2025-12-31',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentUserId).mockResolvedValue(userId)
    vi.mocked(getProfile).mockResolvedValue({
      id: userId,
      display_name: '測試人員',
      timezone: 'Asia/Taipei',
    })
    vi.mocked(listWorkAssignments).mockResolvedValue(sampleAssignments)
    vi.mocked(listWorkContexts).mockResolvedValue([])
    vi.mocked(listWorkPolicies).mockResolvedValue([])
    vi.mocked(hasAttendanceRecordsForAssignment).mockResolvedValue(false)
    vi.mocked(hasAttendanceRecordsForWorkPolicy).mockResolvedValue(false)
  })

  it('renders work assignments list with status badges and details', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('工作派駐')
    expect(wrapper.text()).toContain('派遣雇主 H1')
    expect(wrapper.text()).toContain('派駐客戶 A · 專案 P1')
    expect(wrapper.text()).toContain('目前派駐')
    expect(wrapper.text()).toContain('已結束')
  })

  it('loads policies for the selected work assignment', async () => {
    vi.mocked(listWorkPolicies).mockResolvedValue([{
      id: 'policy-1',
      name: '派駐制度',
      effective_from: '2026-01-01',
      effective_to: null,
      standard_start_time: '09:00',
      work_minutes: 480,
    }] as never)

    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    expect(listWorkPolicies).toHaveBeenCalledWith(userId, 'wa-1')
    expect(wrapper.text()).toContain('派駐制度')
  })

  it('checks policy attendance usage by policy id before editing', async () => {
    vi.mocked(listWorkPolicies).mockResolvedValue([{
      id: 'policy-1',
      name: '派駐制度',
      effective_from: '2026-01-01',
      effective_to: null,
      standard_start_time: '09:00',
      work_minutes: 480,
    }] as never)

    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    const editButton = wrapper.get('#policies').findAll('button').find((button) => button.text() === '編輯')
    await editButton!.trigger('click')
    await flushPromises()

    expect(hasAttendanceRecordsForWorkPolicy).toHaveBeenCalledWith('policy-1')
  })

  it('toggles new assignment form', async () => {
    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    const addBtn = wrapper.findAll('button').find((b) => b.text() === '新增工作派駐')
    expect(addBtn).toBeDefined()
    await addBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('生效起日')
  })

  it('fails closed when attendance lookup rejects, not opening form and displaying error', async () => {
    vi.mocked(hasAttendanceRecordsForAssignment).mockRejectedValue(new Error('網路連線逾時'))

    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '編輯')
    expect(editBtn).toBeDefined()
    await editBtn!.trigger('click')
    await flushPromises()

    // Form should NOT be open
    expect(wrapper.find('#assignment-staffing-employer').exists()).toBe(false)
    // Page error should be visible with stable domain copy
    expect(wrapper.text()).toContain('無法確認此工作派駐是否已有出勤紀錄，請稍後再試。')
  })

  it('opens assignment edit form with locked H/A/P when attendance records exist', async () => {
    vi.mocked(hasAttendanceRecordsForAssignment).mockResolvedValue(true)

    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '編輯')
    expect(editBtn).toBeDefined()
    await editBtn!.trigger('click')
    await flushPromises()

    // Form should be open
    const staffingInput = wrapper.find<HTMLInputElement>('#assignment-staffing-employer')
    expect(staffingInput.exists()).toBe(true)
    expect(staffingInput.element.disabled).toBe(true)
    expect(wrapper.text()).toContain('此工作派駐已有出勤紀錄')
  })

  it('opens assignment edit form with editable H/A/P when no attendance exists', async () => {
    vi.mocked(hasAttendanceRecordsForAssignment).mockResolvedValue(false)

    const wrapper = mount(SettingsView, {
      global: {
        stubs: {
          ProfileForm: true,
          WorkContextForm: true,
          WorkPolicyForm: true,
          ExportTemplateSection: true,
        },
      },
    })
    await flushPromises()

    const editBtn = wrapper.findAll('button').find((b) => b.text() === '編輯')
    expect(editBtn).toBeDefined()
    await editBtn!.trigger('click')
    await flushPromises()

    // Form should be open and editable
    const staffingInput = wrapper.find<HTMLInputElement>('#assignment-staffing-employer')
    expect(staffingInput.exists()).toBe(true)
    expect(staffingInput.element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('此工作派駐已有出勤紀錄')
  })
})
