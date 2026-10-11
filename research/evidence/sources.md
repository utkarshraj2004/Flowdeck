# Source log

Collected 2026-10-11. **DOC** sources were read through web-search summaries that quote the official page; the pages themselves could not be fetched from this environment (egress 403). Re-verify any DOC item marked critical before release.

## Official documentation (DOC)

| ID | Topic | URL |
|---|---|---|
| D01 | Roles: observers, guests, board admins | https://support.atlassian.com/trello/docs/adding-observers-to-boards/ |
| D02 | Changing board permissions | https://support.atlassian.com/trello/docs/changing-permissions-on-a-board |
| D03 | Archive / delete a list | https://support.atlassian.com/trello/docs/archiving-lists-deleting-lists/ |
| D04 | Keyboard shortcuts | https://support.atlassian.com/trello/docs/using-keyboard-shortcuts-in-trello/ (full list at trello.com/shortcuts) |
| D05 | Search operators | https://support.atlassian.com/trello/docs/searching-for-cards-all-boards/ |
| D06 | Pricing / plan limits | https://trello.com/pricing |
| D07 | Automation (Butler) | https://trello.com/guide/automate-anything ; https://trello.com/guide/enterprise/advanced-features |
| D08 | Views (Table, Calendar, Timeline, Dashboard, Map, Workspace) | https://trello.com/views ; https://www.atlassian.com/blog/trello/new-views-switcher-and-table-view |
| D09 | Export (JSON / CSV) | https://support.atlassian.com/trello/docs/exporting-data-from-trello |
| D10 | Start / due dates, reminders, recurring | https://support.atlassian.com/trello/docs/due-soon |
| D11 | Workspace admin capabilities | https://support.atlassian.com/trello/docs/workspace-admin-capabilities/ |
| D12 | Notifications / watching | https://support.atlassian.com/trello/docs/receiving-trello-notifications/ |
| D13 | Mirror cards, Inbox, Planner | https://www.atlassian.com/blog/trello/new-trello-is-here ; https://www.atlassian.com/blog/trello/card-mirroring-and-jira-lists |
| D14 | Object limits | https://developer.atlassian.com/cloud/trello/guides/rest-api/limits/ |
| D15 | Slow-board guidance | https://support.atlassian.com/trello/docs/troubleshooting-a-slow-board/ |
| D16 | Real-time architecture (historic) | https://www.atlassian.com/blog/trello/the-trello-tech-stack |
| D17 | Custom fields | https://support.atlassian.com/trello/docs/using-custom-fields/ |
| D18 | Board templates | https://support.atlassian.com/trello/docs/creating-template-boards/ |
| D19 | Login / Atlassian account, SSO providers | https://support.atlassian.com/atlassian-account/docs/log-in-to-your-atlassian-account/ |
| D20 | Two-factor authentication | https://support.atlassian.com/trello/docs/enabling-two-factor-authentication-for-your-trello-account/ |
| D21 | Closing / deleting boards | https://support.atlassian.com/trello/docs/closing-a-board/ |
| D22 | Comments, mentions, edit/delete | https://support.atlassian.com/trello/docs/commenting-on-cards |
| D23 | Emoji reactions | https://support.atlassian.com/trello/docs/using-emoji-reactions-in-trello |
| D24 | Moving cards / lists | https://support.atlassian.com/trello/docs/moving-cards-or-lists |
| D25 | Copying cards, lists, boards | https://help.trello.com/article/802-copying-cards-lists-or-boards |
| D26 | Labels (30 colours + colourless, colour-blind patterns) | https://support.atlassian.com/trello/docs/adding-labels-to-cards/ |
| D27 | Mobile offline (historic, 2016-17) | https://www.atlassian.com/blog/trello/trello-mobile-offline |
| D28 | Kafka socket architecture (title/summary only) | https://www.atlassian.com/blog/how-we-build/page/8 |
| D29 | Archive / delete cards | https://support.atlassian.com/trello/docs/archiving-and-deleting-cards/ |
| D30 | Attachments, covers, upload limits, attachment security | https://support.atlassian.com/trello/docs/adding-attachments-to-cards/ |

**Session 2 update (DOC-direct):** D01, D02, D03, D10, D11, D12, D14, D24, D29 and D30 were fetched **directly** (HTTP 200) on 2026-10-11 after network access was set to Full. Findings: [E-session2.md](E-session2.md#official-documentation-read-directly-doc-direct). Where they differ from the second-hand summaries, the direct reading wins.

## API reference (API)

| ID | Source |
|---|---|
| A01 | APIs.guru mirror of Trello REST API v1 (scraped, `x-unofficialSpec: true`): https://raw.githubusercontent.com/APIs-guru/openapi-directory/main/APIs/trello.com/1.0/openapi.yaml . Derived inventory: [E-API-surface.md](E-API-surface.md) |

## Observed (OBS)

| ID | Source |
|---|---|
| O02 | REA 6.4.0 + Chromium 141 probe of trello.com: blocked (`ERR_TUNNEL_CONNECTION_FAILED`, egress 403). [E-REA.md](E-REA.md) |
| O03 | Live logged-out observation of trello.com and the public board `/b/nC8QJJoZ` with Chromium + REA 6.4.0. [E-trello-public.md](E-trello-public.md) |
| O04 | Session 2: login attempt (stopped at Atlassian email verification), `trello.com/shortcuts`, logged-out loading/offline/not-found states, WebSocket reconnect timeline, REA 6.4.0 reinstall. [E-session2.md](E-session2.md) |
| O01 | Trello connector tool schemas and read-only responses (workspace list, board list metadata, member profile shape). [E-connector.md](E-connector.md) |

## Third-party (3P), used only to flag conflicts

| ID | Claim checked | URL |
|---|---|---|
| T01 | Observer plan tier (claims Enterprise; DOC-direct D01/D02 say **Premium**; T01 is wrong) | https://www.stitchflow.com/user-management/atlassian-trello/manual |
| T02 | Attachment size: 10 MB free, 250 MB paid (**now confirmed by DOC-direct D30**) | https://www.chanty.com/blog/trello-pricing ; community.atlassian.com threads |
| T03 | Free plan: 10 collaborators, 10 boards per workspace (DOC D06 agrees) | https://plaky.com/learn/plaky/trello-collaborator-limit/ |
| T04 | Per-card limits (1000 attachments, 500 checklists, 200 items) — dated 2020 | https://h-rd.org/trello-limits-cards-boards/ |
| T05 | Move between boards may drop labels (open bug TRELLO-1614) | https://jira.atlassian.com/browse/TRELLO-1614 |
| T06 | RabbitMQ to Kafka WebSocket pipeline (secondary analysis) | https://arpitbhayani.me/videos/trello-rabbitmq-kafka-migration-websockets/ |
| T07 | Template boards drop automation buttons (TRELLO-882) | https://jira.atlassian.com/browse/TRELLO-882 |

## Blocked sources (session 1 only; all reachable in session 2)

`trello.com` (app, `/shortcuts`, `/pricing`, `/guide`), `api.trello.com`, `support.atlassian.com`, `developer.atlassian.com`, `atlassian.com`, `web.archive.org`: HTTP 403 from the environment egress proxy. WebFetch: DNS failure for the same hosts.
