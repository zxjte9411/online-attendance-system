// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExportTemplateSection from './ExportTemplateSection.vue'
import * as exportTemplatesApi from '../../lib/export-templates'
import type { WorkbookPreview } from '../../lib/export-templates'

vi.mock('../../lib/export-templates', () => ({
  getExportTemplate: vi.fn(),
  uploadExportTemplate: vi.fn(),
  saveExportTemplateMapping: vi.fn(),
  replaceExportTemplate: vi.fn(),
  deleteExportTemplate: vi.fn(),
  downloadExportTemplateFile: vi.fn(),
  getWorkbookWorksheetNames: vi.fn(),
  getWorkbookPreview: vi.fn(),
  validateXlsxFileInput: vi.fn(),
}))

function makePreviewResult(rowCount = 45): WorkbookPreview {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    rowNumber: index + 1,
    isHidden: false,
    cells: [
      {
        column: 'A',
        rowNumber: index + 1,
        text: `2026-08-${String(index + 1).padStart(2, '0')}`,
      },
      {
        column: 'B',
        rowNumber: index + 1,
        text: `出勤資料 ${index + 1}`,
      },
    ],
  }))

  return {
    worksheets: [
      {
        name: '8月',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [
          { column: 'A', isHidden: false },
          { column: 'B', isHidden: false },
        ],
        rows,
      },
      {
        name: '9月',
        isHidden: false,
        isProtected: false,
        hasImages: false,
        columns: [
          { column: 'A', isHidden: false },
          { column: 'B', isHidden: false },
        ],
        rows: [
          {
            rowNumber: 1,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 1, text: '2026-09-01' },
              { column: 'B', rowNumber: 1, text: '九月資料' },
            ],
          },
        ],
      },
    ],
  }
}

function makeEdgeCasePreviewResult(): WorkbookPreview {
  return {
    worksheets: [
      {
        name: '可見表',
        isHidden: false,
        isProtected: true,
        hasImages: true,
        columns: [
          { column: 'A', isHidden: false },
          { column: 'B', isHidden: true },
          { column: 'C', isHidden: false },
          { column: 'D', isHidden: true },
        ],
        rows: [
          {
            rowNumber: 1,
            isHidden: false,
            cells: [
              { column: 'A', rowNumber: 1, text: '日期' },
              { column: 'B', rowNumber: 1, text: '隱藏欄標題' },
              { column: 'C', rowNumber: 1, text: 'ƒ 公式結果' },
            ],
          },
          {
            rowNumber: 2,
            isHidden: true,
            cells: [
              { column: 'A', rowNumber: 2, text: '隱藏列資料' },
              { column: 'B', rowNumber: 2, text: '隱藏欄資料' },
              {
                column: 'C',
                rowNumber: 2,
                text: '↖ merged A1:C1',
              },
            ],
          },
        ],
      },
      {
        name: '隱藏表',
        isHidden: true,
        isProtected: false,
        hasImages: false,
        columns: [{ column: 'A', isHidden: false }],
        rows: [
          {
            rowNumber: 1,
            isHidden: false,
            cells: [{ column: 'A', rowNumber: 1, text: '隱藏工作表資料' }],
          },
        ],
      },
    ],
  }
}

