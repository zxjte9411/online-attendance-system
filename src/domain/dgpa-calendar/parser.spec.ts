import { describe, expect, it } from 'vitest'
import {
  selectDgpaResource,
  parseDgpaCalendarCsv,
  decodeDgpaBuffer,
  type DgpaDatasetMetadata,
  type DgpaResource,
} from './parser'

function generateFullYearCsv(year: number, options?: {
  skipDay?: number // 1-based day to skip
  duplicateDay?: number
  foreignYearDay?: boolean
  invalidHolidayValue?: boolean
  invalidDateFormat?: boolean
  customHeader?: string
  includeQuotesAndCommas?: boolean
  crlf?: boolean
  bom?: boolean
  extraColumns?: boolean
}): string {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
  const totalDays = isLeap ? 366 : 365
  const newline = options?.crlf ? '\r\n' : '\n'
  
  let header = options?.customHeader ?? (options?.extraColumns
    ? `西元日期,星期,是否放假,備註,額外欄位1,額外欄位2`
    : `西元日期,星期,是否放假,備註`)

  const rows: string[] = [header]
  const startDate = new Date(Date.UTC(year, 0, 1))

  for (let i = 0; i < totalDays; i++) {
    if (options?.skipDay && i + 1 === options.skipDay) {
      continue
    }

    const cur = new Date(startDate.getTime() + i * 86400000)
    let y = cur.getUTCFullYear()
    if (options?.foreignYearDay && i === 10) {
      y = year - 1
    }
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cur.getUTCDate()).padStart(2, '0')
    const dateStr = options?.invalidDateFormat && i === 5 ? `${y}-99-99` : `${y}${m}${d}`
    
    const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][cur.getUTCDay()]
    const isWeekend = cur.getUTCDay() === 0 || cur.getUTCDay() === 6
    let holidayCode = (isWeekend || i === 0) ? '2' : '0'
    if (options?.invalidHolidayValue && i === 20) {
      holidayCode = '1'
    }

    let note = ''
    if (i === 0) {
      note = options?.includeQuotesAndCommas ? '"中華民國開國紀念日, 元旦"' : '中華民國開國紀念日'
    } else if (i === 1 && options?.includeQuotesAndCommas) {
      note = '"備註包含 ""雙引號"" 與換行\n第二行說明"'
    }

    const row = options?.extraColumns
      ? `${dateStr},${dayOfWeek},${holidayCode},${note},extra1,extra2`
      : `${dateStr},${dayOfWeek},${holidayCode},${note}`

    rows.push(row)

    if (options?.duplicateDay && i + 1 === options.duplicateDay) {
      rows.push(row)
    }
  }

  const content = rows.join(newline)
  return options?.bom ? `\uFEFF${content}` : content
}

describe('DGPA Metadata Resource Selector (selectDgpaResource)', () => {
  const validBaseResource: DgpaResource = {
    resourceId: 'res-115',
    resourceDescription: '115年中華民國政府行政機關辦公日曆表',
    resourceFormat: 'CSV',
    resourceDownloadUrl: 'https://data.gov.tw/dataset/14718/resource/res-115.csv',
    resourceCharacterEncoding: 'UTF-8',
    resourceField: ['西元日期', '星期', '是否放假', '備註'],
    resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
  }

  it('selects valid candidate for target ROC year (2026 -> 115)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [validBaseResource],
      },
    }

    const selected = selectDgpaResource(metadata, 2026)
    expect(selected.resourceId).toBe('res-115')
    expect(selected.resourceDownloadUrl).toBe(validBaseResource.resourceDownloadUrl)
  })

  it('rejects year substring false positives (e.g. 1115年 or 1150年)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceDescription: '1115年假想行事曆',
          },
          {
            ...validBaseResource,
            resourceDescription: '1150年未來行事曆',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年 \(民國 115 年\) 的合法 DGPA CSV 資源/)
  })

  it('rejects candidate when resourceField is completely missing', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceField: undefined,
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects resource missing one of required fields in resourceField array or string', () => {
    const metadataArray: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceField: ['西元日期', '星期', '是否放假'], // missing 備註
          },
        ],
      },
    }
    expect(() => selectDgpaResource(metadataArray, 2026)).toThrow(/找不到 2026 年/)

    const metadataString: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceField: '西元日期,星期,是否放假', // missing 備註
          },
        ],
      },
    }
    expect(() => selectDgpaResource(metadataString, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects candidate when resourceCharacterEncoding is missing', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceCharacterEncoding: undefined,
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects unsupported character encoding (e.g. UTF-16, ISO-8859-1)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceCharacterEncoding: 'UTF-16',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('accepts BIG5 character encoding variants (BIG5, BIG-5, CP950, WINDOWS-950)', () => {
    for (const enc of ['BIG5', 'big-5', 'CP950', 'windows-950']) {
      const metadata: DgpaDatasetMetadata = {
        result: {
          distribution: [
            {
              ...validBaseResource,
              resourceCharacterEncoding: enc,
            },
          ],
        },
      }
      const selected = selectDgpaResource(metadata, 2026)
      expect(selected.resourceCharacterEncoding).toBe(enc)
    }
  })

  it('selects newest candidate by resourceQualityCheckTime when multiple valid candidates exist', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceId: 'res-old',
            resourceQualityCheckTime: '2025-05-01T10:00:00+08:00',
          },
          {
            ...validBaseResource,
            resourceId: 'res-new',
            resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
          },
        ],
      },
    }

    const selected = selectDgpaResource(metadata, 2026)
    expect(selected.resourceId).toBe('res-new')
  })

  it('throws error when multiple candidates exist and one is missing resourceQualityCheckTime', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceId: 'res-1',
            resourceQualityCheckTime: undefined,
          },
          {
            ...validBaseResource,
            resourceId: 'res-2',
            resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/缺少 resourceQualityCheckTime/)
  })

  it('throws error when multiple candidates exist and quality timestamp is invalid', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceId: 'res-1',
            resourceQualityCheckTime: 'invalid-date-string',
          },
          {
            ...validBaseResource,
            resourceId: 'res-2',
            resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/無效/)
  })

  it('throws error when multiple latest candidates have identical quality timestamps (tie/ambiguous)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        distribution: [
          {
            ...validBaseResource,
            resourceId: 'res-1',
            resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
          },
          {
            ...validBaseResource,
            resourceId: 'res-2',
            resourceQualityCheckTime: '2025-06-01T10:00:00+08:00',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/無法唯一判定 2026 年的最新 DGPA 資源版本/)
  })
})

