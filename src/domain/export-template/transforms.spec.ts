import { describe, it, expect } from 'vitest'
import {
  applyTransform,
  applyTransformPipeline,
  type TransformConfig,
} from './transforms'

describe('Domain: Export Template Transforms', () => {
  describe('MINUTES_TO_DECIMAL_HOURS', () => {
    it('converts positive integer minutes to decimal hours', () => {
      expect(applyTransform(480, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBe(8)
      expect(applyTransform(450, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBe(7.5)
      expect(applyTransform(30, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBe(0.5)
      expect(applyTransform(0, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBe(0)
    })

    it('preserves null and undefined', () => {
      expect(applyTransform(null, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBeNull()
      expect(applyTransform(undefined, { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBeNull()
    })

    it('handles numeric strings if parsed', () => {
      expect(applyTransform('480', { type: 'MINUTES_TO_DECIMAL_HOURS' })).toBe(8)
    })

    it('throws on non-numeric non-null values', () => {
      expect(() => applyTransform('invalid', { type: 'MINUTES_TO_DECIMAL_HOURS' })).toThrow()
    })
  })

  describe('TIME_HH_MM', () => {
    it('converts ISO timestamptz to HH:mm in Asia/Taipei', () => {
      // 2026-08-10 09:30:00 UTC+8 is 2026-08-10T01:30:00.000Z
      expect(applyTransform('2026-08-10T01:30:00.000Z', { type: 'TIME_HH_MM' })).toBe('09:30')
      expect(applyTransform('2026-08-10T10:05:00.000Z', { type: 'TIME_HH_MM' })).toBe('18:05')
    })

    it('returns null for null or empty input', () => {
      expect(applyTransform(null, { type: 'TIME_HH_MM' })).toBeNull()
      expect(applyTransform('', { type: 'TIME_HH_MM' })).toBeNull()
    })

    it('accepts Date objects', () => {
      const date = new Date('2026-08-10T01:30:00.000Z')
      expect(applyTransform(date, { type: 'TIME_HH_MM' })).toBe('09:30')
    })
  })

  describe('DATE_YYYY_MM_DD', () => {
    it('formats date as YYYY-MM-DD', () => {
      expect(applyTransform('2026-08-10', { type: 'DATE_YYYY_MM_DD' })).toBe('2026-08-10')
      expect(applyTransform('2026-08-10T01:30:00.000Z', { type: 'DATE_YYYY_MM_DD' })).toBe('2026-08-10')
    })

    it('returns null for null or empty input', () => {
      expect(applyTransform(null, { type: 'DATE_YYYY_MM_DD' })).toBeNull()
    })
  })

  describe('WEEKDAY_ZH_TW', () => {
    it('formats date string to zh-TW weekday', () => {
      // 2026-08-10 is Monday -> 週一
      expect(applyTransform('2026-08-10', { type: 'WEEKDAY_ZH_TW' })).toBe('週一')
      // 2026-08-16 is Sunday -> 週日
      expect(applyTransform('2026-08-16', { type: 'WEEKDAY_ZH_TW' })).toBe('週日')
    })

    it('returns null for null or empty', () => {
      expect(applyTransform(null, { type: 'WEEKDAY_ZH_TW' })).toBeNull()
    })
  })

  describe('ROC_YEAR_MONTH', () => {
    it('converts YYYY-MM to ROC year format', () => {
      expect(applyTransform('2026-08', { type: 'ROC_YEAR_MONTH' })).toBe('115 年 08 月')
      expect(applyTransform('1912-01', { type: 'ROC_YEAR_MONTH' })).toBe('1 年 01 月')
    })

    it('supports custom format options', () => {
      expect(applyTransform('2026-08', { type: 'ROC_YEAR_MONTH', options: { format: 'SLASH' } })).toBe('115/08')
      expect(applyTransform('2026-08', { type: 'ROC_YEAR_MONTH', options: { format: 'COMPACT_ZH' } })).toBe('115年8月')
    })

    it('returns null for null or empty input', () => {
      expect(applyTransform(null, { type: 'ROC_YEAR_MONTH' })).toBeNull()
    })
  })

  describe('EMPTY_IF_ZERO', () => {
    it('replaces 0 with null', () => {
      expect(applyTransform(0, { type: 'EMPTY_IF_ZERO' })).toBeNull()
      expect(applyTransform('0', { type: 'EMPTY_IF_ZERO' })).toBeNull()
    })

    it('preserves non-zero values', () => {
      expect(applyTransform(8, { type: 'EMPTY_IF_ZERO' })).toBe(8)
      expect(applyTransform(null, { type: 'EMPTY_IF_ZERO' })).toBeNull()
      expect(applyTransform('ABC', { type: 'EMPTY_IF_ZERO' })).toBe('ABC')
    })
  })

  describe('ZERO_IF_EMPTY', () => {
    it('replaces null, undefined, or empty string with 0', () => {
      expect(applyTransform(null, { type: 'ZERO_IF_EMPTY' })).toBe(0)
      expect(applyTransform(undefined, { type: 'ZERO_IF_EMPTY' })).toBe(0)
      expect(applyTransform('', { type: 'ZERO_IF_EMPTY' })).toBe(0)
    })

    it('preserves other values', () => {
      expect(applyTransform(5, { type: 'ZERO_IF_EMPTY' })).toBe(5)
      expect(applyTransform(0, { type: 'ZERO_IF_EMPTY' })).toBe(0)
      expect(applyTransform('ABC', { type: 'ZERO_IF_EMPTY' })).toBe('ABC')
    })
  })

  describe('VALUE_MAP', () => {
    it('maps known values', () => {
      const config: TransformConfig = {
        type: 'VALUE_MAP',
        options: {
          map: {
            LEAVE: '請假',
            REMOTE: '遠端',
            BUSINESS_TRIP: '出差',
            ABSENT: '缺勤',
          },
          unmappedBehavior: 'keep',
        },
      }
      expect(applyTransform('LEAVE', config)).toBe('請假')
      expect(applyTransform('REMOTE', config)).toBe('遠端')
      expect(applyTransform('NORMAL', config)).toBe('NORMAL')
    })

    it('handles unmappedBehavior empty and error', () => {
      const emptyConfig: TransformConfig = {
        type: 'VALUE_MAP',
        options: {
          map: { LEAVE: '請假' },
          unmappedBehavior: 'empty',
        },
      }
      expect(applyTransform('UNKNOWN', emptyConfig)).toBeNull()

      const errorConfig: TransformConfig = {
        type: 'VALUE_MAP',
        options: {
          map: { LEAVE: '請假' },
          unmappedBehavior: 'error',
        },
      }
      expect(() => applyTransform('UNKNOWN', errorConfig)).toThrow()
    })

    it('handles null with unmappedBehavior', () => {
      const config: TransformConfig = {
        type: 'VALUE_MAP',
        options: {
          map: { LEAVE: '請假' },
          unmappedBehavior: 'keep',
        },
      }
      expect(applyTransform(null, config)).toBeNull()
    })

    it('throws TRANSFORM_INVALID on missing or invalid unmappedBehavior', () => {
      const missingBehaviorConfig: any = {
        type: 'VALUE_MAP',
        options: {
          map: { LEAVE: '請假' },
        },
      }
      expect(() => applyTransform('WORK', missingBehaviorConfig)).toThrow('Missing or invalid unmappedBehavior')

      const invalidBehaviorConfig: any = {
        type: 'VALUE_MAP',
        options: {
          map: { LEAVE: '請假' },
          unmappedBehavior: 'invalid_mode',
        },
      }
      expect(() => applyTransform('WORK', invalidBehaviorConfig)).toThrow('Missing or invalid unmappedBehavior')
    })

    it('throws TRANSFORM_INVALID on missing map', () => {
      const missingMapConfig: any = {
        type: 'VALUE_MAP',
        options: {
          unmappedBehavior: 'keep',
        },
      }
      expect(() => applyTransform('WORK', missingMapConfig)).toThrow('Missing map in VALUE_MAP options')
    })
  })

  describe('Transform Pipeline', () => {
    it('executes transforms in order', () => {
      // 0 -> MINUTES_TO_DECIMAL_HOURS (0) -> EMPTY_IF_ZERO (null)
      const pipeline1: TransformConfig[] = [
        { type: 'MINUTES_TO_DECIMAL_HOURS' },
        { type: 'EMPTY_IF_ZERO' },
      ]
      expect(applyTransformPipeline(0, pipeline1)).toBeNull()
      expect(applyTransformPipeline(480, pipeline1)).toBe(8)

      // null -> ZERO_IF_EMPTY (0)
      const pipeline2: TransformConfig[] = [{ type: 'ZERO_IF_EMPTY' }]
      expect(applyTransformPipeline(null, pipeline2)).toBe(0)
    })
  })
})
