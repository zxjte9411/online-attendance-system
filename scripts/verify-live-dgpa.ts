#!/usr/bin/env bun
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  selectDgpaResource,
  parseDgpaCalendarCsv,
  decodeDgpaBuffer,
  type DgpaDatasetMetadata,
  type DgpaResource,
} from '../supabase/functions/_shared/dgpa-calendar/parser.ts'
import { DEFAULT_DGPA_METADATA_URL } from '../supabase/functions/_shared/dgpa-calendar/config.ts'

export const OFFICIAL_METADATA_URL = DEFAULT_DGPA_METADATA_URL

export const BASELINE_METADATA: DgpaDatasetMetadata = {
  result: {
    distribution: [
      {
        resourceDescription: '115年中華民國政府行政機關辦公日曆表',
        resourceDownloadUrl: 'https://example.com/calendar-2026-utf8.csv',
        resourceCharacterEncoding: 'utf-8',
        resourceFormat: 'CSV',
        resourceQualityCheckTime: '2026-07-15 11:30:22',
        resourceField: ['西元日期', '星期', '是否放假', '備註'],
      },
      {
        resourceDescription: '114年中華民國政府行政機關辦公日曆表',
        resourceDownloadUrl: 'https://example.com/calendar-2025-big5.csv',
        resourceCharacterEncoding: 'big5',
        resourceFormat: 'CSV',
        resourceQualityCheckTime: '2026-07-15 11:30:19',
        resourceField: ['西元日期', '星期', '是否放假', '備註'],
      },
    ],
  },
}

export function loadBaselineFixtureBuffer(year: number = 2026): Buffer {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const fileName = year === 2025 ? 'calendar-2025-big5.csv' : 'calendar-2026-utf8.csv'
  const fixturePath = path.resolve(__dirname, `../tests/fixtures/dgpa/${fileName}`)
  return fs.readFileSync(fixturePath)
}

export interface BaselineVerificationDependencies {
  selectResourceFn?: typeof selectDgpaResource
  parseCsvFn?: typeof parseDgpaCalendarCsv
  decodeBufferFn?: typeof decodeDgpaBuffer
}

export function verifyApplicationBaseline(
  dependencies?: BaselineVerificationDependencies
): void {
  const selectFn = dependencies?.selectResourceFn ?? selectDgpaResource
  const parseFn = dependencies?.parseCsvFn ?? parseDgpaCalendarCsv
  const decodeFn = dependencies?.decodeBufferFn ?? decodeDgpaBuffer
  const metadata = BASELINE_METADATA

  for (const year of [2026, 2025]) {
    const rawBuffer = loadBaselineFixtureBuffer(year)

    // 1. Verify resource selection on known baseline metadata
    const candidate = selectFn(metadata, year)
    if (!candidate) {
      throw new Error(`Baseline resource selection returned invalid candidate for ${year}`)
    }

    // 2. Verify buffer decoding
    const encoding = candidate.resourceCharacterEncoding || 'utf-8'
    const csvText = decodeFn(new Uint8Array(rawBuffer), encoding)

    // 3. Verify CSV parsing and calendar validation on known baseline CSV
    const rows = parseFn(csvText, year)
    if (rows.length !== 365) {
      throw new Error(`Baseline parser returned ${rows.length} rows for ${year}; expected 365`)
    }
  }
}

export const EXIT_SUCCESS = 0
export const EXIT_APPLICATION_REGRESSION = 1
export const EXIT_AVAILABILITY_DRIFT = 2
export const EXIT_CONTRACT_DRIFT = 3

export type VerificationDiagnosis =
  | 'UPSTREAM AVAILABILITY DRIFT'
  | 'UPSTREAM CONTRACT DRIFT'
  | 'APPLICATION REGRESSION'

export interface VerificationResult {
  success: boolean
  diagnosis?: VerificationDiagnosis
  failureSeam?: string
  exitCode: number
  errorDetails?: string
  rootCause?: string
  verdict?: string
  logs: string[]
  extra?: { label: string; value: string }
}

