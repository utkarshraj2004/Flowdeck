# Handoff: Trello parity research (session 5 complete, 2026-10-12)

> **Read this first.** This file and PR #3 are the current state. Statements in older files that say the test accounts cannot collaborate, that Account 2 "is not a member", or that the 409 billing check is the cause are **superseded** by session 5 ([evidence/E-session5.md](evidence/E-session5.md)).
>
> A future session must check its own environment first: the variable names exist (never print values), and `trello.com` is reachable. It should expect that a fresh email verification **may** be needed at login.

**Research is complete except one owner task (real-phone touch drag).** Nothing has been implemented. Do not merge PR #2 or PR #3 without the owner's approval.

## Where things are

| Item | Value |
|---|---|
| Branch | `claude/trello-investigation-resume-kxgrvd` (`git log -1` shows the head) |
| Research PR (draft) | https://github.com/utkarshraj2004/Flowdeck/pull/3 (base: `claude/great-ride-udwvvd`, PR #2's branch) |
| Original research PR (draft) | https://github.com/utkarshraj2004/Flowdeck/pull/2 (base: `main`) |
| Merge path, when approved | PR #3 into `claude/great-ride-udwvvd`, then PR #2 into `main` |
| Start reading | [README.md](README.md) → [00-coverage.md](00-coverage.md) (65 rows, current) → [evidence/E-session5.md](evidence/E-session5.md) |
| Test status table | [09-test-plan.md](09-test-plan.md), "T status after session 5" |

## Trello test content (synthetic; keep it)

| Item | State at the end of session 5 |
|---|---|
| **Flowdeck Research WS** (owner: Account 1 = A) | Members: **A only**. Adding Account 2 here fails silently (residual issue, below) |
| **FD Parity Board** (in Flowdeck Research WS) | A admin; 12 open cards. **Visibility: Public** (set by the owner on 2026-10-11): its synthetic content is visible on the internet until set back to Workspace or Private |
| **FD Reverse WS** (created by Account 2 = B in session 5) | Members: **B (admin)**. A is a **single-board guest** (A was removed from the workspace but kept FD Collab Board, for the guest test) |
| **FD Collab Board** (in FD Reverse WS) | A member, B member, **no admin**: the sole admin left during the last-admin test, and Trello offers no way back. Synthetic cards for T3/T4. Leave it as evidence, or close it from the workspace if desired |
| **FD Roles Board** (in FD Reverse WS) | B admin; A removed (guest-removal test); 4 cards |
| FD Throwaway Board | Created and **permanently deleted** (lifecycle test) |
| Untouched | Both accounts' onboarding workspaces and starter boards; the owner's real boards |

## T1–T10 status

| ID | Status | Notes |
|---|---|---|
| T1 Layout | ✅ Done | Desktop and phone, logged in and out |
| T2 Drag-and-drop | 🟡 Mostly done | Mouse and keyboard done. **Real-phone touch drag unverified** (emulation is not proof) → [PHONE-CHECKLIST.md](PHONE-CHECKLIST.md) |
| T3 Concurrent edits | ✅ Done (two users) | Last write wins per field; drafts kept; no warning; draft lost on delete |
| T4 Real-time | ✅ Done (two-way) | B→A median 504 ms, A→B 443 ms; reconnect catch-up 2.75 s; persistence; frame shapes |
| T5 Roles | ✅ Done (admin, member, guest, workspace member not on the board, live role changes) | **Observer and normal workspace role: paid, untested** |
| T6 Validation | ✅ Done | — |
| T7 Archive/restore/delete | ✅ Done | Board close/reopen/delete added |
| T8 Notifications | ✅ Done (member triggers) | Checklist-item assignment is paid (no effect) |
| T9 Shortcuts | ✅ Done | — |
| T10 States | ✅ Done | Two-user offline added |

## Remaining gaps and the smallest action for each

