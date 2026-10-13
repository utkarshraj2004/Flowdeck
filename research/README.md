# Flowdeck research: Trello-equivalent specification

Research and preparation only. No application code was built and `site/` was not changed.

Flowdeck will be an **independent, self-hosted kanban tool** for a small team. Trello is the reference product. Flowdeck uses its own name, branding, copy, icons and assets; nothing here copies Trello code, artwork, or text.

## Documents

| # | Document | Contents |
|---|---|---|
| 0 | [00-coverage.md](00-coverage.md) | Coverage table: every feature, evidence source, status, uncertainty, build readiness, backend need |
| 1 | [01-product-scope.md](01-product-scope.md) | Product scope and feature inventory (MVP / later / out of scope) |
| 2 | [02-screens.md](02-screens.md) | Screen inventory, layouts, components, interaction states |
| 3 | [03-journeys-acceptance.md](03-journeys-acceptance.md) | User journeys and acceptance criteria |
| 4 | [04-permissions.md](04-permissions.md) | Role and permission matrix |
| 5 | [05-data-model.md](05-data-model.md) | Proposed data model and entity relationships |
| 6 | [06-api-realtime.md](06-api-realtime.md) | Proposed REST API and real-time event contracts |
| 7 | [07-ordering-concurrency-persistence.md](07-ordering-concurrency-persistence.md) | Ordering, concurrency, persistence, attachments |
| 8 | [08-hosting-ops.md](08-hosting-ops.md) | Local hosting, backup, restore, upgrade |
| 9 | [09-test-plan.md](09-test-plan.md) | Test plan linked to workflows |
| 10 | [10-phases-questions.md](10-phases-questions.md) | Implementation phases, dependencies, open questions |
| — | [evidence/sources.md](evidence/sources.md) | Source log with IDs cited throughout |
| — | [evidence/E-API-surface.md](evidence/E-API-surface.md) | Derived inventory of Trello's documented REST API (324 operations) |
| — | [evidence/E-connector.md](evidence/E-connector.md) | What the authorized Trello connector exposed (schemas, enums, account shape) |
| — | [evidence/E-REA.md](evidence/E-REA.md) | REA install, tool verification, Trello reachability probe + screenshots |
| — | [evidence/E-session5.md](evidence/E-session5.md) | **Session 5, two users**: membership resolved (Account 2's own workspace), T3 conflicts, T4 two-way real-time and reconnect, T5 member/admin/guest with read-back, live role changes, T8 member notifications, paid/free inventory, axe audit, REA tool attribution and limits |
| — | [HANDOFF.md](HANDOFF.md) | **Pause/resume notes**: branch, PRs, T1–T10 status, blocker, exact resume steps |
| — | [evidence/E-session2-auth.md](evidence/E-session2-auth.md) | **Session 2, authenticated** (test accounts, synthetic workspace): full board/list/card/card-back behaviour, T1–T10 results, the User B invitation blocker |
| — | [evidence/E-session2.md](evidence/E-session2.md) | **Session 2**: login attempt (stopped at Atlassian email verification), full shortcut list, logged-out loading/offline/not-found states, WebSocket reconnect timeline, official docs read directly |
| — | [evidence/E-trello-public.md](evidence/E-trello-public.md) | **Live Trello observations** (logged out, public board): layout, card dialog, filter, menu, views, phone; REA results; blocked login hosts |

## Evidence labels

Every claim carries one label. Labels are not interchangeable.

| Label | Meaning |
|---|---|
| **OBS** | Directly observed in this session through authorized access (the Trello connector, operating on the user's own account). |
| **DOC-direct** | Official page fetched and read directly (session 2). Stronger than DOC. |
| **DOC** | Supported by official Trello/Atlassian documentation. In this session docs were read **second-hand**, via web-search summaries citing `support.atlassian.com`, `trello.com/guide`, `developer.atlassian.com`, and the Atlassian blog (direct fetch was blocked; see below). |
| **API** | Trello's documented REST API (derived from a scraped OpenAPI mirror, see `E-API`). |
| **3P** | Third-party article or community post. Used only to flag conflicts or fill gaps; never sole basis for a requirement. |
| **INF** | Inference or a **Flowdeck design decision**. Not a claim about Trello. |
| **N/A** | Not available for inspection in this session. |
| **PAID** | Seen in Trello behind Upgrade / free trial; behaviour **not tested** (no trial started). |
| **HYP** | A hypothesis about Trello's server inferred from client-visible behaviour (e.g. from bundle code or response shapes); not directly verified. Client code is treated as a clue, never as proof. |
| **FD** | Used in the coverage table for a **Flowdeck choice** (same meaning as INF). |

## Method and environment (current, session 5)

- **Repository.** `main` holds the static-site scaffold from PR #1. This research changes only `research/` (and `CLAUDE.md`'s structure list); `site/` is untouched.
- **REA.** `rea-agents` **6.4.0** (MIT), installed in the session scratchpad. Used: `list-browser-targets`, `inspect-web-page` (accessibility tree, JSON and WebSocket shapes, script sources), `capture-web-screenshot`, `analyze-web-bundle`, `export-web-scripts`, `observe-web-session`. Limits found and their workarounds: [E-session5 §1](evidence/E-session5.md#1--rea-in-this-session).
- **Browsers.** Two headless Chromium instances with loopback-only CDP, one per test account. Playwright (`connectOverCDP`) was used for actions and for capture REA cannot do (WebSocket frames opened before attach, cross-navigation requests, DOM timing). Every result names its tool.
- **Network.** Full access since session 2: Trello, Atlassian and `*.atl-paas.net` reachable.
- **Accounts.** Two dedicated test accounts, credentials only in environment variables (names in HANDOFF; values never printed). Synthetic workspaces "Flowdeck Research WS" and "FD Reverse WS".
- **Trello connector.** Attached to the owner's real account; used read-only in session 1 for schemas only. **Not used for experiments.**
- **Redaction.** No tokens, cookies, IDs, invite links or personal data are stored. Screenshots mask names, usernames, emails and avatars.

*History:* in session 1 the network blocked Trello (HTTP 403) and nothing could be observed; that state ended in session 2. See [evidence/E-REA.md](evidence/E-REA.md).

## Honest status

**Session 5 (2026-10-12):** the second account joined through a workspace it created itself, so the two-user checks ran: conflicting edits (T3), two-way real-time with reconnect and persistence (T4), member/admin/guest permissions with every write read back (T5), live role and access changes, and member-triggered notifications (T8). Paid features are marked as untested. **Trello behaviour still unverified:** real-phone touch drag, paid roles and features (observer, normal workspace role, custom fields, views), the automation builder, the card dialog's focus trap, and Trello's replay mechanism. **Implementation can start from this package**; none of these gaps blocks the MVP. See [00-coverage.md](00-coverage.md) and [HANDOFF.md](HANDOFF.md).

*Earlier status notes (sessions 1–4) are superseded by the above and by the coverage table.*
