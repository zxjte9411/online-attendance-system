import { describe, it, expect } from 'vitest'
import {
  validateMonthWorksheetMapping,
  validateRowMapping,
  validateStaticCellMapping,
  validateExportTemplateConfig,
  REPORT_MODEL_SOURCE_FIELDS,
  STATIC_SOURCE_FIELDS,
  type ExportTemplateConfig,
  type RowMappingEntry,
  type StaticCellMappingEntry,
} from './mapping-validator'

describe('Domain: Export Template Mapping Validator', () => {
  describe('Month Worksheet Mapping', () => {
    it('accepts valid YYYY-MM mapping', () => {
      const result = validateMonthWorksheetMapping({
        '2026-08': '8月',
        '2026-09': '9月',
      })
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects invalid month keys', () => {
      const result = validateMonthWorksheetMapping({
        '2026-8': '8月',
        'August': '8月',
      })
      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects empty worksheet name', () => {
      const result = validateMonthWorksheetMapping({
        '2026-08': '   ',
      })
      expect(result.isValid).toBe(false)
    })
  })

  describe('Row Mapping', () => {
    it('accepts valid row mapping containing a date locator', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'actual_clock_in_at', targetColumn: 'D', transforms: [{ type: 'TIME_HH_MM' }] },
        { sourceField: 'net_worked_minutes', targetColumn: 'G', transforms: [{ type: 'MINUTES_TO_DECIMAL_HOURS' }] },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects row mapping without date locator', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'actual_clock_in_at', targetColumn: 'D' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Row mapping 必須包含一個 date 日期定位欄位。')
    })

    it('rejects row mapping with multiple date locators', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'date', targetColumn: 'C' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Row mapping 只能設定一個 date 日期定位欄位。')
    })

    it('rejects invalid column identifier', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'date', targetColumn: '12' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
    })

    it('normalizes target column to uppercase', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'date', targetColumn: 'b' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(true)
    })

    it('rejects duplicate target columns in row mapping', () => {
      const entries: RowMappingEntry[] = [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'actual_clock_in_at', targetColumn: 'B' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('重複'))).toBe(true)
    })

    it('rejects unsupported fields (such as compensatory leave)', () => {
      const entries: any[] = [
        { sourceField: 'date', targetColumn: 'B' },
        { sourceField: 'compensatory_leave', targetColumn: 'E' },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
      expect(result.errors.some((e) => e.includes('不支援的欄位'))).toBe(true)
    })

    it('rejects invalid transform in pipeline', () => {
      const entries: any[] = [
        {
          sourceField: 'date',
          targetColumn: 'B',
          transforms: [{ type: 'INVALID_TRANSFORM' }],
        },
      ]
      const result = validateRowMapping(entries)
      expect(result.isValid).toBe(false)
    })
  })

  describe('Static Cell Mapping', () => {
    it('accepts valid static mapping with A1 cell format', () => {
      const entries: StaticCellMappingEntry[] = [
        { sourceField: 'year_month', targetCell: 'B2', transforms: [{ type: 'ROC_YEAR_MONTH' }] },
        { sourceField: 'company_identifier', targetCell: 'D2' },
      ]
      const result = validateStaticCellMapping(entries)
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects invalid A1 cell address', () => {
      const entries: StaticCellMappingEntry[] = [
        { sourceField: 'year_month', targetCell: '2B' },
      ]
      const result = validateStaticCellMapping(entries)
      expect(result.isValid).toBe(false)
    })

    it('rejects duplicate target cells', () => {
      const entries: StaticCellMappingEntry[] = [
        { sourceField: 'year_month', targetCell: 'B2' },
        { sourceField: 'company_identifier', targetCell: 'b2' },
      ]
      const result = validateStaticCellMapping(entries)
      expect(result.isValid).toBe(false)
    })

    it('rejects unsupported static source fields', () => {
      const entries: any[] = [
        { sourceField: 'unsupported_field', targetCell: 'B2' },
      ]
      const result = validateStaticCellMapping(entries)
      expect(result.isValid).toBe(false)
    })
  })

  describe('Full ExportTemplateConfig validation', () => {
    it('validates complete valid config', () => {
      const config: ExportTemplateConfig = {
        name: '公司出勤表',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [
          { sourceField: 'date', targetColumn: 'B' },
          { sourceField: 'actual_clock_in_at', targetColumn: 'D' },
        ],
        staticCellMapping: [
          { sourceField: 'year_month', targetCell: 'B2' },
        ],
      }
      const result = validateExportTemplateConfig(config)
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('rejects empty template name', () => {
      const config: ExportTemplateConfig = {
        name: '',
        monthWorksheetMapping: { '2026-08': '8月' },
        rowMapping: [{ sourceField: 'date', targetColumn: 'B' }],
        staticCellMapping: [],
      }
      const result = validateExportTemplateConfig(config)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('請填寫範本名稱。')
    })
  })
})
