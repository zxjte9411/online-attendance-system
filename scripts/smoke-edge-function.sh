#!/usr/bin/env bash
set -euo pipefail

GATEWAY_HOST="${SUPABASE_GATEWAY_HOST:-host.docker.internal}"
GATEWAY_PORT="${SUPABASE_GATEWAY_PORT:-54321}"
BASE_URL="http://${GATEWAY_HOST}:${GATEWAY_PORT}"

# Fallback to localhost if host.docker.internal is not resolvable/accessible
if ! curl -s --connect-timeout 2 "${BASE_URL}/functions/v1/sync-dgpa-calendar" >/dev/null 2>&1; then
  if curl -s --connect-timeout 2 "http://127.0.0.1:${GATEWAY_PORT}/functions/v1/sync-dgpa-calendar" >/dev/null 2>&1; then
    BASE_URL="http://127.0.0.1:${GATEWAY_PORT}"
  fi
fi

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

echo "=== Edge Function Smoke Verification at ${BASE_URL} ==="

# 1. Verify missing auth is rejected with 401
echo "[1/4] Testing unauthorized request..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"year": 2026}')

if [ "${HTTP_CODE}" -ne 401 ]; then
  echo "Expected 401 for unauthorized request, got ${HTTP_CODE}"
  exit 1
fi
echo "✓ Unauthorized request rejected with 401"

# 2. Acquire test user access token
echo "[2/4] Acquiring test user token..."
SIGNUP_RES=$(curl -s -X POST "${BASE_URL}/auth/v1/signup" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "edge_smoke_user@example.com", "password": "password123456"}')

ACCESS_TOKEN=$(echo "${SIGNUP_RES}" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 || true)

if [ -z "${ACCESS_TOKEN}" ]; then
  SIGNIN_RES=$(curl -s -X POST "${BASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"email": "edge_smoke_user@example.com", "password": "password123456"}')
  ACCESS_TOKEN=$(echo "${SIGNIN_RES}" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "${ACCESS_TOKEN}" ]; then
  echo "Failed to acquire test user access token"
  exit 1
fi
echo "✓ Access token acquired"

# 3. Verify invalid year is rejected with 400
echo "[3/4] Testing invalid year parameter..."
HTTP_CODE_INVALID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"year": 1800}')

if [ "${HTTP_CODE_INVALID}" -ne 400 ]; then
  echo "Expected 400 for invalid year, got ${HTTP_CODE_INVALID}"
  exit 1
fi
echo "✓ Invalid year rejected with 400"

# 4. Verify valid year sync succeeds with 200
echo "[4/4] Testing live DGPA sync for year 2026..."
SYNC_RES=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"year": 2026}')

HTTP_CODE_SYNC=$(echo "${SYNC_RES}" | grep "HTTP_STATUS:" | cut -d':' -f2)
BODY_SYNC=$(echo "${SYNC_RES}" | grep -v "HTTP_STATUS:")

if [ "${HTTP_CODE_SYNC}" -ne 200 ]; then
  echo "Expected 200 for valid sync, got ${HTTP_CODE_SYNC}: ${BODY_SYNC}"
  exit 1
fi

echo "✓ Live DGPA sync succeeded: ${BODY_SYNC}"
echo "=== Edge Function Smoke Verification Passed ==="
