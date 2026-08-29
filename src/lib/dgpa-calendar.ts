import { getSupabaseClient } from './supabase'
import type { DgpaCalendarRow } from '../domain/dgpa-calendar/resolver'

export type DgpaSyncResult = {
  success: boolean
  count: number
  year: number
  source: string
  fetched_at: string
}

export async function getDgpaCalendarForMonth(yearMonth: string): Promise<DgpaCalendarRow[]> {
  const [yearStr, monthStr] = yearMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const startDate = `${yearMonth}-01`
  const endDate = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`

  const { data, error } = await getSupabaseClient()
    .from('dgpa_calendar_cache')
    .select('calendar_date, day_type, name, source, fetched_at')
    .gte('calendar_date', startDate)
    .lte('calendar_date', endDate)
    .order('calendar_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as DgpaCalendarRow[]
}

export async function syncDgpaCalendarYear(year: number): Promise<DgpaSyncResult> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('sync-dgpa-calendar', {
    body: { year },
  })

  if (error) {
    throw error
  }
  if (!data?.success) {
    throw new Error(data?.error || 'DGPA 日曆同步失敗。')
  }

  return data as DgpaSyncResult
}
