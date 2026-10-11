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

## Method and environment (what actually happened)

- **Repository state.** `main` contained the static-site scaffold from PR #1 (placeholder `site/`, validation, CI, manual Pages deploy). Untouched by this work except `CLAUDE.md`'s structure list.
- **REA.** Cloned `morluto/rea` at commit `23d50ea` (2026-10-12); `package.json` and npm `latest` both report **rea-agents 6.4.0**, MIT licence. Its website capability (`inspect_web_page`, `observe_web_session`, `analyze_web_bundle`, `capture_web_screenshot`) attaches to a user-started Chrome over a loopback CDP port. **Update (owner-authorized):** REA 6.4.0 is now installed and its website tools are verified against a local page (`list-browser-targets`, `inspect-web-page`, `capture-web-screenshot`, `analyze-web-bundle`, `observe-web-session`). After the owner's allowlist update, **Trello loads and REA inspects it** (accessibility tree, screenshots, bundle analysis, session observation) — see [evidence/E-trello-public.md](evidence/E-trello-public.md). **Login is still blocked** by one remaining asset host (`*.atl-paas.net`). Details: [evidence/E-REA.md](evidence/E-REA.md).
- **Network.** The environment's egress policy returns 403 for `trello.com`, `api.trello.com`, `support.atlassian.com`, `developer.atlassian.com`, `atlassian.com`, `web.archive.org`. GitHub and package registries are reachable. Result: **no browser session against Trello, no screenshots, no network capture, no client bundle inspection.**
- **Trello connector.** An authorized Trello connector (claude.ai) is attached, signed in to the user's real account (one workspace, one real board). Read-only calls were used to record schemas and enums. **No experiments were run** and no board content was read or saved, because the account is not a dedicated test account and the connector cannot create a separate workspace. See `E-connector`.
- **Docs.** ~25 targeted web searches; each summary cites the official page. Recorded in `evidence/sources.md`.
- **Redaction.** No tokens, cookies, IDs, or personal data are stored. Account identifiers in `E-connector` are replaced with placeholders.

## Honest status

**Session 2 (2026-10-11):** network access Full; after the owner entered Atlassian's emailed codes, **both test accounts logged in** and a synthetic workspace and board were investigated in depth ([evidence/E-session2-auth.md](evidence/E-session2-auth.md)). Single-user behaviour across boards, lists, cards, card details, archive/delete, drag-and-drop, search, filter, offline and error states is now **OBS**. A follow-up **cross-user round** verified that the second account is **not** a member (the board had been made Public). As a logged-in public viewer, it showed cross-user real-time (≈ 0.4–0.9 s), watcher notifications from another user, and server-enforced read-only access. **Still unobserved:** two different users editing the same item, and member/observer/guest role rows. Added: the full shortcut list, logged-out loading/offline/not-found states, the client WebSocket reconnect timeline, and eleven official pages read directly. See [evidence/E-session2.md](evidence/E-session2.md).


This is a **systematic inventory with explicit gaps**, not a full reverse-engineering. Most Trello behaviour here is **DOC** (second-hand) or **API**. Logged-out UI (board layout, card dialog, filter, board menu, views, phone layout) is now **OBS**; everything requiring an account (editing, drag-and-drop, permissions, multi-user real-time) is still unobserved. The specification is ready to build the core (workspaces, boards, lists, cards, labels, members, dates, checklists, comments, attachments, archive, search, real-time) from Flowdeck's own design decisions. Exact UI parity details (layout measurements, copy, animation, edge-case error text) remain unverified. See [00-coverage.md](00-coverage.md).