describe('DGPA CSV Parser (parseDgpaCalendarCsv)', () => {
  it('parses valid non-leap year (2025: 365 days) with UTF-8 and CRLF', () => {
    const csv = generateFullYearCsv(2025, { crlf: true, bom: true })
    const rows = parseDgpaCalendarCsv(csv, 2025)

    expect(rows).toHaveLength(365)
    expect(rows[0]).toEqual({
      calendar_date: '2025-01-01',
      day_type: 'HOLIDAY',
      name: '中華民國開國紀念日',
    })
    expect(rows[364].calendar_date).toBe('2025-12-31')
  })

  it('parses valid leap year (2024: 366 days)', () => {
    const csv = generateFullYearCsv(2024)
    const rows = parseDgpaCalendarCsv(csv, 2024)

    expect(rows).toHaveLength(366)
    const feb29 = rows.find((r) => r.calendar_date === '2024-02-29')
    expect(feb29).toBeDefined()
  })

  it('rejects CSV with missing required headers (any of date, weekday, holiday, note missing)', () => {
    // Missing 西元日期
    expect(() => parseDgpaCalendarCsv(generateFullYearCsv(2026, { customHeader: '日期,星期,是否放假,備註' }), 2026))
      .toThrow(/CSV 標頭缺失必要欄位/)

    // Missing 星期
    expect(() => parseDgpaCalendarCsv(generateFullYearCsv(2026, { customHeader: '西元日期,週別,是否放假,備註' }), 2026))
      .toThrow(/CSV 標頭缺失必要欄位/)

    // Missing 是否放假
    expect(() => parseDgpaCalendarCsv(generateFullYearCsv(2026, { customHeader: '西元日期,星期,放假,備註' }), 2026))
      .toThrow(/CSV 標頭缺失必要欄位/)

    // Missing 備註
    expect(() => parseDgpaCalendarCsv(generateFullYearCsv(2026, { customHeader: '西元日期,星期,是否放假' }), 2026))
      .toThrow(/CSV 標頭缺失必要欄位/)
  })

  it('supports column reordering as long as all required columns exist', () => {
    const isLeap = false
    const totalDays = 365
    const rows = ['備註,是否放假,星期,西元日期']
    const startDate = new Date(Date.UTC(2025, 0, 1))

    for (let i = 0; i < totalDays; i++) {
      const cur = new Date(startDate.getTime() + i * 86400000)
      const y = cur.getUTCFullYear()
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
      const d = String(cur.getUTCDate()).padStart(2, '0')
      const dateStr = `${y}${m}${d}`
      const dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][cur.getUTCDay()]
      const isWeekend = cur.getUTCDay() === 0 || cur.getUTCDay() === 6
      const holidayCode = (isWeekend || i === 0) ? '2' : '0'
      const note = i === 0 ? '元旦' : ''
      rows.push(`${note},${holidayCode},${dayOfWeek},${dateStr}`)
    }

    const parsed = parseDgpaCalendarCsv(rows.join('\n'), 2025)
    expect(parsed).toHaveLength(365)
    expect(parsed[0].calendar_date).toBe('2025-01-01')
    expect(parsed[0].day_type).toBe('HOLIDAY')
    expect(parsed[0].name).toBe('元旦')
  })

  it('accepts extra unknown columns without error', () => {
    const csv = generateFullYearCsv(2026, { extraColumns: true })
    const rows = parseDgpaCalendarCsv(csv, 2026)
    expect(rows).toHaveLength(365)
  })

  it('normalizes empty note column to null', () => {
    const csv = generateFullYearCsv(2026)
    const rows = parseDgpaCalendarCsv(csv, 2026)
    const workdayWithoutNote = rows.find((r) => r.day_type === 'WORKDAY' && r.calendar_date === '2026-01-02')
    expect(workdayWithoutNote).toBeDefined()
    expect(workdayWithoutNote?.name).toBeNull()
  })

  it('handles quotes, escaped quotes, commas, and multiline fields in notes', () => {
    const csv = generateFullYearCsv(2026, { includeQuotesAndCommas: true })
    const rows = parseDgpaCalendarCsv(csv, 2026)

    expect(rows[0].name).toBe('中華民國開國紀念日, 元旦')
    expect(rows[1].name).toBe('備註包含 "雙引號" 與換行\n第二行說明')
  })

  it('rejects CSV containing unknown holiday code', () => {
    const csv = generateFullYearCsv(2026, { invalidHolidayValue: true })
    expect(() => parseDgpaCalendarCsv(csv, 2026)).toThrow(/未知的「是否放假」代碼/)
  })

  it('rejects CSV containing foreign year date', () => {
    const csv = generateFullYearCsv(2026, { foreignYearDay: true })
    expect(() => parseDgpaCalendarCsv(csv, 2026)).toThrow(/包含非 2026 年之日期/)
  })

  it('rejects CSV containing duplicate date', () => {
    const csv = generateFullYearCsv(2026, { duplicateDay: 5 })
    expect(() => parseDgpaCalendarCsv(csv, 2026)).toThrow(/發現重複日期/)
  })

  it('rejects CSV with missing day / incomplete year (364 days)', () => {
    const csv = generateFullYearCsv(2026, { skipDay: 100 })
    expect(() => parseDgpaCalendarCsv(csv, 2026)).toThrow(/年度資料不完整/)
  })
})

