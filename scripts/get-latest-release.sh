#!/bin/bash
# Download the latest release from GitHub (no token needed!)
#
# Usage on your server:
#   wget -qO- https://raw.githubusercontent.com/d0m3k/rybaspotting/master/scripts/get-latest-release.sh | bash
#
# Or:
#   curl -sL https://raw.githubusercontent.com/d0m3k/rybaspotting/master/scripts/get-latest-release.sh | bash

set -euo pipefail

REPO="d0m3k/rybaspotting"
OUTDIR="${1:-/opt/rybaspotting}"

echo "=== Fetching latest release ==="
LATEST=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null)
TAG=$(echo "$LATEST" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null)

if [ -z "$TAG" ]; then
  echo "Error: Could not find latest release"
  echo "Check: https://github.com/${REPO}/releases"
  exit 1
fi

echo "  Latest: ${TAG}"
echo ""

DOWNLOAD="https://github.com/${REPO}/releases/download/${TAG}/rybaspotting-release.tar.gz"
echo "=== Downloading ==="
wget -q --show-progress -O /tmp/rybaspotting-release.tar.gz "$DOWNLOAD"
echo "  Size: $(ls -lh /tmp/rybaspotting-release.tar.gz | awk '{print $5}')"
echo ""

echo "=== Extracting ==="
mkdir -p /tmp/rybaspotting-release
tar -xzf /tmp/rybaspotting-release.tar.gz -C /tmp/rybaspotting-release
echo "  Extracted to: /tmp/rybaspotting-release"
echo ""

echo "=== Deploying to ${OUTDIR} ==="
systemctl stop rybaspotting 2>/dev/null || true
cp /tmp/rybaspotting-release/rybaspotting "${OUTDIR}/"
rm -rf "${OUTDIR}/frontend"
cp -r /tmp/rybaspotting-release/frontend "${OUTDIR}/"
systemctl start rybaspotting
echo ""

echo "=== Done! ==="
systemctl status rybaspotting --no-pager | head -3
