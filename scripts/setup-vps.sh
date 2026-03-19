#!/usr/bin/env bash
# Claude Terminal Platform — VPS Setup Script
# Run as root on a fresh Ubuntu 24.04 VPS
set -euo pipefail

echo "=== Claude Terminal Platform — VPS Setup ==="

# ── System ──
apt-get update && apt-get upgrade -y
apt-get install -y curl git tmux build-essential python3 ufw jq

# ── Node.js 22 ──
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

# ── Claude Code CLI ──
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code
  echo "Claude Code installed"
else
  echo "Claude Code already installed: $(claude --version 2>/dev/null || echo 'unknown')"
fi

# ── Service user ──
if ! id claude &>/dev/null; then
  useradd -m -s /bin/bash claude
  echo "Created user: claude"
fi

# ── Firewall (Cloudflare IPs + SSH) ──
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH from admin IP (passed as $1 or all)
if [ -n "${1:-}" ]; then
  ufw allow from "$1" to any port 22 proto tcp comment "SSH admin"
else
  ufw allow 22/tcp comment "SSH"
fi

# HTTPS from Cloudflare IPv4 ranges
CF_IPS=(
  173.245.48.0/20
  103.21.244.0/22
  103.22.200.0/22
  103.31.4.0/22
  141.101.64.0/18
  108.162.192.0/18
  190.93.240.0/20
  188.114.96.0/20
  197.234.240.0/22
  198.41.128.0/17
  162.158.0.0/15
  104.16.0.0/13
  104.24.0.0/14
  172.64.0.0/13
  131.0.72.0/22
)

for ip in "${CF_IPS[@]}"; do
  ufw allow from "$ip" to any port 443 proto tcp comment "Cloudflare"
done

ufw --force enable
echo "Firewall configured"

# ── TLS directory ──
mkdir -p /etc/ssl/cloudflare
chown claude:claude /etc/ssl/cloudflare
echo "Place Cloudflare origin cert at:"
echo "  /etc/ssl/cloudflare/origin.pem"
echo "  /etc/ssl/cloudflare/origin-key.pem"

# ── App directory ──
APP_DIR=/opt/claude-terminal
mkdir -p "$APP_DIR"
chown claude:claude "$APP_DIR"

# ── Projects directory ──
mkdir -p /home/claude/projects
chown claude:claude /home/claude/projects

# ── Systemd service ──
cat > /etc/systemd/system/claude-terminal.service << 'EOF'
[Unit]
Description=Claude Terminal Platform
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/opt/claude-terminal
EnvironmentFile=/opt/claude-terminal/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=false
ProtectSystem=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable claude-terminal

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Place Cloudflare origin cert in /etc/ssl/cloudflare/"
echo "  2. Deploy the app: bash scripts/deploy.sh"
echo "  3. Create .env from .env.example"
echo "  4. Start: systemctl start claude-terminal"
echo "  5. Point loop.seafin.ai A record to this VPS IP"
echo "  6. Configure Cloudflare: SSL=Full(Strict), WebSocket=On"
