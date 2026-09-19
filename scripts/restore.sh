#!/bin/sh
set -eu
[ $# -eq 1 ] || { echo "Usage: $0 backups/file.dump"; exit 1; }
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$1"
