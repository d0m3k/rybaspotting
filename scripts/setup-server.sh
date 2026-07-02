#!/bin/bash
# setup-server.sh — Complete VPS setup for rybaspotting
# Run this ON the server OR remotely via:
#   ssh -p 10135 root@amy135.mikrus.xyz 'bash -s' < scripts/setup-server.sh
#
# Prerequisites: Run manually once with mikrus panel to get DB credentials
#   - Check your Mikrus panel for PostgreSQL credentials
#   - Run: cat /root/.mikrus/db.txt  (if mikrus setup exists)

set -euo pipefail

echo "=== 1. Installing system packages ==="
apt-get update -qq
apt-get install -y -qq nginx postgresql postgresql-contrib certbot curl

echo "=== 2. Setting up PostgreSQL ==="
# Start PostgreSQL if not running
pg_lsclusters 2>/dev/null | grep -q online || pg_ctlcluster 15 main start 2>/dev/null || service postgresql start

# Create database and extensions (adjust user/pass as needed)
# NOTE: On Mikrus, you might already have a DB set up in the panel
# If using default postgres user:
#   sudo -u postgres psql -c "CREATE USER m135_rybaspotting WITH PASSWORD 'YOUR_PASSWORD';"
#   sudo -u postgres psql -c "CREATE DATABASE m135_rybaspotting OWNER m135_rybaspotting;"
#   sudo -u postgres psql -d m135_rybaspotting -c "CREATE EXTENSION IF NOT EXISTS cube;"
#   sudo -u postgres psql -d m135_rybaspotting -c "CREATE EXTENSION IF NOT EXISTS earthdistance;"

echo "=== 3. Setting up app directory ==="
mkdir -p /opt/rybaspotting
mkdir -p /var/lib/rybaspotting/photos

echo "=== 4. Setting up systemd service ==="
# Service file is deployed by deploy.sh, but here's a manual fallback:
if [ ! -f /etc/systemd/system/rybaspotting.service ]; then
  cat > /etc/systemd/system/rybaspotting.service << 'SERVICEEOF'
[Unit]
Description=Ryby z Dupom — Spotter backend
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/rybaspotting
EnvironmentFile=/opt/rybaspotting/.env
ExecStart=/opt/rybaspotting/rybaspotting
Restart=always
RestartSec=5
LimitNOFILE=65536

NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICEEOF
  systemctl daemon-reload
fi

echo "=== 5. Setting up nginx ==="
cat > /etc/nginx/sites-available/rybaspotting << 'NGINXEOF'
server {
    listen 80;
    server_name ryby.dom3k.pl;

    root /opt/rybaspotting/frontend/dist;
    index index.html;

    location /photos/ {
        alias /var/lib/rybaspotting/photos/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

# Enable the site
ln -sf /etc/nginx/sites-available/rybaspotting /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx || systemctl restart nginx

echo "=== 6. Setting up cloudflared ==="
if ! command -v cloudflared &>/dev/null; then
  echo "Installing cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi

# Create cloudflared config
# NOTE: You need to run these AFTER this script:
#   cloudflared tunnel login
#   cloudflared tunnel create rybaspotting
# Then edit /etc/cloudflared/config.yml with your tunnel ID
mkdir -p /etc/cloudflared

cat > /etc/cloudflared/config.yml << 'CLEOF'
tunnel: YOUR-TUNNEL-ID
credentials-file: /root/.cloudflared/YOUR-TUNNEL-ID.json

ingress:
  - hostname: ryby.dom3k.pl
    service: http://localhost:80
  - service: http_status:404
CLEOF

echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "Next steps (manual):"
echo "  1. Edit /opt/rybaspotting/.env with your DB credentials"
echo "  2. Set up PostgreSQL extensions:"
echo "     sudo -u postgres psql -d your_database -c 'CREATE EXTENSION cube;'"
echo "     sudo -u postgres psql -d your_database -c 'CREATE EXTENSION earthdistance;'"
echo "  3. Run deploy.sh from local machine:"
echo "     ./scripts/deploy.sh root@amy135.mikrus.xyz 10135"
echo "  4. Register and approve admin user"
echo "  5. Setup cloudflared tunnel:"
echo "     cloudflared tunnel login"
echo "     cloudflared tunnel create rybaspotting"
echo "     cloudflared tunnel route dns <id> ryby.dom3k.pl"
echo "     systemctl enable cloudflared"
echo "     systemctl start cloudflared"
echo ""
