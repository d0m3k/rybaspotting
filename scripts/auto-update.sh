#!/bin/bash
# auto-update.sh — check for new releases and deploy if changed
# Run via cron: * * * * * /opt/rybaspotting/auto-update.sh >> /var/log/rybaspotting-update.log 2>&1

set -euo pipefail

STATE_FILE="/opt/rybaspotting/.current-release"
RELEASE_URL="https://raw.githubusercontent.com/d0m3k/rybaspotting/master/scripts/get-latest-release.sh"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Fetch latest release tag
echo "$LOG_PREFIX Checking for new release..."
LATEST=$(curl -sfL "$RELEASE_URL" 2>/dev/null | grep "^  Latest:" | awk '{print $2}' || true)

if [ -z "$LATEST" ]; then
    echo "$LOG_PREFIX ERROR: could not fetch latest release info"
    exit 1
fi

echo "$LOG_PREFIX Latest: $LATEST"

# Check current version
if [ -f "$STATE_FILE" ]; then
    CURRENT=$(cat "$STATE_FILE")
else
    CURRENT="none"
fi

if [ "$LATEST" = "$CURRENT" ]; then
    echo "$LOG_PREFIX Already up to date ($CURRENT) — skipping"
    exit 0
fi

echo "$LOG_PREFIX New version! $CURRENT -> $LATEST"
echo "$LOG_PREFIX Deploying..."

# Run the actual deploy
if curl -sfL "$RELEASE_URL" | bash; then
    echo "$LATEST" > "$STATE_FILE"
    echo "$LOG_PREFIX Deploy successful — now running $LATEST"
else
    echo "$LOG_PREFIX ERROR: deploy script failed"
    exit 1
fi
