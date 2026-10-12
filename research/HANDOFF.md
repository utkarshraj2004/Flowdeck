# Handoff: Trello parity research (paused 2026-10-11, ~20:05 UTC; reconciled 2026-10-12)

> **Read this first (reconciled 2026-10-12).** This file and PR #3 are the current research state. Some older notes on PR #2's branch (`claude/great-ride-udwvvd`, up to `6106a48`) predate session 2 and say the test-account variables were missing, CAPTCHA hosts were blocked, or login was not possible: `evidence/E-trello-public.md` "Login check", item 2 of `10-phases-questions.md` "Access needed", PR #2's description, and the PR #2 check-in messages. **Those statements are superseded.** In session 2:
> - all four test-account variables were confirmed present (by name);
> - network access was set to **Full**;
> - REA 6.4.0 was installed and used;
> - **both accounts logged in** after email verification;
> - "Flowdeck Research WS" and "FD Parity Board" were created;
> - extensive authenticated single-user research and a cross-user round were completed.
>
> Do **not** infer missing credentials or network access from old notes. A future session must **check its own environment** first (variable names only; a reachability probe of `trello.com`). It should expect that **fresh email verification may be needed** even though earlier logins succeeded.

The research is **paused** and nothing has been implemented. Do not merge PR #2 or PR #3 yet.

## Where things are

| Item | Value |
|---|---|
| Branch | `claude/trello-investigation-resume-kxgrvd` |
| Latest research commits | `1cb8483` (authenticated session 2), `edf407d` (cross-user round), `e3f6c13` (this handoff), then the 2026-10-12 reconciliation of this file. `git log -1` shows the current head. |
| Research PR (this branch, draft) | https://github.com/utkarshraj2004/Flowdeck/pull/3 (base: `claude/great-ride-udwvvd`, PR #2's branch) |
| Original research PR (draft) | https://github.com/utkarshraj2004/Flowdeck/pull/2 (base: `main`) |
| Merge path, when approved | PR #3 into `claude/great-ride-udwvvd`, then PR #2 into `main`. Do **not** merge without the owner's approval. |
| Main evidence | [evidence/E-session2-auth.md](evidence/E-session2-auth.md) (authenticated, §1–§14), [evidence/E-session2.md](evidence/E-session2.md) (logged-out states, shortcuts, direct docs) |
| Test status table | [09-test-plan.md](09-test-plan.md), "T status after session 2" |

## Trello test content (keep it; it is synthetic)

| Item | Value |
|---|---|
| Owner account | Test **Account 1** (`TRELLO_TEST_*`), "User A" in the evidence |
| Workspace | **Flowdeck Research WS** (slug `flowdeckresearchws`), free plan |
| Board | **FD Parity Board**, lists Backlog / To Do / Doing / Done, synthetic cards (`Review permissions` ×2, `Write spec draft`, `Set up backups`, `RT probe 1–5`, `XU probe 1–3`) |
| Board visibility now | **Public** (changed by the owner on 2026-10-11 19:38 UTC). Its synthetic content is visible on the internet until set back to Workspace or Private. |
| Second account | Test **Account 2** (`TRELLO_TEST2_*`), "User B". **Not a member** of the board or workspace. Watches the card "Set up backups". |
| Untouched | Both accounts' onboarding "Trello Workspace" and starter boards; the owner's real boards. |

## T1–T10 status

| ID | Status | Notes |
|---|---|---|
| T1 Layout | ✅ Done | Desktop 1280 and phone 375, logged in and out |
| T2 Drag-and-drop | 🟡 Mostly done | Mouse drag of cards/lists, placeholder, keyboard moves, persistence. **Real-phone touch drag: unverified** (emulation cannot start native drags) |
| T3 Concurrent edits | 🟡 Partial / **blocked** | Same user, two tabs: last write wins, no warning. **Two different users: blocked**, because B is not a member (writes → 401) |
| T4 Real-time | ✅ Done | A→B 383–914 ms (median ≈ 440 ms); live archive/delete in an open dialog; socket reconnect timing (logged out) |
| T5 Roles and permissions | 🟡 Partial / **blocked** | Non-member and logged-in public viewer mapped, plus server 401 on writes. **Member / observer / guest rows: blocked** (B not a member; Observer is a paid feature) |
| T6 Validation | ✅ Done | Title limit 16384 (silent), upload limit 10 MiB, required fields |
| T7 Archive/restore/delete | ✅ Done | Restore to original position, confirmation wording, `z` undo |
| T8 Notifications | 🟡 Mostly done | Watcher triggers from another user, drawer, badge, no self-notifications, non-member @mention silent, default email Periodically. **Member-only triggers** (@mention of a member, "added to card") blocked |
| T9 Shortcuts | ✅ Done | Full list |
| T10 Empty/loading/offline/error states | ✅ Done | Logged in and out |

