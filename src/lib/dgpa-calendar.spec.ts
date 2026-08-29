import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getDgpaCalendarForMonth,
  getDgpaCalendarForYear,
  syncDgpaCalendarYear,
} from './dgpa-calendar'
import * as supabaseModule from './supabase'

describe('DGPA Calendar Data Access (src/lib/dgpa-calendar)', () => {
  const mockFrom = vi.fn()
  const mockFunctions = {
    invoke: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(supabaseModule, 'getSupabaseClient').mockReturnValue({
      from: mockFrom as any,
      functions: mockFunctions as any,
    } as any)
  })

  it('getDgpaCalendarForMonth queries date range for the month', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          calendar_date: '2026-02-01',
          day_type: 'HOLIDAY',
          name: null,
          source: 'https://test',
          fetched_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    })
    const mockLte = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lte: mockLte })
    const mockSelect = vi.fn().mockReturnValue({ gte: mockGte })
    mockFrom.mockReturnValue({ select: mockSelect })

    const result = await getDgpaCalendarForMonth('2026-02')

    expect(mockFrom).toHaveBeenCalledWith('dgpa_calendar_cache')
    expect(mockGte).toHaveBeenCalledWith('calendar_date', '2026-02-01')
    expect(mockLte).toHaveBeenCalledWith('calendar_date', '2026-02-28')
    expect(result).toHaveLength(1)
    expect(result[0].calendar_date).toBe('2026-02-01')
  })

  it('getDgpaCalendarForYear queries full year date range', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    const mockLte = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lte: mockLte })
    const mockSelect = vi.fn().mockReturnValue({ gte: mockGte })
    mockFrom.mockReturnValue({ select: mockSelect })

    const result = await getDgpaCalendarForYear(2026)

    expect(mockFrom).toHaveBeenCalledWith('dgpa_calendar_cache')
    expect(mockGte).toHaveBeenCalledWith('calendar_date', '2026-01-01')
    expect(mockLte).toHaveBeenCalledWith('calendar_date', '2026-12-31')
    expect(result).toEqual([])
  })

  it('syncDgpaCalendarYear invokes Edge Function with target year', async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: {
        success: true,
        count: 365,
        year: 2026,
        source: 'https://data.gov.tw/test.csv',
        fetched_at: '2026-08-29T12:00:00Z',
      },
      error: null,
    })

    const res = await syncDgpaCalendarYear(2026)

    expect(mockFunctions.invoke).toHaveBeenCalledWith('sync-dgpa-calendar', {
      body: { year: 2026 },
    })
    expect(res.success).toBe(true)
    expect(res.count).toBe(365)
  })

  it('syncDgpaCalendarYear throws on Edge Function error response', async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge Function invocation failed'),
    })

    await expect(syncDgpaCalendarYear(2026)).rejects.toThrow('Edge Function invocation failed')
  })
})
