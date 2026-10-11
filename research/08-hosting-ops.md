# 08 · Local hosting, backup, restore, upgrade

**All INF.** Trello is SaaS-only, so there is no Trello evidence for self-hosting.

## Important: GitHub Pages is not enough

The current repo deploys a **static** site to GitHub Pages. A multi-user Flowdeck needs a server process, a database, file storage, and WebSockets, and GitHub Pages provides none of them. Pages can still host a marketing/docs page; the app itself must run on a team-controlled machine (on-prem server, NAS, or a VM).

## Deployment shape

```
[browser] ⇄ HTTPS ⇄ [reverse proxy: Caddy (auto TLS)] ⇄ [flowdeck app: HTTP + WS] ⇄ [PostgreSQL 16]
                                                                  └─ /data/blobs (volume)
                                                                  └─ worker (same image: notifications, GC, thumbnails, scheduled backups)
```

- Single `docker compose up -d`, with images `flowdeck/app`, `postgres:16`, `caddy:2`. Optional: `clamav`, `minio`.
- Minimum host: 2 vCPU, 2 GB RAM, 20 GB disk, Linux x86_64/arm64.
- Configuration via env file (`.env`, never committed — the repo's `.gitignore` already blocks it). Variables (to be defined at build time; listed here as requirements, not yet in code): `FLOWDECK_BASE_URL`, `DATABASE_URL`, `FLOWDECK_SECRET_KEY`, `BLOB_STORE`, `SMTP_URL` (optional), `MAX_UPLOAD_MB`.
- First run: a CLI `flowdeck admin create --email` creates the first system admin. No default password.
- Health: `/healthz` (liveness), `/readyz` (DB + blob store reachable).
- TLS required for non-localhost access (cookies are `Secure`). LAN-only installs can use Caddy's internal CA.

## Backup

| Item | Method | Default schedule |
|---|---|---|
| Database | `pg_dump --format=custom`, run by the worker | daily 02:00, keep 7 daily + 4 weekly |
| Blobs | rsync / `restic` snapshot of `/data/blobs` (content-addressed, so it's incremental by design) | daily, after the DB dump |
| Config | `.env` + compose file, stored separately by the operator (contains secrets) | on change |
| Manifest | `backup.json`: app version, schema version, DB dump checksum, blob count/bytes | each run |

- Consistency rule: blobs are GC'd only 24 h after the last reference is removed (07), so a DB dump never points to a missing blob from the same day.
- Backups are written to `/backups` (a mount); the operator copies them off-host. The admin console shows the last backup time and size, and warns if it's older than 36 h.

## Restore

1. Stop the app (`docker compose stop app worker`).
2. `flowdeck restore --db <dump> --blobs <path>`: verifies the manifest checksum, refuses a dump from a **newer** schema than the binary, restores into an empty DB, and runs migrations forward if the dump is older.
3. Start; `/readyz` must pass; the admin console runs an integrity check (every `attachments.blob_id` exists on disk, reported, not auto-fixed).
- **Restore drill:** CI job (later) restores the latest fixture backup into a fresh container and runs the smoke tests (09 §O).

## Upgrade

- Semantic versioning. Release notes flag any migration that is not reversible.
- Migrations are forward-only, versioned (e.g. `node-pg-migrate`/`sqlx`/`goose`, matching the chosen stack), and run automatically on app start inside an advisory lock. The app refuses to start if the DB schema is newer than the binary.
- Upgrade procedure: take a backup (automatic pre-upgrade dump) → `docker compose pull` → `up -d` → verify `/readyz` → done. Rollback = restore the pre-upgrade backup + previous image tag.
- Zero-downtime is not required for a small team. Expect a few seconds of disconnect; clients auto-reconnect and resync (06).

## Security baseline

argon2id passwords; session rotation on login; CSRF protection; rate limits on auth; CSP `default-src 'self'`; Markdown rendered with a sanitiser (no raw HTML); uploads never executed or served inline as HTML/SVG; audit log for admin actions; dependency and container image scanning in CI.
