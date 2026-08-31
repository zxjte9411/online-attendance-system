// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkAssignmentForm from './WorkAssignmentForm.vue'
import {
  createWorkAssignment,
  updateWorkAssignment,
} from '../../lib/work-assignment'
import type { WorkAssignment } from '../../domain/work-assignment/work-assignment'

vi.mock('../../lib/work-assignment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/work-assignment')>()),
  createWorkAssignment: vi.fn(),
  updateWorkAssignment: vi.fn(),
}))

describe('WorkAssignmentForm.vue', () => {
  const userId = '00000000-0000-0000-0000-000000000001'

  const sampleAssignment: WorkAssignment = {
    id: 'wa-1',
    user_id: userId,
    staffing_employer: '派遣雇主 A',
    client_company: '派駐客戶 B',
    project: '專案 C',
    effective_from: '2026-01-01',
    effective_to: '2026-06-30',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all form fields for creating a new assignment', () => {
    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: null,
        existingAssignments: [],
        hasAttendance: false,
      },
    })

    expect(wrapper.find('input[name="staffing_employer"]').exists()).toBe(true)
    expect(wrapper.find('input[name="client_company"]').exists()).toBe(true)
    expect(wrapper.find('input[name="project"]').exists()).toBe(true)
    expect(wrapper.find('input[name="effective_from"]').exists()).toBe(true)
    expect(wrapper.find('input[name="effective_to"]').exists()).toBe(true)
  })

  it('validates empty required fields and shows error', async () => {
    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: null,
        existingAssignments: [],
        hasAttendance: false,
      },
    })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const error = wrapper.find('[role="alert"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('請填寫派遣雇主、派駐客戶與專案名稱。')
    expect(createWorkAssignment).not.toHaveBeenCalled()
  })

  it('submits valid new assignment and emits saved', async () => {
    vi.mocked(createWorkAssignment).mockResolvedValue({
      assignments: [sampleAssignment],
      createdAssignment: sampleAssignment,
    })

    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: null,
        existingAssignments: [],
        hasAttendance: false,
      },
    })

    await wrapper.find('input[name="staffing_employer"]').setValue('派遣雇主 A')
    await wrapper.find('input[name="client_company"]').setValue('派駐客戶 B')
    await wrapper.find('input[name="project"]').setValue('專案 C')
    await wrapper.find('input[name="effective_from"]').setValue('2026-01-01')
    await wrapper.find('input[name="effective_to"]').setValue('2026-06-30')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(createWorkAssignment).toHaveBeenCalledWith(userId, {
      staffing_employer: '派遣雇主 A',
      client_company: '派駐客戶 B',
      project: '專案 C',
      effective_from: '2026-01-01',
      effective_to: '2026-06-30',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(wrapper.emitted('saved')![0][0]).toEqual([sampleAssignment])
  })

  it('disables identity fields when editing an assignment with attendance records', () => {
    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: sampleAssignment,
        existingAssignments: [sampleAssignment],
        hasAttendance: true,
      },
    })

    expect((wrapper.find('input[name="staffing_employer"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.find('input[name="client_company"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.find('input[name="project"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.find('input[name="effective_from"]').element as HTMLInputElement).disabled).toBe(false)
    expect((wrapper.find('input[name="effective_to"]').element as HTMLInputElement).disabled).toBe(false)
    expect(wrapper.text()).toContain('已有出勤紀錄')
  })

  it('allows editing all fields when editing an assignment without attendance', async () => {
    vi.mocked(updateWorkAssignment).mockResolvedValue([
      {
        ...sampleAssignment,
        staffing_employer: '新雇主',
      },
    ])

    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: sampleAssignment,
        existingAssignments: [sampleAssignment],
        hasAttendance: false,
      },
    })

    expect((wrapper.find('input[name="staffing_employer"]').element as HTMLInputElement).disabled).toBe(false)

    await wrapper.find('input[name="staffing_employer"]').setValue('新雇主')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(updateWorkAssignment).toHaveBeenCalledWith(userId, 'wa-1', {
      staffing_employer: '新雇主',
      client_company: '派駐客戶 B',
      project: '專案 C',
      effective_from: '2026-01-01',
      effective_to: '2026-06-30',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('shows error when assignment period overlaps with another assignment', async () => {
    const otherAssignment: WorkAssignment = {
      id: 'wa-2',
      user_id: userId,
      staffing_employer: '其他雇主',
      client_company: '其他客戶',
      project: '其他專案',
      effective_from: '2026-07-01',
      effective_to: '2026-12-31',
    }

    const wrapper = mount(WorkAssignmentForm, {
      props: {
        userId,
        assignment: null,
        existingAssignments: [otherAssignment],
        hasAttendance: false,
      },
    })

    await wrapper.find('input[name="staffing_employer"]').setValue('新雇主')
    await wrapper.find('input[name="client_company"]').setValue('新客戶')
    await wrapper.find('input[name="project"]').setValue('新專案')
    await wrapper.find('input[name="effective_from"]').setValue('2026-08-01')
    await wrapper.find('input[name="effective_to"]').setValue('2027-01-31')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    const error = wrapper.find('[role="alert"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('派駐期間不可與其他工作派駐重疊。')
  })
})
