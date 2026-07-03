#!/bin/bash
# Download the latest GitHub Actions release artifact.
#
# Usage:
#   1. Create a GitHub token: https://github.com/settings/tokens
#      (needs only "actions:read" scope — no repo access needed)
#   2. Export it or pass it as an argument:
#
#   export GITHUB_TOKEN=ghp_xxxxx
#   ./scripts/get-latest-release.sh
#
#   Or pass inline:
#   GITHUB_TOKEN=ghp_xxxxx ./scripts/get-latest-release.sh

set -euo pipefail

TOKEN="${GITHUB_TOKEN:-}"
REPO="d0m3k/rybaspotting"

if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_TOKEN not set"
  echo ""
  echo "Create one at: https://github.com/settings/tokens"
  echo "Only 'actions:read' scope is needed."
  echo ""
  echo "Then:  export GITHUB_TOKEN=ghp_xxxxx"
  echo "       $0"
  exit 1
fi

echo "=== Fetching latest successful run ==="
RUN_URL="https://api.github.com/repos/${REPO}/actions/runs?per_page=1&status=success&event=push&branch=master"
RUN_JSON=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$RUN_URL")
RUN_ID=$(echo "$RUN_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['workflow_runs'][0]['id'])" 2>/dev/null)

if [ -z "$RUN_ID" ]; then
  echo "Error: Could not find latest run"
  exit 1
fi
echo "  Latest run: #${RUN_ID}"

echo "=== Fetching artifact ==="
ART_URL="https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/artifacts"
ART_JSON=$(curl -s -H "Authorization: Bearer ${TOKEN}" "$ART_URL")
ART_ID=$(echo "$ART_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['artifacts'][0]['id'])" 2>/dev/null)
ART_NAME=$(echo "$ART_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['artifacts'][0]['name'])" 2>/dev/null)

if [ -z "$ART_ID" ]; then
  echo "Error: Could not find artifact"
  exit 1
fi
echo "  Artifact: ${ART_NAME} (id=${ART_ID})"

echo "=== Downloading ==="
DL_URL="https://api.github.com/repos/${REPO}/actions/artifacts/${ART_ID}/zip"
curl -L -s -o /tmp/rybaspotting-release.zip \
  -H "Authorization: Bearer ${TOKEN}" \
  "$DL_URL"

echo "  Downloaded: /tmp/rybaspotting-release.zip"
echo "  Size: $(ls -lh /tmp/rybaspotting-release.zip | awk '{print $5}')"

echo "=== Extracting ==="
mkdir -p /tmp/rybaspotting-release
cd /tmp/rybaspotting-release
unzip -q -o /tmp/rybaspotting-release.zip
echo "  Extracted to: /tmp/rybaspotting-release"

echo ""
echo "=== To deploy, run: ==="
echo "  systemctl stop rybaspotting"
echo "  cp /tmp/rybaspotting-release/rybaspotting /opt/rybaspotting/"
echo "  rm -rf /opt/rybaspotting/frontend"
echo "  cp -r /tmp/rybaspotting-release/frontend /opt/rybaspotting/"
echo "  systemctl start rybaspotting"
