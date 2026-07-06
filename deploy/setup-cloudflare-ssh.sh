#!/bin/bash
# setup-cloudflare-ssh.sh — uruchom NA INSTANCJI (przez hotspot)
# Po tym skrypcie SSH będzie dostępne przez Cloudflare Tunnel:
#   ssh -o "ProxyCommand=/tmp/cloudflared access ssh --hostname m.dom3k.pl" root@m.dom3k.pl
set -euo pipefail

echo "=== Cloudflare Tunnel SSH setup ==="

# 1. Credentials file dla tunelu
echo "[1/6] Creating credentials file..."
mkdir -p /root/.cloudflared
cat > /root/.cloudflared/9deb503f-f6d1-4347-9374-8e01b44affa3.json << 'CREDS'
{
  "AccountTag": "ec57bcd4c27446c1862890191884a1d5",
  "TunnelID": "9deb503f-f6d1-4347-9374-8e01b44affa3",
  "TunnelSecret": "441b9d46-dc69-4a6c-a077-e4fdc102a552"
}
CREDS
echo "   OK"

# 2. Nowy config cloudflared z SSH ingress
echo "[2/6] Creating cloudflared config with SSH ingress..."
cat > /etc/cloudflared/config.yml << 'CONF'
tunnel: 9deb503f-f6d1-4347-9374-8e01b44affa3
credentials-file: /root/.cloudflared/9deb503f-f6d1-4347-9374-8e01b44affa3.json

ingress:
  # SSH via Cloudflare
  - hostname: m.dom3k.pl
    service: ssh://localhost:22

  # HTTP (rybaspotting)
  - hostname: ryby.dom3k.pl
    service: http://localhost:80

  # Fallback
  - service: http_status:404
CONF
echo "   OK"

# 3. Wyłącz password auth w SSH
echo "[3/6] Hardening SSH (disabling password auth)..."
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
grep -q '^PasswordAuthentication' /etc/ssh/sshd_config || echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config

sed -i 's/^#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^PermitRootLogin without-password/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
# Upewnij się, że PermitRootLogin nie jest yes
if grep -q '^PermitRootLogin yes' /etc/ssh/sshd_config; then
    sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
fi

echo "   SSH config:"
grep -E '^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)' /etc/ssh/sshd_config
systemctl restart sshd
echo "   sshd restarted"

# 4. Przełącz cloudflared z --token na --config
echo "[4/6] Switching cloudflared from token-based to config-based..."
systemctl stop cloudflared 2>/dev/null || true

cat > /etc/systemd/system/cloudflared.service << 'SVCEOF'
[Unit]
Description=cloudflared
After=network.target

[Service]
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run --config /etc/cloudflared/config.yml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl start cloudflared
sleep 3
echo "   cloudflared status:"
systemctl is-active cloudflared

# 5. Sprawdź czy tunel działa (HTTP)
echo "[5/6] Testing tunnel (HTTP)..."
curl -s http://localhost:80/ -o /dev/null -w "   HTTP status: %{http_code}\n" || echo "   HTTP check skipped"

# 6. Dodaj klucz do roota (jeśli go nie ma)
echo "[6/6] Ensuring SSH keys for root..."
mkdir -p /root/.ssh
chmod 700 /root/.ssh
if [ ! -f /root/.ssh/authorized_keys ]; then
    touch /root/.ssh/authorized_keys
    chmod 600 /root/.ssh/authorized_keys
fi

echo ""
echo "=== DONE ==="
echo ""
echo "Teraz na lokalnym komputerze:"
echo ""
echo "  1. Zainstaluj cloudflared:"
echo "     curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared"
echo "     chmod +x /usr/local/bin/cloudflared"
echo ""
echo "  2. Dodaj do ~/.ssh/config:"
echo ""
echo "     Host amy135-tunnel"
echo "         Hostname m.dom3k.pl"
echo "         User root"
echo "         ProxyCommand /usr/local/bin/cloudflared access ssh --hostname m.dom3k.pl"
echo ""
echo "  3. Połącz się:"
echo "     ssh amy135-tunnel"
echo ""
echo "  4. (opcjonalnie) Dla klucza mikrus:"
echo "     ssh -i ~/.ssh/mikrus -o 'ProxyCommand=cloudflared access ssh --hostname m.dom3k.pl' domek@m.dom3k.pl"
echo ""
echo "UWAGA: Musisz też skonfigurować Cloudflare Access w panelu Zero Trust,"
echo "żeby SSH przez tunel działało. Patrz instrukcja niżej."
