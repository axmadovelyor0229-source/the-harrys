# the harry's — server-ready V19

Production-oriented package for one VPS. It contains:
- Nginx frontend
- Node.js API
- PostgreSQL 16
- JWT authentication with bcrypt password hashes
- centralized application state
- user synchronization endpoint for Super Admin
- iikoCloud Transport API connector (server-side only)
- health check
- Docker Compose deployment
- PostgreSQL backup/restore scripts

## First VPS deployment
1. Install Docker + Docker Compose plugin on Ubuntu 24.04.
2. Copy this folder to `/opt/the-harrys`.
3. `cp .env.example .env` and replace all CHANGE_ME values.
4. Add `IIKO_API_LOGIN` when iiko gives/enables the API login.
5. Run `./scripts/deploy.sh`.
6. Open `http://SERVER_IP/` and test `/api/health`.
7. Put the domain behind HTTPS (recommended: Caddy, Traefik, or Certbot/Nginx).
8. Immediately change every default demo password.

## Backups
Run `./scripts/backup.sh` daily with cron. It keeps 14 days locally. For real production also copy backups to a second storage/location.

## Updates
Keep `/opt/the-harrys` in Git. Update code, run `./scripts/backup.sh`, then `./scripts/deploy.sh`. PostgreSQL volume is separate from frontend/backend containers, so normal code updates do not erase business data.

## iikoCloud
The API login is stored only in `.env` on the server. Never put it in frontend JavaScript. The backend includes `/api/iiko/status` and `/api/iiko/organizations` for connectivity tests. Further order/menu/customer sync can be added after the exact iikoCloud permissions and organization IDs are confirmed.

## Important
This package is a migration foundation. Before public production use, set strong passwords, HTTPS, firewall rules, off-server backups, and verify iikoCloud permissions/organization mappings.
