#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p backups
set -a; . ./.env; set +a
STAMP=$(date +%Y%m%d_%H%M%S)
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "backups/harrys_${STAMP}.dump"
find backups -type f -name 'harrys_*.dump' -mtime +14 -delete
printf 'Backup created: %s\n' "backups/harrys_${STAMP}.dump"
