# 10 · Implementation phases, dependencies, unresolved questions

## Phases

| Phase | Scope | Depends on | Exit criteria |
|---|---|---|---|
| **0 · Decisions** | Choose stack (see Q1), licence, hosting target; confirm MVP scope with the team | answers to Q1–Q4 | decisions recorded in `research/` |
| **1 · Skeleton** | Repo restructure (`app/` server + client; static `site/` stays for docs), Postgres + migrations, auth (J01, J03), workspace + invites (J02), compose file, CI (unit + API + e2e) | 0 | J01–J03 pass; O1 passes |
| **2 · Board core** | Boards (J04, J05, J13), lists (J06), cards (J07), ordering (U1), archive/restore/delete, activity log, permission policy (04, P tests) | 1 | J04–J07, J12, J13 pass |
| **3 · Card detail + realtime** | Description, labels, members, dates, checklists, comments, attachments, covers (J08); WebSocket + catch-up (J11); notifications (J10); filter + search (J09); JSON export (J14.1); mobile + a11y (J15, J16) | 2 | All MVP AC pass; R1–R6, E1–E10 green; **MVP release** |
| **4 · Ops hardening** | Backup/restore/upgrade tooling (J17), admin console, limits, ClamAV option, load test O4 | 3 | O1–O4 green; restore drill documented |
| **5 · Later features** | Email notifications + reminders, templates, custom fields, Table + Calendar views, reactions, Trello JSON import (J14.2), OIDC, TOTP, webhooks, simple automation rules | 4 | per-feature AC to be written |

Critical path: auth → permission policy → ordering + activity `seq` → realtime. The permission matrix and `seq` design should be prototyped in phase 1 because they are the hardest to retrofit.

## Unresolved questions

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| Q1 | Tech stack? (e.g. TypeScript: Node + Fastify + React/Svelte; or Go + HTMX) | Everything | TypeScript monorepo (Node 22 LTS, Fastify, React, Postgres) |
| Q2 | Expected team size and boards? | Limits, hosting size | ≤ 50 users, single node |
| Q3 | Where will it run (on-prem server, NAS, cloud VM)? Internet-exposed or LAN/VPN only? | TLS, auth hardening, SMTP | LAN/VPN, Caddy TLS |
| Q4 | Licence for Flowdeck's code (MIT, AGPL, private)? | Repo is public now | Decide before phase 1 |
| Q5 | Email available (SMTP)? | Invites, notifications, resets | Invites by link only; reset by admin |
| Q6 | Is migrating existing Trello data needed? | Moves the Trello JSON importer from phase 5 to 3 | Phase 5 |
| Q7 | Which "later" views matter most (Table, Calendar, Timeline)? | Phase 5 order | Table, then Calendar |
| Q8 | Should board members be able to permanently delete archived cards, or admins only? | 04 | Members can (configurable) |
| Q9 | Single sign-on required (Google Workspace / Microsoft Entra)? | Phase placement | Later (OIDC) |

## Unresolved Trello-behaviour questions (need observation)

Parity checks T1–T10 in `09-test-plan.md`, plus these documentation conflicts:
- Observer role plan tier: Premium (DOC D01) vs Enterprise (3P T01). Irrelevant to Flowdeck, which has no plan gating.
- Do labels survive a cross-board move? Trello staff say yes; open bug TRELLO-1614 says no (3P T05). Flowdeck defines its own rule (J07.4).
- `has:membername` vs `@name` in search docs (D05 internal inconsistency).
- Current per-card limits (only dated 3P T04 figures).

## Access needed

These items block **observed** evidence, not the build.

**Status after session 2 (2026-10-11):** network access is **Full** and every Trello, Atlassian and CAPTCHA host is reachable. All four test-account variables are present. REA 6.4.0 is reinstalled and verified. **The only blocker:** Atlassian asked both test accounts for an **emailed verification code** (`id.atlassian.com/login/mfa`, "We've emailed you a code") on this new headless device. Per the owner's rule, both logins were stopped there. Supported ways forward, best first (details in [E-session2](evidence/E-session2.md#what-is-needed-to-continue)):

1. In a live session, the owner says "ready". Claude clicks **Resend email** once per account, and the owner replies with the two one-time codes. They are typed only into the Atlassian form and never stored.
2. Enable authenticator-app two-step verification on both test accounts and provide the TOTP secrets as environment variables (e.g. `TRELLO_TEST_TOTP_SECRET`, `TRELLO_TEST2_TOTP_SECRET`). This is likely to replace the email challenge, but that is unverified.

Once logged in, the remaining work is T1–T8 and T10 (logged in) in a dedicated synthetic workspace, as planned in `09-test-plan.md`.

### Earlier status (session 1, kept for history)

1. **A dedicated Trello test account** (separate from your real one), ideally with a second test user for permission checks. Connect it to Claude via the Trello connector, or give a session where Claude can drive a browser. **Never put credentials in the repo or in chat.** The connected account in this session is your real one (it holds a real board), so no experiments were run on it.
2. **Network allow-list** — *mostly done.* Trello, Atlassian and `*.atl-paas.net` load and the login form renders. Still blocked and possibly required for login challenges: `*.captcha-sdk.awswaf.com`, `www.recaptcha.net`, `google.com` (see `evidence/E-trello-public.md`). Test-account variables were not visible to the session. Original request: `trello.com`, `*.trello.com`, `trello.net`, `support.atlassian.com`, `developer.atlassian.com`, `id.atlassian.com`, `*.atlassian.com`, and Trello's static asset CDN. Change it in the environment settings: the cloud environment menu in the session title bar → Edit → Network access → Allowed domains (https://code.claude.com/docs/en/cloud-environments#network-access).
3. **REA**: done. Installed with owner authorization and verified (see `evidence/E-REA.md`). It only needs items 1–2 to reach Trello. Test-account credentials go in environment variables `TRELLO_TEST_EMAIL` / `TRELLO_TEST_PASSWORD` (optionally `TRELLO_TEST2_*`), set in the environment settings, never in chat or the repo.
