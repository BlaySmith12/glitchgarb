#!/usr/bin/env bash
# migrate-db.sh - Copy all data from Neon PostgreSQL to the local VPS PostgreSQL container.
#
# Run this AFTER the db container is up but BEFORE the api container starts creating tables,
# or any time you want to re-sync data from Neon. It is safe to re-run.
#
# Usage (on the VPS, from the project root):
#   ./deploy/migrate-db.sh "postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
#
# Get your Neon URL from: Neon console -> Connect -> Connection string (Node.js/psql URL).

set -euo pipefail

NEON_URL="${1:-}"
if [[ -z "$NEON_URL" ]]; then
  echo "Usage: $0 \"<neon-postgres-connection-url>\""
  exit 1
fi

# 1. Make sure pg_dump is available
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[migrate] pg_dump not found. Installing postgresql-client..."
  sudo apt-get update
  sudo apt-get install -y postgresql-client
fi

# 2. Wait for the local db container to be healthy
echo "[migrate] Waiting for local db container..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U glitchgarb -d glitchgarb >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == 30 ]]; then
    echo "[migrate] ERROR: db container not ready. Run: docker compose up -d db"
    exit 1
  fi
  sleep 2
done

# 3. Dump from Neon and restore into the local container (plain SQL, safe to re-run)
echo "[migrate] Dumping data from Neon..."
echo "[migrate] Restoring into local PostgreSQL (this may take a few minutes)..."
pg_dump "$NEON_URL" --no-owner --no-acl --clean --if-exists \
  | docker compose exec -T db psql -U glitchgarb -d glitchgarb \
  || { echo "[migrate] ERROR: restore failed"; exit 1; }

echo ""
echo "[migrate] DONE. Data copied from Neon to the VPS database."
echo "[migrate] You can now start the rest of the stack: docker compose up -d --build"
