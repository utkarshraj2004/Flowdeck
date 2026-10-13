# Implementation checklist

Status of Flowdeck on `main` (0.1.0 plus the session 3 and 4 work, [UPGRADE-GAPS.md](UPGRADE-GAPS.md)) against the first-version scope and the research coverage table ([research/00-coverage.md](../research/00-coverage.md); row numbers in brackets). Updated 2026-10-13.

**First-version scope** = the coverage rows marked *Ready*. All of them are ✅ except the physical-phone check of touch drag (🟡, needs a real device). Rows the research marks *Later* or *Out* are listed under [Beyond the first version](#beyond-the-first-version) at the end; several were built anyway (views, automation, webhooks, email, templates).

**Legend:**
- ✅ **Complete**: implemented and covered by automated tests.
- 🟡 **Partial**: works, with the named gap.
- ⬜ **Pending**: not built yet.
- ➖ **Out of scope**: deliberately not planned for the first version.

## Vertical slice

| Step | Status | Evidence |
|---|---|---|
| Login → workspace → board → list → card → persistence → visible to a second authorized user | ✅ | `tests/api/slice.test.ts`; browser: `tests/e2e/collab.spec.ts` "first admin sets up, invites a teammate…" |

## Accounts, workspaces, permissions

| Feature | Status | Notes |
|---|---|---|
| First admin via CLI one-time setup link (J01) | ✅ | 24 h, single use, no default password |
| Login / logout / generic error / rate limit (J03) [1] | ✅ | 5 per minute per IP+account |
| Password change; admin-issued reset links; reset by email | ✅ | Reset signs out other sessions. “Forgot your password?” appears only when SMTP is configured (`tests/api/email.test.ts`) |
| Profile name, colour-blind patterns, shortcuts toggle [5] | ✅ | |
| Avatars, locale, timezone preference | ➖ | Roadmap. Initials avatars; the browser's locale and time zone are used |
| Signed-in devices: list, sign out one or all others | ✅ | Account settings. A signed-out device's live connection closes within one heartbeat (`tests/api/account.test.ts`) |
| Workspaces: create, rename, describe, delete (typed name) [6] | ✅ | |
| Workspace roles admin/member, real roles without plan gating [7] | ✅ | |
| Invitations: reusable link, email-bound single use, revoke, pending list, sign-up via invite [8] | ✅ | Email-bound invites are also emailed when SMTP is configured; the link is always shown |
| Remove member: keep boards as guest / remove from boards; notify (J02.6) | ✅ | |
| Last-admin protection for workspaces and boards, including *leave* [65] | ✅ | Deliberate difference from the reference product |
| Board roles admin/member/observer, guests, workspace viewers, self-join [64] | ✅ | "Request access" is pending |
| Server-enforced permissions, 404 for no access, 403 with reason, no silent no-ops | ✅ | Representative cells tested with read-back; not every matrix cell is generated |
| System administration: users, setup/reset links, disable, admin flag, status | ✅ | |
| SSO (OIDC), two-factor login [2, 3] | ➖ | Roadmap |

## Boards, lists, cards

| Feature | Status | Notes |
|---|---|---|
| Board create (default lists), visibility, backgrounds, star, rename, description [9, 10, 12] | ✅ | Public boards pending (research: Later) |
| Board settings: comments, invitations, self-join, covers [11] | ✅ | |
| Copy board (with or without cards) | ✅ | |
| Close / reopen / delete with typed name [14] | ✅ | |
| Board templates [13] | ✅ | Admins mark a board as a template (board menu → Settings); “Create board” offers it as a starting point (lists, labels, cards copied) |
| Lists: create, rename, reorder, move to board, copy, move all, archive all, archive/restore/delete [15–17] | ✅ | |
| List sort and collapse | ✅ | One-time sort by name, due date, newest or oldest (live event). Collapse is remembered per browser |
| List colours, WIP limits | ➖ | Roadmap |
| Cards: create, rename (512 chars, inline error), reorder, move across lists/boards, copy with keep options, archive/restore/delete [18–21] | ✅ | |
| Complete state, start/due dates, due badges [22, 26] | ✅ | |
| Due reminders, recurring dates [27, 28] | ➖ | Roadmap; the background worker and SMTP now exist |
| Markdown description with preview [23] | ✅ | Plain textarea + preview (no WYSIWYG) |
| Labels: create/edit/delete, apply, colour-blind patterns [24] | ✅ | 30 colours (subtle / normal / bold × 10) + colourless; stable order (migration 0002); search in the picker; names on the card front with `;` |
| Card members [25] | ✅ | |
| Checklists: multiple, add/rename/check/delete items, progress, hide checked, reorder, convert an item to a card [29] | ✅ | Reorder by drag, keyboard (Space + arrows) or the item menu. Item assignee/due pending |
| Comments with Markdown, @mentions (board members only), edit own, admin deletes non-admin [30] | ✅ | |
| Emoji reactions [31] | ➖ | Later |
| Attachments: upload (picker, drop, paste), links, size limit, permission-checked downloads [32] | ✅ | No thumbnails (originals are shown scaled); no virus scanning |
| Covers: colour or image, auto-cover for the first image [33] | ✅ | |
| Activity history for board and card [34] | ✅ | Also logs description and label changes |
| Card templates [63] | ✅ | “Make template” in the card actions; “Create from template” in each list (checklists, labels, members, attachments copied) |
| Custom fields, mirror cards [35, 36] | ➖ | Roadmap |
| Undo | 🟡 | Undo for archiving a card or list (toast and `z`) and for moving a card between lists (toast); no general undo |

## Ordering and drag and drop

| Feature | Status | Notes |
|---|---|---|
| Persistent ordering with fractional keys, server-computed, rebalancing | ✅ | 150-move model test, rebalance test, restart test |
| Mouse drag of cards (within and across lists) and lists | ✅ | Browser test |
| Keyboard moves: Space + arrows + Enter/Esc with live announcements; `,` `.` shortcuts | ✅ | Browser test |
| Touch: long-press drag | 🟡 | Emulated touch: reorder on a phone and cross-list drag on a tablet pass. Phone cross-list drag with edge auto-scroll **needs a physical-device check** ([research/PHONE-CHECKLIST.md](../research/PHONE-CHECKLIST.md)) |
| Move dialogs (board → list → position) as the non-drag alternative | ✅ | |

## Collaboration

| Feature | Status | Notes |
|---|---|---|
| Live updates over WebSocket, gap-free seq, own changes applied in order [42] | ✅ | Tests assert cross-user delivery under 1 s (API) and under 2 s (browser) |
| Reconnect catch-up by `sinceSeq`, resync beyond the window, polling fallback | ✅ | API and browser tests (offline → online) |
| Half-open socket detection (heartbeat, browser offline event) | ✅ | Found and fixed by the browser test |
| Role changes and access revocation pushed live | ✅ | |
| Editing presence ("is editing") | ✅ | |
| Conflict handling: title, description and dates base check → explicit choice; moves converge [43] | ✅ | |
| Unsaved edits: drafts kept, close/leave prompts, "Copy draft" when the card is deleted | ✅ | |
| Online presence dots on board members | 🟡 | Works; only the server side (`presence` messages) is covered by tests |
| Character-level co-editing (CRDT) | ➖ | Later |
| Offline editing | ➖ | Out of scope (as in the research) |

## Notifications, search, filters

| Feature | Status | Notes |
|---|---|---|
| In-app notifications with the research trigger table; never the actor; live bell; grouped per card; mark read/unread per item [39] | ✅ | Drawer with “Only unread”. Per-user settings turn off kinds of notifications; access changes are always delivered |
| Watching boards, lists and cards; auto-watch on create/assign/comment | ✅ | |
| Email digests of unread notifications [40] | ✅ | Opt-in per user; needs the operator's SMTP server. Each notification is emailed once. Instant per-event emails are not offered |
| Unread markers on card fronts | ✅ | From the user's unread notifications; cleared by opening the card; live across tabs and persistent (`tests/api/automation.test.ts`, `tests/e2e/views.spec.ts`) |
| Board filter: keyword, members (incl. none / me), labels (incl. none), due, status, any/all, URL state, `f`/`x`/`q` [38] | ✅ | |
| Global search with operators [37] | ✅ | ILIKE matching (no stemming or ranking) |
| Saved searches | ➖ | Roadmap |
| Keyboard shortcuts with a help dialog [41] | ✅ | Navigation, `n`, `c`, `z`, `,` `.` `<` `>`, `e` quick edit, `l` `m` `d`, `t`, `-`, `s`, `;`, `f`, `x`, `q`, `/`, `b`, `?`, Esc, Ctrl+Enter; on the focused or hovered card. Deliberate difference: Space picks a card up (keyboard move) instead of self-assigning |

## Interface quality

| Feature | Status | Notes |
|---|---|---|
| Responsive layout: phone shows one list at ~85% width, full-screen card, 44 px targets [45] | ✅ | Browser test |
| Accessibility: focus trap and return, labelled controls, live regions, axe with no serious/critical issues on 7 screens [47] | ✅ | WCAG 2.2 AA is the target; a full manual audit has not been done |
| Loading, empty, error and offline states; identical 404 for missing vs no access [48] | ✅ | |
| Popovers anchored to their control (labels, members, dates, move/copy, cover, menus); quick edit on the card front; error boundary with recovery | ✅ | `tests/e2e/upgrade.spec.ts`; axe covers the popovers, quick edit and notifications |
| Home: recently viewed boards, templates; top bar Create menu and live search | ✅ | Recently viewed is stored per browser |
| Browsers other than Chromium | ➖ | Not tested automatically |

## Operations

| Feature | Status | Notes |
|---|---|---|
| Docker Compose (app + PostgreSQL), persistent volumes, healthchecks [60] | ✅ | `scripts/compose-smoke.mjs` |
| GitHub Codespaces development preview (private port, one origin, background start, `flowdeck` helper) | 🟡 | Verified with `devcontainer up` and an emulated forwarded origin (setup, auth, live updates, stop/resume, rebuild); first real codespace launch pending ([CODESPACES.md](CODESPACES.md)) |
| Optional HTTPS (Caddy profile) | 🟡 | Configuration provided; not exercised in automated tests (needs a real domain) |
| Automatic forward-only migrations, advisory lock, downgrade refusal (J17.3) | ✅ | |
| Backup and restore scripts with checksums and manifest (J17.2) | ✅ | Wipe-and-restore verified by the smoke test |
| Scheduled backups, backup status in the admin page | ➖ | cron example in OPERATIONS.md |
| JSON export of a board [55] | ✅ | Full activity included |
| CSV export, print view [56] | ➖ | Roadmap |
| Import from Trello [57] | ➖ | Only on the owner's explicit request |
| Object limits [59] | ✅ | Defaults configurable with `FLOWDECK_LIMIT_*` (docs/OPERATIONS.md#limits) |
| CI: typecheck, API tests, build, browser tests, compose smoke | ✅ | The workflow first runs on the implementation PR |
| Load test (5,000 cards, 30 clients) | ➖ | Single-client benchmark with 1,200 cards: `scripts/perf/bench.mjs`, results in [perf/RESULTS.md](perf/RESULTS.md) |
| Response compression, code splitting | ✅ | Board snapshot 537 KB → 45 KB; first-render JS 178 KB → 101 KB gzip |
| Multi-node / horizontal scaling | ➖ | Single process |
| Idempotency keys for retried POSTs | ➖ | The client does not auto-retry writes |

## Views, automation and integrations (research: Later; built in session 4)

| Feature | Status | Notes |
|---|---|---|
| Table view [49] | ✅ | Sortable; inline title, list and due edits with base checks; the board filter applies; read-only for viewers; live (`tests/e2e/views.spec.ts`) |
| Calendar view [49] | ✅ | Month/week by due date; drag or Alt+arrows to reschedule (time kept, base-checked); undated cards listed |
| Automation rules [52] | ✅ | Card added / moved into list / completed / due soon → move, label, member, complete, due date, archive. Run in the triggering transaction; failures visible; no chaining (`tests/api/automation.test.ts`) |
| Automation buttons, scheduled (calendar) rules | ➖ | Roadmap |
| Outgoing webhooks [54] | ✅ | Signed, retried, delivery log, private addresses refused by default |
| Email (SMTP) | ✅ | Optional: password reset, invites, digests, admin test; outbox with retries |
| Background worker | ✅ | In-process; `FOR UPDATE SKIP LOCKED`; disable the timer with `FLOWDECK_WORKER_INTERVAL_MS=0` |

## Beyond the first version

Kept for later on purpose (the research marks them *Later* or *Out*, or they are new ideas): due reminders and recurring dates [27, 28], emoji reactions [31], custom fields [35], mirror cards [36], public boards [10], CSV export / print [56], email-to-board [61], request access [64], saved searches, list colours and WIP limits, SSO and two-factor login [2, 3], avatars, per-user locale and time zone, general undo, several app replicas, Trello import (only on request).

