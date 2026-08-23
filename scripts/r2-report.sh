#!/bin/bash
# r2-report.sh — daily evening R2 usage + traffic report via Pushover
#
# Deployed on the VPS: /opt/rybaspotting/r2-report.sh
# Cron (18:00 UTC = 20:00 CEST):
#     0 18 * * * /opt/rybaspotting/r2-report.sh >> /var/log/rybaspotting-r2.log 2>&1
#
# What it reports (window: last 24h):
#   1. R2 bucket storage — size + object count, delta vs yesterday (via rclone)
#   2. R2 operations — Class A / Class B counts + cost estimate, ALERT over
#      thresholds (via Cloudflare GraphQL Analytics API — needs CF_API_TOKEN,
#      see below; without it this section reports "no token")
#   3. Origin traffic (nginx) — requests, unique client IPs, top talkers,
#      photo redirects, uploads, errors
#
# .env keys read by this script:
#   R2_BUCKET            — bucket name (required, already present)
#   PUSHOVER_USER_KEY / PUSHOVER_APP_TOKEN — push delivery (already present)
#   CF_API_TOKEN         — Cloudflare API token for R2 analytics (optional)
#                          Create in CF dashboard → My Profile → API Tokens:
#                          permission "Account → Analytics → Read"
#   CF_ACCOUNT_ID        — optional, auto-discovered via API if not set
#   R2_ALERT_CLASS_B     — alert threshold, default 250000 ops/day
#   R2_ALERT_CLASS_A     — alert threshold, default 25000 ops/day
#   R2_ALERT_REQUESTS    — origin-traffic alert threshold, default 100000 req/day
#
# Why the CF token matters: photo traffic goes browser → Cloudflare → R2
# (cdn.ryby.dom3k.pl) and NEVER touches the VPS, so nginx logs can't see it.
# R2 cost = Class A/B operations (egress is free); a request flood on the CDN
# domain is only visible via Cloudflare's R2 analytics.

set -euo pipefail

ENV_FILE="/opt/rybaspotting/.env"
STATE_FILE="/opt/rybaspotting/.r2-report-state"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# ── helpers ──────────────────────────────────────────────────────────────────

env_val() {
    grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

push_notify() {
    # push_notify <title> <message> [priority] [sound]
    local title="$1" message="$2" priority="${3:-0}" sound="${4:-}"
    local user_key app_token
    user_key=$(env_val PUSHOVER_USER_KEY)
    app_token=$(env_val PUSHOVER_APP_TOKEN)
    if [ -z "$user_key" ] || [ -z "$app_token" ]; then
        echo "$LOG_PREFIX push_notify: Pushover keys not found — skipping"
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
    if curl -sf -X POST https://api.pushover.net/1/messages.json "${args[@]}" >/dev/null 2>&1; then
        echo "$LOG_PREFIX push_notify: sent (${title})"
    else
        echo "$LOG_PREFIX push_notify: send FAILED (${title})"
    fi
    return 0
}

human_bytes() {
    awk -v b="$1" 'BEGIN {
        split("B KiB MiB GiB TiB", u, " ")
        i = 1
        while (b >= 1024 && i < 5) { b /= 1024; i++ }
        printf (i == 1) ? "%d %s" : "%.1f %s", b, u[i]
    }'
}

# ── config ───────────────────────────────────────────────────────────────────

BUCKET=$(env_val R2_BUCKET)
ALERT_B=$(env_val R2_ALERT_CLASS_B); [ -z "$ALERT_B" ] && ALERT_B=250000
ALERT_A=$(env_val R2_ALERT_CLASS_A); [ -z "$ALERT_A" ] && ALERT_A=25000
ALERT_REQ=$(env_val R2_ALERT_REQUESTS); [ -z "$ALERT_REQ" ] && ALERT_REQ=100000

if [ -z "$BUCKET" ]; then
    echo "$LOG_PREFIX ERROR: R2_BUCKET not found in $ENV_FILE"
    exit 1
fi

echo "$LOG_PREFIX === R2 report start (bucket=$BUCKET) ==="

# ── 1. bucket storage (rclone) ───────────────────────────────────────────────

