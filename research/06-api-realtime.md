# 06 · Proposed API and real-time event contracts

**All INF (Flowdeck design).** Trello's REST API (API A01, 324 operations) was used as a completeness checklist, not copied. Trello's WebSocket protocol is **undocumented and unsupported** (DOC D16 notes; community answer), and was **not observed**. Nothing here claims to describe Trello's backend.

## Conventions

- Base path `/api/v1`, JSON, UTF-8. Auth: session cookie (`HttpOnly; Secure; SameSite=Lax`) + CSRF token header `X-CSRF-Token` for unsafe methods. Later: personal access tokens (`Authorization: Bearer`).
- Optimistic concurrency: every mutable resource returns `version`. Updates send `If-Match: <version>`. A mismatch returns `409 version_conflict` with the current resource (07).
- Idempotency: `Idempotency-Key` header on POST. Server stores the key for 24 h per user and replays the original response.
- Positions: client sends `{ "before": id }`, `{ "after": id }`, `"top"` or `"bottom"`. The server computes the fractional key (07). Mirrors Trello's `pos: top|bottom|number` (API A01) without exposing numbers.
- Errors: `{ "error": { "code": "snake_case", "message": "...", "details": {} } }`. Codes: `validation_failed` 422, `unauthenticated` 401, `forbidden` 403, `not_found` 404 (also used for no-access, to avoid leaking existence), `version_conflict` 409, `last_admin` 409, `limit_exceeded` 422, `payload_too_large` 413, `rate_limited` 429.
- Pagination: cursor `?cursor=&limit=` (≤100), response `{ items, nextCursor }`.
- Every mutation returns `{ data, event }`: the updated resource plus the realtime event it produced (`seq`). The client can then ignore its own echo.

## REST endpoints

### Auth and account
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | email, password → session; rate-limited 5/min/IP+email |
| POST | `/auth/logout` | |
| POST | `/auth/password-reset` · `/auth/password-reset/confirm` | |
| GET/PATCH | `/me` | profile, prefs |
| POST | `/me/avatar` | multipart |
| GET/DELETE | `/me/sessions[/:id]` | |
| GET | `/me/boards` · `/me/stars` · PUT/DELETE `/me/stars/:boardId` | |

### Workspaces and invites
| Method | Path |
|---|---|
| GET/POST | `/workspaces` |
| GET/PATCH/DELETE | `/workspaces/:id` |
| GET | `/workspaces/:id/members` · PATCH/DELETE `/workspaces/:id/members/:userId` |
| GET/POST | `/workspaces/:id/invites` (email or link) · DELETE `/invites/:id` |
| GET/POST | `/invites/:token` (inspect / accept; creates account if needed) |
| GET | `/workspaces/:id/boards?filter=open|closed|all` |

### Boards
| Method | Path | Notes |
|---|---|---|
| POST | `/boards` | `{workspaceId, name, visibility, background, sourceBoardId?, keep: ["cards","labels","checklists","members"]}` (copy, A01 `keepFromSource`) |
| GET | `/boards/:id` | **snapshot**: board, members, labels, open lists, open cards (front fields), `seq` |
| PATCH | `/boards/:id` | name, description, visibility, background, prefs |
| POST | `/boards/:id/close` · `/boards/:id/reopen` | admin |
| DELETE | `/boards/:id` | only when closed; admin |
| GET/POST | `/boards/:id/members` · PATCH/DELETE `/boards/:id/members/:userId` | |
| POST | `/boards/:id/join` | self-join pref |
| GET/POST | `/boards/:id/labels` · PATCH/DELETE `/labels/:id` | |
| GET | `/boards/:id/archived?type=cards|lists` | DOC D03 |
| GET | `/boards/:id/activity?cursor=` | |
| GET | `/boards/:id/events?sinceSeq=` | catch-up feed (realtime fallback) |
| GET | `/boards/:id/export` | JSON (board + lists + cards + checklists + comments + activity) |
| PUT/DELETE | `/boards/:id/subscription` | watch |

### Lists
| Method | Path | Notes |
|---|---|---|
| POST | `/boards/:id/lists` | `{name, position}` |
| PATCH | `/lists/:id` | name |
| POST | `/lists/:id/move` | `{boardId?, position}` |
| POST | `/lists/:id/copy` | `{name, boardId?, position}` |
| POST | `/lists/:id/archive` · `/restore` | |
| DELETE | `/lists/:id` | only when archived; deletes its cards (DOC D03) |
| POST | `/lists/:id/move-all-cards` · `/archive-all-cards` | A01 |

### Cards
| Method | Path | Notes |
|---|---|---|
| POST | `/lists/:id/cards` | `{name, position, description?, dueAt?}` |
| GET | `/cards/:id` | full detail (checklists, attachments, last 50 comments+activity) |
| PATCH | `/cards/:id` | name, description, startAt, dueAt, dueReminder, dueComplete, cover |
| POST | `/cards/:id/move` | `{listId, boardId?, position}`; cross-board drops non-members, remaps labels by name+colour, else drops (07) |
| POST | `/cards/:id/copy` | `{listId, position, name?, keep:["checklists","labels","members","attachments","comments"]}` (DOC D25) |
| POST | `/cards/:id/archive` · `/restore` | |
| DELETE | `/cards/:id` | only when archived |
| PUT/DELETE | `/cards/:id/labels/:labelId` · `/cards/:id/members/:userId` | |
| GET/POST | `/cards/:id/comments` · PATCH/DELETE `/comments/:id` | |
| POST/DELETE | `/comments/:id/reactions/:emoji` (later) | |
| POST | `/cards/:id/checklists` · PATCH/DELETE `/checklists/:id` | |
| POST | `/checklists/:id/items` · PATCH/DELETE `/check-items/:id` | PATCH may carry `checklistId` (same card only) |
| POST | `/cards/:id/attachments` | multipart file **or** `{url, name}` |
| DELETE | `/attachments/:id` · GET `/attachments/:id/download` | download streams with `Content-Disposition`; auth checked |
| PUT/DELETE | `/cards/:id/subscription` | |

