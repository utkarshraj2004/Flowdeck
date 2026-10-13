# Operating Flowdeck

How to install, configure, secure, back up, restore and upgrade a self-hosted Flowdeck. Every command here is run from the Flowdeck directory, the one that contains `docker-compose.yml`.

## Contents

- [Install](#install)
- [Configuration](#configuration)
- [First administrator and user management](#first-administrator-and-user-management)
- [HTTPS and access from outside your network](#https-and-access-from-outside-your-network)
- [Where data lives](#where-data-lives)
- [Backups](#backups)
- [Restore](#restore)
- [Upgrades and rollback](#upgrades-and-rollback)
- [Health and logs](#health-and-logs)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)

## Install

Requirements:
- Docker Engine 24+ with the Compose v2 plugin;
- 2 CPU cores, 2 GB RAM and 20 GB disk recommended;
- git.

```bash
git clone https://github.com/utkarshraj2004/Flowdeck.git
cd Flowdeck
cp .env.example .env            # then edit .env (see Configuration)
docker compose up -d --build
docker compose ps               # "app" becomes (healthy) when ready
docker compose exec app node dist/server/cli.js admin create --email you@example.com
```

Open the printed setup link within 24 hours.

The Compose project is named `flowdeck` and contains:

| Service | Image | Purpose |
|---|---|---|
| `db` | `postgres:16-alpine` | Database (volume `flowdeck_db-data`) |
| `app` | built from `Dockerfile` (`flowdeck:local`) | Web interface, API, WebSocket; runs as the unprivileged `node` user; uploaded files in volume `flowdeck_uploads` |
| `caddy` (optional, profile `https`) | `caddy:2` | HTTPS reverse proxy |

## Configuration

Settings come from `.env`, which is never committed to git. Only these variables exist:

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `FLOWDECK_BASE_URL` | yes | — | The address people type in their browser, e.g. `http://192.168.1.20:8080` or `https://flowdeck.example.com`. Used to build setup and invite links. |
| `POSTGRES_PASSWORD` | yes | — | Database password. Use letters and digits only (`openssl rand -hex 24`). |
| `FLOWDECK_PORT` | no | `8080` | Host port the app is published on. |
| `MAX_UPLOAD_MB` | no | `25` | Maximum size of one uploaded file. |
| `FLOWDECK_TRUST_PROXY` | no | `false` | Set `true` only behind a reverse proxy you control (e.g. the `https` profile), so client IPs are read from `X-Forwarded-For`. |
| `FLOWDECK_COOKIE_SECURE` | no | automatic | Session cookies are `Secure` when `FLOWDECK_BASE_URL` starts with `https://`. Override with `true`/`false` only if you must. |
| `FLOWDECK_DOMAIN` | only for `https` | — | DNS name Caddy serves. |

Internal variables that Compose and the image set for you are `DATABASE_URL`, `PORT`, `FLOWDECK_DATA_DIR` and `FLOWDECK_WEB_DIR`. Outside Docker, `SESSION_DAYS` (default 30) controls how long a login lasts.

After changing `.env`, run `docker compose up -d` to apply it.

## First administrator and user management

- **First admin:** `docker compose exec app node dist/server/cli.js admin create --email you@example.com` prints a one-time setup link, valid for 24 hours. The account has no password until the link is used.
- **More people:** the normal way is a workspace invitation (Workspace → Members → Create invite link). System administrators can also create accounts under **Administration → Users** (also a setup link).
- **Forgotten password:**
  - In the web interface: Administration → Users → **Reset link** (valid 1 hour; using it signs out the person's other sessions).
  - From the server: `docker compose exec app node dist/server/cli.js admin reset-link --email them@example.com`.
- **Disable someone:** Administration → Users → **Disable**. This signs them out at once, their live connections lose access, and they can't log in again.
- **System administrators** manage users and see instance status. They are *not* automatically members of anyone's boards. Workspace admins administer all boards in their own workspace.

Flowdeck sends no email. You share links yourself.

## HTTPS and access from outside your network

On a trusted office network, `http://<server-ip>:8080` works. For anything else, use HTTPS or a VPN: over plain HTTP, passwords and session cookies travel unencrypted.

Built-in option, Caddy with automatic certificates:

1. Point a DNS name, for example `flowdeck.example.com`, at the server. Open ports 80 and 443.
2. In `.env`:
   ```
   FLOWDECK_DOMAIN=flowdeck.example.com
   FLOWDECK_BASE_URL=https://flowdeck.example.com
   FLOWDECK_TRUST_PROXY=true
   ```
3. Run `docker compose --profile https up -d`.
4. Optionally, stop publishing port 8080 to the world, either with a firewall rule or by changing `FLOWDECK_PORT` to `127.0.0.1:8080`.

For a LAN-only name without public DNS, uncomment `tls internal` in [`deploy/Caddyfile`](../deploy/Caddyfile); each browser then needs to trust Caddy's local certificate authority.

Any other reverse proxy works if it:
- forwards WebSocket upgrades on `/api/v1/ws`;
- passes `Host`;
- allows request bodies up to `MAX_UPLOAD_MB`.

## Where data lives

| Data | Location | Removed by |
|---|---|---|
| Users, workspaces, boards, cards, comments, activity, notifications | Volume `flowdeck_db-data` | `docker compose down -v` or `docker volume rm` |
| Attached files | Volume `flowdeck_uploads` (`/data/uploads` in the container) | the same |
| Settings | `.env` (contains secrets: keep a private copy) | you |

`docker compose down`, `restart` and `up --build` keep your data. **`down -v` deletes it.**

## Backups

```bash
scripts/backup.sh                    # writes backups/flowdeck-<UTC time>/
scripts/backup.sh /mnt/nas/flowdeck  # or into another directory
```

Each backup directory contains:
- `db.dump`: PostgreSQL custom-format dump;
- `uploads.tar.gz`: all attached files;
- `SHA256SUMS`;
- `manifest.json`: Flowdeck version and schema version.

Flowdeck keeps running during a backup.

**Schedule it** with cron (daily at 02:15), and keep copies on another machine:

```cron
15 2 * * * cd /opt/Flowdeck && scripts/backup.sh /mnt/backup/flowdeck >> /var/log/flowdeck-backup.log 2>&1
```

Delete old backups yourself, for example with `find /mnt/backup/flowdeck -maxdepth 1 -name 'flowdeck-*' -mtime +30 -exec rm -rf {} +`. Also keep a copy of `.env`, because it holds the database password.

## Restore

```bash
scripts/restore.sh backups/flowdeck-20261012T020000Z
```

The script:
1. verifies the checksums;
2. asks you to type `restore`;
3. stops the app;
4. recreates the database from the dump;
5. replaces the uploaded files;
6. starts the app and waits until it is ready.

Migrations run forward automatically if the backup is from an older Flowdeck version. A backup from a **newer** version is refused: run that newer version instead.

**Restore drill:** `node scripts/compose-smoke.mjs` runs the full cycle in a separate, throwaway Compose project (`flowdeck-smoke`, port 18080). It never touches your real data:
1. build;
2. create an admin;
3. create data and an attachment;
4. restart;
5. back up;
6. wipe the volumes;
7. restore;
8. compare the board export and the file bytes.

CI runs the same script.

## Upgrades and rollback

1. `scripts/backup.sh`, always first.
2. `git pull`, or check out the release you want.
3. `docker compose up -d --build`.
4. `docker compose ps` should show `app` as healthy. Migrations run at start, under a database lock.

Rollback: check out the previous version and run `scripts/restore.sh <backup taken before the upgrade>`. Starting an older Flowdeck against a newer database is refused with a clear message instead of corrupting data.

## Health and logs

- `GET /healthz` returns `{"ok":true}` while the process is alive.
- `GET /readyz` returns 200 when the database is reachable, migrations are applied and the upload folder is writable, and 503 otherwise. The container healthcheck uses it.
- `docker compose logs -f app`: JSON request logs (method, URL, status, timing). Request bodies, passwords and cookies are not logged, and setup/invite tokens are redacted from logged URLs.
- **Administration** page: version, schema, counts and upload storage used.

## Limits

These are per-instance defaults, built in:
- 5,000 open cards per board;
- 475 open lists per board;
- 950 labels per board;
- 50 checklists per card, 200 items per checklist;
- 100 attachments per card;
- `MAX_UPLOAD_MB` per file.

Login is limited to 5 attempts per minute per IP and account.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `required variable FLOWDECK_BASE_URL is missing a value` | Create `.env` from `.env.example` and fill it in. |
| Teammates can't connect | `FLOWDECK_BASE_URL` must use an address they can reach (not `localhost`), and the port must be allowed by the firewall. Test from their machine: `curl http://<server>:8080/healthz`. |
| Setup/invite links point to the wrong address | Fix `FLOWDECK_BASE_URL`, run `docker compose up -d`, then create new links. |
| Login seems to work but you are immediately logged out | `FLOWDECK_BASE_URL` starts with `https://` (cookies become Secure) while people open Flowdeck over plain `http://`, so the browser drops the cookie. Make `FLOWDECK_BASE_URL` match how people really open Flowdeck, or set `FLOWDECK_COOKIE_SECURE=false` only on a trusted LAN. |
| "Connection to Flowdeck lost" banner | The live connection dropped. Flowdeck reconnects with backoff and replays missed changes. Behind a proxy, enable WebSocket upgrades. |
| `toomanyrequests` / rate limit pulling images | Docker Hub limits anonymous pulls. Log in (`docker login`), or use a registry mirror (Docker daemon `registry-mirrors`, for example `https://mirror.gcr.io`). |
| `npm ci` fails during `docker compose build` with `SELF_SIGNED_CERT_IN_CHAIN` | Your network inspects TLS. Build with your proxy's CA certificate: `docker build --secret id=extra_ca,src=/path/to/ca.pem -t flowdeck:local .`, then `docker compose up -d`. |
| App restarts with "schema version … is newer than this Flowdeck build" | The database was upgraded by a newer Flowdeck. Run that version, or restore a backup that matches this one. |
| "File is larger than N MB" | Raise `MAX_UPLOAD_MB` in `.env` (and your proxy's body limit), then `docker compose up -d`. |
| Lost the only administrator password | `docker compose exec app node dist/server/cli.js admin reset-link --email <their email>` |