function classifyContractOrRegressionError(
  err: any,
  verifyBaselineFn: () => void,
  applicationSeam: string,
  upstreamSeam: string,
  upstreamRootCause: string,
  logs: string[]
): VerificationResult {
  try {
    verifyBaselineFn()
  } catch (baselineErr: any) {
    return {
      success: false,
      diagnosis: 'APPLICATION REGRESSION',
      failureSeam: applicationSeam,
      errorDetails: `Application baseline failed: ${baselineErr.message}. Live error: ${err.message}`,
      rootCause: `Application logic failed verification against known-good baseline: ${baselineErr.message}`,
      verdict: 'APPLICATION REGRESSION.',
      exitCode: EXIT_APPLICATION_REGRESSION,
      logs,
    }
  }

  return {
    success: false,
    diagnosis: 'UPSTREAM CONTRACT DRIFT',
    failureSeam: upstreamSeam,
    errorDetails: err.message,
    rootCause: upstreamRootCause,
    verdict: 'Upstream contract drift.',
    exitCode: EXIT_CONTRACT_DRIFT,
    logs,
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit,
  fetchFn: typeof fetch
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return res
  } finally {
    clearTimeout(timeoutId)
  }
}

export interface EvaluateOptions {
  targetYear?: number
  fetchFn?: typeof fetch
  selectResourceFn?: typeof selectDgpaResource
  parseCsvFn?: typeof parseDgpaCalendarCsv
  decodeBufferFn?: typeof decodeDgpaBuffer
  verifyBaselineFn?: () => void
}

export async function evaluateLiveDgpa(options?: EvaluateOptions): Promise<VerificationResult> {
  const targetYear = options?.targetYear ?? 2026
  const fetchFn = options?.fetchFn ?? fetch
  const selectFn = options?.selectResourceFn ?? selectDgpaResource
  const parseFn = options?.parseCsvFn ?? parseDgpaCalendarCsv
  const decodeFn = options?.decodeBufferFn ?? decodeDgpaBuffer
  const verifyBaseline =
    options?.verifyBaselineFn ??
    (() =>
      verifyApplicationBaseline({
        selectResourceFn: selectFn,
        parseCsvFn: parseFn,
        decodeBufferFn: decodeFn,
      }))

  const logs: string[] = []
  logs.push(`=== DGPA Official Upstream Live Verification (Year: ${targetYear}) ===`)
  logs.push(`[Non-blocking / Out-of-band Verification Seam]`)
  logs.push(`Connecting to official data.gov.tw endpoint: ${OFFICIAL_METADATA_URL}...\n`)

  // Step 1: Probe metadata endpoint
  let metadata: DgpaDatasetMetadata
  const fetchStartTime = Date.now()
  try {
    const res = await fetchWithTimeout(
      OFFICIAL_METADATA_URL,
      15000,
      { headers: { Accept: 'application/json' } },
      fetchFn
    )
    metadata = await res.json()
    const elapsed = Date.now() - fetchStartTime
    logs.push(`✓ [1/4] Upstream metadata reachable (${elapsed}ms)`)
  } catch (err: any) {
    return {
      success: false,
      diagnosis: 'UPSTREAM AVAILABILITY DRIFT',
      failureSeam: 'data.gov.tw metadata discovery endpoint',
      extra: { label: 'Endpoint', value: OFFICIAL_METADATA_URL },
      errorDetails: err.message,
      rootCause: 'Official government open data platform is unreachable or timing out.',
      verdict: 'NOT an application code regression.',
      exitCode: EXIT_AVAILABILITY_DRIFT,
      logs,
    }
  }

  // Step 2: Validate metadata schema and candidate selection
  let candidate: DgpaResource
  try {
    candidate = selectFn(metadata, targetYear)
    logs.push(`✓ [2/4] Valid candidate resource found for ${targetYear}:`)
    logs.push(`        Description: ${candidate.resourceDescription}`)
    logs.push(`        Encoding:    ${candidate.resourceCharacterEncoding}`)
    logs.push(`        QualityTime: ${candidate.resourceQualityCheckTime}`)
    logs.push(`        URL:         ${candidate.resourceDownloadUrl}`)
  } catch (err: any) {
    return classifyContractOrRegressionError(
      err,
      verifyBaseline,
      'Application resource selection logic (selectDgpaResource)',
      'DGPA dataset metadata schema validation',
      'Upstream dataset structure changed, fields missing, or target year resource not published.',
      logs
    )
  }

  // Step 3: Download CSV resource from DGPA file server
  let csvBuffer: ArrayBuffer
  const downloadStartTime = Date.now()
  try {
    const res = await fetchWithTimeout(
      candidate.resourceDownloadUrl,
      20000,
      {},
      fetchFn
    )
    csvBuffer = await res.arrayBuffer()
    const elapsed = Date.now() - downloadStartTime
    logs.push(`✓ [3/4] Candidate CSV downloaded (${csvBuffer.byteLength} bytes in ${elapsed}ms)`)
  } catch (err: any) {
    return {
      success: false,
      diagnosis: 'UPSTREAM AVAILABILITY DRIFT',
      failureSeam: 'DGPA official CSV file download',
      extra: { label: 'URL', value: candidate.resourceDownloadUrl },
      errorDetails: err.message,
      rootCause: 'Official DGPA file server unreachable or file missing.',
      verdict: 'NOT an application code regression.',
      exitCode: EXIT_AVAILABILITY_DRIFT,
      logs,
    }
  }

  // Step 4: Decode and parse CSV according to metadata encoding
  try {
    const encoding = candidate.resourceCharacterEncoding || 'utf-8'
    const csvText = decodeFn(new Uint8Array(csvBuffer), encoding)
    const rows = parseFn(csvText, targetYear)

    logs.push(`✓ [4/4] Full-year parsed & validated: ${rows.length} calendar days`)
    logs.push(`        Date range:  ${rows[0].calendar_date} to ${rows[rows.length - 1].calendar_date}`)
    const holidays = rows.filter((r) => r.day_type === 'HOLIDAY')
    logs.push(`        Holidays:    ${holidays.length} days`)
  } catch (err: any) {
    return classifyContractOrRegressionError(
      err,
      verifyBaseline,
      'Application CSV parsing / decoding logic (parseDgpaCalendarCsv)',
      'DGPA CSV parsing and calendar validation',
      'Official CSV content format, header fields, holiday codes, or date continuity changed.',
      logs
    )
  }

  logs.push('\n' + '='.repeat(70))
  logs.push(`✓ Upstream DGPA live contract verified successfully for year ${targetYear}.`)
  logs.push('  All metadata, network endpoints, encoding, and calendar data are fully compatible.')
  logs.push('='.repeat(70))

  return {
    success: true,
    exitCode: EXIT_SUCCESS,
    logs,
  }
}