obj_count="?"
obj_bytes="?"
delta_str=""
size_out=$(rclone size "r2:${BUCKET}" 2>/dev/null || true)
if [ -n "$size_out" ]; then
    obj_count=$(echo "$size_out" | sed -n 's/Total objects: \([0-9]*\)/\1/p')
    obj_bytes=$(echo "$size_out" | sed -n 's/Total size:.*(\([0-9]*\) Byte)/\1/p')
    [ -z "$obj_count" ] && obj_count="?"
    [ -z "$obj_bytes" ] && obj_bytes="?"

    if [ "$obj_count" != "?" ] && [ "$obj_bytes" != "?" ]; then
        if [ -f "$STATE_FILE" ]; then
            read -r prev_objs prev_bytes < "$STATE_FILE" 2>/dev/null || prev_objs=""
            if [ -n "${prev_objs:-}" ] && [ "$prev_objs" != "?" ]; then
                d_objs=$(( obj_count - prev_objs ))
                d_bytes=$(( obj_bytes - prev_bytes ))
                ds=$(human_bytes "${d_bytes#-}")
                [ "$d_bytes" -lt 0 ] && ds="-$ds"
                delta_str=" (${d_objs} obj, ${ds} vs wczoraj)"
            fi
        fi
        printf '%s %s\n' "$obj_count" "$obj_bytes" > "$STATE_FILE"
    fi
fi

# ── 2. R2 operations via Cloudflare GraphQL (optional) ───────────────────────

ops_a="?"; ops_b="?"; ops_cost_str=""; ops_note=""
CF_TOKEN=$(env_val CF_API_TOKEN)
if [ -n "$CF_TOKEN" ]; then
    ACCOUNT=$(env_val CF_ACCOUNT_ID)
    if [ -z "$ACCOUNT" ]; then
        ACCOUNT=$(curl -s -H "Authorization: Bearer ${CF_TOKEN}" \
            https://api.cloudflare.com/client/v4/accounts 2>/dev/null \
            | jq -r '.result[0].id // empty' 2>/dev/null || true)
    fi
    if [ -z "$ACCOUNT" ]; then
        ops_note="(nie mogę ustalić account ID — ustaw CF_ACCOUNT_ID w .env)"
        echo "$LOG_PREFIX CF: account ID discovery failed"
    else
        FROM=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
        TO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        QUERY=$(jq -n --arg a "$ACCOUNT" --arg f "$FROM" --arg t "$TO" --arg b "$BUCKET" \
            '{query: ("query { viewer { accounts(filter: {accountTag: \"" + $a + "\"}) { r2OperationsAdaptiveGroups(limit: 100, filter: {datetime_geq: \"" + $f + "\", datetime_leq: \"" + $t + "\", bucketName: \"" + $b + "\"}) { dimensions { actionType } sum { requests } } } } }")}')
        RESP=$(curl -s -X POST https://api.cloudflare.com/client/v4/graphql \
            -H "Authorization: Bearer ${CF_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$QUERY" 2>/dev/null || true)

        cf_err=$(echo "$RESP" | jq -r '.errors[0].message // empty' 2>/dev/null || true)
        if [ -n "$cf_err" ]; then
            ops_note="(błąd CF API: ${cf_err} — szczegóły w logu)"
            echo "$LOG_PREFIX CF GraphQL error: $(echo "$RESP" | jq -c '.errors' 2>/dev/null)"
        else
            a_sum=0; b_sum=0
            while IFS=$'\t' read -r action requests; do
                [ -z "$action" ] && continue
                case "$action" in
                    # Class B (reads, $0.36/M): Get*/Head*/UsageSummary
                    GetObject|HeadObject|HeadBucket|UsageSummary|GetBucketLocation|GetBucketEncryption|GetBucketCors|GetBucketLifecycleConfiguration|GetBucketNotificationConfiguration|GetBucketSippyConfiguration|GetBucketTagging)
                        b_sum=$(( b_sum + requests )) ;;
                    # Class A (writes/listings, $4.50/M): Put*/List*/Copy*/Upload*/Delete* …
                    *)
                        a_sum=$(( a_sum + requests )) ;;
                esac
            done < <(echo "$RESP" | jq -r '.data.viewer.accounts[0].r2OperationsAdaptiveGroups[]? | [.dimensions.actionType, .sum.requests] | @tsv' 2>/dev/null)
            ops_a=$a_sum; ops_b=$b_sum
            ops_cost_str=$(awk -v a="$ops_a" -v b="$ops_b" 'BEGIN { printf "~$%.6f/d", (a*4.50 + b*0.36) / 1000000 }')
        fi
    fi
else
    ops_note="(brak CF_API_TOKEN w .env — patrz nagłówek skryptu)"
fi

# ── 3. origin traffic from nginx logs (last 24h) ─────────────────────────────

req_total=0; req_photo=0; req_upload=0; req_err=0
declare -A ip_count=()
declare -A ts_cache=()
CUTOFF=$(date -u -d '24 hours ago' +%s)

# prefer the ryby vhost log (real client IPs); fall back to the global one
if [ -f /var/log/nginx/ryby.access.log ]; then
    LOGS=(/var/log/nginx/ryby.access.log)
    [ -f /var/log/nginx/ryby.access.log.1 ] && LOGS+=(/var/log/nginx/ryby.access.log.1)
    [ -f /var/log/nginx/ryby.access.log.2.gz ] && LOGS+=(/var/log/nginx/ryby.access.log.2.gz)
