import { describe, expect, it } from 'vitest'
import {
  evaluateLiveDgpa,
  verifyApplicationBaseline,
  BASELINE_METADATA,
  EXIT_SUCCESS,
  EXIT_APPLICATION_REGRESSION,
  EXIT_AVAILABILITY_DRIFT,
  EXIT_CONTRACT_DRIFT,
} from './verify-live-dgpa'

describe('Live DGPA Verification Root-Cause Diagnosis (verify-live-dgpa.ts)', () => {
  const validMetadata = BASELINE_METADATA
  const validCsvText = `西元日期,星期,是否放假,備註\n` +
    Array.from({ length: 365 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
      const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
      return `${ymd},${d.getUTCDay()},${isWeekend ? '2' : '0'},${i === 0 ? '開國紀念日' : ''}`
    }).join('\n')

  const validCsvBuffer = new TextEncoder().encode(validCsvText).buffer

  const mockFetchSuccess: typeof fetch = (async (url: any) => {
    if (String(url).includes('dataset/14718')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => validMetadata,
      } as any
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => validCsvBuffer,
    } as any
  }) as any

  it('reports SUCCESS (exitCode 0) when upstream and application code are both healthy', async () => {
    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchSuccess,
    })

    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.diagnosis).toBeUndefined()
  })

  it('reliably diagnoses UPSTREAM AVAILABILITY DRIFT (exitCode 2) when metadata endpoint is down/timing out', async () => {
    const mockFetchDown: typeof fetch = (async () => {
      throw new Error('Connection timeout after 15000ms')
    }) as any

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchDown,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('UPSTREAM AVAILABILITY DRIFT')
    expect(result.exitCode).toBe(2)
    expect(result.verdict).toContain('NOT an application code regression')
  })

  it('reliably diagnoses UPSTREAM AVAILABILITY DRIFT (exitCode 2) when CSV download fails with HTTP error', async () => {
    const mockFetchCsvFail: typeof fetch = (async (url: any) => {
      if (String(url).includes('dataset/14718')) {
        return {
          ok: true,
          status: 200,
          json: async () => validMetadata,
        } as any
      }
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as any
    }) as any

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchCsvFail,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('UPSTREAM AVAILABILITY DRIFT')
    expect(result.exitCode).toBe(2)
    expect(result.verdict).toContain('NOT an application code regression')
  })

  it('reliably diagnoses UPSTREAM CONTRACT DRIFT (exitCode 3) when metadata changes but baseline passes', async () => {
    const corruptedMetadata = {
      result: {
        distribution: [
          {
            // Missing required resourceField array or valid format
            resourceDescription: '115年中華民國政府行政機關辦公日曆表',
            resourceDownloadUrl: 'https://example.com/fixture.csv',
            resourceCharacterEncoding: 'utf-8',
            format: 'UNKNOWN_FORMAT',
            resourceQualityCheckTime: '2026-07-15 11:30:22',
            resourceField: ['不同欄位1', '不同欄位2'],
          },
        ],
      },
    }

    const mockFetchCorruptMeta: typeof fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => corruptedMetadata,
      } as any
    }) as any

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchCorruptMeta,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('UPSTREAM CONTRACT DRIFT')
    expect(result.exitCode).toBe(3)
    expect(result.verdict).toBe('Upstream contract drift.')
  })

  it('reliably diagnoses UPSTREAM CONTRACT DRIFT (exitCode 3) when live CSV format changes but baseline passes', async () => {
    const corruptedCsvText = `UnknownHeader1,UnknownHeader2\n1,2\n`
    const corruptedCsvBuffer = new TextEncoder().encode(corruptedCsvText).buffer

    const mockFetchCorruptCsv: typeof fetch = (async (url: any) => {
      if (String(url).includes('dataset/14718')) {
        return {
          ok: true,
          status: 200,
          json: async () => validMetadata,
        } as any
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => corruptedCsvBuffer,
      } as any
    }) as any

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchCorruptCsv,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('UPSTREAM CONTRACT DRIFT')
    expect(result.exitCode).toBe(3)
    expect(result.verdict).toBe('Upstream contract drift.')
  })

  it('reliably diagnoses APPLICATION REGRESSION (exitCode 1) when application selection logic breaks', async () => {
    // Simulating a regression where selectResourceFn is buggy and fails even on baseline
    const buggySelectFn = () => {
      throw new Error('TypeError: Cannot read property of undefined in buggy selectDgpaResource')
    }

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchSuccess,
      selectResourceFn: buggySelectFn as any,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('APPLICATION REGRESSION')
    expect(result.exitCode).toBe(1)
    expect(result.verdict).toBe('APPLICATION REGRESSION.')
  })

  it('reliably diagnoses APPLICATION REGRESSION (exitCode 1) when application CSV parser logic breaks', async () => {
    // Simulating a regression where parseCsvFn is buggy and throws even on baseline
    const buggyParseFn = () => {
      throw new Error('Bug in parseDgpaCalendarCsv implementation')
    }

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchSuccess,
      parseCsvFn: buggyParseFn as any,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('APPLICATION REGRESSION')
    expect(result.exitCode).toBe(EXIT_APPLICATION_REGRESSION)
    expect(result.verdict).toBe('APPLICATION REGRESSION.')
  })

  it('reliably diagnoses APPLICATION REGRESSION (exitCode 1) when application decode logic breaks', async () => {
    // Simulating a regression where decodeBufferFn is buggy and throws even on baseline
    const buggyDecodeFn = () => {
      throw new Error('Bug in decodeDgpaBuffer implementation')
    }

    const result = await evaluateLiveDgpa({
      targetYear: 2026,
      fetchFn: mockFetchSuccess,
      decodeBufferFn: buggyDecodeFn as any,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('APPLICATION REGRESSION')
    expect(result.exitCode).toBe(EXIT_APPLICATION_REGRESSION)
    expect(result.verdict).toBe('APPLICATION REGRESSION.')
  })

  it('reliably verifies both 2026 (UTF-8) and 2025 (Big5) application baselines', () => {
    expect(() => verifyApplicationBaseline()).not.toThrow()
  })

  it('reliably diagnoses APPLICATION REGRESSION (exitCode 1) when Big5 decoding breaks on year 2025', async () => {
    // Simulating a regression where Big5 decoding specifically fails
    const buggyBig5DecodeFn = (_buf: Uint8Array, encoding: string) => {
      if (encoding.toLowerCase() === 'big5') {
        throw new Error('EncodingError: Big5 decoder crashed')
      }
      return '西元日期,星期,是否放假,備註\n'
    }

    const mockFetch2025Success: typeof fetch = (async (url: any) => {
      if (String(url).includes('dataset/14718')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => BASELINE_METADATA,
        } as any
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new ArrayBuffer(100),
      } as any
    }) as any

    const result = await evaluateLiveDgpa({
      targetYear: 2025,
      fetchFn: mockFetch2025Success,
      decodeBufferFn: buggyBig5DecodeFn as any,
    })

    expect(result.success).toBe(false)
    expect(result.diagnosis).toBe('APPLICATION REGRESSION')
    expect(result.exitCode).toBe(EXIT_APPLICATION_REGRESSION)
    expect(result.verdict).toBe('APPLICATION REGRESSION.')
  })
})