| # | Gap | Blocks the build? | Smallest action |
|---|---|---|---|
| 1 | **Real-phone touch drag** (long-press, drag between lists, auto-scroll, cancel) | No (Flowdeck's J15 rules stand) | Owner runs [PHONE-CHECKLIST.md](PHONE-CHECKLIST.md) on a phone (~15 min) and reports one line per step |
| 2 | **Paid features** untested: observer, normal workspace role, custom fields, views, mirror, CSV, list colours, item assignment | No (Flowdeck has no plan gating and defines these itself) | None. Starting a trial was explicitly not authorized |
| 3 | **Automation builder**: blank cross-origin iframe in headless Chromium, outside REA's scope | No (Later feature) | Optional: open Automation once in a normal desktop browser and list its trigger/action menus |
| 4 | **Card dialog focus trap**: probe inconsistent | No (Flowdeck requires it, E12) | Optional manual Tab test in a desktop browser |
| 5 | **Residual membership issue**: adding Account 2 to Flowdeck Research WS returns 200 but adds nobody (the 409 billing check is **not** the cause) | No (two-user work used FD Reverse WS) | Optional: send the support draft below (owner's decision) |

## Optional Atlassian support draft (not sent)

Prepared because one route failed. **Claude has not sent it.** The owner decides whether to send it from their own account, and must fill in the placeholders. Do not include passwords or codes.

> **Subject:** Trello: inviting a user to my free workspace returns success but adds nobody
>
> **Product:** Trello (free workspace)
>
> **What happens:** As the admin of my workspace "<workspace name>", I invite another Atlassian account (<invitee email>) through Members → Invite Workspace members, or share a board in that workspace with them. Trello shows "Member was invited" (or nothing, when sharing a board), but the person never becomes a member or guest and receives no invitation or notification. The workspace still shows 1 / 10 collaborators. The same two accounts work normally in a new workspace created by the other account, so both accounts are confirmed and active.
>
> **What I tried:** workspace invite by email; board share by email (role Member); invite link; approving a join request from the invitee. All four fail the same way.
>
> **Technical detail, if useful:** the request `PUT /1/organizations/<workspace id>/members/<member id>` returns 200 but no membership is created. Board shares also call `…/paidAccount/isFreeToAdd`, which returns 409 "This account is managed by the commerce platform and cannot be modified by this billing API". However, the same 409 appears in the other workspace, where adding works.
>
> **Request:** please check whether the workspace or the invitee account is in a state that silently blocks membership, and fix it or tell me what to change.

## How to resume (only if the owner asks for more)

1. Check out the branch: `git fetch origin && git checkout claude/trello-investigation-resume-kxgrvd && git pull`.
2. Check the environment. The four variables must exist **by name only** (`TRELLO_TEST_EMAIL`, `TRELLO_TEST_PASSWORD`, `TRELLO_TEST2_EMAIL`, `TRELLO_TEST2_PASSWORD`). Probe `https://trello.com/`.
3. Set up REA in the scratchpad: `npm install rea-agents@6.4.0`, then `rea --version`.
4. Start two headless Chromium instances with loopback-only CDP (ports 9222/9223). The previous browser profiles were in an ephemeral scratchpad and are gone, so log in again through the genuine Atlassian flow. Ask the owner for an email code **only if Atlassian shows the code screen**.
5. Use **FD Reverse WS** boards for any two-user work. For a fresh admin-owned two-user board, have B create one in FD Reverse WS and share it with A.
6. Before saving anything, redact names, usernames, emails, IDs, short links and invite links. Run `npm run check` and the secret scan.

## Tools and settings needed (names only)

- Node 22 and `playwright-core` (via `npm ci`); Chromium at `/opt/pw-browsers`; REA (`rea-agents` 6.4.0, npm).
- Environment variables: the four `TRELLO_TEST*` names above.
- Network: Full (Trello, Atlassian, `*.atl-paas.net`).
- Helper scripts lived in the session scratchpad (not committed): Playwright `connectOverCDP` runners, an in-page API helper that reads the anti-CSRF cookie inside the page and never prints it, and output scrubbing. They are straightforward to recreate.

## Hygiene at the end of session 5

- Committed text and screenshots were scanned for:
  - credential values, usernames, display names and emails;
  - 24-hex IDs, board/card short links, invite links and the email-to-board address;
  - PNG metadata.

  None were found. In four screenshots, leftover text (a display name, a username, a partial username and a short link) was blacked out before commit.
- No cookies or session state were exported. The temporary Chromium instances were stopped after the push.
- No check-ins, monitors or scheduled tasks are running.
- Disclosures, from tool output only and never committed:
  - In session 2, one command printed Account 2's email address.
  - In session 5, tool output showed account usernames twice: once in a toast's text and once in a menu dump. Both were scrubbed from saved results.

## Session history (short)

- **Session 1:** docs and API only; Trello blocked by the network.
- **Session 2:** both accounts logged in; deep single-user research; cross-user round as a public viewer.
- **Session 3:** membership check; Account 2 still not a member.
- **Session 4:** one recorded board-share invite, which failed. The 409 was misread as the cause (since corrected).
- **Session 5:** route 1 (recorded workspace invite) failed. Route 2 (Account 2 creates a workspace and invites Account 1) succeeded. T3, T4, T5 and T8 were completed with two users, followed by a paid/free inventory sweep and an axe audit.
