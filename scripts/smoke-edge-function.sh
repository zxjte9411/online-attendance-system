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
FIXTURE_CONTAINER="dgpa-fixture-server"
NETWORK_NAME="supabase_network_online-attendance-system"
DB_CONTAINER="supabase_db_online-attendance-system"

cleanup() {
  if [ "${KEEP_FIXTURE_SERVER:-0}" != "1" ]; then
    echo "Stopping DGPA fixture server..."
    docker stop "${FIXTURE_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "=== Edge Function Deterministic Smoke Verification at ${BASE_URL} ==="

# 0. Start local deterministic fixture server inside Supabase docker network
echo "[0/5] Starting DGPA upstream fixture server on ${NETWORK_NAME}..."
docker stop "${FIXTURE_CONTAINER}" >/dev/null 2>&1 || true

NODE_IMAGE=$(docker inspect supabase_storage_online-attendance-system -f '{{.Config.Image}}' 2>/dev/null || echo "public.ecr.aws/supabase/storage-api:v1.71.0")
SERVER_SCRIPT=$(cat "$(dirname "$0")/dgpa-fixture-server.mjs")

docker run -d --rm \
  --name "${FIXTURE_CONTAINER}" \
  --network "${NETWORK_NAME}" \
  -e SCRIPT="${SERVER_SCRIPT}" \
  --entrypoint node \
  "${NODE_IMAGE}" \
  -e 'eval(process.env.SCRIPT)' >/dev/null

# Wait for fixture server health
READY=0
for i in $(seq 1 10); do
  if docker exec "${FIXTURE_CONTAINER}" node -e "require('http').get('http://127.0.0.1:54329/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "${READY}" -ne 1 ]; then
  echo "Failed to start DGPA fixture server"
  docker logs "${FIXTURE_CONTAINER}" || true
  exit 1
fi
echo "✓ DGPA fixture server ready (serving 2026 UTF-8 & 2025 Big5 fixtures on port 54329)"

# 1. Verify missing auth is rejected with 401
echo "[1/5] Testing unauthorized request..."
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
echo "[2/5] Acquiring test user token..."
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
echo "[3/5] Testing invalid year parameter..."
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

# 4. Verify deterministic UTF-8 sync succeeds with 200 and writes 365 rows to DB (Year 2026)
echo "[4/5] Testing deterministic DGPA sync for year 2026 (UTF-8)..."
SYNC_RES_2026=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"year": 2026}')

HTTP_CODE_SYNC_2026=$(echo "${SYNC_RES_2026}" | grep "HTTP_STATUS:" | cut -d':' -f2)
BODY_SYNC_2026=$(echo "${SYNC_RES_2026}" | grep -v "HTTP_STATUS:")

if [ "${HTTP_CODE_SYNC_2026}" -ne 200 ]; then
  echo "Expected 200 for 2026 sync, got ${HTTP_CODE_SYNC_2026}: ${BODY_SYNC_2026}"
  exit 1
fi

if ! echo "${BODY_SYNC_2026}" | grep -q '"success":true'; then
  echo "Response does not indicate success: ${BODY_SYNC_2026}"
  exit 1
fi

# Verify database write for 2026
DB_COUNT_2026=$(docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -t -A -c "
  SELECT count(*) FROM public.dgpa_calendar_cache WHERE calendar_date >= '2026-01-01' AND calendar_date <= '2026-12-31';
")

if [ "${DB_COUNT_2026}" -ne 365 ]; then
  echo "Database verification failed: expected 365 rows for 2026, found ${DB_COUNT_2026}"
  exit 1
fi

echo "✓ 2026 UTF-8 sync succeeded: HTTP 200, count=${DB_COUNT_2026}, verified in canonical cache"

# 5. Verify deterministic Big5 sync succeeds with 200 and writes 365 rows to DB (Year 2025)
echo "[5/5] Testing deterministic DGPA sync for year 2025 (Big5)..."
SYNC_RES_2025=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"year": 2025}')

HTTP_CODE_SYNC_2025=$(echo "${SYNC_RES_2025}" | grep "HTTP_STATUS:" | cut -d':' -f2)
BODY_SYNC_2025=$(echo "${SYNC_RES_2025}" | grep -v "HTTP_STATUS:")

if [ "${HTTP_CODE_SYNC_2025}" -ne 200 ]; then
  echo "Expected 200 for 2025 sync, got ${HTTP_CODE_SYNC_2025}: ${BODY_SYNC_2025}"
  exit 1
fi

if ! echo "${BODY_SYNC_2025}" | grep -q '"success":true'; then
  echo "Response does not indicate success: ${BODY_SYNC_2025}"
  exit 1
fi

# Verify database write for 2025 and check Big5 decoding correctness
DB_COUNT_2025=$(docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -t -A -c "
  SELECT count(*) FROM public.dgpa_calendar_cache WHERE calendar_date >= '2025-01-01' AND calendar_date <= '2025-12-31';
")

if [ "${DB_COUNT_2025}" -ne 365 ]; then
  echo "Database verification failed: expected 365 rows for 2025, found ${DB_COUNT_2025}"
  exit 1
fi

HOLIDAY_NAME_2025=$(docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -t -A -c "
  SELECT name FROM public.dgpa_calendar_cache WHERE calendar_date = '2025-01-01';
")

if [ "${HOLIDAY_NAME_2025}" != "開國紀念日" ]; then
  echo "Big5 decoding verification failed: expected '開國紀念日', got '${HOLIDAY_NAME_2025}'"
  exit 1
fi

echo "✓ 2025 Big5 sync succeeded: HTTP 200, count=${DB_COUNT_2025}, name='${HOLIDAY_NAME_2025}' accurately decoded"
echo "=== Edge Function Deterministic Smoke Verification Passed ==="
