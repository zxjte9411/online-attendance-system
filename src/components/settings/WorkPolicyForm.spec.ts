// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkPolicyForm from './WorkPolicyForm.vue'
import type { WorkingDay } from '../../lib/settings'

const { createWorkPolicy, updateWorkPolicy, hasAttendanceRecordsForWorkPolicy } = vi.hoisted(() => ({
  createWorkPolicy: vi.fn(),
  updateWorkPolicy: vi.fn(),
  hasAttendanceRecordsForWorkPolicy: vi.fn(),
}))

vi.mock('../../lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/settings')>()),
  createWorkPolicy,
  updateWorkPolicy,
  hasAttendanceRecordsForWorkPolicy,
}))

const userId = 'user-1'
const assignmentId = 'assignment-1'
const policy = {
  id: 'policy-1',
  user_id: userId,
  assignment_id: assignmentId,
  context_id: null,
  name: '平日制度',
  standard_start_time: '09:00',
  work_minutes: 480,
  fixed_break_minutes: 60,
  early_arrival_policy: 'STANDARD_START' as const,
  clock_in_rounding_mode: 'NONE' as const,
  clock_in_rounding_minutes: null,
  clock_out_rounding_mode: 'NONE' as const,
  clock_out_rounding_minutes: null,
  working_days: ['1', '2', '3', '4', '5'] as WorkingDay[],
  effective_from: '2026-01-01',
  effective_to: '2026-06-30',
  timezone: 'Asia/Taipei',
}

describe('WorkPolicyForm.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createWorkPolicy.mockResolvedValue(policy)
    updateWorkPolicy.mockResolvedValue(policy)
  })

  it('creates a policy under the selected assignment', async () => {
    const wrapper = mount(WorkPolicyForm, {
      props: { assignmentId, policies: [] },
    })

    await wrapper.get('input[name="name"]').setValue('新制度')
    await wrapper.get('input[name="effective_from"]').setValue('2026-07-01')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(createWorkPolicy).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({ name: '新制度', effective_from: '2026-07-01' }),
    )
  })

  it('allows every policy field to be edited when unused', async () => {
    const wrapper = mount(WorkPolicyForm, {
      props: { assignmentId, policies: [policy], policy, hasAttendance: false },
    })

    expect((wrapper.get('input[name="standard_start_time"]').element as HTMLInputElement).disabled).toBe(false)
    await wrapper.get('input[name="name"]').setValue('調整後制度')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(updateWorkPolicy).toHaveBeenCalledWith(
      policy.id,
      expect.objectContaining({ name: '調整後制度', effective_from: policy.effective_from }),
    )
  })

  it('locks calculation fields when the policy is used by attendance', () => {
    const wrapper = mount(WorkPolicyForm, {
      props: { assignmentId, policies: [policy], policy, hasAttendance: true },
    })

    expect((wrapper.get('input[name="standard_start_time"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.get('input[name="work_minutes"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.get('input[name="name"]').element as HTMLInputElement).disabled).toBe(false)
    expect((wrapper.get('input[name="effective_to"]').element as HTMLInputElement).disabled).toBe(false)
    expect(wrapper.text()).toContain('已有出勤紀錄')
  })
})
