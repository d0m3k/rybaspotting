#!/bin/bash
# build.sh — Build the Go backend and Preact frontend
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Building backend ==="
cd backend
go build -o ../dist/rybaspotting ./cmd/rybaspotting/
echo "Backend built: dist/rybaspotting"

echo "=== Building frontend ==="
cd ../frontend
npm install --silent
npm run build
echo "Frontend built: frontend/dist/"

echo "=== Done ==="
