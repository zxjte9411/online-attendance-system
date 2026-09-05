#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_YEAR="${1:-2026}"

if command -v bun >/dev/null 2>&1; then
  exec bun "${SCRIPT_DIR}/verify-live-dgpa.ts" "${TARGET_YEAR}"
else
  echo "Error: bun is required to run verify-live-dgpa.ts"
  exit 1
fi
