# Contributing to Flowdeck

## Set up

Requirements: Node.js 22 and PostgreSQL 16. Docker is optional; it is only needed for the deployment smoke test.

```bash
npm ci
# A local PostgreSQL role that may create databases (the tests create one throwaway database per test file):
sudo -u postgres psql -c "CREATE ROLE flowdeck LOGIN PASSWORD 'flowdeck' CREATEDB"
sudo -u postgres createdb -O flowdeck flowdeck
```

In Claude Code Cloud, `scripts/dev-setup.sh` does all of this at session start.

Defaults the code assumes in development (override with environment variables):
- `DATABASE_URL=postgres://flowdeck:flowdeck@localhost:5432/flowdeck`: the dev server's database.
- `TEST_DATABASE_URL=postgres://flowdeck:flowdeck@localhost:5432/postgres`: the admin connection the tests use to create and drop `flowdeck_test_*` and `flowdeck_e2e` databases.
- `FLOWDECK_DATA_DIR=./data`: where uploads are stored in development (git-ignored).

## Everyday commands

| Command | Purpose |
|---|---|
| `npm run dev` | API on :8080 (auto-restart with `tsx watch`) + web on :5173 (Vite, proxies `/api`) |
| `npm run cli -- admin create --email you@example.com` | First admin for the dev database |
| `npm run typecheck` | TypeScript for server and web |
| `npm test` | Unit + API/realtime tests (Vitest, real PostgreSQL) |
| `npm run build` | `dist/server` + `dist/web` |
| `npm run test:e2e` | Playwright browser tests (needs `npm run build:web`; starts its own server on :4173). Uses `CHROMIUM_PATH` or `/opt/pw-browsers/chromium` if present, otherwise `npx playwright install chromium` |
| `npm run check` | All of the above: **run before every commit** |
| `node scripts/compose-smoke.mjs` | Docker build + backup/restore drill in an isolated Compose project (set `EXTRA_CA_CERT` behind a TLS-inspecting proxy) |

## Conventions

- **Server:**
  - Every mutation goes through `runMutation`, which locks the board, emits an event, notifies and publishes after commit.
  - Every route checks access with `requireBoard` / `requireWorkspace` before reading input that could be large.
  - Return `404` when the user cannot see the board, and `403 forbidden` with a human-readable reason when they can see it but lack the capability.
  - Never return 2xx for a change that was not applied.
- **Schema changes:** add a new `migrations/NNNN_description.sql`. Never edit a migration that has shipped. Migrations are forward-only.
- **Events:** carry the changed entity snapshot (`card`, `list`, `board`, `members`, `label`) so clients can upsert. Add handling in `web/src/board/store.ts` and wording in `describeActivity`.
- **Client:** apply server events only through `ingest` (it keeps `seq` order). Optimistic updates are limited to drag moves.
- **Text in the UI:** Flowdeck's own wording; do not copy another product's copy, icons or artwork.
- **Tests:** a bug fix comes with a test that fails without it. Prefer API tests for rules and browser tests for interaction.
- **Dependencies:** pin exact versions, check licenses, and run `npm audit` and `node scripts/dependency-notices.mjs` to regenerate [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
- **Secrets:** never commit `.env`, tokens, keys or real user data. `.gitignore` blocks the usual files.

## Pull requests

- Keep PRs focused. Update `CHANGELOG.md` (Unreleased) and, when behaviour or status changes, `docs/IMPLEMENTATION-CHECKLIST.md`.
- CI must be green: typecheck, API tests, build, browser tests and the Docker Compose smoke.
- Describe how you tested, and what you could not test.

## Research material

`research/` is the product research and specification Flowdeck was built from. Treat it as **reference**: it records observations and proposals, not the current behaviour. Current behaviour is described in `README.md` and `docs/`.
