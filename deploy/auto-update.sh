#!/bin/bash
# auto-update.sh — check for new releases and deploy if changed
# Run via cron: * * * * * /opt/rybaspotting/auto-update.sh >> /var/log/rybaspotting-update.log 2>&1
#
# Sends a Pushover push on every successful deploy (and a priority-1 alert
# when a deploy fails, with a cooldown so a broken state doesn't spam).
# Keys are read from the app's .env — the same PUSHOVER_USER_KEY /
# PUSHOVER_APP_TOKEN the backend uses for app-event notifications.
#
# This file is versioned in the repo (deploy/auto-update.sh); the copy on
# the VPS at /opt/rybaspotting/auto-update.sh is the live one.

set -euo pipefail

REPO="d0m3k/rybaspotting"
STATE_FILE="/opt/rybaspotting/.current-release"
DEPLOY_URL="https://raw.githubusercontent.com/${REPO}/master/scripts/get-latest-release.sh"
ENV_FILE="/opt/rybaspotting/.env"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# ── Pushover helper ─────────────────────────────────────────────────────────
# push_notify <title> <message> [priority] [sound] [url]
# Never fails the update loop: a notification hiccup is logged and swallowed.
push_notify() {
    local title="$1" message="$2" priority="${3:-0}" sound="${4:-}" url="${5:-}"
    local user_key app_token
    user_key=$(grep -E '^PUSHOVER_USER_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    app_token=$(grep -E '^PUSHOVER_APP_TOKEN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)
    if [ -z "$user_key" ] || [ -z "$app_token" ]; then
        echo "$LOG_PREFIX push_notify: Pushover keys not found in $ENV_FILE — skipping"
        return 0
    fi
    local args=(
        --data-urlencode "token=${app_token}"
        --data-urlencode "user=${user_key}"
        --data-urlencode "title=${title}"
        --data-urlencode "message=${message}"
        --data-urlencode "priority=${priority}"
    )
    [ -n "$sound" ] && args+=(--data-urlencode "sound=${sound}")
    [ -n "$url" ] && args+=(--data-urlencode "url=${url}" --data-urlencode "url_title=Szczegóły release")
    if curl -sf -X POST https://api.pushover.net/1/messages.json "${args[@]}" >/dev/null 2>&1; then
        echo "$LOG_PREFIX push_notify: sent (${title})"
    else
        echo "$LOG_PREFIX push_notify: send FAILED (${title}) — check keys / Pushover API"
    fi
    return 0
}

# ── Notification cooldown ───────────────────────────────────────────────────
# notify_cooldown <key> → 0 = notify now (and stamp), 1 = too soon (skip).
# 30-minute window so a persistently failing deploy alerts once, not every minute.
notify_cooldown() {
    local stamp="/tmp/rybaspotting-notify-$1"
    if [ -f "$stamp" ]; then
        local age=$(( $(date +%s) - $(stat -c %Y "$stamp") ))
        if [ "$age" -lt 1800 ]; then return 1; fi
    fi
    touch "$stamp"
    return 0
}

echo "$LOG_PREFIX Checking for new release..."

# Query GitHub API for the latest release tag (+ display name for the push)
RELEASE_JSON=$(curl -sf "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)
LATEST=$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || true)
RELEASE_NAME=$(echo "$RELEASE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null || true)

if [ -z "$LATEST" ]; then
    echo "$LOG_PREFIX ERROR: could not fetch latest release from GitHub API"
    # Transient (rate limit / hiccup) — retry next minute, log only.
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
if curl -sfL "$DEPLOY_URL" | bash; then
    echo "$LATEST" > "$STATE_FILE"
    echo "$LOG_PREFIX Deploy successful — now running $LATEST"
    push_notify \
        "🚀 Rybaspotting: nowa wersja na żywo!" \
        "Zdeployowano: ${RELEASE_NAME:-$LATEST}" \
        0 "" \
        "https://github.com/${REPO}/releases/tag/${LATEST}"
else
    echo "$LOG_PREFIX ERROR: deploy script failed"
    if notify_cooldown deployfail; then
        push_notify \
            "🚨 Rybaspotting: deploy NIEUDANY!" \
            "Deploy ${LATEST} nie powiódł się. Log: tail -50 /var/log/rybaspotting-update.log" \
            1 "siren"
    fi
    exit 1
fi
