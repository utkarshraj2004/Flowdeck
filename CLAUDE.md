# Flowdeck

Self-hosted team work management (workspaces → boards → lists → cards) with real-time collaboration. Node.js 22 + Fastify 5 + PostgreSQL 16 server, React 19 + Vite web client, Docker Compose deployment. **Not a static site**: GitHub Pages is not used.

## Read first
- `docs/HANDOFF.md`: current state, what's next, how to resume.
- `docs/IMPLEMENTATION-CHECKLIST.md`: complete / partial / pending features. Update it when status changes.
- `docs/ARCHITECTURE.md`: design, invariants, real-time contract.
- `research/`: product research and spec (**reference only**; observations of another product, not Flowdeck's behaviour).

## Structure
- `server/src/`: `app.ts` (HTTP setup, auth/CSRF hook), `routes/` (REST + WebSocket), `lib/` (permissions, mutation/events, hub, positions, search), `cli.ts`, `migrate.ts`.
- `web/src/`: `pages/`, `board/` (BoardPage, ListColumn, CardModal, BoardMenu, store), `components/`.
- `migrations/NNNN_*.sql`: forward-only; never edit a shipped migration.
- `tests/unit`, `tests/api` (Vitest + real PostgreSQL), `tests/e2e` (Playwright).
- `.devcontainer/`: GitHub Codespaces preview (`docs/CODESPACES.md`): compose with PostgreSQL, background supervisor, `flowdeck` helper; runtime data in gitignored `.codespace-data/`.
- `scripts/`: `dev-setup.sh` (SessionStart hook), `backup.sh`, `restore.sh`, `compose-smoke.mjs`, `dependency-notices.mjs`.

## Commands
- Setup: `bash scripts/dev-setup.sh` (runs automatically at session start: `npm ci`, starts the local PostgreSQL, creates role/db `flowdeck`/`flowdeck`).
- Dev: `npm run dev` (API :8080, web :5173). First admin: `npm run cli -- admin create --email you@example.com`. Cloud sessions have no port forwarding/web preview: the owner cannot open these ports. Show results with screenshots; the owner runs Flowdeck locally with Docker Compose.
- `npm run typecheck` · `npm test` · `npm run build` · `npm run test:e2e` (after `npm run build:web`).
- **`npm run check` before every commit.**
- Deployment drill: `EXTRA_CA_CERT=/root/.ccr/ca-bundle.crt node scripts/compose-smoke.mjs`. In Claude Code Cloud: start `dockerd` first. Docker Hub is rate-limited there, so `docker pull mirror.gcr.io/library/{postgres:16-alpine,node:22-bookworm-slim}` and `docker tag` them to the plain names.
- Codespaces preview: the owner's way to open the app in a browser (cloud sessions have no preview). Test changes to `.devcontainer/` locally with `@devcontainers/cli` (`devcontainer up`) under `dockerd`; see `docs/HANDOFF.md`. Never make the forwarded port public.
- ECC plugin (`ecc@ecc`) is enabled at project scope in `.claude/settings.json`; keep the existing SessionStart hook. Do not also run ECC's manual installer (duplicate hooks).
- Browser tests use `CHROMIUM_PATH` or `/opt/pw-browsers/chromium` (the installed Playwright version expects a different Chromium build; do not run `playwright install` here).

## Rules
- Every write goes through `runMutation` and a permission check (`requireBoard` / `requireWorkspace`). No access → 404; visible but not allowed → 403 with a reason; never a silent 2xx.
- A board and a workspace always keep ≥1 admin (`409 last_admin`).
- Clients apply server events in `seq` order only (`ingest`).
- Title, description and date edits send `base`; on `409 version_conflict` the UI asks the user. Never overwrite silently.
- Own wording and design; do not copy another product's text, icons or artwork.
- Do not import Trello data or use Trello credentials unless the owner explicitly asks.

## Deployment
Teams run Docker Compose on their own server (`docs/OPERATIONS.md`). Never publish or deploy anything without the owner's approval. Do not merge PRs.

## Credentials
Never commit secrets, tokens, keys, `.env` or real user data (`.gitignore` blocks them). Never print or paste credentials. Tests use synthetic accounts only.