function printReport(result: VerificationResult): void {
  for (const log of result.logs) {
    console.log(log)
  }

  if (!result.success && result.diagnosis) {
    console.error('\n' + '='.repeat(70))
    console.error(`[DIAGNOSIS: ${result.diagnosis}]`)
    console.error(`Failure Seam: ${result.failureSeam}`)
    if (result.extra) {
      console.error(`${result.extra.label}: ${result.extra.value}`)
    }
    console.error(`Error details: ${result.errorDetails}`)
    console.error(`Root cause: ${result.rootCause}`)
    console.error(`Verdict: ${result.verdict}`)
    console.error('='.repeat(70) + '\n')
  }
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2)
  const yearArg = args.find((a) => /^\d{4}$/.test(a))
  const targetYear = yearArg ? Number(yearArg) : 2026

  try {
    const result = await evaluateLiveDgpa({ targetYear })
    printReport(result)
    process.exit(result.exitCode)
  } catch (err: any) {
    console.error('\n' + '='.repeat(70))
    console.error('[DIAGNOSIS: APPLICATION REGRESSION]')
    console.error('Failure Seam: Live verification CLI runner')
    console.error(`Error details: ${err.message || String(err)}`)
    console.error('Root cause: Unexpected uncaught exception in verification runner.')
    console.error('Verdict: APPLICATION REGRESSION.')
    console.error('='.repeat(70) + '\n')
    process.exit(1)
  }
}

if (import.meta.main || process.argv[1]?.endsWith('verify-live-dgpa.ts')) {
  runCli()
}
