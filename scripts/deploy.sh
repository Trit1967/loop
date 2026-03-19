#!/usr/bin/env bash
# Deploy Claude Terminal Platform to VPS
# Usage: bash scripts/deploy.sh [user@host] [ssh-key]
set -euo pipefail

HOST="${1:-claude@$(cat .deploy-host 2>/dev/null || echo 'YOUR_VPS_IP')}"
KEY="${2:-$HOME/.ssh/hetzner_ed25519}"
APP_DIR="/opt/claude-terminal"

echo "=== Deploying to $HOST ==="

# Sync files (exclude node_modules, .env, data/)
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude '.deploy-host' \
  -e "ssh -i $KEY" \
  ./ "$HOST:$APP_DIR/"

echo "Files synced"

# Install dependencies and restart
ssh -i "$KEY" "$HOST" << 'REMOTE'
  cd /opt/claude-terminal
  npm install --production
  mkdir -p data

  # Restart service
  sudo systemctl restart claude-terminal
  sleep 2

  # Check status
  if systemctl is-active --quiet claude-terminal; then
    echo "✓ claude-terminal is running"
  else
    echo "✗ claude-terminal failed to start"
    journalctl -u claude-terminal --no-pager -n 20
    exit 1
  fi
REMOTE

echo ""
echo "=== Deploy complete ==="
echo "Dashboard: https://loop.seafin.ai"
