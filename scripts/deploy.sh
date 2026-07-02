#!/bin/bash
# deploy.sh — Deploy the built app to the VPS
# Usage: ./deploy.sh [user@host] [port]
# Example: ./deploy.sh root@amy135.mikrus.xyz 10135

set -euo pipefail

cd "$(dirname "$0")/.."

HOST="${1:-root@amy135.mikrus.xyz}"
PORT="${2:-22}"

echo "=== Building ==="
./scripts/build.sh

echo "=== Stopping service ==="
ssh -p "$PORT" "$HOST" "systemctl stop rybaspotting || true"

echo "=== Copying backend binary ==="
ssh -p "$PORT" "$HOST" "mkdir -p /opt/rybaspotting"
scp -P "$PORT" dist/rybaspotting "$HOST:/opt/rybaspotting/"

echo "=== Copying frontend ==="
scp -P "$PORT" -r frontend/dist "$HOST:/opt/rybaspotting/frontend/"

echo "=== Copying systemd service ==="
scp -P "$PORT" deploy/rybaspotting.service "$HOST:/etc/systemd/system/"
ssh -p "$PORT" "$HOST" "systemctl daemon-reload"

echo "=== Copying nginx config ==="
scp -P "$PORT" deploy/nginx.conf "$HOST:/etc/nginx/sites-available/rybaspotting"
ssh -p "$PORT" "$HOST" "ln -sf /etc/nginx/sites-available/rybaspotting /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx || systemctl restart nginx"

echo "=== Copying cloudflared config ==="
scp -P "$PORT" deploy/cloudflared.yml "$HOST:/etc/cloudflared/config.yml" || echo "cloudflared config copied (needs tunnel ID filled in)"

echo "=== Copying .env (if exists) ==="
if [ -f .env ]; then
  scp -P "$PORT" .env "$HOST:/opt/rybaspotting/"
fi

echo "=== Setting up photo directory ==="
ssh -p "$PORT" "$HOST" "mkdir -p /var/lib/rybaspotting/photos"

echo "=== Starting service ==="
ssh -p "$PORT" "$HOST" "systemctl start rybaspotting"
ssh -p "$PORT" "$HOST" "systemctl enable rybaspotting"

echo "=== Done! ==="
echo "Check status: ssh -p $PORT $HOST 'systemctl status rybaspotting'"
echo ""
echo "Remaining manual steps:"
echo "  1. SSH into server and run:    sudo -u postgres psql -d YOUR_DB -c 'CREATE EXTENSION cube; CREATE EXTENSION earthdistance;'"
echo "  2. Edit .env with real DB credentials"
echo "  3. Setup cloudflared tunnel (see deploy/cloudflared.yml)"
