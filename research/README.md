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

## Evidence labels

Every claim carries one label. Labels are not interchangeable.

| Label | Meaning |
|---|---|
| **OBS** | Directly observed in this session through authorized access (the Trello connector, operating on the user's own account). |
| **DOC** | Supported by official Trello/Atlassian documentation. In this session docs were read **second-hand**, via web-search summaries citing `support.atlassian.com`, `trello.com/guide`, `developer.atlassian.com`, and the Atlassian blog (direct fetch was blocked; see below). |
| **API** | Trello's documented REST API (derived from a scraped OpenAPI mirror, see `E-API`). |
| **3P** | Third-party article or community post. Used only to flag conflicts or fill gaps; never sole basis for a requirement. |
| **INF** | Inference or a **Flowdeck design decision**. Not a claim about Trello. |
| **N/A** | Not available for inspection in this session. |

## Method and environment (what actually happened)

- **Repository state.** `main` contained the static-site scaffold from PR #1 (placeholder `site/`, validation, CI, manual Pages deploy). Untouched by this work except `CLAUDE.md`'s structure list.
- **REA.** Cloned `morluto/rea` at commit `23d50ea` (2026-10-12); `package.json` and npm `latest` both report **rea-agents 6.4.0**, MIT licence. Its website capability (`inspect_web_page`, `observe_web_session`, `analyze_web_bundle`, `capture_web_screenshot`) attaches to a user-started Chrome over a loopback CDP port. **REA was not run**: installing it was denied by this session's permission policy ("Create Unsafe Agents"), and it could not have reached Trello anyway (next point). To use it, see [10-phases-questions.md](10-phases-questions.md#access-needed).
- **Network.** The environment's egress policy returns 403 for `trello.com`, `api.trello.com`, `support.atlassian.com`, `developer.atlassian.com`, `atlassian.com`, `web.archive.org`. GitHub and package registries are reachable. Result: **no browser session against Trello, no screenshots, no network capture, no client bundle inspection.**
- **Trello connector.** An authorized Trello connector (claude.ai) is attached, signed in to the user's real account (one workspace, one real board). Read-only calls were used to record schemas and enums. **No experiments were run** and no board content was read or saved, because the account is not a dedicated test account and the connector cannot create a separate workspace. See `E-connector`.
- **Docs.** ~25 targeted web searches; each summary cites the official page. Recorded in `evidence/sources.md`.
- **Redaction.** No tokens, cookies, IDs, or personal data are stored. Account identifiers in `E-connector` are replaced with placeholders.

## Honest status

This is a **systematic inventory with explicit gaps**, not a full reverse-engineering. Nearly all Trello behaviour here is **DOC** (second-hand) or **API**; very little is **OBS**, and no UI was observed. The specification is ready to build the core (workspaces, boards, lists, cards, labels, members, dates, checklists, comments, attachments, archive, search, real-time) from Flowdeck's own design decisions. Exact UI parity details (layout measurements, copy, animation, edge-case error text) remain unverified. See [00-coverage.md](00-coverage.md).
