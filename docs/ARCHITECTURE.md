# Flowdeck architecture

This describes the code as it is now (version 0.1.0). The original design proposals are in [`research/`](../research/README.md) (reference material). Where the code differs from them, this file says so.

## Stack and why

| Layer | Choice | Why | Tradeoff |
|---|---|---|---|
| Server | **Node.js 22 LTS + TypeScript + Fastify 5** | One language for client and server; Fastify is maintained, fast and has first-party WebSocket, multipart, cookie and rate-limit plugins | Single-threaded process. Fine for the ~50-user target |
| Database | **PostgreSQL 16** via `pg`, plain SQL | Transactions, row locks for ordering and sequence numbers, `COLLATE "C"` for byte-ordered position keys; no ORM magic to learn | SQL lives in route files. Queries are reviewed by hand rather than generated |
| Migrations | Own ~70-line runner (`server/src/migrate.ts`) + numbered `.sql` files | Forward-only, one transaction per migration, advisory lock, refuses a newer schema; easy to read | No down-migrations (rollback = restore a backup, as the research recommended) |
| Web client | **React 19 + Vite 7 + React Router 7** | Mature, widely known; Vite gives a fast dev loop and a static build the server serves | ~540 kB JS bundle (gzip ~180 kB); not code-split yet |
| Drag and drop | **@dnd-kit** (mouse + touch sensors) + own keyboard move mode | Maintained, works with touch, lets us control collision and auto-scroll | Keyboard moves are custom code, not dnd-kit's sensor (clearer announcements and cross-list moves) |
| Ordering | **fractional-indexing** string keys | A move rewrites one row; no renumbering storms | Keys can grow; the server rebalances a list when a key exceeds 48 chars |
| Passwords | **argon2id** (`@node-rs/argon2`, prebuilt binaries) | Current OWASP recommendation | Native module (prebuilt for linux-x64/arm64, macOS, Windows) |
| Markdown | **markdown-it** in the browser, `html: false` | Raw HTML is never rendered; the link validator blocks `javascript:`/`data:` URLs | Rendering happens client-side only |
| Tests | **Vitest** (unit + API with real PostgreSQL), **Playwright** (browser), **axe-core** (accessibility) | Real database and real browser, so tests catch integration bugs | Needs PostgreSQL to run the API tests |
| Packaging | **Docker Compose**: `app` + `postgres:16-alpine` (+ optional `caddy`) | One command on any Docker host; named volumes for persistence | Docker required on the server |

**Not used, on purpose:**
- Redis or a message broker: a single node uses in-process pub/sub.
- An ORM.
- Server-side rendering.
- Any SaaS dependency: no external calls at runtime, and no telemetry.

## Request flow

```
Browser ──HTTPS/HTTP──▶ Fastify app
   │                     ├─ onRequest: session cookie → user; CSRF header check for unsafe methods
   │                     ├─ route handler: validate → requireBoard(user, board, need) → runMutation(...)
   │                     │      runMutation = BEGIN → lock board row(s) → change rows → append activity (seq+1)
   │                     │                    → insert notifications → COMMIT → publish events → push notifications
   │                     └─ response: { data, event } (the event lets the client apply its own change in order)
   └──WebSocket /api/v1/ws──▶ Hub: subscribe(board, sinceSeq) → access check → replay missed events → live events
```

### Key modules

