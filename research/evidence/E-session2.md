# E-session2: second investigation session (login attempt, logged-out states, direct docs)

Session 2026-10-11, ~18:00–18:45 UTC. Branch `claude/trello-investigation-resume-kxgrvd`, continuing from PR #2 head `6106a48`. Source ID for observations in this file: **O04**. Docs read directly this session are marked **DOC-direct** (earlier DOC items were read second-hand via search summaries).

## Environment checks

| Check | Result |
|---|---|
| Network | Owner set access to **Full**. HTTP status: `trello.com` 200, `id.atlassian.com/login` 202, `aui-cdn.atlassian.com` 200, `www.recaptcha.net` 200, `api.trello.com/1/` 404 (expected, no route). The CAPTCHA and `*.atl-paas.net` hosts that were blocked in session 1 are reachable. |
| Test-account variables | `TRELLO_TEST_EMAIL`, `TRELLO_TEST_PASSWORD`, `TRELLO_TEST2_EMAIL`, `TRELLO_TEST2_PASSWORD` are all **present** (checked by name; values never printed, logged, screenshotted or committed). |
| REA | Reinstalled from npm into the session scratchpad (`npm install rea-agents@latest`) → **6.4.0** (npm `latest` = 6.4.0). `rea doctor`: Node 22.22.0 and host OK; only the native engines Hopper, Ghidra and IDA are missing, which website analysis does not use (same as session 1). |
| Browsers | Chromium 141.0.7390.37 headless. One throwaway profile per test account, with CDP bound to `127.0.0.1:9222` and `:9223`. A third logged-out profile on `:9224` was used for REA. |

## Login attempt: blocked by email verification

The flow was scripted with Playwright over the loopback CDP port. Credentials were read from the environment inside the script and typed only into the genuine Atlassian form. Output was filtered to remove the variable values and any email-address pattern. No screenshots were taken during login.

| Step | Account 1 | Account 2 |
|---|---|---|
| `trello.com/login` → `id.atlassian.com/login?application=trello…` | ✓ | ✓ |
| Email → **Continue** → password field appears → submit | ✓ | ✓ |
| Result | `id.atlassian.com/login/mfa`, title **"We've emailed you a code"**. Text: "We require additional verification to protect your account. Check your email to continue: [email] · Verification code · Verify · Didn't receive an email? Resend email · Log in to a different account". | Same |

Per the owner's instruction, both logins were **stopped** at this challenge. No retry, no "Resend email", nothing else was entered. The password was accepted (the flow advanced past it), so this is a new-device email verification rather than a credential error. A CAPTCHA-related element was present in the DOM, but no visible CAPTCHA challenge appeared.

