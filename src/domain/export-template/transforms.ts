export const ALLOWED_TRANSFORMS = [
  'MINUTES_TO_DECIMAL_HOURS',
  'TIME_HH_MM',
  'DATE_YYYY_MM_DD',
  'WEEKDAY_ZH_TW',
  'ROC_YEAR_MONTH',
  'EMPTY_IF_ZERO',
  'ZERO_IF_EMPTY',
  'VALUE_MAP',
] as const

export type TransformType = (typeof ALLOWED_TRANSFORMS)[number]

export interface ValueMapOptions {
  map: Record<string, string>
  unmappedBehavior?: 'keep' | 'empty' | 'error'
}

export interface RocYearMonthOptions {
  format?: 'CHINESE' | 'SLASH' | 'COMPACT_ZH'
}

export interface TransformConfig {
  type: TransformType
  options?: ValueMapOptions | RocYearMonthOptions | Record<string, unknown>
}

const WEEKDAY_NAMES_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

export function applyTransform(value: unknown, config: TransformConfig): unknown {
  if (!ALLOWED_TRANSFORMS.includes(config.type)) {
    throw new Error(`TRANSFORM_INVALID: Unsupported transform type "${config.type}"`)
  }

  switch (config.type) {
    case 'MINUTES_TO_DECIMAL_HOURS': {
      if (value === null || value === undefined || value === '') return null
      const num = Number(value)
      if (Number.isNaN(num)) {
        throw new Error(`TRANSFORM_INVALID: Value "${value}" cannot be converted to number`)
      }
      return num / 60
    }

    case 'TIME_HH_MM': {
      if (value === null || value === undefined || value === '') return null
      let date: Date
      if (value instanceof Date) {
        date = value
      } else if (typeof value === 'string') {
        date = new Date(value)
      } else {
        throw new Error(`TRANSFORM_INVALID: Value cannot be converted to time`)
      }
      if (Number.isNaN(date.getTime())) {
        throw new Error(`TRANSFORM_INVALID: Invalid date string "${value}"`)
      }
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date)
    }

    case 'DATE_YYYY_MM_DD': {
      if (value === null || value === undefined || value === '') return null
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value
      }
      let date: Date
      if (value instanceof Date) {
        date = value
      } else if (typeof value === 'string') {
        date = new Date(value)
      } else {
        throw new Error(`TRANSFORM_INVALID: Value cannot be converted to date`)
      }
      if (Number.isNaN(date.getTime())) {
        throw new Error(`TRANSFORM_INVALID: Invalid date "${value}"`)
      }
      const formatter = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const parts = formatter.formatToParts(date)
      const year = parts.find((p) => p.type === 'year')?.value
      const month = parts.find((p) => p.type === 'month')?.value
      const day = parts.find((p) => p.type === 'day')?.value
      return `${year}-${month}-${day}`
    }

    case 'WEEKDAY_ZH_TW': {
      if (value === null || value === undefined || value === '') return null
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
        return WEEKDAY_NAMES_ZH[value]
      }
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number)
        const date = new Date(Date.UTC(y, m - 1, d))
        return WEEKDAY_NAMES_ZH[date.getUTCDay()]
      }
      if (typeof value === 'string' && WEEKDAY_NAMES_ZH.includes(value)) {
        return value
      }
      if (value instanceof Date) {
        const day = value.getDay()
        return WEEKDAY_NAMES_ZH[day]
      }
      throw new Error(`TRANSFORM_INVALID: Cannot determine weekday from "${value}"`)
    }

    case 'ROC_YEAR_MONTH': {
      if (value === null || value === undefined || value === '') return null
      const str = String(value)
      const match = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(str)
      if (!match) {
        throw new Error(`TRANSFORM_INVALID: Cannot parse year-month from "${value}"`)
      }
      const gregorianYear = Number(match[1])
      const month = match[2]
      const rocYear = gregorianYear - 1911
      const format = (config.options as RocYearMonthOptions)?.format ?? 'CHINESE'

      if (format === 'SLASH') {
        return `${rocYear}/${month}`
      }
      if (format === 'COMPACT_ZH') {
        return `${rocYear}年${Number(month)}月`
      }
      return `${rocYear} 年 ${month} 月`
    }

    case 'EMPTY_IF_ZERO': {
      if (value === 0 || value === '0') return null
      return value
    }

    case 'ZERO_IF_EMPTY': {
      if (value === null || value === undefined || value === '') return 0
      return value
    }

    case 'VALUE_MAP': {
      if (value === null || value === undefined) return null
      const opts = (config.options as ValueMapOptions) || { map: {} }
      const key = String(value)
      if (key in opts.map) {
        return opts.map[key]
      }
      const behavior = opts.unmappedBehavior ?? 'keep'
      if (behavior === 'empty') return null
      if (behavior === 'error') {
        throw new Error(`TRANSFORM_INVALID: Unmapped value "${key}" in VALUE_MAP`)
      }
      return value
    }

    default:
      throw new Error(`TRANSFORM_INVALID: Unknown transform type`)
  }
}

export function applyTransformPipeline(
  value: unknown,
  pipeline?: TransformConfig[]
): unknown {
  if (!pipeline || pipeline.length === 0) return value
  let current = value
  for (const config of pipeline) {
    current = applyTransform(current, config)
  }
  return current
}