## Session 3 check (2026-10-12)

Environment confirmed (all four variables present by name; Trello, Atlassian and `*.atl-paas.net` reachable). Both accounts logged in. This time Atlassian showed a **"Security review"** page (suggesting two-step verification or a passkey); "Continue without two-step verification" worked and **no email code was needed**. Membership was re-verified from both sessions: **Account 2 is still not a member** of FD Parity Board or Flowdeck Research WS, and there has been no invite or member action since 2026-10-11 19:38 UTC. Gaps 1–3 were therefore not run. Details: [E-session2-auth §15](evidence/E-session2-auth.md#15--session-3-membership-check-2026-10-12).

## Session 4 (2026-10-12 ~09:50 UTC)

Reused the logged-in browser sessions from session 3 (no restart, no new login). One authorized invitation attempt; **membership still not created** (cause above). Gaps 1–3 not run. While blocked, the existing research was checked for inconsistencies: six stale statements were marked *Reconciled 2026-10-12* in `00`, `02`, `04`, `06`, `10`, `E-trello-public` and `E-REA`, without deleting history. The manual phone checklist was added.

## Remaining gaps (actual, as of 2026-10-12)

Everything else in T1–T10 is done or mostly done (table above). What remains:

| # | Gap | Test | Why it is open | Needs |
|---|---|---|---|---|
| 1 | **Different-user conflict and real-time edits**: both users editing the same title or description, two-way (B→A) real-time while both can write | T3 (and the two-way part of T4) | B is only a public viewer (writes → 401). One-way A→B real-time **is done** (383–914 ms). Same-user two-tab conflict **is done** (last write wins, no warning). | B as a board **member** |
| 2 | **Roles and permissions**: member, observer and guest rows; admin-only settings; removing members; last-admin rule | T5 | Same blocker. Non-member and logged-in public-viewer rows **are done**, including server 401 on writes. Observer is a paid feature, so it may stay N/A on the free plan. | B as a member (guest = member of the board but not the workspace) |
| 3 | **Notifications caused by another user, for a member**: @mention of a member, "added to card", checklist-item assignment | T8 | Watcher notifications from A to B (comment, due, attachment, complete, move) **are done**. Member-only triggers need B as a member. | B as a member |
| 4 | **Real-phone touch dragging**: long-press pick-up, drag between lists, auto-scroll | T2 | Headless emulation cannot start native touch drags. Mouse and keyboard moves **are done**. | A real phone: owner runs [PHONE-CHECKLIST.md](PHONE-CHECKLIST.md) (~15 min) |

Minor and not blocking: list position renumbering when positions get very close (not measured), and auto-scroll near edges during mouse drag.

## Blocker and what the owner needs to do (updated 2026-10-12, session 4)

**User B is still not a member of FD Parity Board.** Session 4 made **one controlled, recorded invitation** through the normal Share dialog ([E-session2-auth §16](evidence/E-session2-auth.md#16--session-4-one-controlled-invitation-attempt-2026-10-12-0950-utc)) and found the first concrete server-side reason:

1. `POST /1/organization/<org>/paidAccount/isFreeToAdd` returns **409**: *"This account is managed by the commerce platform and cannot be modified by this billing API"*.
2. `PUT /1/boards/<board>/members/<B>` (with `allowBillableGuest`) returns **200**, but the membership list it returns still contains only A.
3. **No visible feedback at all.** "Board members 1" stays, and B gets no invitation.

B is not in the workspace, so on this board B would be a **guest**, and the guest billing check is what fails. Ruled out by evidence: seat limits (1/10), guest restrictions (`externalMembersDisabled: false`), invite restrictions, unconfirmed or blocked accounts, and the email provider (B was resolved correctly by email).

**Smallest next step:** make B a **workspace member** (not a board guest), so the guest billing check no longer applies. Choose one:
- **(a) Authorize Claude** to make **one recorded workspace-member invite** (Flowdeck Research WS → Members → Invite Workspace members → B's email → Send invite), with request/response capture as in §16. The earlier §11 workspace invite failed silently but was not recorded, so this tests a different, still-unexplained path. *Or*
- **(b) Do it manually** in a normal browser as Account 1: Flowdeck Research WS → Members → **Invite Workspace members** → Account 2's email → **Send invite**. Then check that the workspace shows **2** members (not 1/10) and tell Claude any message shown.

If B becomes a workspace member, adding B to the board should follow (B joins as a normal member, not a guest). If the workspace route also fails with the same 409, the restriction is in Trello/Atlassian billing for this workspace. The fallback is a fresh test workspace created by **B**, with A invited as a workspace member, or contacting Atlassian support with the 409 message.

Optional, once B is a member: set the board back to **Workspace** visibility (Board menu → Visibility).

## How to resume

1. Start a new session on branch `claude/trello-investigation-resume-kxgrvd` (`git fetch origin && git checkout claude/trello-investigation-resume-kxgrvd && git pull`).
2. **Check the actual environment before concluding anything is missing:** confirm the four variables exist **by name only** (`TRELLO_TEST_EMAIL`, `TRELLO_TEST_PASSWORD`, `TRELLO_TEST2_EMAIL`, `TRELLO_TEST2_PASSWORD`; never print values), and probe `https://trello.com/` and `https://id.atlassian.com/login`. Report only what this check actually shows; do not repeat setup requests from older notes.
3. Reinstall REA in the session scratchpad (not the repo): `npm install rea-agents@latest` (6.4.0 at pause time); check `npx rea --version` and `npx rea doctor`.
4. Start two headless Chromium instances with separate throwaway profiles and loopback-only CDP (`--remote-debugging-address=127.0.0.1`, ports 9222 / 9223, `--no-sandbox`; the binary is `/opt/pw-browsers/chromium-*/chrome-linux/chrome`). The profiles from today live in an ephemeral container and will be gone.
5. Log in each account through the genuine Atlassian flow (`trello.com/login`). **A fresh "We've emailed you a code" verification may be needed for each account, even though both logged in before.** Ask the owner for codes only at that point. The owner supplies the codes in chat, and they go only into Atlassian's form (six boxes; it submits automatically). Do not assume authenticator-app setup removes this challenge.
6. Verify membership via each account's own session (`/1/boards/<board>/memberships`) before testing.
7. If B is a member, close remaining gaps 1–3: run T3 (both users edit the same description and title; record the outcome and any warning), the T5 member rows (what a normal member can and cannot do, admin-only settings, removing members, last-admin rule), and the T8 member triggers (@mention, added to card, assigned to a checklist item). Use only FD Parity Board.
8. Redact before saving: mask names and emails in screenshots, never save cookies or session state, strip IDs and invite links from text. Run `npm run check` and the link and secret scans, commit, push, and update PR #3.

## Tools and settings needed (names only)

- Node 22 (repo `npm ci` installs `playwright-core`), Chromium at `/opt/pw-browsers`, REA (`rea-agents`, npm).
- Environment variables: `TRELLO_TEST_EMAIL`, `TRELLO_TEST_PASSWORD`, `TRELLO_TEST2_EMAIL`, `TRELLO_TEST2_PASSWORD`.
- Network access: Full (Trello, Atlassian, `*.atl-paas.net`, CAPTCHA hosts were all reachable on 2026-10-11).
- Helper scripts used today were in the session scratchpad (not committed): a login script that reads credentials from the environment and filters output, a code-entry script, and step runners for one or two browsers. Recreate them as needed; they are straightforward Playwright `connectOverCDP` scripts.

## Pause hygiene (done at pause time)

- Committed files and screenshots were scanned for credential values, verification codes, account names and usernames, email addresses, tokens and cookie names, board/card/member IDs, invite links and PNG metadata: none found. Names and avatars are masked in screenshots; one partial username was blacked out.
- No browser session state or cookies were exported or committed.
- The temporary Chromium instances were stopped after saving. No scheduled check-ins or monitors were created.
- 2026-10-12 reconciliation: the PR #2 session's safety-net check-ins were stopped. No check-ins, monitors or browsers are running. Work is paused until the owner resumes it.
- Disclosure from earlier: one diagnostic command printed Account 2's email address into the session's tool output (never committed). Output filtering was enforced afterwards.
