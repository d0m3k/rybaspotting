#!/bin/bash
# approve-user.sh — Approve a user's registration via admin API
# Usage: ./approve-user.sh <username>
# Requires ADMIN_TOKEN from .env

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <username>"
  exit 1
fi

USERNAME="$1"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

if [ -z "$ADMIN_TOKEN" ]; then
  # Try to load from .env
  if [ -f "../.env" ]; then
    ADMIN_TOKEN=$(grep '^ADMIN_TOKEN=' "../.env" | cut -d= -f2-)
  fi
fi

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Error: ADMIN_TOKEN not set. Export it or add to .env"
  echo "  export ADMIN_TOKEN=your-token"
  exit 1
fi

curl -s -X POST "${BASE_URL}/api/admin/approve-user?username=${USERNAME}" \
  -H "X-Admin-Token: ${ADMIN_TOKEN}" | jq .
