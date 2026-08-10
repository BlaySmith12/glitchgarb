#!/usr/bin/env bash
# setup-vps.sh - One-time VPS setup for GlitchGarb (Ubuntu/Debian).
#
# Steps covered:
#   1. Install Docker + Docker Compose plugin
#   2. Create .env from .env.example
#
# NOTE: It deliberately does NOT start the stack yet - you must edit .env FIRST,
# because POSTGRES_PASSWORD is only applied when the database is first created.
#
# Run as your normal user (sudo is used internally):
#   bash deploy/setup-vps.sh
#
# Then:
#   nano .env                      <- fill in real secrets
#   docker compose up -d --build   <- start everything
#   ./deploy/migrate-db.sh "<neon-url>"   <- import live data
#   docker compose restart api
#   See DEPLOY_VPS.md for SSL (certbot)

set -euo pipefail

echo "==> Installing Docker..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
echo "==> Docker installed. Log out and back in if 'docker' permission errors appear."

echo "==> Creating .env from example..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "    .env created."
else
  echo "    .env already exists - leaving it untouched."
fi

echo ""
echo "============================================================"
echo " Next steps (in order):"
echo ""
echo "  1. Edit secrets:            nano .env"
echo "     (set POSTGRES_PASSWORD, JWT_SECRET, RESEND_API_KEY,"
echo "      PAYSTACK_SECRET_KEY, GOOGLE_CLIENT_ID/SECRET)"
echo ""
echo "  2. Start the stack:         docker compose up -d --build"
echo ""
echo "  3. Import data from Neon:   ./deploy/migrate-db.sh \"<neon-url>\""
echo ""
echo "  4. Restart api:             docker compose restart api"
echo ""
echo "  5. Enable HTTPS:            see DEPLOY_VPS.md Step 6"
echo "============================================================"