else
    LOGS=(/var/log/nginx/access.log)
    [ -f /var/log/nginx/access.log.1 ] && LOGS+=(/var/log/nginx/access.log.1)
    [ -f /var/log/nginx/access.log.2.gz ] && LOGS+=(/var/log/nginx/access.log.2.gz)
fi

# log format: <ip> - [23/Aug/2026:12:18:25 +0000] "GET /x HTTP/1.1" 200 123 "ref" "ua"
# (also matches the old combined format where remote_user sits before the bracket)
re='^([^ ]+)[^[]*\[([^]]+)\] "([A-Z]+) ([^?" ]+)[^"]*" ([0-9]{3}) '

for log in "${LOGS[@]}"; do
    if [[ $log == *.gz ]]; then CAT="zcat"; else CAT="cat"; fi
    while read -r line; do
        [[ $line =~ $re ]] || continue
        ip=${BASH_REMATCH[1]}
        ts=${BASH_REMATCH[2]}
        method=${BASH_REMATCH[3]}
        path=${BASH_REMATCH[4]}
        status=${BASH_REMATCH[5]}

        if [ -z "${ts_cache[$ts]:-}" ]; then
            # 23/Aug/2026:12:18:25 +0000 → 23 Aug 2026 12:18:25
            ts_norm=${ts//\// }
            ts_norm=${ts_norm/:/ }
            ts_norm=${ts_norm% +*}
            ts_cache[$ts]=$(date -u -d "$ts_norm" +%s 2>/dev/null || echo 0)
        fi
        [ "${ts_cache[$ts]}" -lt "$CUTOFF" ] && continue

        req_total=$(( req_total + 1 ))
        ip_count[$ip]=$(( ${ip_count[$ip]:-0} + 1 ))

        case "$method $path" in
            *" /api/photos/"*) req_photo=$(( req_photo + 1 )) ;;
            "POST /api/fish"*) req_upload=$(( req_upload + 1 )) ;;
            "POST /api/users/me/avatar"*) req_upload=$(( req_upload + 1 )) ;;
        esac
        case "$status" in 4*|5*) req_err=$(( req_err + 1 )) ;; esac
    done < <($CAT "$log" 2>/dev/null || true)
done

unique_ips=${#ip_count[@]}
top_ips=""
if [ "$unique_ips" -gt 0 ]; then
    top_ips=$(for ip in "${!ip_count[@]}"; do echo "${ip_count[$ip]} $ip"; done \
        | sort -rn | head -3 | awk '{ printf "%s%s (%s)", sep, $2, $1; sep = ", " }')
fi

# ── thresholds → priority-1 alert ────────────────────────────────────────────

alert_parts=""
if [ "$ops_b" != "?" ] && [ "$ops_b" -gt "$ALERT_B" ] 2>/dev/null; then alert_parts+="Class B ops ${ops_b} > ${ALERT_B}; "; fi
if [ "$ops_a" != "?" ] && [ "$ops_a" -gt "$ALERT_A" ] 2>/dev/null; then alert_parts+="Class A ops ${ops_a} > ${ALERT_A}; "; fi
if [ "$req_total" -gt "$ALERT_REQ" ] 2>/dev/null; then alert_parts+="origin req ${req_total} > ${ALERT_REQ}; "; fi

if [ -n "$alert_parts" ]; then
    push_notify "🚨 Ryby R2 — anomaliczny ruch!" \
        "Przekroczone progi (24h): ${alert_parts}Sprawdź Cloudflare → R2 metrics; rozważ Cache Rule dla cdn.ryby.dom3k.pl / Under Attack mode." \
        1 siren
fi

# ── daily report push ────────────────────────────────────────────────────────

if [ -n "$ops_cost_str" ]; then
    ops_line="🔄 R2 ops (24h): B=${ops_b}, A=${ops_a} ${ops_cost_str}"
else
    ops_line="🔄 R2 ops (24h): B=${ops_b}, A=${ops_a} ${ops_note}"
fi

[ "$obj_bytes" = "?" ] && obj_bytes=0

REPORT="🐋 Ryby — raport wieczorny (24h)

📦 R2: $(human_bytes "$obj_bytes") / ${obj_count} obj${delta_str}
${ops_line}
🌐 Origin: ${req_total} żądań, ${unique_ips} IP, err ${req_err}
   top: ${top_ips:-—}
📸 Foto redirecty: ${req_photo} · uploady: ${req_upload}"

echo "$REPORT"
push_notify "🐋 Ryby — raport R2 (24h)" "$REPORT"

echo "$LOG_PREFIX === R2 report end ==="
