export type CalendarDayType = 'WORKDAY' | 'HOLIDAY'

export type ParsedDgpaCalendarRow = {
  calendar_date: string
  day_type: CalendarDayType
  name: string | null
}

export type DgpaResource = {
  resourceId?: string
  resourceDescription: string
  resourceFormat: string
  resourceDownloadUrl: string
  resourceCharacterEncoding?: string
  resourceField?: string[] | string
  resourceQualityCheckTime?: string
  resourceModifyDate?: string
  resourceReleaseDate?: string
  [key: string]: unknown
}

export type DgpaDatasetMetadata = {
  result?: {
    distribution?: DgpaResource[]
    resources?: DgpaResource[]
    [key: string]: unknown
  }
  distribution?: DgpaResource[]
  resources?: DgpaResource[]
  [key: string]: unknown
}

const SUPPORTED_ENCODINGS = new Set(['utf-8', 'utf8', 'big5', 'big-5', 'cp950', 'windows-950'])

export function selectDgpaResource(metadata: DgpaDatasetMetadata, targetYear: number): DgpaResource {
  const rocYear = targetYear - 1911
  const rocYearRegex = new RegExp(`(?:^|[^\\d])${rocYear}年(?:[^\\d]|$)`)

  const rawResources =
    metadata.result?.distribution ??
    metadata.result?.resources ??
    metadata.distribution ??
    metadata.resources ??
    []

  if (!Array.isArray(rawResources)) {
    throw new Error(`DGPA metadata 格式錯誤或缺少 resources/distribution 陣列。`)
  }

  const candidates = rawResources.filter((res) => {
    // 1. Format must be explicitly CSV
    const format = res.resourceFormat?.trim().toLowerCase()
    if (format !== 'csv') return false

    // 2. Must not be Google Calendar resource
    const desc = res.resourceDescription ?? ''
    if (/google/i.test(desc) || /ics|ical/i.test(format)) return false

    // 3. Must match target ROC year (e.g. 115年) without false positive substring match
    if (!rocYearRegex.test(desc)) return false

    // 4. Must contain valid download URL
    if (!res.resourceDownloadUrl || typeof res.resourceDownloadUrl !== 'string' || !res.resourceDownloadUrl.trim().startsWith('http')) {
      return false
    }

    // 5. Must have supported character encoding
    const enc = (res.resourceCharacterEncoding ?? 'utf-8').trim().toLowerCase()
    if (!SUPPORTED_ENCODINGS.has(enc)) return false

    // 6. Required fields check if resourceField metadata is provided
    if (res.resourceField) {
      const requiredFields = ['西元日期', '星期', '是否放假', '備註']
      if (Array.isArray(res.resourceField)) {
        const fieldNames = res.resourceField.map((f: any) =>
          typeof f === 'object' && f !== null && f.name ? String(f.name).trim() : String(f).trim()
        )
        const fieldSet = new Set(fieldNames)
        if (!requiredFields.every((rf) => fieldSet.has(rf))) {
          return false
        }
      } else if (typeof res.resourceField === 'string') {
        if (!requiredFields.every((rf) => (res.resourceField as string).includes(rf))) {
          return false
        }
      }
    }

    return true
  })

  if (candidates.length === 0) {
    throw new Error(`找不到 ${targetYear} 年 (民國 ${rocYear} 年) 的合法 DGPA CSV 資源。`)
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  // Multiple candidates: resolve by latest timestamp
  const getTimestampMs = (res: DgpaResource): number => {
    const rawTs = res.resourceQualityCheckTime || res.resourceModifyDate || res.resourceReleaseDate
    if (!rawTs) return -1
    const ms = Date.parse(rawTs)
    return isNaN(ms) ? -1 : ms
  }

  const sorted = [...candidates].sort((a, b) => getTimestampMs(b) - getTimestampMs(a))
  const topMs = getTimestampMs(sorted[0])
  const secondMs = getTimestampMs(sorted[1])

  if (topMs === -1 || topMs === secondMs) {
    throw new Error(`無法唯一判定 ${targetYear} 年的最新 DGPA 資源版本。`)
  }

  return sorted[0]
}

export function parseCsvRecords(csvText: string): string[][] {
  const text = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText
  const records: string[][] = []
  let currentRecord: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"'
          i += 2
          continue
        } else {
          inQuotes = false
          i++
          continue
        }
      } else {
        currentField += char
        i++
        continue
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
        continue
      } else if (char === ',') {
        currentRecord.push(currentField)
        currentField = ''
        i++
        continue
      } else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++
        }
        currentRecord.push(currentField)
        currentField = ''
        if (currentRecord.some((f) => f.trim().length > 0)) {
          records.push(currentRecord)
        }
        currentRecord = []
        i++
        continue
      } else if (char === '\n') {
        currentRecord.push(currentField)
        currentField = ''
        if (currentRecord.some((f) => f.trim().length > 0)) {
          records.push(currentRecord)
        }
        currentRecord = []
        i++
        continue
      } else {
        currentField += char
        i++
        continue
      }
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField)
    if (currentRecord.some((f) => f.trim().length > 0)) {
      records.push(currentRecord)
    }
  }

  return records
}