| File | Responsibility |
|---|---|
| `server/src/app.ts` | Fastify setup, security headers (CSP, nosniff, frame-deny), session + CSRF hook, error mapping, health endpoints, static web client, log redaction |
| `server/src/lib/permissions.ts` | The permission policy: effective role per board (`admin` / `member` / `observer` / `viewer`), capability matrix, `requireBoard`, `requireWorkspace` |
| `server/src/lib/mutation.ts` | `runMutation`: transaction, board locks, activity/seq allocation, notification fan-out (never to the actor; only to people who can see the board), post-commit publishing |
| `server/src/lib/hub.ts` | In-process realtime hub: subscriptions, presence, "is editing" state with 30 s expiry, re-checking access after role, membership or visibility changes |
| `server/src/lib/positions.ts` | Fractional keys for "top / bottom / after X", with rebalancing |
| `server/src/lib/search.ts` | Search query parser and SQL builder |
| `server/src/routes/*.ts` | REST endpoints (auth, workspaces/invites, boards, lists, cards, card details, attachments, search, notifications, admin, ws) |
| `web/src/realtime.ts` | One WebSocket per tab: re-subscribes with the last applied `seq` after reconnects; heartbeat and browser `offline` handling for half-open sockets |
| `web/src/board/BoardPage.tsx` | Board state, strictly ordered event ingestion with gap detection, polling fallback, drag/keyboard moves, filters |
| `web/src/board/store.ts` | Event reducer (upserts the entity snapshots carried by events) |
| `web/src/board/CardModal.tsx` | Card dialog: conflict handling, presence, drafts, all card features |

## Data model

The tables are in [`migrations/0001_initial.sql`](../migrations/0001_initial.sql):
- `users`, `sessions`, `user_tokens` (one-time setup/reset links; only hashes are stored);
- `workspaces`, `workspace_members`, `invites`;
- `boards`, `board_members`, `board_stars`;
- `lists`, `labels`, `cards`, `card_labels`, `card_members`;
- `checklists`, `check_items`, `comments`, `attachments`;
- `activity` (the per-board event log), `subscriptions` (watching), `notifications`, `audit_log`.

Guest status is **derived**: a user is a guest when they have a `board_members` row but no `workspace_members` row.

Differences from the research data model (`research/05-data-model.md`):
- IDs are UUIDv4 (`gen_random_uuid()`), not UUIDv7.
- Boards have an 8-character `short_id` and cards a per-board `number`; card URLs are `/b/<shortId>/c/<number>`, without a slug.
- Attachments are stored one file per upload under `/data/uploads/<xx>/<random key>`, not content-addressed or deduplicated (SHA-256 is recorded). Files are removed right after their card, list, board or workspace is deleted, not by a delayed garbage collector.
- Not built yet: reactions, custom fields, TOTP, password-reset-by-email tables.

## Real-time contract (as implemented)

- Each board has `boards.last_seq`. Every mutation locks the board row, increments `last_seq` and writes an `activity` row with that `seq`, in the same transaction. Sequence numbers are therefore gap-free and ordered per board.
- An event message is `{type:'event', board, seq, event, actor, at, clientMutationId, data}`. The `data` carries the changed entity snapshot (card front, list, board, member list, label), never the whole board.
- **Client:** applies events strictly in `seq` order and buffers out-of-order ones. If a gap persists for 1.5 s, it re-subscribes with `sinceSeq` and the server replays. When the gap exceeds 1,000 events, it receives `resync_required` and reloads the snapshot.
- **Reconnect:** exponential backoff (1 s → 30 s, with jitter); the browser `online` event triggers an immediate retry. The client pings every 15 s, and if nothing arrives for 45 s, or the browser goes `offline`, it drops the socket and reconnects. This catches half-open connections that never fire `close`.
- **Fallback:** if the socket is down for 10 s, the board polls `GET /boards/:id/events?sinceSeq=` (every 5 s while visible, 60 s while hidden).
- **Access:** checked on subscribe and re-checked after membership, role or visibility changes. The affected socket gets `board.member_role_changed` (with its new capabilities) or `board.access_revoked`.
- **Presence:** `presence` lists who has the board open. `editing` (description/title) expires after 30 s without a heartbeat.

**Scaling limit:** the hub lives in process memory, so a single app process serves all sockets. Multiple replicas would need a shared bus (PostgreSQL `LISTEN/NOTIFY` or Redis). This is not implemented.

## Ordering and concurrency

