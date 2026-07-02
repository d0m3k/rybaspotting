#!/bin/bash
# create-admin.sh — Manually set a user as admin (run directly on PostgreSQL)
# Usage: ./create-admin.sh <username>
# Connects via psql using DATABASE_URL from .env

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <username>"
  exit 1
fi

USERNAME="$1"
DB_URL="${DATABASE_URL:-}"

if [ -z "$DB_URL" ]; then
  # Try to load from .env
  if [ -f "../.env" ]; then
    DB_URL=$(grep '^DATABASE_URL=' "../.env" | head -1 | cut -d= -f2-)
  fi
fi

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL not set. Export it or add to .env"
  exit 1
fi

psql "$DB_URL" -c "UPDATE users SET is_active = true, is_admin = true WHERE username = '$USERNAME';"
echo "User '$USERNAME' is now admin and active."