describe('Component: ExportTemplateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue({ worksheets: [] })
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

  it('selects the mapped worksheet, loads more rows, and keeps a manual selection', async () => {
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
    const nextTemplate: exportTemplatesApi.ExportTemplate = {
      ...mockTemplate,
      id: 'tpl-2',
      context_id: 'ctx-2',
      month_worksheet_mapping: { '2026-09': '8月' },
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockImplementation(async (_userId, contextId) =>
      contextId === 'ctx-2' ? nextTemplate : mockTemplate
    )
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makePreviewResult())

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })

    await flushPromises()

    const worksheetSelect = wrapper.find('[data-test="preview-worksheet-select"]')
    expect((worksheetSelect.element as HTMLSelectElement).value).toBe('8月')
    expect(wrapper.find('caption').text()).toContain('8月')
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text())).toContain('A')
    expect(wrapper.findAll('tbody tr')).toHaveLength(20)

    await worksheetSelect.setValue('9月')
    expect((worksheetSelect.element as HTMLSelectElement).value).toBe('9月')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)

    await wrapper.find('#template-name-input').setValue('更新後的名稱')
    expect((worksheetSelect.element as HTMLSelectElement).value).toBe('9月')

    await wrapper.setProps({ contextId: 'ctx-2' })
    await flushPromises()
    expect(
      (wrapper.find('[data-test="preview-worksheet-select"]').element as HTMLSelectElement).value
    ).toBe('8月')

    await wrapper.find('[data-test="preview-worksheet-select"]').setValue('8月')
    await wrapper.find('[data-test="preview-load-more"]').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(40)
  })

  it('leaves omitted sparse columns blank instead of shifting later cell values left', async () => {
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
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue({
      worksheets: [
        {
          name: '8月',
          isHidden: false,
          isProtected: false,
          hasImages: false,
          columns: [
            { column: 'A', isHidden: false },
            { column: 'B', isHidden: false },
            { column: 'C', isHidden: false },
            { column: 'D', isHidden: false },
            { column: 'G', isHidden: false },
            { column: 'H', isHidden: false },
          ],
          rows: [
            {
              rowNumber: 1,
              isHidden: false,
              cells: [
                { column: 'A', rowNumber: 1, text: 'A 值' },
                { column: 'G', rowNumber: 1, text: 'G 值' },
                { column: 'H', rowNumber: 1, text: 'H 值' },
              ],
            },
          ],
        },
      ],
    })

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })

    await flushPromises()

    expect(wrapper.findAll('tbody tr')[0].findAll('td').map((cell) => cell.text())).toEqual([
      'A 值',
      '',
      '',
      '',
      'G 值',
      'H 值',
    ])
  })

  it('filters hidden worksheets, rows, and columns until the native preview toggles are enabled', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '可見表' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['可見表', '隱藏表'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeEdgeCasePreviewResult())

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })

    await flushPromises()

    const worksheetSelect = wrapper.find('[data-test="preview-worksheet-select"]')
    expect(worksheetSelect.findAll('option').map((option) => option.text())).toEqual(['可見表'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text())).toEqual(['列', 'A', 'C'])

    await wrapper.find('#show-hidden-worksheets').setValue(true)
    expect(worksheetSelect.findAll('option').map((option) => option.text())).toEqual(['可見表', '隱藏表'])
    await worksheetSelect.setValue('隱藏表')
    expect(wrapper.find('caption').text()).toContain('隱藏表')

    await worksheetSelect.setValue('可見表')
    await wrapper.find('#show-hidden-preview-rows-columns').setValue(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text().replace(/\s/g, ''))).toContain(
      'B（隱藏欄）'
    )
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text().replace(/\s/g, ''))).toContain(
      'D（隱藏欄）'
    )
    expect(wrapper.findAll('tbody th[scope="row"]').map((header) => header.text().replace(/\s/g, ''))).toContain(
      '2（隱藏列）'
    )
    expect(wrapper.text()).toContain('ƒ 公式結果')
    expect(wrapper.text()).toContain('↖ merged A1:C1')
  })

  it('resets hidden preview toggles when loading a different context', async () => {
    const template: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '可見表' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }
    const nextTemplate = { ...template, id: 'tpl-2', context_id: 'ctx-2' }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockImplementation(async (_userId, contextId) =>
      contextId === 'ctx-2' ? nextTemplate : template
    )
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['可見表', '隱藏表'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeEdgeCasePreviewResult())

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })
    await flushPromises()

    await wrapper.find('#show-hidden-worksheets').setValue(true)
    await wrapper.find('[data-test="preview-worksheet-select"]').setValue('隱藏表')
    await wrapper.find('[data-test="preview-worksheet-select"]').setValue('可見表')
    await wrapper.find('#show-hidden-preview-rows-columns').setValue(true)

    await wrapper.setProps({ contextId: 'ctx-2' })
    await flushPromises()

    expect((wrapper.find('#show-hidden-worksheets').element as HTMLInputElement).checked).toBe(false)
    expect(
      (wrapper.find('#show-hidden-preview-rows-columns').element as HTMLInputElement).checked
    ).toBe(false)
    expect(wrapper.find('[data-test="preview-worksheet-select"]').findAll('option').map((option) => option.text())).toEqual([
      '可見表',
    ])
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text())).toEqual(['列', 'A', 'C'])
  })

  it('shows protected and image notices without disabling mapping controls', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '可見表' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['可見表'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeEdgeCasePreviewResult())

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })

    await flushPromises()

    expect(wrapper.find('[data-test="preview-protected-notice"]').text()).toContain('此工作表受保護')
    expect(wrapper.find('[data-test="preview-images-notice"]').text()).toContain('Preview 不顯示圖片')
    expect(wrapper.find('[data-test="mapping-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="save-mapping-button"]').attributes('disabled')).toBeUndefined()
  })

  it('keeps mapping editing and save available when preview parsing fails', async () => {
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
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockRejectedValue(new Error('預覽檔案解析失敗'))
    vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

    const wrapper = mount(ExportTemplateSection, {
      props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
    })

    await flushPromises()

    expect(wrapper.find('[data-test="preview-error"]').text()).toContain('預覽檔案解析失敗')
    expect(wrapper.find('[data-test="mapping-form"]').exists()).toBe(true)

    await wrapper.find('[data-test="mapping-form"]').trigger('submit')
    await flushPromises()

    expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalled()
    expect(wrapper.text()).toContain('範本設定已儲存。')
  })

  it('preserves existing multi-stage pipeline without silent truncation on save', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        {
          sourceField: 'net_worked_minutes',
          targetColumn: 'F',
          transforms: [{ type: 'MINUTES_TO_DECIMAL_HOURS' }, { type: 'EMPTY_IF_ZERO' }],
        },
      ],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

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

    expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        rowMapping: expect.arrayContaining([
          expect.objectContaining({
            sourceField: 'net_worked_minutes',
            transforms: [{ type: 'MINUTES_TO_DECIMAL_HOURS' }, { type: 'EMPTY_IF_ZERO' }],
          }),
        ]),
      })
    )
  })

  it('saves VALUE_MAP configuration with parsed key-value map and fallback option', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        {
          sourceField: 'status',
          targetColumn: 'C',
          transforms: [
            {
              type: 'VALUE_MAP',
              options: {
                map: { WORK: '出勤', LEAVE: '請假' },
                unmappedBehavior: 'keep',
              },
            },
          ],
        },
      ],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('值映射設定')

    const saveForm = wrapper.find('[data-test="mapping-form"]')
    await saveForm.trigger('submit')
    await flushPromises()

    expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        rowMapping: expect.arrayContaining([
          expect.objectContaining({
            sourceField: 'status',
            transforms: [
              {
                type: 'VALUE_MAP',
                options: {
                  map: { WORK: '出勤', LEAVE: '請假' },
                  unmappedBehavior: 'keep',
                },
              },
            ],
          }),
        ]),
      })
    )
  })

  it('updates first VALUE_MAP stage from UI while preserving tail stages in multi-stage pipeline', async () => {
    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        {
          sourceField: 'status',
          targetColumn: 'C',
          transforms: [
            {
              type: 'VALUE_MAP',
              options: {
                map: { WORK: '出勤' },
                unmappedBehavior: 'keep',
              },
            },
            { type: 'EMPTY_IF_ZERO' },
          ],
        },
      ],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
    vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    // Edit textarea value
    const textarea = wrapper.find('textarea')
    await textarea.setValue('WORK=出勤\nLEAVE=請假')

    const saveForm = wrapper.find('[data-test="mapping-form"]')
    await saveForm.trigger('submit')
    await flushPromises()

    expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalledWith(
      expect.objectContaining({
        rowMapping: expect.arrayContaining([
          expect.objectContaining({
            sourceField: 'status',
            transforms: [
              {
                type: 'VALUE_MAP',
                options: {
                  map: { WORK: '出勤', LEAVE: '請假' },
                  unmappedBehavior: 'keep',
                },
              },
              { type: 'EMPTY_IF_ZERO' },
            ],
          }),
        ]),
      })
    )
  })

  it('resets hidden preview toggles after same-template replacement reload', async () => {
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
    vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月'])
    vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeEdgeCasePreviewResult())
    vi.mocked(exportTemplatesApi.replaceExportTemplate).mockResolvedValue({
      template: { ...mockTemplate, name: '更換後新範本' },
      warning: '舊範本檔案清理失敗：Storage timeout',
    })

    const wrapper = mount(ExportTemplateSection, {
      props: {
        userId: 'user-1',
        contextId: 'ctx-1',
        contextName: '測試情境',
      },
    })

    await flushPromises()

    await wrapper.find('#show-hidden-worksheets').setValue(true)
    await wrapper.find('#show-hidden-preview-rows-columns').setValue(true)

    // 1. Click "更換檔案" button
    const buttons = wrapper.findAll('button')
    const replaceToggleBtn = buttons.find((b) => b.text().includes('更換檔案'))
    expect(replaceToggleBtn?.exists()).toBe(true)
    await replaceToggleBtn!.trigger('click')
    await flushPromises()

    // 2. Select file
    const fileInput = wrapper.find('input[type="file"]')
    const dummyFile = new File(['fake xlsx'], 'replacement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    Object.defineProperty(fileInput.element, 'files', {
      value: [dummyFile],
      writable: false,
    })
    await fileInput.trigger('change')
    await flushPromises()

    // 3. Submit replace form
    const replaceForm = wrapper.findAll('form').find((f) => f.text().includes('確認更換'))
    expect(replaceForm?.exists()).toBe(true)
    await replaceForm!.trigger('submit')
    await flushPromises()

    // 4. Assert UI contains partial-success warning and that it was not wiped by loadTemplate()
    const statusMsg = wrapper.find('[role="status"]')
    expect(statusMsg.exists()).toBe(true)
    expect(statusMsg.text()).toContain('XLSX 範本檔案已成功更換，但舊檔案清理未完成：舊範本檔案清理失敗：Storage timeout')
    expect((wrapper.find('#show-hidden-worksheets').element as HTMLInputElement).checked).toBe(false)
    expect(
      (wrapper.find('#show-hidden-preview-rows-columns').element as HTMLInputElement).checked
    ).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.findAll('th[scope="col"]').map((header) => header.text())).toEqual(['列', 'A', 'C'])
  })

  describe('Header Reference Range and Preview Selection (Issue #37)', () => {
    function makeHeaderReferencePreviewResult(): WorkbookPreview {
      return {
        worksheets: [
          {
            name: '8月',
            isHidden: false,
            isProtected: false,
            hasImages: false,
            columns: [
              { column: 'A', isHidden: false },
              { column: 'B', isHidden: false },
              { column: 'C', isHidden: false },
              { column: 'D', isHidden: false },
              { column: 'E', isHidden: false },
              { column: 'F', isHidden: false },
            ],
            rows: [
              {
                rowNumber: 4,
                isHidden: false,
                cells: [
                  { column: 'A', rowNumber: 4, text: '員工編號' },
                  { column: 'B', rowNumber: 4, text: '  日期  ' },
                  { column: 'C', rowNumber: 4, text: '姓名' },
                  { column: 'D', rowNumber: 4, text: '出勤時數統計', headerText: '出勤時數統計' },
                  { column: 'E', rowNumber: 4, text: '↖ merged D4:E4', headerText: '出勤時數統計' },
                ],
              },
              {
                rowNumber: 5,
                isHidden: false,
                cells: [
                  { column: 'A', rowNumber: 5, text: '' },
                  { column: 'B', rowNumber: 5, text: '   ' },
                  { column: 'C', rowNumber: 5, text: '姓名' },
                  { column: 'D', rowNumber: 5, text: '工時' },
                  { column: 'E', rowNumber: 5, text: '上班' },
                ],
              },
            ],
          },
          {
            name: '9月',
            isHidden: false,
            isProtected: false,
            hasImages: false,
            columns: [
              { column: 'A', isHidden: false },
              { column: 'B', isHidden: false },
              { column: 'C', isHidden: false },
              { column: 'D', isHidden: false },
              { column: 'E', isHidden: false },
            ],
            rows: [
              {
                rowNumber: 4,
                isHidden: false,
                cells: [
                  { column: 'A', rowNumber: 4, text: '員工編號' },
                  { column: 'B', rowNumber: 4, text: '日期' },
                  { column: 'C', rowNumber: 4, text: '下班時間' },
                  { column: 'D', rowNumber: 4, text: '出勤時數統計', headerText: '出勤時數統計' },
                  { column: 'E', rowNumber: 4, text: '↖ merged D4:E4', headerText: '出勤時數統計' },
                ],
              },
            ],
          },
        ],
      }
    }

    const mockTemplate: exportTemplatesApi.ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司出勤表範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月', '2026-09': '9月' },
      row_mapping: [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'actual_clock_in_at', targetColumn: 'C' },
      ],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    it('sets header reference range, derives hierarchical labels, and populates column picker options', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      const startInput = wrapper.find('[data-test="header-range-start"]')
      const endInput = wrapper.find('[data-test="header-range-end"]')
      const applyBtn = wrapper.find('[data-test="apply-header-range-btn"]')

      await startInput.setValue(4)
      await endInput.setValue(5)
      await applyBtn.trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('已設定：Row 4–5')

      // Check derived column picker options on row mapping 0
      const select0 = wrapper.find('[data-test="row-col-select-0"]')
      const options = select0.findAll('option').map((o) => o.text())
      expect(options).toContain('A — 員工編號')
      expect(options).toContain('B — 日期')
      expect(options).toContain('C — 姓名')
      expect(options).toContain('D — 出勤時數統計 / 工時')
      expect(options).toContain('E — 出勤時數統計 / 上班')
      expect(options).toContain('F')
    })

    it('allows selecting blank column from picker and saves existing targetColumn payload', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())
      vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      // Set header range
      await wrapper.find('[data-test="header-range-start"]').setValue(4)
      await wrapper.find('[data-test="header-range-end"]').setValue(5)
      await wrapper.find('[data-test="apply-header-range-btn"]').trigger('click')
      await flushPromises()

      // Select blank column F
      const select1 = wrapper.find('[data-test="row-col-select-1"]')
      await select1.setValue('F')
      await flushPromises()

      const input1 = wrapper.find('[data-test="row-col-input-1"]')
      expect((input1.element as HTMLInputElement).value).toBe('F')

      // Save mapping
      await wrapper.find('[data-test="mapping-form"]').trigger('submit')
      await flushPromises()

      expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          rowMapping: expect.arrayContaining([
            expect.objectContaining({ sourceField: 'actual_clock_in_at', targetColumn: 'F' }),
          ]),
        })
      )
    })

    it('allows manual input of column outside preview bounds', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())
      vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      const input1 = wrapper.find('[data-test="row-col-input-1"]')
      await input1.setValue('Z')
      await flushPromises()

      await wrapper.find('[data-test="mapping-form"]').trigger('submit')
      await flushPromises()

      expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          rowMapping: expect.arrayContaining([
            expect.objectContaining({ sourceField: 'actual_clock_in_at', targetColumn: 'Z' }),
          ]),
        })
      )
    })

    it('does NOT mutate mapping when clicking preview table header outside selection mode', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      const headerE = wrapper.find('[data-test="preview-column-header-E"]')
      await headerE.trigger('click')
      await flushPromises()

      // Target columns remain unchanged
      expect((wrapper.find('[data-test="row-col-input-0"]').element as HTMLInputElement).value).toBe('B')
      expect((wrapper.find('[data-test="row-col-input-1"]').element as HTMLInputElement).value).toBe('C')
    })

    it('handles preview selection mode: activation, column click, update form, and auto-exit without persistence', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      const selectBtn1 = wrapper.find('[data-test="select-from-preview-btn-1"]')
      await selectBtn1.trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(true)
      expect(selectBtn1.attributes('aria-pressed')).toBe('true')

      // Click column E in preview table
      const headerE = wrapper.find('[data-test="preview-column-header-E"]')
      await headerE.trigger('click')
      await flushPromises()

      // Target column updated to E and selection mode exited
      expect((wrapper.find('[data-test="row-col-input-1"]').element as HTMLInputElement).value).toBe('E')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)
      expect(selectBtn1.attributes('aria-pressed')).toBe('false')
      expect(exportTemplatesApi.saveExportTemplateMapping).not.toHaveBeenCalled()
    })

    it('cancels selection mode on button toggle, explicit cancel button, or Escape key', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      // 1. Toggle off
      const selectBtn0 = wrapper.find('[data-test="select-from-preview-btn-0"]')
      await selectBtn0.trigger('click')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(true)
      await selectBtn0.trigger('click')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)

      // 2. Explicit cancel button
      await selectBtn0.trigger('click')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(true)
      await wrapper.find('[data-test="cancel-preview-selection-button"]').trigger('click')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)

      // 3. Escape keydown
      await selectBtn0.trigger('click')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(true)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)
    })

    it('supports keyboard selection with Enter and Space on preview column headers', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      // Test Enter
      await wrapper.find('[data-test="select-from-preview-btn-0"]').trigger('click')
      await wrapper.find('[data-test="preview-column-header-A"]').trigger('keydown.enter')
      await flushPromises()
      expect((wrapper.find('[data-test="row-col-input-0"]').element as HTMLInputElement).value).toBe('A')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)

      // Test Space
      await wrapper.find('[data-test="select-from-preview-btn-1"]').trigger('click')
      await wrapper.find('[data-test="preview-column-header-D"]').trigger('keydown.space')
      await flushPromises()
      expect((wrapper.find('[data-test="row-col-input-1"]').element as HTMLInputElement).value).toBe('D')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)
    })

    it('highlights target column on row focus without entering selection mode', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      const input0 = wrapper.find('[data-test="row-col-input-0"]')
      await input0.trigger('focus')
      await flushPromises()

      // Header B is highlighted
      const headerB = wrapper.find('[data-test="preview-column-header-B"]')
      expect(headerB.classes()).toContain('border-accent')
      expect(wrapper.find('[data-test="preview-selection-active-banner"]').exists()).toBe(false)
    })

    it('displays non-blocking consistency warning when mapped column headers differ between worksheets', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())
      vi.mocked(exportTemplatesApi.saveExportTemplateMapping).mockResolvedValue(mockTemplate)

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      // Set range on 8月
      await wrapper.find('[data-test="header-range-start"]').setValue(4)
      await wrapper.find('[data-test="header-range-end"]').setValue(4)
      await wrapper.find('[data-test="apply-header-range-btn"]').trigger('click')
      await flushPromises()

      // Switch to 9月
      const wsSelect = wrapper.find('[data-test="preview-worksheet-select"]')
      await wsSelect.setValue('9月')
      await wsSelect.trigger('change')
      await flushPromises()

      // Set range on 9月
      await wrapper.find('[data-test="header-range-start"]').setValue(4)
      await wrapper.find('[data-test="header-range-end"]').setValue(4)
      await wrapper.find('[data-test="apply-header-range-btn"]').trigger('click')
      await flushPromises()

      // Column C has "姓名" in 8月 and "下班時間" in 9月 -> warning shown
      const warningBanner = wrapper.find('[data-test="header-consistency-warning"]')
      expect(warningBanner.exists()).toBe(true)
      expect(warningBanner.text()).toContain('目標欄位 C')
      expect(warningBanner.text()).toContain('8月: 「姓名」')
      expect(warningBanner.text()).toContain('9月: 「下班時間」')

      // Save still works normally (non-blocking)
      await wrapper.find('[data-test="mapping-form"]').trigger('submit')
      await flushPromises()
      expect(exportTemplatesApi.saveExportTemplateMapping).toHaveBeenCalled()
    })

    it('produces no false consistency warning when reference data is insufficient', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      // Only 8月 has range set, 9月 does not
      await wrapper.find('[data-test="header-range-start"]').setValue(4)
      await wrapper.find('[data-test="header-range-end"]').setValue(4)
      await wrapper.find('[data-test="apply-header-range-btn"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="header-consistency-warning"]').exists()).toBe(false)
    })

    it('applies header range to all worksheets when confirmed on first configuration', async () => {
      vi.mocked(exportTemplatesApi.getExportTemplate).mockResolvedValue(mockTemplate)
      vi.mocked(exportTemplatesApi.downloadExportTemplateFile).mockResolvedValue(new ArrayBuffer(8))
      vi.mocked(exportTemplatesApi.getWorkbookWorksheetNames).mockResolvedValue(['8月', '9月'])
      vi.mocked(exportTemplatesApi.getWorkbookPreview).mockResolvedValue(makeHeaderReferencePreviewResult())

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      const wrapper = mount(ExportTemplateSection, {
        props: { userId: 'user-1', contextId: 'ctx-1', contextName: '測試情境' },
      })
      await flushPromises()

      await wrapper.find('[data-test="header-range-start"]').setValue(4)
      await wrapper.find('[data-test="header-range-end"]').setValue(5)
      await wrapper.find('[data-test="apply-header-range-btn"]').trigger('click')
      await flushPromises()

      expect(confirmSpy).toHaveBeenCalledWith('是否將此標題參考範圍套用到所有工作表？（後續仍可個別調整）')

      // Switch to 9月 and check range was applied
      const wsSelect = wrapper.find('[data-test="preview-worksheet-select"]')
      await wsSelect.setValue('9月')
      await wsSelect.trigger('change')
      await flushPromises()

      expect(wrapper.text()).toContain('已設定：Row 4–5')
      confirmSpy.mockRestore()
    })
  })
})
