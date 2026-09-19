#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
[ -f .env ] || { echo "Copy .env.example to .env and fill secrets first."; exit 1; }
docker compose pull
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1/api/health || true