describe('DGPA Buffer Decoder (decodeDgpaBuffer) with Real Big5 Fixtures', () => {
  it('decodes UTF-8 buffer with BOM', () => {
    const text = '\uFEFF西元日期,星期,是否放假,備註\n20260101,四,2,元旦'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(text)

    const decoded = decodeDgpaBuffer(bytes, 'UTF-8')
    expect(decoded.startsWith('西元日期')).toBe(true)
    expect(decoded).toContain('20260101,四,2,元旦')
  })

  it('decodes genuine Big5 byte sequences into accurate Traditional Chinese characters', () => {
    // Genuine Big5 bytes for header: "西元日期,星期,是否放假,備註\r\n"
    // and sample row: "20250101,三,2,開國紀念日"
    const big5HeaderBytes = [
      0xA6, 0xE8, // 西
      0xA4, 0xB8, // 元
      0xA4, 0xE9, // 日
      0xB4, 0xC1, // 期
      0x2C,       // ,
      0xAC, 0x50, // 星
      0xB4, 0xC1, // 期
      0x2C,       // ,
      0xAC, 0x4F, // 是
      0xA7, 0x5F, // 否
      0xA9, 0xF1, // 放
      0xB0, 0xB2, // 假
      0x2C,       // ,
      0xB3, 0xC6, // 備
      0xB5, 0xF9, // 註
      0x0D, 0x0A, // \r\n
    ]

    const big5RowBytes = [
      0x32, 0x30, 0x32, 0x35, 0x30, 0x31, 0x30, 0x31, // 20250101
      0x2C,                                           // ,
      0xA4, 0x54,                                     // 三
      0x2C,                                           // ,
      0x32,                                           // 2
      0x2C,                                           // ,
      0xB6, 0x7D,                                     // 開
      0xB0, 0xEA,                                     // 國
      0xAC, 0xF6,                                     // 紀
      0xA9, 0xC0,                                     // 念
      0xA4, 0xE9,                                     // 日
    ]

    const combinedBytes = new Uint8Array([...big5HeaderBytes, ...big5RowBytes])
    const decoded = decodeDgpaBuffer(combinedBytes, 'BIG5')

    expect(decoded).toContain('西元日期,星期,是否放假,備註')
    expect(decoded).toContain('20250101,三,2,開國紀念日')

    // Confirm that passing this to parseDgpaCalendarCsv recognises the headers and content
    // Generate a full Big5 year or verify header parse
    expect(decoded.startsWith('西元日期,星期,是否放假,備註')).toBe(true)
  })
})