- Positions are fractional string keys compared byte-wise. Clients send `{afterId}` / `"top"` / `"bottom"`, never raw numbers, and the server computes the key under the board lock.
- **Moves are not version-gated.** Two concurrent moves both succeed, and everyone converges on the last one through `seq` order.
- **Title, description and dates** use a *base check*. The client sends the value it started editing from (`base`). If the stored value changed in the meantime, and differs from what the client wants to save, the server answers `409 version_conflict` with the current value and who changed it. The client then asks the user to keep theirs, keep mine, or combine. Unrelated edits to the same card (labels, checklists, moves) never cause false conflicts, which is why Flowdeck uses this check rather than one row-level version number.
- Label, member and checklist toggles are set operations (idempotent).
- **Deliberate differences from the reference product** (`research/07`): no silent last-write-wins on text, a live notice when someone else saves the field you are editing, and drafts are kept, with a "Copy draft", when the card is deleted under you.

## Permissions

The rules follow the "Flowdeck model" in `research/04-permissions.md`:

| Role | What it can do |
|---|---|
| Workspace admin | Administers every board in the workspace, including private ones |
| Workspace member | Can view workspace-visible boards (as a *viewer*) and self-join them when the board allows it |
| Board admin | Manages settings, visibility, members and roles; can close and delete the board; can delete non-admins' comments |
| Board member | Edits lists and cards; may delete archived items; can add people when the board's invitation setting allows |
| Observer | Reads; comments when the board's comment setting allows |
| Guest | A board member from outside the workspace; sees only their boards |

**Invariants enforced on the server:**
- A board and a workspace always keep at least one admin. Demote, remove or leave by the last admin returns `409 last_admin`.
- Card members must be board members. Cross-board moves drop the others, and the activity log records it.
- A user without access gets `404` (existence is never revealed). A user who can see the board but lacks a capability gets `403 forbidden` with an explanation.
- There are no silent no-ops: tests read state back after every denied write.

## Security measures

- **Sessions:** a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` with HTTPS); only its SHA-256 is stored. Sessions are revoked on logout, password change, reset and user disable.
- **CSRF:** every unsafe request needs the `X-CSRF-Token` header that matches the session. The WebSocket checks `Origin`.
- **Passwords:** argon2id, minimum 12 characters. Login is rate-limited (5 per minute per IP+account) and returns one generic error message.
- **One-time links:** hashed, expiring (24 h setup, 1 h reset), single use, and redacted from logs.
- **Headers:** CSP `default-src 'self'` (inline *styles* are allowed for drag transforms), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` on the API.
- **Uploads:**
  - permission is checked before reading the body;
  - the size is enforced while streaming (`413`), and partial files are removed;
  - downloads go only through the authenticated route, with a `sandbox` CSP;
  - only PNG, JPEG, GIF, WebP, PDF and plain text are shown inline; HTML, SVG and everything else are downloaded;
  - links must be `http(s)` and are never fetched by the server (no SSRF).
- **Audit log:** user creation and updates, reset links, workspace role changes and removals, board and workspace deletion.

## Testing strategy

See [README → Testing](../README.md#testing-and-github-actions). The research test plan (`research/09-test-plan.md`) mapped to the implementation:

- **U, A, R and P cases:** largely covered by `tests/unit` and `tests/api`. The P (permission) cases are not generated cell-by-cell; they are representative cells, each read back.
- **E cases:** E1, E2, E3, E5, E7, E10, E11 and E12 by `tests/e2e`; E4 (card details) partly (description, conflicts, uploads, comments). E6 (archive/restore/delete) and E9 (close/reopen/delete board) are covered by API tests, not browser tests. E8 (phone) is covered with emulated touch.
- **O1 and O2:** covered by `scripts/compose-smoke.mjs`. O3 (upgrade N→N+1) is covered only by the "refuses newer schema" test, because there is no second release yet. O4 (load) is not covered yet.
