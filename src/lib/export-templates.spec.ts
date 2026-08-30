import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import {
  getExportTemplate,
  uploadExportTemplate,
  saveExportTemplateMapping,
  replaceExportTemplate,
  deleteExportTemplate,
  downloadExportTemplateFile,
  getWorkbookWorksheetNames,
  getWorkbookPreview,
  validateXlsxFileInput,
  type ExportTemplate,
} from './export-templates'
import * as supabaseModule from './supabase'

const syntheticFixturePath = new URL(
  '../test/fixtures/issue34_synthetic_timesheet_fixture.xlsx',
  import.meta.url
)

const mockSupabase = {
  from: vi.fn(),
  storage: {
    from: vi.fn(),
  },
}

vi.mock('./supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

async function createDummyXlsxBuffer(
  sheetNames = ['8月', '9月'],
  withDates: Record<string, { col: string; dates: (string | number)[] }> = {}
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const name of sheetNames) {
    const ws = wb.addWorksheet(name)
    const conf = withDates[name]
    if (conf) {
      conf.dates.forEach((d, idx) => {
        ws.getCell(`${conf.col}${idx + 1}`).value = d
      })
    } else {
      for (let day = 1; day <= 31; day++) {
        ws.getCell(`B${day}`).value = day
      }
    }
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

  it('previews the high-fidelity multi-month fixture within used-range caps', async () => {
    const bytes = new Uint8Array(await readFile(syntheticFixturePath))
    const preview = await getWorkbookPreview(bytes)

    expect(preview.worksheets).toHaveLength(14)
    expect(preview.worksheets.map((worksheet) => worksheet.name)).toContain('Aug')
    expect(preview.worksheets.map((worksheet) => worksheet.name)).toContain('_HiddenLookup')

    const hiddenLookup = preview.worksheets.find((worksheet) => worksheet.name === '_HiddenLookup')
    expect(hiddenLookup).toMatchObject({ isHidden: true, isProtected: false, hasImages: false })

    const april = preview.worksheets.find((worksheet) => worksheet.name === 'Apr')
    expect(april).toMatchObject({ isHidden: false, isProtected: true, hasImages: false })
    expect(april?.rows[2]).toMatchObject({ rowNumber: 3, isHidden: true })
    expect(april?.rows[2].cells).toContainEqual(
      expect.objectContaining({ column: 'A', text: '隱藏說明列（Synthetic）' })
    )

    const march = preview.worksheets.find((worksheet) => worksheet.name === 'Mar')
    expect(march?.columns.find((column) => column.column === 'K')).toEqual({
      column: 'K',
      isHidden: true,
    })
    expect(march?.rows[3].cells).toContainEqual(
      expect.objectContaining({ column: 'K', text: '隱藏輔助欄' })
    )

    const august = preview.worksheets.find((worksheet) => worksheet.name === 'Aug')
    expect(august).toBeDefined()
    if (!august) throw new Error('Aug worksheet missing from fixture preview')

    expect(august.columns).toHaveLength(11)
    expect(august.columns.at(-1)?.column).toBe('K')
    expect(august.rows).toHaveLength(200)
    expect(august).toMatchObject({ isHidden: false, isProtected: true, hasImages: false })
    expect(august.rows[2]).toEqual({ rowNumber: 3, isHidden: false, cells: [] })
    expect(august.rows[3].cells).toContainEqual(
      expect.objectContaining({ column: 'E', text: '出勤時數統計' })
    )
    expect(august.rows[3].cells).toContainEqual(
      expect.objectContaining({ column: 'F', text: '↖ merged E4:H4' })
    )
    expect(august.rows[5].cells).toContainEqual(
      expect.objectContaining({ column: 'B', text: 'ƒ =CHOOSE(WEEKDAY(A6,2),"一","二","三","四","五","六","日")' })
    )
    expect(august.rows[3].cells).toContainEqual({
      column: 'I',
      rowNumber: 4,
      text: '說明\n(工作內容、請假、其他)',
    })
    expect(august.rows[7].cells).toContainEqual(
      expect.objectContaining({ column: 'A', rowNumber: 8, text: expect.any(String) })
    )
    expect(august.rows[7].cells).toContainEqual(
      expect.objectContaining({ column: 'C', rowNumber: 8, text: expect.any(String) })
    )
    expect(august.rows[37].cells).toContainEqual({
      column: 'A',
      rowNumber: 38,
      text: '備註：本檔為去識別化 synthetic fixture，所有資料皆為虛構。',
    })
    expect(august.rows[199].cells).toEqual([])
    expect(august.columns.length).toBeLessThanOrEqual(50)
  })

  it('keeps empty row positions in the first 200 worksheet rows', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('出勤資料')
    worksheet.getCell('A1').value = '標題'
    worksheet.getCell('B3').value = '第三列資料'
    worksheet.getCell('C205').value = '超出預覽範圍'
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())

    const preview = await getWorkbookPreview(bytes)
    const rows = preview.worksheets[0].rows

    expect(preview.worksheets[0].columns).toEqual([
      { column: 'A', isHidden: false },
      { column: 'B', isHidden: false },
      { column: 'C', isHidden: false },
      { column: 'D', isHidden: false },
    ])
    expect(rows).toHaveLength(200)
    expect(rows[0].rowNumber).toBe(1)
    expect(rows[1]).toEqual({ rowNumber: 2, isHidden: false, cells: [] })
    expect(rows[2].rowNumber).toBe(3)
    expect(rows[199].rowNumber).toBe(200)
    expect(rows[199].cells).toEqual([])
  })

  it('caps columns at 50 without expanding for a far empty cell', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('欄位上限')
    worksheet.getCell('A1').value = '保留'
    worksheet.getCell('AY1').value = '超出欄位上限'
    worksheet.getCell('AZ1').value = ''

    const preview = await getWorkbookPreview(
      new Uint8Array(await workbook.xlsx.writeBuffer())
    )
    const result = preview.worksheets[0]

    expect(result.columns).toHaveLength(50)
    expect(result.columns.at(-1)?.column).toBe('AX')
    expect(result.rows[0].cells).toEqual([
      { column: 'A', rowNumber: 1, text: '保留' },
    ])
  })

  it('exposes worksheet, row, column, formula, merge, and image edge metadata', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Visible')
    const hiddenWorksheet = workbook.addWorksheet('Hidden')
    hiddenWorksheet.state = 'hidden'

    worksheet.getRow(2).hidden = true
    worksheet.getColumn('B').hidden = true
    worksheet.getColumn('D').hidden = true
    worksheet.getCell('A1').value = 'visible'
    worksheet.getCell('B1').value = 'hidden column'
    worksheet.getCell('A2').value = 'hidden row'
    worksheet.getCell('A3').value = { formula: '1+1', result: 2 }
    worksheet.getCell('C3').value = { formula: 'SUM(A1:A2)' }
    worksheet.getCell('D3').value = { formula: 'REF()', result: { error: '#REF!' } }
    worksheet.getCell('E3').value = { formula: '1/0', result: { error: '#DIV/0!' } }
    worksheet.getCell('F3').value = { formula: 'TEXT()', result: 'cached text' }
    worksheet.getCell('G3').value = { formula: 'TRUE()', result: true }
    worksheet.getCell('H3').value = { formula: 'TODAY()', result: new Date('2026-08-03T00:00:00.000Z') }
    worksheet.getCell('H3').numFmt = 'yyyy/mm/dd'
    worksheet.mergeCells('A4:H4')
    worksheet.getCell('A4').value = 'Merged owner'
    worksheet.getCell('Z200').value = ''

    const imageId = workbook.addImage({
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      extension: 'png',
    })
    worksheet.addImage(imageId, 'Z1:Z2')
    await worksheet.protect('secret', {})

    const preview = await getWorkbookPreview(new Uint8Array(await workbook.xlsx.writeBuffer()))
    const visible = preview.worksheets.find((sheet) => sheet.name === 'Visible')
    expect(visible).toMatchObject({ isHidden: false, isProtected: true, hasImages: true })
    expect(preview.worksheets.find((sheet) => sheet.name === 'Hidden')).toMatchObject({
      isHidden: true,
    })
    if (!visible) throw new Error('Visible worksheet missing from preview')

    expect(visible.columns).toEqual([
      { column: 'A', isHidden: false },
      { column: 'B', isHidden: true },
      { column: 'C', isHidden: false },
      { column: 'D', isHidden: true },
      { column: 'E', isHidden: false },
      { column: 'F', isHidden: false },
      { column: 'G', isHidden: false },
      { column: 'H', isHidden: false },
      { column: 'I', isHidden: false },
      { column: 'J', isHidden: false },
    ])
    expect(visible.rows).toHaveLength(200)
    expect(visible.rows.find((row) => row.rowNumber === 2)).toMatchObject({ isHidden: true })
    expect(visible.rows[0].cells).toContainEqual(
      expect.objectContaining({ column: 'B', text: 'hidden column' })
    )

    const formulaRow = visible.rows.find((row) => row.rowNumber === 3)
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'A', text: 'ƒ 2' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'C', text: 'ƒ =SUM(A1:A2)' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'D', text: 'ƒ #REF!' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'E', text: 'ƒ #DIV/0!' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'F', text: 'ƒ cached text' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'G', text: 'ƒ true' })
    )
    expect(formulaRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'H', text: 'ƒ 2026/08/03' })
    )

    const mergedRow = visible.rows.find((row) => row.rowNumber === 4)
    expect(mergedRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'A', text: 'Merged owner' })
    )
    expect(mergedRow?.cells).toContainEqual(
      expect.objectContaining({ column: 'B', text: '↖ merged A4:H4' })
    )
    expect(mergedRow?.cells.map((cell) => cell.column)).toEqual([
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
    ])
  })

  it('detects worksheet background image as hasImages in preview', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Background')
    worksheet.getCell('A1').value = 'with background'

    const imageId = workbook.addImage({
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      extension: 'png',
    })
    worksheet.addBackgroundImage(imageId)

    const preview = await getWorkbookPreview(new Uint8Array(await workbook.xlsx.writeBuffer()))
    const result = preview.worksheets.find((sheet) => sheet.name === 'Background')

    expect(result).toMatchObject({ hasImages: true })
  })

  it('falls back to formula text for an unknown object-shaped cached result', async () => {
    const sourceWorkbook = new ExcelJS.Workbook()
    const sourceWorksheet = sourceWorkbook.addWorksheet('Unknown result')
    sourceWorksheet.getCell('A1').value = { formula: 'ORIGINAL()' }
    const bytes = await sourceWorkbook.xlsx.writeBuffer()

    const xlsxPrototype = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx)
    const originalLoad = xlsxPrototype.load
    const loadSpy = vi.spyOn(xlsxPrototype, 'load').mockImplementation(async function (this: any, input: any) {
      await originalLoad.call(this, input)
      this.workbook.getWorksheet('Unknown result').getCell('A1').value = {
        formula: 'SOME_FORMULA()',
        result: { unexpected: true },
      }
    })

    try {
      const preview = await getWorkbookPreview(new Uint8Array(bytes))
      expect(preview.worksheets[0].rows[0].cells[0].text).toBe('ƒ =SOME_FORMULA()')
    } finally {
      loadSpy.mockRestore()
    }
  })

  it('formats common Excel date and time number formats for preview', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('日期時間')
    worksheet.getCell('A1').value = new Date('2026-08-03T00:00:00.000Z')
    worksheet.getCell('A1').numFmt = 'yyyy/mm/dd'
    worksheet.getCell('B1').value = new Date('1899-12-30T08:30:00.000Z')
    worksheet.getCell('B1').numFmt = 'hh:mm'
    worksheet.getCell('C1').value = new Date('2026-08-03T00:00:00.000Z')
    worksheet.getCell('C1').numFmt = 'm/d/yy'
    worksheet.getCell('D1').value = new Date('2026-08-03T00:00:00.000Z')
    worksheet.getCell('D1').numFmt = 'm/d'
    worksheet.getCell('E1').value = new Date('1899-12-30T08:30:00.000Z')
    worksheet.getCell('E1').numFmt = 'h:mm AM/PM'
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())

    const preview = await getWorkbookPreview(bytes)
    const cells = preview.worksheets[0].rows[0].cells

    expect(cells.find((cell) => cell.column === 'A')?.text).toBe('2026/08/03')
    expect(cells.find((cell) => cell.column === 'B')?.text).toBe('08:30')
    expect(cells.find((cell) => cell.column === 'C')?.text).toBe('8/3/26')
    expect(cells.find((cell) => cell.column === 'D')?.text).toBe('8/3')
    expect(cells.find((cell) => cell.column === 'E')?.text).toBe('8:30 AM')
  })

  it.each([
    ['ArrayBuffer', async (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer],
    ['Blob', async (bytes: Uint8Array) => new Blob([bytes.slice().buffer as ArrayBuffer])],
  ])('accepts %s workbook input', async (_label, toInput) => {
    const bytes = await createDummyXlsxBuffer(['8月'])
    const preview = await getWorkbookPreview(await toInput(bytes))

    expect(preview.worksheets).toHaveLength(1)
  })

  it('uses the established parse error for invalid workbook input', async () => {
    await expect(getWorkbookPreview(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      '無法解析範本檔案，請確認上傳的為有效 .xlsx 活頁簿。'
    )
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

      expect(result).toEqual({ template: updatedData, warning: null })
      expect(uploadMock).toHaveBeenCalled()
      expect(updateMock).toHaveBeenCalled()
      expect(removeMock).toHaveBeenCalledWith(['user-1/ctx-1/tpl-1/source.xlsx'])
    })

    it('reports partial-success warning when old storage file cleanup fails', async () => {
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
      const removeMock = vi.fn().mockResolvedValue({ data: null, error: new Error('Storage network timeout') })

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
      })

      expect(result.template).toEqual(updatedData)
      expect(result.warning).toContain('舊範本檔案清理失敗')
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

    it('rejects replacement if new workbook date column contains no usable dates for configured month', async () => {
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

      // In new file, dates moved to column A, column B only has non-date text
      const newFileBytes = await createDummyXlsxBuffer(['8月'], {
        '8月': { col: 'B', dates: ['Header', 'Note', 'Other'] },
      })

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
      ).rejects.toThrow('未找到任何對應月份 2026-08 的日期資料')

      expect(uploadMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
    })

    it('rejects replacement if new workbook date column contains duplicate dates for configured month', async () => {
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

      // Duplicate date 2026-08-01 in column B
      const newFileBytes = await createDummyXlsxBuffer(['8月'], {
        '8月': { col: 'B', dates: ['2026-08-01', '2026-08-01', '2026-08-03'] },
      })

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
      ).rejects.toThrow('出現重複日期「2026-08-01」')

      expect(uploadMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
    })

    it('rejects replacement if current template is missing date locator without touching storage or DB', async () => {
      const currentTemplate: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '舊範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: { '2026-08': '8月' },
        row_mapping: [
          // Missing date locator!
          { sourceField: 'actual_clock_in_at', targetColumn: 'D' },
        ],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const newFileBytes = await createDummyXlsxBuffer(['8月'])

      const uploadMock = vi.fn()
      const updateMock = vi.fn()
      const removeMock = vi.fn()
      mockSupabase.storage.from.mockReturnValue({ upload: uploadMock, remove: removeMock } as any)
      mockSupabase.from.mockReturnValue({ update: updateMock } as any)

      await expect(
        replaceExportTemplate({
          userId: 'user-1',
          currentTemplate,
          newFile: newFileBytes,
        })
      ).rejects.toThrow('Row mapping 必須包含一個 date 日期定位欄位')

      expect(uploadMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
      expect(removeMock).not.toHaveBeenCalled()
    })

    it('rejects replacement if current template has blank or invalid date locator target column', async () => {
      const currentTemplate: ExportTemplate = {
        id: 'tpl-1',
        user_id: 'user-1',
        context_id: 'ctx-1',
        name: '舊範本',
        storage_path: 'user-1/ctx-1/tpl-1/source.xlsx',
        month_worksheet_mapping: { '2026-08': '8月' },
        row_mapping: [
          // Invalid column identifier!
          { sourceField: 'date', targetColumn: '123' },
        ],
        static_cell_mapping: [],
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      }

      const newFileBytes = await createDummyXlsxBuffer(['8月'])

      const uploadMock = vi.fn()
      const updateMock = vi.fn()
      const removeMock = vi.fn()
      mockSupabase.storage.from.mockReturnValue({ upload: uploadMock, remove: removeMock } as any)
      mockSupabase.from.mockReturnValue({ update: updateMock } as any)

      await expect(
        replaceExportTemplate({
          userId: 'user-1',
          currentTemplate,
          newFile: newFileBytes,
        })
      ).rejects.toThrow('無效的欄位代號')

      expect(uploadMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
      expect(removeMock).not.toHaveBeenCalled()
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
