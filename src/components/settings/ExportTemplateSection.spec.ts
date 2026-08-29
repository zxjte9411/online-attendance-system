// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExportTemplateSection from './ExportTemplateSection.vue'
import * as exportTemplatesApi from '../../lib/export-templates'

vi.mock('../../lib/export-templates', () => ({
  getExportTemplate: vi.fn(),
  uploadExportTemplate: vi.fn(),
  saveExportTemplateMapping: vi.fn(),
  replaceExportTemplate: vi.fn(),
  deleteExportTemplate: vi.fn(),
  downloadExportTemplateFile: vi.fn(),
  getWorkbookWorksheetNames: vi.fn(),
}))

describe('Component: ExportTemplateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload CTA when no template exists for the context', async () => {
    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(null)

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('尚未上傳 XLSX 匯出範本')
    expect(wrapper.find('[data-test="upload-template-button"]').exists()).toBe(true)
  })

  it('renders template details and mapping configurations when template exists', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'actual_clock_in_at', targetColumn: 'D', transforms: [{ type: 'TIME_HH_MM' }] },
      ],
      static_cell_mapping: [
        { sourceField: 'year_month', targetCell: 'B2', transforms: [{ type: 'ROC_YEAR_MONTH' }] },
      ],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('公司出勤表範本')
    expect(wrapper.find('[data-test="save-mapping-button"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('月份工作表對應')
    expect(wrapper.text()).toContain('每日列欄位對應（Row Mapping）')
    expect(wrapper.text()).toContain('靜態儲存格對應（Static Cell Mapping）')
  })

  it('saves updated mapping successfully', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
    vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue({
      ...mockTemplate,
      month_worksheet_mapping: { '2026-08': '8月', '2026-09': '9月' },
    })

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    const saveForm = wrapper.find('[data-test="mapping-form"]')
    await saveForm.trigger('submit')
    await flushPromises()

    expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalled()
    expect(wrapper.text()).toContain('範本設定已儲存。')
  })
})
