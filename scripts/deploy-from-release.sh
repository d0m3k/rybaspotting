#!/bin/bash
# Deploy a GitHub Actions release artifact to the server.
# Usage (on the server itself):
#   curl -L -o release.tar.gz <artifact-url>
#   bash deploy-from-release.sh release.tar.gz
#
# Or locally:
#   ./scripts/deploy-from-release.sh rybaspotting-release.tar.gz root@amy135.mikrus.xyz 10135

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <release.tar.gz> [user@host] [port]"
  echo ""
  echo "  If host is given, copies files via SSH."
  echo "  If no host, deploys locally (run on the server)."
  exit 1
fi

ARCHIVE="$1"
HOST="${2:-}"
PORT="${3:-22}"

if [ ! -f "$ARCHIVE" ]; then
  echo "Error: archive not found: $ARCHIVE"
  exit 1
fi

TMPDIR=$(mktemp -d)
tar -xzf "$ARCHIVE" -C "$TMPDIR"

echo "=== Stopping service ==="
if [ -n "$HOST" ]; then
  ssh -p "$PORT" "$HOST" "systemctl stop rybaspotting || true"
else
  systemctl stop rybaspotting || true
fi

echo "=== Copying backend binary ==="
if [ -n "$HOST" ]; then
  scp -P "$PORT" "$TMPDIR/rybaspotting" "$HOST:/opt/rybaspotting/"
  scp -P "$PORT" -r "$TMPDIR/frontend" "$HOST:/opt/rybaspotting/"
else
  cp "$TMPDIR/rybaspotting" /opt/rybaspotting/
  rm -rf /opt/rybaspotting/frontend
  cp -r "$TMPDIR/frontend" /opt/rybaspotting/
fi

echo "=== Starting service ==="
if [ -n "$HOST" ]; then
  ssh -p "$PORT" "$HOST" "systemctl start rybaspotting && systemctl status rybaspotting --no-pager | head -4"
else
  systemctl start rybaspotting
  systemctl status rybaspotting --no-pager | head -4
fi

rm -rf "$TMPDIR"
echo "=== Done ==="
