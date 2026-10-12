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

**Status after session 2 (2026-10-11, final):** both test accounts logged in after the owner entered the emailed codes. The authenticated single-user investigation is complete ([E-session2-auth](evidence/E-session2-auth.md)). **Remaining blocker:** User B could not be added to User A's board or workspace. All four supported routes (approving the join request, sharing by email, invite link, workspace invite) failed silently on Trello's side, although both accounts are confirmed and unblocked. Options, best first:

1. **Owner check from a normal browser:** log in as User A, open "FD Parity Board" → Share, invite User B, and see whether Trello shows an error that the headless session did not. If it works, the next session can run T3/T4/T5/T8 cross-user.
2. ~~Use test accounts with non-relay email addresses, or let the accounts age.~~ *Reconciled 2026-10-12:* superseded by evidence: adding Account 2 fails at a billing check (`isFreeToAdd` → 409 "managed by the commerce platform"), and B was correctly resolved by email. See [E-session2-auth §16](evidence/E-session2-auth.md#16--session-4-one-controlled-invitation-attempt-2026-10-12-0950-utc). The email provider is not implicated.
3. Accept the gap: build permissions from DOC-direct + Flowdeck rules (04), which is already specified.

**Update after the cross-user round:** the owner's manual step changed FD Parity Board's visibility to **Public** (board history, 19:38 UTC). It did not make User B a member, which was verified from both accounts. Cross-user real-time, watcher notifications and the public-viewer permission set are now observed. **Still blocked:** two different users editing the same card (T3), and member/observer/guest rows (T5). These need B to appear under Share → Board members as a member. **The board is Public**, so its synthetic content is visible on the internet until it is set back to Workspace or Private.

Login note: the browser profiles survived a container restart without a new email code, but new devices or sessions can still be challenged; authenticator-app 2SV is **not** assumed to remove those challenges.

### Earlier status (session 1, kept for history)

1. **A dedicated Trello test account** (separate from your real one), ideally with a second test user for permission checks. Connect it to Claude via the Trello connector, or give a session where Claude can drive a browser. **Never put credentials in the repo or in chat.** The connected account in this session is your real one (it holds a real board), so no experiments were run on it.
2. **Network allow-list** — *mostly done.* Trello, Atlassian and `*.atl-paas.net` load and the login form renders. Still blocked and possibly required for login challenges: `*.captcha-sdk.awswaf.com`, `www.recaptcha.net`, `google.com` (see `evidence/E-trello-public.md`). Test-account variables were not visible to the session. Original request: `trello.com`, `*.trello.com`, `trello.net`, `support.atlassian.com`, `developer.atlassian.com`, `id.atlassian.com`, `*.atlassian.com`, and Trello's static asset CDN. Change it in the environment settings: the cloud environment menu in the session title bar → Edit → Network access → Allowed domains (https://code.claude.com/docs/en/cloud-environments#network-access).
3. **REA**: done. Installed with owner authorization and verified (see `evidence/E-REA.md`). It only needs items 1–2 to reach Trello. Test-account credentials go in environment variables `TRELLO_TEST_EMAIL` / `TRELLO_TEST_PASSWORD` (optionally `TRELLO_TEST2_*`), set in the environment settings, never in chat or the repo.
