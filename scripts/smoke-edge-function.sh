#!/usr/bin/env bash
set -euo pipefail

GATEWAY_HOST="${SUPABASE_GATEWAY_HOST:-host.docker.internal}"
GATEWAY_PORT="${SUPABASE_GATEWAY_PORT:-54321}"
BASE_URL="http://${GATEWAY_HOST}:${GATEWAY_PORT}"

# Fallback to localhost if host.docker.internal is not resolvable/accessible from host
if ! curl -s --connect-timeout 2 "${BASE_URL}/functions/v1/sync-dgpa-calendar" >/dev/null 2>&1; then
  if curl -s --connect-timeout 2 "http://127.0.0.1:${GATEWAY_PORT}/functions/v1/sync-dgpa-calendar" >/dev/null 2>&1; then
    BASE_URL="http://127.0.0.1:${GATEWAY_PORT}"
  fi
fi

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
FIXTURE_PORT=54329
DB_CONTAINER="supabase_db_online-attendance-system"
EDGE_CONTAINER="supabase_edge_runtime_online-attendance-system"
NETWORK_NAME="supabase_network_online-attendance-system"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIXTURE_PID=""
PROXY_CONTAINER=""

cleanup() {
  if [ -n "${FIXTURE_PID}" ]; then
    kill "${FIXTURE_PID}" 2>/dev/null || true
  fi
  if [ -n "${PROXY_CONTAINER}" ]; then
    docker stop "${PROXY_CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "=== Edge Function Deterministic Smoke Verification at ${BASE_URL} ==="

# 0. Start local deterministic fixture server
echo "[0/5] Starting DGPA upstream fixture server on port ${FIXTURE_PORT}..."
node "${SCRIPT_DIR}/dgpa-fixture-server.mjs" --port "${FIXTURE_PORT}" &
FIXTURE_PID=$!

# In devcontainer environments, host.docker.internal maps to Docker host rather than devcontainer.
if [ -f /.dockerenv ]; then
  PROXY_CONTAINER="dgpa-host-proxy-$$"
  DEVCONTAINER_HOST="$(hostname)"
  docker run -d --rm \
    --name "${PROXY_CONTAINER}" \
    --network "${NETWORK_NAME}" \
    -p "${FIXTURE_PORT}:${FIXTURE_PORT}" \
    alpine:latest sh -c "
      FIFO=/tmp/dgpa_proxy_fifo
      while true; do
        rm -f \${FIFO}
        mkfifo \${FIFO}
        nc -l -p ${FIXTURE_PORT} < \${FIFO} | nc ${DEVCONTAINER_HOST} ${FIXTURE_PORT} > \${FIFO}
      done" >/dev/null 2>&1 || true
fi

# Wait for fixture server health check
READY=0
for i in $(seq 1 10); do
  if curl -s "http://127.0.0.1:${FIXTURE_PORT}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "${READY}" -ne 1 ]; then
  echo "Error: DGPA fixture server failed to start on port ${FIXTURE_PORT}"
  exit 1
fi
echo "✓ DGPA fixture server ready on port ${FIXTURE_PORT}"

# Verify Edge Runtime has DGPA_METADATA_URL configured to prevent silent fallback to live DGPA
if ! docker exec "${EDGE_CONTAINER}" env 2>/dev/null | grep -q "^DGPA_METADATA_URL="; then
  echo "Error: Edge Runtime is not configured with DGPA_METADATA_URL."
  echo "Please ensure supabase/functions/.env has DGPA_METADATA_URL set (e.g. from .env.test) and restart Supabase."
  exit 1
fi
echo "✓ Edge Runtime upstream isolation verified (DGPA_METADATA_URL is set)"

# Wait for Edge Function gateway to become responsive
for i in $(seq 1 15); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" -H "apikey: ${ANON_KEY}" || true)
  if [ "${STATUS}" != "000" ] && [ "${STATUS}" != "502" ] && [ "${STATUS}" != "503" ] && [ "${STATUS}" != "504" ]; then
    break
  fi
  sleep 1
done

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

# Reusable helper to verify year sync through local Edge Runtime and PostgreSQL cache
verify_year_sync() {
  local target_year="$1"
  local encoding_label="$2"
  local expected_name="$3"

  local sync_res
  sync_res=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${BASE_URL}/functions/v1/sync-dgpa-calendar" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"year\": ${target_year}}")

  local http_code
  http_code=$(echo "${sync_res}" | grep "HTTP_STATUS:" | cut -d':' -f2)
  local body
  body=$(echo "${sync_res}" | grep -v "HTTP_STATUS:")

  if [ "${http_code}" -ne 200 ]; then
    echo "Expected 200 for ${target_year} sync, got ${http_code}: ${body}"
    exit 1
  fi

  if ! echo "${body}" | grep -q '"success":true'; then
    echo "Response does not indicate success: ${body}"
    exit 1
  fi

  # Guard against silent fallback: ensure source URL originates from our local fixture server
  if ! echo "${body}" | grep -E -q ':(54329|dgpa-fixture-server)'; then
    echo "Isolation violation: sync response source did not originate from fixture server: ${body}"
    exit 1
  fi

  local db_count
  db_count=$(docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -t -A -c "
    SELECT count(*) FROM public.dgpa_calendar_cache WHERE calendar_date >= '${target_year}-01-01' AND calendar_date <= '${target_year}-12-31';
  ")

  if [ "${db_count}" -ne 365 ]; then
    echo "Database verification failed: expected 365 rows for ${target_year}, found ${db_count}"
    exit 1
  fi

  if [ -n "${expected_name}" ]; then
    local holiday_name
    holiday_name=$(docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -t -A -c "
      SELECT name FROM public.dgpa_calendar_cache WHERE calendar_date = '${target_year}-01-01';
    ")
    if [ "${holiday_name}" != "${expected_name}" ]; then
      echo "${encoding_label} decoding check failed: expected '${expected_name}', got '${holiday_name}'"
      exit 1
    fi
  fi

  echo "✓ ${target_year} ${encoding_label} sync succeeded: HTTP 200, count=${db_count}, verified in canonical cache"
}

# 4. Deterministic sync for year 2026 (UTF-8)
echo "[4/5] Testing deterministic DGPA sync for year 2026 (UTF-8)..."
verify_year_sync 2026 "UTF-8" "開國紀念日"

# 5. Deterministic sync for year 2025 (Big5)
echo "[5/5] Testing deterministic DGPA sync for year 2025 (Big5)..."
verify_year_sync 2025 "Big5" "開國紀念日"

# 6. Verify that fixture server actually received requests
HEALTH_JSON=$(curl -s "http://127.0.0.1:${FIXTURE_PORT}/health")
if ! echo "${HEALTH_JSON}" | grep -q '"metadata":[1-9]'; then
  echo "Error: Fixture server did not record metadata discovery hits: ${HEALTH_JSON}"
  exit 1
fi
echo "✓ Fixture server verified request hits: ${HEALTH_JSON}"

echo "=== Edge Function Deterministic Smoke Verification Passed ==="
