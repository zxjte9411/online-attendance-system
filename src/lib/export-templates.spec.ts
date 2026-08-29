import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import {
  getExportTemplate,
  uploadExportTemplate,
  saveExportTemplateMapping,
  replaceExportTemplate,
  deleteExportTemplate,
  downloadExportTemplateFile,
  getWorkbookWorksheetNames,
  validateXlsxFileInput,
  type ExportTemplate,
} from './export-templates'
import * as supabaseModule from './supabase'

const mockSupabase = {
  from: vi.fn(),
  storage: {
    from: vi.fn(),
  },
}

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

async function createDummyXlsxBuffer(sheetNames = ['8月', '9月']): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const name of sheetNames) {
    wb.addWorksheet(name)
  }
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf)
}

describe('Lib: Export Templates Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabaseModule.getSupabaseClient).mockReturnValue(mockSupabase as any)
  })

  describe('File validation', () => {
    it('rejects files with non-.xlsx extension or invalid MIME', () => {
      const csvFile = new File(['1,2,3'], 'report.csv', { type: 'text/csv' })
      expect(() => validateXlsxFileInput(csvFile)).toThrow('僅支援 .xlsx 格式')

      const xlsFile = new File(['binary'], 'report.xls', { type: 'application/vnd.ms-excel' })
      expect(() => validateXlsxFileInput(xlsFile)).toThrow('僅支援 .xlsx 格式')

      const xlsmFile = new File(['binary'], 'macro.xlsm', {
        type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      })
      expect(() => validateXlsxFileInput(xlsmFile)).toThrow('僅支援 .xlsx 格式')

      const validFile = new File(['binary'], 'template.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      expect(() => validateXlsxFileInput(validFile)).not.toThrow()
    })
  })

  it('getExportTemplate queries database by user_id and context_id', async () => {
    const mockData: ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '2026 範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    const maybeSingleMock = vi.fn().mockResolvedValue({ data: mockData, error: null })
    const eqContextMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
    const eqUserMock = vi.fn().mockReturnValue({ eq: eqContextMock })
    const selectMock = vi.fn().mockReturnValue({ eq: eqUserMock })

    mockSupabase.from.mockReturnValue({
      select: selectMock,
    } as any)

    const result = await getExportTemplate('user-1', 'ctx-1')
    expect(result).toEqual(mockData)
    expect(mockSupabase.from).toHaveBeenCalledWith('export_templates')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqContextMock).toHaveBeenCalledWith('context_id', 'ctx-1')
  })

  it('getWorkbookWorksheetNames extracts sheet names from buffer', async () => {
    const buffer = await createDummyXlsxBuffer(['10月', '11月', '12月'])
    const sheetNames = await getWorkbookWorksheetNames(buffer)
    expect(sheetNames).toEqual(['10月', '11月', '12月'])
  })

  it('uploadExportTemplate validates file, uploads to Storage, and inserts DB metadata', async () => {
    const fileBytes = await createDummyXlsxBuffer(['8月'])

    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'path' }, error: null })
    mockSupabase.storage.from.mockReturnValue({
      upload: uploadMock,
    } as any)

    const insertedData: ExportTemplate = {
      id: 'new-id',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '公司範本',
      storage_path: 'user-1/ctx-1/new-id/source.xlsx',
      month_worksheet_mapping: {},
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    }

    const singleMock = vi.fn().mockResolvedValue({ data: insertedData, error: null })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const insertMock = vi.fn().mockReturnValue({ select: selectMock })

    mockSupabase.from.mockReturnValue({
      insert: insertMock,
    } as any)

    const result = await uploadExportTemplate({
      userId: 'user-1',
      contextId: 'ctx-1',
      name: '公司範本',
      file: fileBytes,
    })

    expect(result).toEqual(insertedData)
    expect(mockSupabase.storage.from).toHaveBeenCalledWith('export-templates')
    expect(uploadMock).toHaveBeenCalled()
    expect(mockSupabase.from).toHaveBeenCalledWith('export_templates')
    expect(insertMock).toHaveBeenCalled()
  })

  it('uploadExportTemplate rejects invalid workbook file', async () => {
    const corruptFile = new Uint8Array([1, 2, 3])

    await expect(
      uploadExportTemplate({
        userId: 'user-1',
        contextId: 'ctx-1',
        name: '壞檔案',
        file: corruptFile,
      })
    ).rejects.toThrow('無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。')
  })

  it('saveExportTemplateMapping updates metadata after validation', async () => {
    const updatedData: ExportTemplate = {
      id: 'tpl-1',
      user_id: 'user-1',
      context_id: 'ctx-1',
      name: '更新範本',
      storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [{ sourceField: 'year_month', targetCell: 'B2' }],
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
    }

    const singleMock = vi.fn().mockResolvedValue({ data: updatedData, error: null })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const eqIdMock = vi.fn().mockReturnValue({ select: selectMock })
    const eqUserMock = vi.fn().mockReturnValue({ eq: eqIdMock })
    const updateMock = vi.fn().mockReturnValue({ eq: eqUserMock })

    mockSupabase.from.mockReturnValue({
      update: updateMock,
    } as any)

    const result = await saveExportTemplateMapping({
      userId: 'user-1',
      templateId: 'tpl-1',
      name: '更新範本',
      monthWorksheetMapping: { '2026-08': '8月' },
      rowMapping: [{ sourceField: 'date', targetColumn: 'B' }],
      staticCellMapping: [{ sourceField: 'year_month', targetCell: 'B2' }],
    })

    expect(result).toEqual(updatedData)
    expect(updateMock).toHaveBeenCalledWith({
      name: '更新範本',
      month_worksheet_mapping: { '2026-08': '8月' },
      row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
      static_cell_mapping: [{ sourceField: 'year_month', targetCell: 'B2' }],
    })
  })

  describe('replaceExportTemplate', () => {
    it('uploads new file, updates DB, then removes old file on successful replacement', async () => {
      const currentTemplate: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '舊範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: { '2026-08': '8月' },
        row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const newFileBytes = await createDummyXlsxBuffer(['8月', '9月'])

      const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'new-path' }, error: null })
      const removeMock = vi.fn().mockResolvedValue({ data: [], error: null })

      mockSupabase.storage.from.mockReturnValue({
        upload: uploadMock,
        remove: removeMock,
      } as any)

      const updatedData = { ...currentTemplate, name: '新範本' }
      const singleMock = vi.fn().mockResolvedValue({ data: updatedData, error: null })
      const selectMock = vi.fn().mockReturnValue({ single: singleMock })
      const eqIdMock = vi.fn().mockReturnValue({ select: selectMock })
      const eqUserMock = vi.fn().mockReturnValue({ eq: eqIdMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUserMock })

      mockSupabase.from.mockReturnValue({
        update: updateMock,
      } as any)

      const result = await replaceExportTemplate({
        userId: 'user-1',
        currentTemplate,
        newFile: newFileBytes,
        newName: '新範本',
      })

      expect(result).toEqual(updatedData)
      expect(uploadMock).toHaveBeenCalled()
      expect(updateMock).toHaveBeenCalled()
      expect(removeMock).toHaveBeenCalledWith(['user-1/ctx-1/tpl-1/source.xlsx'])
    })

    it('rejects replacement if new workbook is missing configured month worksheets without touching storage or DB', async () => {
      const currentTemplate: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '舊範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: { '2026-08': '8月', '2026-09': '9月' },
        row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      // New file only has 8月, missing 9月!
      const newFileBytes = await createDummyXlsxBuffer(['8月'])

      const uploadMock = vi.fn()
      const updateMock = vi.fn()
      mockSupabase.storage.from.mockReturnValue({ upload: uploadMock } as any)
      mockSupabase.from.mockReturnValue({ update: updateMock } as any)

      await expect(
        replaceExportTemplate({
          userId: 'user-1',
          currentTemplate,
          newFile: newFileBytes,
        })
      ).rejects.toThrow('新範本檔案缺少目前已設定的月份工作表「9月」')

      expect(uploadMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
    })

    it('performs best-effort cleanup on new file if DB update fails and preserves old template', async () => {
      const currentTemplate: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '舊範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: { '2026-08': '8月' },
        row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const newFileBytes = await createDummyXlsxBuffer(['8月'])

      const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'new-path' }, error: null })
      const removeMock = vi.fn().mockResolvedValue({ data: [], error: null })

      mockSupabase.storage.from.mockReturnValue({
        upload: uploadMock,
        remove: removeMock,
      } as any)

      // DB update fails
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: new Error('DB connection timeout') })
      const selectMock = vi.fn().mockReturnValue({ single: singleMock })
      const eqIdMock = vi.fn().mockReturnValue({ select: selectMock })
      const eqUserMock = vi.fn().mockReturnValue({ eq: eqIdMock })
      const updateMock = vi.fn().mockReturnValue({ eq: eqUserMock })

      mockSupabase.from.mockReturnValue({
        update: updateMock,
      } as any)

      await expect(
        replaceExportTemplate({
          userId: 'user-1',
          currentTemplate,
          newFile: newFileBytes,
        })
      ).rejects.toThrow('DB connection timeout')

      // Verifies newly uploaded file was cleaned up and old file was not removed
      expect(removeMock).toHaveBeenCalledTimes(1)
      expect(removeMock).not.toHaveBeenCalledWith(['user-1/ctx-1/tpl-1/source.xlsx'])
    })
  })

  describe('deleteExportTemplate', () => {
    it('deletes DB metadata and Storage file on success', async () => {
      const template: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: {},
        row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const eqIdMock = vi.fn().mockResolvedValue({ error: null })
      const eqUserMock = vi.fn().mockReturnValue({ eq: eqIdMock })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqUserMock })

      mockSupabase.from.mockReturnValue({
        delete: deleteMock,
      } as any)

      const removeMock = vi.fn().mockResolvedValue({ data: [], error: null })
      mockSupabase.storage.from.mockReturnValue({
        remove: removeMock,
      } as any)

      await deleteExportTemplate('user-1', template)

      expect(deleteMock).toHaveBeenCalled()
      expect(removeMock).toHaveBeenCalledWith(['user-1/ctx-1/tpl-1/source.xlsx'])
    })

    it('throws error when storage file cleanup fails and does not report clean success', async () => {
      const template: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: {},
        row_mapping: [{ sourceField: 'date', targetColumn: 'B' }],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const eqIdMock = vi.fn().mockResolvedValue({ error: null })
      const eqUserMock = vi.fn().mockReturnValue({ eq: eqIdMock })
      const deleteMock = vi.fn().mockReturnValue({ eq: eqUserMock })

      mockSupabase.from.mockReturnValue({
        delete: deleteMock,
      } as any)

      const removeMock = vi.fn().mockResolvedValue({ data: null, error: new Error('Storage bucket unavailable') })
      mockSupabase.storage.from.mockReturnValue({
        remove: removeMock,
      } as any)

      await expect(deleteExportTemplate('user-1', template)).rejects.toThrow(
        '儲存庫檔案清理失敗'
      )
    })
  })

  it('downloadExportTemplateFile downloads ArrayBuffer from storage', async () => {
    const mockBlob = new Blob(['test content'])
    const downloadMock = vi.fn().mockResolvedValue({ data: mockBlob, error: null })
    mockSupabase.storage.from.mockReturnValue({
      download: downloadMock,
    } as any)

    const buffer = await downloadExportTemplateFile('some/path/source.xlsx')
    expect(buffer).toBeDefined()
    expect(downloadMock).toHaveBeenCalledWith('some/path/source.xlsx')
  })
})
