#!/usr/bin/env bun
import {
  selectDgpaResource,
  parseDgpaCalendarCsv,
  decodeDgpaBuffer,
  type DgpaDatasetMetadata,
} from '../supabase/functions/_shared/dgpa-calendar/parser.ts'

const OFFICIAL_METADATA_URL = 'https://data.gov.tw/api/v2/rest/dataset/14718'

const args = process.argv.slice(2)
const yearArg = args.find((a) => /^\d{4}$/.test(a))
const targetYear = yearArg ? Number(yearArg) : 2026

console.log(`=== DGPA Official Upstream Live Verification (Year: ${targetYear}) ===`)
console.log(`[Non-blocking / Out-of-band Verification Seam]`)
console.log(`Connecting to official data.gov.tw endpoint: ${OFFICIAL_METADATA_URL}...\n`)

async function runLiveVerification() {
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
    console.error('\n' + '='.repeat(70))
    console.error('[DIAGNOSIS: UPSTREAM AVAILABILITY DRIFT]')
    console.error('Failure Seam: data.gov.tw metadata discovery endpoint')
    console.error(`Endpoint: ${OFFICIAL_METADATA_URL}`)
    console.error(`Error details: ${err.message}`)
    console.error('Root cause: Official government open data platform is unreachable or timing out.')
    console.error('Verdict: NOT an application code regression.')
    console.error('='.repeat(70) + '\n')
    process.exit(2)
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
    console.error('\n' + '='.repeat(70))
    console.error('[DIAGNOSIS: UPSTREAM CONTRACT DRIFT]')
    console.error('Failure Seam: DGPA dataset metadata schema validation')
    console.error(`Error details: ${err.message}`)
    console.error('Root cause: Upstream dataset structure changed, fields missing, or target year resource not published.')
    console.error('Verdict: Upstream contract drift.')
    console.error('='.repeat(70) + '\n')
    process.exit(3)
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
    console.error('\n' + '='.repeat(70))
    console.error('[DIAGNOSIS: UPSTREAM AVAILABILITY DRIFT]')
    console.error('Failure Seam: DGPA official CSV file download')
    console.error(`URL: ${candidate.resourceDownloadUrl}`)
    console.error(`Error details: ${err.message}`)
    console.error('Root cause: Official DGPA file server unreachable or file missing.')
    console.error('Verdict: NOT an application code regression.')
    console.error('='.repeat(70) + '\n')
    process.exit(2)
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
    console.error('\n' + '='.repeat(70))
    console.error('[DIAGNOSIS: UPSTREAM CONTRACT DRIFT]')
    console.error('Failure Seam: DGPA CSV parsing and calendar validation')
    console.error(`Error details: ${err.message}`)
    console.error('Root cause: Official CSV content format, header fields, holiday codes, or date continuity changed.')
    console.error('Verdict: Upstream contract drift.')
    console.error('='.repeat(70) + '\n')
    process.exit(3)
  }

  console.log('\n' + '='.repeat(70))
  console.log(`✓ Upstream DGPA live contract verified successfully for year ${targetYear}.`)
  console.log('  All metadata, network endpoints, encoding, and calendar data are fully compatible.')
  console.log('='.repeat(70))
}

runLiveVerification().catch((err) => {
  console.error('\n' + '='.repeat(70))
  console.error('[DIAGNOSIS: APPLICATION REGRESSION]')
  console.error(`Unexpected runner failure: ${err.message}`)
  console.error('='.repeat(70))
  process.exit(1)
})
