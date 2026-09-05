#!/usr/bin/env bun
import {
  selectDgpaResource,
  parseDgpaCalendarCsv,
  decodeDgpaBuffer,
  type DgpaDatasetMetadata,
} from '../supabase/functions/_shared/dgpa-calendar/parser.ts'

const OFFICIAL_METADATA_URL = 'https://data.gov.tw/api/v2/rest/dataset/14718'

function reportFailure(
  diagnosis: 'UPSTREAM AVAILABILITY DRIFT' | 'UPSTREAM CONTRACT DRIFT' | 'APPLICATION REGRESSION',
  failureSeam: string,
  details: string,
  rootCause: string,
  verdict: string,
  exitCode: number,
  extra?: { label: string; value: string }
): never {
  console.error('\n' + '='.repeat(70))
  console.error(`[DIAGNOSIS: ${diagnosis}]`)
  console.error(`Failure Seam: ${failureSeam}`)
  if (extra) {
    console.error(`${extra.label}: ${extra.value}`)
  }
  console.error(`Error details: ${details}`)
  console.error(`Root cause: ${rootCause}`)
  console.error(`Verdict: ${verdict}`)
  console.error('='.repeat(70) + '\n')
  process.exit(exitCode)
}

async function runLiveVerification() {
  const args = process.argv.slice(2)
  const yearArg = args.find((a) => /^\d{4}$/.test(a))
  const targetYear = yearArg ? Number(yearArg) : 2026

  console.log(`=== DGPA Official Upstream Live Verification (Year: ${targetYear}) ===`)
  console.log(`[Non-blocking / Out-of-band Verification Seam]`)
  console.log(`Connecting to official data.gov.tw endpoint: ${OFFICIAL_METADATA_URL}...\n`)

  // Step 1: Probe metadata endpoint
  let metadata: DgpaDatasetMetadata
  const fetchStartTime = Date.now()
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(OFFICIAL_METADATA_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    metadata = await res.json()
    const elapsed = Date.now() - fetchStartTime
    console.log(`✓ [1/4] Upstream metadata reachable (${elapsed}ms)`)
  } catch (err: any) {
    reportFailure(
      'UPSTREAM AVAILABILITY DRIFT',
      'data.gov.tw metadata discovery endpoint',
      err.message,
      'Official government open data platform is unreachable or timing out.',
      'NOT an application code regression.',
      2,
      { label: 'Endpoint', value: OFFICIAL_METADATA_URL }
    )
  }

  // Step 2: Validate metadata schema and candidate selection
  let candidate
  try {
    candidate = selectDgpaResource(metadata, targetYear)
    console.log(`✓ [2/4] Valid candidate resource found for ${targetYear}:`)
    console.log(`        Description: ${candidate.resourceDescription}`)
    console.log(`        Encoding:    ${candidate.resourceCharacterEncoding}`)
    console.log(`        QualityTime: ${candidate.resourceQualityCheckTime}`)
    console.log(`        URL:         ${candidate.resourceDownloadUrl}`)
  } catch (err: any) {
    reportFailure(
      'UPSTREAM CONTRACT DRIFT',
      'DGPA dataset metadata schema validation',
      err.message,
      'Upstream dataset structure changed, fields missing, or target year resource not published.',
      'Upstream contract drift.',
      3
    )
  }

  // Step 3: Download CSV resource from DGPA file server
  let csvBuffer: ArrayBuffer
  const downloadStartTime = Date.now()
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    const res = await fetch(candidate.resourceDownloadUrl, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    csvBuffer = await res.arrayBuffer()
    const elapsed = Date.now() - downloadStartTime
    console.log(`✓ [3/4] Candidate CSV downloaded (${csvBuffer.byteLength} bytes in ${elapsed}ms)`)
  } catch (err: any) {
    reportFailure(
      'UPSTREAM AVAILABILITY DRIFT',
      'DGPA official CSV file download',
      err.message,
      'Official DGPA file server unreachable or file missing.',
      'NOT an application code regression.',
      2,
      { label: 'URL', value: candidate.resourceDownloadUrl }
    )
  }

  // Step 4: Decode and parse CSV according to metadata encoding
  try {
    const encoding = candidate.resourceCharacterEncoding || 'utf-8'
    const csvText = decodeDgpaBuffer(new Uint8Array(csvBuffer), encoding)
    const rows = parseDgpaCalendarCsv(csvText, targetYear)

    console.log(`✓ [4/4] Full-year parsed & validated: ${rows.length} calendar days`)
    console.log(`        Date range:  ${rows[0].calendar_date} to ${rows[rows.length - 1].calendar_date}`)
    const holidays = rows.filter((r) => r.day_type === 'HOLIDAY')
    console.log(`        Holidays:    ${holidays.length} days`)
  } catch (err: any) {
    reportFailure(
      'UPSTREAM CONTRACT DRIFT',
      'DGPA CSV parsing and calendar validation',
      err.message,
      'Official CSV content format, header fields, holiday codes, or date continuity changed.',
      'Upstream contract drift.',
      3
    )
  }

  console.log('\n' + '='.repeat(70))
  console.log(`✓ Upstream DGPA live contract verified successfully for year ${targetYear}.`)
  console.log('  All metadata, network endpoints, encoding, and calendar data are fully compatible.')
  console.log('='.repeat(70))
}

runLiveVerification().catch((err) => {
  reportFailure(
    'APPLICATION REGRESSION',
    'Live verification runner entrypoint',
    err.message || String(err),
    'Unexpected exception occurred in live verification runner.',
    'APPLICATION REGRESSION.',
    1
  )
})