export function parseDgpaCalendarCsv(csvText: string, targetYear: number): ParsedDgpaCalendarRow[] {
  const records = parseCsvRecords(csvText)
  if (records.length === 0) {
    throw new Error('CSV 內容為空。')
  }

  const header = records[0].map((h) => h.trim())
  const dateIdx = header.findIndex((h) => h === '西元日期')
  const holidayIdx = header.findIndex((h) => h === '是否放假')
  const noteIdx = header.findIndex((h) => h === '備註')

  if (dateIdx === -1 || holidayIdx === -1) {
    throw new Error('CSV 標頭缺失必要欄位（西元日期、是否放假）。')
  }

  const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || (targetYear % 400 === 0)
  const expectedDays = isLeap ? 366 : 365

  const dateSet = new Set<string>()
  const parsedRows: ParsedDgpaCalendarRow[] = []

  for (let r = 1; r < records.length; r++) {
    const row = records[r]
    if (row.length === 0 || row.every((c) => c.trim().length === 0)) {
      continue
    }

    const rawDate = (row[dateIdx] ?? '').trim()
    let formattedDate = ''

    if (/^\d{8}$/.test(rawDate)) {
      formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    } else if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(rawDate)) {
      const parts = rawDate.split(/[-/]/)
      formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    } else {
      throw new Error(`CSV 資料包含無效日期格式: ${rawDate}`)
    }

    // Gregorian Date validation
    const [yStr, mStr, dStr] = formattedDate.split('-')
    const y = Number(yStr)
    const m = Number(mStr)
    const d = Number(dStr)

    if (y !== targetYear) {
      throw new Error(`CSV 資料包含非 ${targetYear} 年之日期: ${formattedDate}`)
    }

    const dateObj = new Date(Date.UTC(y, m - 1, d))
    if (dateObj.getUTCFullYear() !== y || dateObj.getUTCMonth() !== m - 1 || dateObj.getUTCDate() !== d) {
      throw new Error(`CSV 資料包含無效公曆日期: ${formattedDate}`)
    }

    if (dateSet.has(formattedDate)) {
      throw new Error(`發現重複日期: ${formattedDate}`)
    }
    dateSet.add(formattedDate)

    const rawHoliday = (row[holidayIdx] ?? '').trim()
    let dayType: CalendarDayType
    if (rawHoliday === '0') {
      dayType = 'WORKDAY'
    } else if (rawHoliday === '2') {
      dayType = 'HOLIDAY'
    } else {
      throw new Error(`未知的「是否放假」代碼: ${rawHoliday} (日期: ${formattedDate})`)
    }

    const rawNote = noteIdx !== -1 ? (row[noteIdx] ?? '').trim() : ''
    const name = rawNote.length > 0 ? rawNote : null

    parsedRows.push({
      calendar_date: formattedDate,
      day_type: dayType,
      name,
    })
  }

  // Full-year validation
  if (parsedRows.length !== expectedDays || dateSet.size !== expectedDays) {
    throw new Error(`年度資料不完整，預期 ${expectedDays} 天，實際解析 ${parsedRows.length} 天。`)
  }

  // Verify consecutive days from Jan 1 to Dec 31
  const startMs = Date.UTC(targetYear, 0, 1)
  for (let i = 0; i < expectedDays; i++) {
    const cur = new Date(startMs + i * 86400000)
    const isoDate = cur.toISOString().slice(0, 10)
    if (!dateSet.has(isoDate)) {
      throw new Error(`年度資料缺失日期: ${isoDate}`)
    }
  }

  // Sort by date ascending
  parsedRows.sort((a, b) => a.calendar_date.localeCompare(b.calendar_date))

  return parsedRows
}

export function decodeDgpaBuffer(buffer: ArrayBuffer | Uint8Array, encoding: string): string {
  const normEnc = encoding.trim().toLowerCase()
  let decoderEncoding = 'utf-8'
  if (normEnc === 'big5' || normEnc === 'big-5' || normEnc === 'cp950' || normEnc === 'windows-950') {
    decoderEncoding = 'big5'
  }

  const decoder = new TextDecoder(decoderEncoding)
  let text = decoder.decode(buffer)
  if (text.startsWith('\uFEFF')) {
    text = text.slice(1)
  }
  return text
}
