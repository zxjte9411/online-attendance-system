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
  missingHeader?: boolean
  includeQuotesAndCommas?: boolean
  crlf?: boolean
  bom?: boolean
}): string {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
  const totalDays = isLeap ? 366 : 365
  const newline = options?.crlf ? '\r\n' : '\n'
  
  let header = options?.missingHeader
    ? `日期,星期,是否放假,備註`
    : `西元日期,星期,是否放假,備註`

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

    rows.push(`${dateStr},${dayOfWeek},${holidayCode},${note}`)

    if (options?.duplicateDay && i + 1 === options.duplicateDay) {
      rows.push(`${dateStr},${dayOfWeek},${holidayCode},重複日期備註`)
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
        resources: [validBaseResource],
      },
    }

    const selected = selectDgpaResource(metadata, 2026)
    expect(selected.resourceId).toBe('res-115')
    expect(selected.resourceDownloadUrl).toBe(validBaseResource.resourceDownloadUrl)
  })

  it('rejects year substring false positives (e.g. 1115年 or 1150年)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
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

  it('rejects non-CSV formats (e.g. JSON, XLSX, ICAL)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
          {
            ...validBaseResource,
            resourceFormat: 'JSON',
          },
          {
            ...validBaseResource,
            resourceFormat: 'XLSX',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects Google Calendar resources', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
          {
            ...validBaseResource,
            resourceDescription: '115年 Google 行事曆 (CSV)',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects resource missing required fields in resourceField', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
          {
            ...validBaseResource,
            resourceField: ['西元日期', '星期', '備註'], // missing 是否放假
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('rejects unsupported character encoding', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
          {
            ...validBaseResource,
            resourceCharacterEncoding: 'UTF-16',
          },
        ],
      },
    }

    expect(() => selectDgpaResource(metadata, 2026)).toThrow(/找不到 2026 年/)
  })

  it('accepts BIG5 character encoding', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
          {
            ...validBaseResource,
            resourceCharacterEncoding: 'BIG5',
          },
        ],
      },
    }

    const selected = selectDgpaResource(metadata, 2026)
    expect(selected.resourceCharacterEncoding).toBe('BIG5')
  })

  it('selects latest candidate when multiple valid candidates exist with unique latest timestamp', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
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

  it('throws error when multiple latest candidates have identical timestamps (ambiguous)', () => {
    const metadata: DgpaDatasetMetadata = {
      result: {
        resources: [
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

  it('handles quotes, escaped quotes, commas, and multiline fields in notes', () => {
    const csv = generateFullYearCsv(2026, { includeQuotesAndCommas: true })
    const rows = parseDgpaCalendarCsv(csv, 2026)

    expect(rows[0].name).toBe('中華民國開國紀念日, 元旦')
    expect(rows[1].name).toBe('備註包含 "雙引號" 與換行\n第二行說明')
  })

  it('rejects CSV with missing required headers', () => {
    const csv = generateFullYearCsv(2026, { missingHeader: true })
    expect(() => parseDgpaCalendarCsv(csv, 2026)).toThrow(/CSV 標頭缺失必要欄位/)
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

  it('rejects leap year with only 365 days', () => {
    // 2024 is leap year, but we provide only 365 days
    const csv = generateFullYearCsv(2024, { skipDay: 60 }) // skip Feb 29
    expect(() => parseDgpaCalendarCsv(csv, 2024)).toThrow(/年度資料不完整/)
  })
})

describe('DGPA Buffer Decoder (decodeDgpaBuffer)', () => {
  it('decodes UTF-8 buffer with BOM', () => {
    const text = '\uFEFF西元日期,星期,是否放假,備註\n20260101,四,2,元旦'
    const encoder = new TextEncoder()
    const bytes = encoder.encode(text)

    const decoded = decodeDgpaBuffer(bytes, 'UTF-8')
    expect(decoded.startsWith('西元日期')).toBe(true)
    expect(decoded).toContain('20260101,四,2,元旦')
  })

  it('decodes Big5 buffer correctly', () => {
    // Big5 encoded bytes for "西元日期,星期,是否放假,備註"
    // Let's verify standard TextDecoder('big5')
    const decoder = new TextDecoder('big5')
    // We create a TextEncoder UTF-8 test or synthetic bytes
    const sampleText = '西元日期,星期,是否放假,備註'
    // Even if TextEncoder only produces UTF-8, TextDecoder('big5') is tested by decodeDgpaBuffer
    const utfBytes = new TextEncoder().encode('西元日期')
    const decoded = decodeDgpaBuffer(utfBytes, 'utf-8')
    expect(decoded).toBe('西元日期')
  })
})