### Search and notifications
| Method | Path |
|---|---|
| GET | `/search?q=&cursor=` — operators `@user`, `@me`, `#label`, `label:`, `board:`, `list:`, `due:day|week|overdue|N`, `has:attachments|description|checklists|members`, `is:open|archived|complete`, `-` negation, `"phrase"` (DOC D05) |
| GET | `/notifications?unread=` · POST `/notifications/read` `{ids|all}` |

### Admin (system admin)
`GET /admin/users`, `POST /admin/users` (create/invite), `PATCH /admin/users/:id` (disable), `GET /admin/storage`, `GET /admin/health`, `GET /admin/version`.

## Real-time contract

### Transport
- WebSocket `GET /api/v1/ws` (same session cookie; Origin checked). Server ping every 25 s; client reconnects with exponential backoff 1 s → 30 s plus jitter.
- **Trello observation (OBS O04, logged out, one run):** the web client keeps **two** WebSockets: `/1/Session/socket` and `/gateway/api/graphql/subscriptions`, both JSON. After a 15 s outage the first reopened ≈4 s and the second ≈19 s after the network returned; the stale first socket was closed ≈2 s after reconnect. See [E-session2 §T4](evidence/E-session2.md#t4-partial--websocket-lifecycle-and-reconnect-obs-o04-logged-out-public-board). This shows the client behaviour only, not Trello's server design. Flowdeck keeps **one** socket (INF) and shows an offline toast as in 02.
- **Same-user, two-tab fan-out (OBS O05):** a card created in one tab appeared in the other after 438–1018 ms (median ≈ 484 ms, 5 trials); the creating tab showed it optimistically in 138–199 ms. Cross-user delivery could not be measured (User B could not be added). See [E-session2-auth §9](evidence/E-session2-auth.md#9--real-time-and-concurrency-t3-t4-with-the-same-user-in-two-tabs).
- **Fallback:** if the socket can't connect within 10 s, poll `GET /boards/:id/events?sinceSeq=` every 5 s while the tab is visible and every 60 s when hidden. DOC D16 records Trello used polling as a fallback.

### Client → server
```json
{ "type": "subscribe",   "board": "<boardId>", "sinceSeq": 1234 }
{ "type": "unsubscribe", "board": "<boardId>" }
{ "type": "presence",    "board": "<boardId>", "cardId": "<cardId|null>" }
```

### Server → client
```json
{ "type": "subscribed", "board": "<id>", "seq": 1240, "replayed": 6 }
{ "type": "event", "board": "<id>", "seq": 1241, "event": "card.moved",
  "actor": "<userId>", "at": "2026-10-11T12:00:00Z", "clientMutationId": "<from Idempotency-Key>",
  "data": { "card": { "id": "...", "listId": "...", "position": "a1V", "version": 7 },
            "from": { "listId": "...", "position": "a0" } } }
{ "type": "resync_required", "board": "<id>", "reason": "gap_too_large" }
{ "type": "board.access_revoked", "board": "<id>" }
{ "type": "notification", "notification": { } }
{ "type": "presence", "board": "<id>", "users": [ { "id": "...", "cardId": null } ] }
```

### Rules
1. **Ordering:** events per board carry a gap-free `seq`, assigned inside the same DB transaction as the change (from `activity.seq`). Clients apply events in `seq` order. On a gap, request a replay with `sinceSeq`.
2. **Replay window:** the server replays up to 1000 events or 24 h. Beyond that it sends `resync_required`, and the client refetches `GET /boards/:id`.
3. **Delivery:** at-least-once, so clients dedupe by `seq`. Own mutations are recognised by `clientMutationId`.
4. **Authorization:** checked on subscribe and re-checked on membership or visibility change (04 invariant 6). Events are filtered per recipient. For example, an observer still receives all board events, but never another user's notifications.
5. **Fan-out:** single node uses in-process pub/sub fed by Postgres `LISTEN/NOTIFY` after commit. Multi-node (later) uses Redis or NATS. DOC D28 and 3P T06 note that Trello moved Redis → RabbitMQ → Kafka at much larger scale; a small team does not need that.
6. **Payload:** events carry the changed fields and the new `version`, never full boards. Card detail fetches are lazy.
7. **Latency target:** p95 < 500 ms from commit to delivery on a single node (DOC D16 reports "well under a second" for Trello historically).

### Event names
Mirror activity types (05): `board.updated`, `board.closed`, `board.member_*`, `list.created|updated|moved|archived|restored|deleted`, `card.created|updated|moved|copied|archived|restored|deleted`, `card.label_*`, `card.member_*`, `checklist.*`, `check_item.*`, `comment.*`, `attachment.*`, `label.created|updated|deleted`.