**Consequence:** no workspace, board, list, card, comment, checklist or attachment was created. Every authenticated item (T2–T8 and the logged-in parts of T1/T10) remains unobserved. See [§ What is needed to continue](#what-is-needed-to-continue).

## T9 · Keyboard shortcuts (OBS O04, `trello.com/shortcuts`, logged out)

Page title "Keyboard shortcuts | Trello", with a "Shortcuts enabled" toggle. Screenshot: [obs-t9-shortcuts-page.png](screens/obs-t9-shortcuts-page.png).

| Key | Action (Trello's description, paraphrased) |
|---|---|
| Shift+Click | Bulk select cards (Inbox + current board); second Shift+Click selects a range within one list; `e` or right-click opens bulk actions |
| ← ↓ ↑ → / `j` `k` | Select adjacent card on the board (`j` below, `k` above) |
| ← → / `k` `j` (card open) | Open the previous / next card in the list |
| Ctrl/Cmd+C, then V over a list | Copy card (works across boards) |
| Ctrl/Cmd+X, then V over a list | Move card (works across boards) |
| Ctrl/Cmd+V (on board) | Create a card from copied text or link |
| Ctrl/Cmd+V (card open) | Attach copied link |
| `]` | Toggle board menu (right sidebar) |
| `b` | Open header boards menu (search boards; arrows + Enter) |
| `/` | Focus header search |
| `c` | Archive card |
| `d` | Open due-date picker |
| `-` | Add checklist (card open) |
| `e` | Quick edit mode (hovered card) |
| Esc | Close dialog/popover, cancel editing |
| Ctrl/Cmd+Enter | Save text (comment, title, list title, description, …) |
| Enter | Open selected card; Shift+Enter while submitting a new card opens it |
| `f` | Open filter menu (keyword input focused) |
| `l` | Labels popover; `1`–`0` toggle labels by colour: 1 green, 2 yellow, 3 orange, 4 red, 5 purple, 6 blue, 7 sky, 8 lime, 9 pink, 0 black |
| `;` | Toggle label names on card fronts (clicking a label does the same) |
| `m` | Add/remove members popover |
| `n` | Insert new card after the selected card (or into an empty list) |
| `,` `.` / `<` `>` | Move card to bottom / top of the adjacent left / right list |
| `q` | Toggle "cards assigned to me" filter |
| `s` | Watch / unwatch card |
| Space | Assign / unassign self |
| `t` | Edit title (card open) |
| `v` | Vote (Voting Power-Up) |
| `x` | Clear all filters |
| `?` | Open shortcuts page |
| `@` | Member autocomplete in comments (name, username, initials) |
| `z` / Shift+`z` | Undo / redo your last action on a card |
| `r` | Repeat last action on another card |
| Shift+Scroll | Scroll the board sideways |

Logged out, pressing `?` on a board produced no dialog in session 1. The page says `?` "opens the shortcuts page" (navigation, not a modal).

## T10 · Loading, offline and error states (OBS O04, logged out)

| State | Observation | Evidence |
|---|---|---|
| Loading | Skeleton: grey header placeholders, then grey rounded list placeholders (≈272 px wide, varying heights) before content | [obs-t10-loading.png](screens/obs-t10-loading.png) |
| Offline (connection dropped on a loaded board) | Bottom-left toast with warning icon: **"You are offline. Changes made now will not be saved."** The board stays visible and readable. (The "About this board" dialog in the shot is the board's own welcome dialog, unrelated.) | [obs-t10-offline.png](screens/obs-t10-offline.png) |
| Reload while offline | Browser's own "No internet" page. REA `inspect-web-page` reports **0 workers** (no service worker), so there is no offline app shell for the web client. | [obs-t10-offline-reload.png](screens/obs-t10-offline-reload.png) |
| Unknown board `/b/<bad id>` (logged out) | **"Sign up to see this board"**: "You're almost there! The board you are trying to access requires a Trello account." Buttons: Sign up for free / Already have an account? Log in. A non-existent board is shown the same way as a private one, so its existence is not disclosed. | [obs-t10-board-not-found.png](screens/obs-t10-board-not-found.png) |
| Unknown card `/c/<bad id>` (logged out) | Same "Sign up to see this board" page | text capture |

Not observed (needs login): empty board / empty list composer states, logged-in 404 and "no access" pages, error toasts on failed saves, and what happens to edits made while offline.

## T4 (partial) · WebSocket lifecycle and reconnect (OBS O04, logged out, public board)

Measured with Playwright `page.on('websocket')`. Only host and path, timing, frame counts, byte totals and the first character of each frame were recorded. **No payload content was stored.**

| t (s) | Event |
|---|---|
| 2.6 | WS #1 open: `trello.com/1/Session/socket` |
| 3.0 | WS #2 open: `trello.com/gateway/api/graphql/subscriptions` |
| 21.1 | Network set **offline** |
| 26.1 | WS #2 closed after ≈5 s offline: 2 frames sent (≈5.5 kB), 2 received (≈7.7 kB) |
| 36.1 | Network set **online** (15 s outage) |
| 38.1 | WS #1 closed (stale socket detected ≈2 s after reconnect): 4 sent / 4 received, ≈0.5 kB / 0.1 kB |
| 40.2 | WS #1 reopened (`/1/Session/socket`), **≈4 s after online** |
| 55.5 | WS #2 reopened (`/gateway/api/graphql/subscriptions`), **≈19 s after online** |

Frames on both sockets are JSON (first character `{`). The pattern suggests two independent channels with different reconnect policies. This is an inference: the delays fit backoff or a deliberately delayed re-subscribe, but one run does not establish the policy. Fan-out latency between two users (the main point of T4) needs a login.

REA `observe-web-session` (20 s window across a reload and a 4 s offline toggle) returned only page lifecycle events (`commit`, `domcontentloaded`, `load`, `networkidle`, …). REA's `inspect-web-page` network and WebSocket sections are **attach-limited**: they only record activity after REA attaches, and they are empty for a page that is already loaded (`prior_activity_available: false`). This is REA's documented behaviour, so the Playwright listener was used for the socket timeline.

## Official documentation read directly (DOC-direct)

Pages fetched from `support.atlassian.com` / `developer.atlassian.com` (HTTP 200) on 2026-10-11. This **upgrades** these second-hand DOC items and settles some 3P-only facts:

| Topic (source ID) | Direct finding | Effect on spec |
|---|---|---|
| Board user types (D02) | Invited (greyed avatar), Normal member, Observer (read-only, Premium), Workspace member (sees workspace-visible boards), Guest, Board admin (chevron on avatar; paid-workspace admins also board admins). | Confirms 04 |
| Commenting pref (D02) | **Disabled / Members (default) / Members and Observers / Workspace members / Any Trello user (public boards only)**. | Confirms 04 `comments` pref values and default |
| Add/remove members pref (D02) | **Admins / All members (default)**. | 04: invite pref default → **members** (DOC-direct) |
| Workspace self-join (D02) | "Workspace editing" lets any workspace member join without invite; board must be in a workspace and **not private**. | Confirms `selfJoin` |
| Observer rights (D01) | View, download attachments, comment and vote (if enabled), export. Cannot move/edit cards, upload, **tick checklist items**, or change settings. Added via Share (role dropdown) or a share link that adds as Observer. Only workspace or board admins can change a member to observer. **Premium** (3P T01's "Enterprise" claim is wrong). | 04: checklist ticking added to observer ✗ |
| Free-workspace admins (D11) | On free workspaces **all members are admins by default**, but workspace admin gives **no** board control. On Standard/Premium, workspace admins are admin on every workspace board, including private ones. | Confirms 04 |
| Archive/delete list (D03) | A list must be **archived before delete**. Delete removes the list and all its open and archived cards permanently. Restore via Board menu → Archived items → **Switch to lists** → **Send to board**. | J06 |
| Archive/delete card (D29, new) | Archive via card actions, the hover menu, or `c`. Completed cards get a quick-archive icon on hover. Archived cards are never auto-deleted and are not loaded with the board. Restore: Board menu → Archived items → **Restore**. Delete only after archive, with a confirmation click; permanent. | J07 |
| Move card/list across boards (D24) | Copies **description, checklists, attachments, comments**. Does **not** copy history/activity. Members not on the target board are removed. Labels are not mentioned (T05 conflict stays open). Multi-select: Shift-range or Ctrl/Cmd-click, **up to 20 cards**. "Move all cards in this list…" and "Archive all cards in this list…". | J07.4, 07 |
| Attachments (D30, new) | **10 MB per file (free), 250 MB (paid)**. The limit applies to uploads, not links. Image uploads automatically become the card cover. Two cover sizes (normal / full). Board admins can disable cover images. Animated GIFs < 300 px wide and < 5 MB animate. Since 2023-12-01 attachment URLs **require board access** (public boards excepted). Deleting a card deletes its files. No WEBP/HEIC/TIFF support. | 07 attachments: replaces 3P T02 |
| Dates (D10) | Badge colours: light grey (> 24 h away), **yellow** (due within 24 h), **red** (overdue, for 24 h), **light pink** (overdue > 24 h), **green** (complete). Reminder must be set to get a due notification. Archived cards send no notifications. Recurring due: on complete, the due date advances to the next matching cadence date and the card reverts to not done. | 02 badge states, J08 |
| Notifications (D12) | Always notified (when someone else acts): mention in a comment, added to a card/board/workspace, a board you're on is closed, made admin, invite accepted via your link, checklist mention or assignment, checklist due change. **Watching** a card: comment, due date added/changed, complete toggled, attachment added, moved or archived. Watching a list/board: the same for every card, plus new cards. No notifications for your own actions (including your automations). Email frequency **Never / Periodically (hourly summary) / Instantly**. The **default is not stated** on the page. Email skipped if already read in-app. | T8 docs part done; J10 |
| Object limits (D14) | Limits are **returned per board/card by the API and "may vary"**. The example values (open cards per board 5000, checklists per board 15200, labels per board 950, …) are illustrative, not documented guarantees. | 05 limits stay configurable |

## What is needed to continue

The rest of T1–T8 needs a logged-in session. Atlassian requires an emailed one-time code for each test account on this new headless device. These are the supported manual routes, best first:

1. **Enter the emailed codes into this session.** When you are ready, tell me. I will click **Resend email** once per account, and you reply with the two codes. They are single-use and expire within minutes; I type them only into the Atlassian form and never write them anywhere. The two browser profiles stay signed in for the rest of this session.
2. **Enable two-step verification with an authenticator app** on both test accounts, then add each TOTP secret as an environment variable (for example `TRELLO_TEST_TOTP_SECRET` and `TRELLO_TEST2_TOTP_SECRET`) and start a new session. If Atlassian then asks for 2SV instead of the email code (likely, but not verified), the login can complete without you each session.
3. **Sign in once yourself** with the two test accounts from a browser you control, to confirm the accounts work. This does **not** trust this container's browser, so on its own it doesn't unblock automated login.
