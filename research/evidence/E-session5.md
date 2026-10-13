# E-session5: membership resolved, two-user checks, inventory sweep

Session 5, 2026-10-12, ~10:00–11:15 UTC. Source ID **O06**. Logged in as the owner's two dedicated test accounts: **A** (Account 1, `TRELLO_TEST_*`) and **B** (Account 2, `TRELLO_TEST2_*`). All content is synthetic. Screenshots are in [screens/](screens/), prefixed `auth-s5-`.

**Scope and safety**
- The browser sessions from session 4 were reused: both `/1/members/me` returned 200, so there was no new login and no email code.
- Owner-authorized actions only:
  1. One recorded workspace-member invitation of B to **Flowdeck Research WS** (route 1).
  2. After that failed, one fresh synthetic workspace created by B (**FD Reverse WS**), inviting A through the normal UI (route 2).
- No trial, purchase, billing change or real workspace was touched.
- In screenshots, names, usernames, emails and avatars are masked. Four images had leftover text blacked out afterwards: a display name, a username, a partial username and the board's short link.
- In this file, IDs, short links and invitation links are replaced by `<placeholders>`.
- **Client code is a clue, not proof.** Bundle excerpts show what the web client *does*. Server rules here are inferred from responses read back with each account's own session, and are labelled as inferred.

## Tool attribution

Every result below names the tool that produced it.

| Tag | Tool | What it can show |
|---|---|---|
| **REA-a11y** | REA `inspect-web-page --include-accessibility-text` | Accessibility tree: roles and names of controls, read before each interaction |
| **REA-net** | REA `inspect-web-page --include-json-body-shapes --include-websocket-shapes` | Requests and JSON body *shapes* (no values) made while REA was attached |
| **REA-shot** | REA `capture-web-screenshot` (after DOM masking) | Screenshots |
| **REA-bundle** | REA `inspect-web-page --include-script-sources` + `export-web-scripts` | The client JavaScript the page loaded (39 scripts from `trello.com`, almost all under `/assets`) |
| **REA-observe** | REA `observe-web-session` | Navigation and lifecycle timeline |
| **PW** | Playwright over CDP (same browser) | Request/response listeners, WebSocket frame listener, DOM mutation observers, UI actions |
| **API** | `fetch` from the logged-in page with the account's own session | Read-back of the real state after every write (Trello often answers **200 to a write it ignored**) |
| **axe** | axe-core 4.10.3, injected into the page | Automated accessibility rules |

## 1 · REA in this session

| Check | Result |
|---|---|
| Version | `rea --version` → **6.4.0** (npm `rea-agents`, MIT), installed in the session scratchpad, not the repo |
| Targets | `list-browser-targets` on both loopback CDP ports (9222 = A, 9223 = B) |
| Tools used | `inspect-web-page` (accessibility, JSON shapes, WebSocket shapes, script sources), `capture-web-screenshot`, `analyze-web-bundle`, `export-web-scripts`, `observe-web-session`, `list-browser-targets` |

**Limitations found, and the workaround used for each:**

| Limitation (exact REA behaviour) | Effect | Workaround |
|---|---|---|
| `inspect-web-page` fails with `target_unavailable` / `target_changed` when the page navigates during the observation window | No capture across a full page load (e.g. opening a workspace URL) | `observe-web-session` attached **before** navigating (lifecycle timeline only), plus **PW** request listeners; then `inspect-web-page` once the page had settled |
| "Observation starts when REA attaches; prior network and console activity is unavailable." | Trello's two WebSockets open at page load, so REA saw `websocket_connections: []` | **PW** `page.on('websocket')` on a fresh tab: frame counts, sizes and key-only shapes |
| Same-origin scope (`--allowed-origins https://trello.com`) | The automation builder renders in a cross-origin iframe from the Butler service's own origin, which REA's scope excludes | **PW** frame listing: the iframe exists but its content stayed blank (§10) |
| `target_not_allowed` on a target outside the selected origin scope | One attempt on a tab that was not an allowed HTTP(S) page | Re-targeted the correct tab |
| `export-web-scripts` rejects relative paths ("must be absolute") | — | Absolute paths |
| REA retains only value-free shapes of bodies and frames | Exact values (e.g. error text) are not in REA output | **PW** captured status codes and short, scrubbed error messages |

## 2 · Membership blocker: resolved by route 2

### Route 1: one recorded workspace-member invitation (Flowdeck Research WS, A invites B) → **failed**

| Step | Tool | Result |
|---|---|---|
| Members page before | REA-a11y, REA-shot | "Collaborators 1 / 10", tabs Members (1) / Single-board guests (0) / Multi-board guests (0) / Join requests (0), **Invite Workspace members** button |
| Invite dialog | REA-a11y | "Invite to Workspace", combobox "Email address or name", **Create link**, Send invite |
| Typed B's email | PW | One suggestion (B's display name). Chip added, **Send invite** enabled. [m1](screens/auth-s5-m1-ws-invite-before-send.png) |
| Send (one click, 10:03:31 UTC) | REA-net (REA attached for the whole window) | Exactly one write: `PUT /1/organizations/<org>/members/<B>` → **200**. **No `isFreeToAdd` call** was made. |
| Visible feedback | PW | Toast **"Member was invited"** + B's username. The dialog closed. |
| Read-back ≈ 20 s later | API (both sessions), REA-shot | Workspace memberships = **A only**. B gets 401 "unauthorized organization" on the workspace. B's workspaces: only B's onboarding workspace. **No notification** to B. The page still shows **1 / 10**, Members (1). [m2](screens/auth-s5-m2-ws-invite-after-send.png) |
| B opens the workspace URL | REA-observe (13 lifecycle events), then REA-a11y | **"Page not found."** |

**Finding:** the workspace invitation was accepted by the server (200), and the UI said it succeeded, but no membership, pending invite or notification was created. This route never calls the billing check. So the **409 from `isFreeToAdd` recorded in session 4 is not what blocks Account 2**; see the correction in §11.

### Route 2: B creates **FD Reverse WS** and invites A → **succeeded**

| Step | Tool | Result |
|---|---|---|
| B's Create menu | REA-a11y | Create board with AI · Create board · Start with a template. Workspace creation is in the account menu, as in session 2 |
| Workspace form | REA-a11y, REA-shot | Name **FD Reverse WS**, type "Other" (8 type options), description optional. [m3](screens/auth-s5-m3-reverse-ws-form.png) |
| Continue | PW | `POST /1/organizations` → 200 (body keys `desc`, `displayName`, `teamType`, `type`, `waitForEntitlement`) → `/w/<slug2>` |
| Invite A (one click, 10:12:50 UTC) | PW, REA-shot | One suggestion. Toast "Member was invited". [m4](screens/auth-s5-m4-reverse-invite-before.png) |
| Read-back | API (both sessions), REA-shot | Memberships **B admin, A admin** (on the free plan every workspace member is an admin). A's workspaces now include FD Reverse WS. A received notification `addedToOrganization`. Page shows **2 / 10**, Members (2). [m5](screens/auth-s5-m5-reverse-invite-after.png) |
| B creates **FD Collab Board** (workspace visibility) and shares it with A as Member | PW | `POST …/paidAccount/isFreeToAdd` → **409** "managed by the commerce platform…" (**the same error as session 4**), then `PUT /1/boards/<board2>/members/<A>?type=normal` → **200**, and the response **contains A as `normal`** |
| Read-back | API (both), REA-shot | Board memberships **B admin, A normal**, seen by both. A received `addedToBoard`. Share dialog shows "Board members 2". [m6](screens/auth-s5-m6-collab-board-two-members.png) |

### What route 2 shows

The billing check returns 409 in **both** workspaces. In FD Reverse WS the add succeeded anyway, so the 409 is cosmetic. The remaining failure is specific to adding **Account 2 into Flowdeck Research WS** (by workspace invite, board share, link or join request). The evidence cannot tell whether the cause is Account 2 as the invitee, Flowdeck Research WS, or that pair. It is a Trello/Atlassian-side state that the client does not report. All two-user tests below use FD Reverse WS. **No support request is needed to continue the research.** An unsent support draft for the residual issue is in [HANDOFF](../HANDOFF.md#optional-atlassian-support-draft-not-sent).

### Bundle clues (REA-bundle; client code, not proof)

REA captured 39 scripts and exported them. Three bundles mention the billing check (`board-invite-modal`, `board-route`, `app`).

- The board invite modal runs a GraphQL mutation `InviteMemberToBoard` → `addMemberToBoard(boardId, member, type, allowBillableGuest: true, invitationMessage, acceptUnconfirmed: true)`. On success it logs a `taskSucceeded` "edit-board/members/add" event. The only user-facing messages are a board-limit pre-check ("To add this person to this board, their access to some other boards must be removed.") and a special case for errors matching `/organization restricts invites/`. **Any other outcome, including a 200 that adds nobody, produces no message.** That matches the silent failures.
- A `FreeToAddMembers` query reads `isFreeToAdd` per invitee. Its error handler only special-cases "There is no paid account" and otherwise returns the invitee list unchanged. So a 409 there does not stop the add, which is consistent with route 2.
- The workspace invite resolver does `PUT /1/organizations/<org>/members/<member>`. Its result handling returns `{success: true}` once the HTTP call succeeds, which explains the "Member was invited" toast in route 1 without a membership.

## 3 · T3: conflicting edits by different users (FD Collab Board)

Both users had the same card dialog open. Each case was reset before it ran (PW actions, API read-back of the result and the card's action history).

| # | Case | Result | Screens |
|---|---|---|---|
| 1 | **Title.** Both edit. A saves, then B saves 1.6 s later | Server keeps **B's title (last write wins)**. A's open dialog updates live to B's title. **No toast or warning** for either user. History records both `updateCard` name changes. While A's save arrived, B's field kept B's own typed text (not overwritten). | [t3-1](screens/auth-s5-t3-1-title-final.png) |
| 1a | Side finding (from an interrupted run) | A card title **saves on blur**. When the script crashed with the title field still open, A's typed title was saved and logged. | — |
| 2 | **Description.** Both open the editor. A saves, then B saves | Server keeps **B's text**. While A's save arrived, B's draft stayed in the editor untouched. **No notice.** A's dialog then showed B's version. | [t3-2](screens/auth-s5-t3-2-desc-draft-kept.png) |
| 3 | **Description.** B saves while A has an unsaved draft | A's draft is **kept** in the editor, with an **"Unsaved changes"** badge and a **Discard changes** button. **No warning that the saved text changed.** After A discards, A sees B's saved text. | [t3-3](screens/auth-s5-t3-3-draft-vs-saved.png) |
| 3a | Editing indicator | In both cases the Description heading showed the **other** user's avatar with a pencil icon while they edited. Screenshot only; the exact rule (live presence or last editor) was not measured. | t3-2, t3-3 |
| 4 | **Move.** Both move the same card at once to different lists | Both PUTs → 200. Both clients converge on the **same final list** (last write wins). | — |
| 5 | **Archive, then delete, while the other user types** | B archives while A is typing in the description: A's dialog shows "This card was archived on …" at the top, and **A's editor stays open with the draft**. B then deletes it: A's view becomes **"Card not found."** The draft is lost. | [t3-5](screens/auth-s5-t3-5-deleted-while-editing.png) |

**Summary:** Trello applies **last write wins per field**. It never overwrites a local draft, never warns about a concurrent change, and loses an unsaved draft when the card is deleted.

## 4 · T4: two-way real-time, reconnect, persistence (FD Collab Board)

Latency = time from the writer's API 200 to the item appearing in the other user's DOM (PW mutation observer).

| Direction | Trials | Range | Median |
|---|---|---|---|
| B → A, card created | 5 | 388–702 ms | **504 ms** |
| A → B, card created | 5 | 416–548 ms | **443 ms** |
| Move to Done (B→A / A→B) | 1 each | 499 / 458 ms | — |
| Rename (B→A / A→B) | 1 each | 325 / 384 ms | — |
| Archive, card disappears (B→A / A→B) | 1 each | 452 / 428 ms | — |

**Reconnect (PW `context.setOffline`):**
- With A offline, B created two cards and renamed one.
- During the outage A showed the toast "**You are offline.** Changes made now will not be saved." and received nothing. [t4-1](screens/auth-s5-t4-1-offline.png)
- After A came back online, **all three changes appeared 2.75 s later**, with no reload and no duplicates. The offline toast stayed until closed. [t4-2](screens/auth-s5-t4-2-after-reconnect.png)

**Persistence:** after a reload, A's board was identical to before the reload and to B's board, list by list (API + DOM).

**WebSocket shapes** (PW frame listener on a fresh tab; REA could not see these sockets, §1; keys only, no values):

| Socket | Client sends | Server sends |
|---|---|---|
| `/1/Session/socket` (query keys `clientVersion`, trace ids) | `{type, reqid}`, then one subscribe per model: `{type, modelType, idModel, tags[], invitationTokens[], reqid}` | Acks `{reqid, result: boolean}` / `{reqid, result: number}`, then **`{notify: {event, typeName, deltas: [{id, name, idList, idBoard, closed, badges{…}, dateLastActivity, …}], tags, idBoard}, idModelChannel, ixLastUpdateChannel}`**. One rename produced **one** frame carrying only the changed card's fields. |
| `/gateway/api/graphql/subscriptions` (graphql-ws) | `connection_init`, then subscriptions with variables `memberId` (+ `noInitialResponse`) or `workspaceId` | `onWorkspaceUpdated` / `onBoardUpdated` payloads with `_deltas` and per-section objects (lists, labels, prefs, members added…) and **`extensions.sequenceNumber`** |

**Reading (inferred):** each channel carries a monotonically increasing index (`ixLastUpdateChannel`, `sequenceNumber`) and field-level deltas. This matches Flowdeck's `seq` + changed-fields contract (06). How Trello replays missed updates after reconnect was not inspected. The client may simply refetch.

## 5 · T5: roles and permissions

Boards in FD Reverse WS. Every write was **read back** (API), because Trello returns **200 for writes it silently ignores**.

### Board roles on the free plan (REA-a11y, REA-shot)

- The role menu for a member offers **Admin · Member · Observer** (greyed out: "Add people with limited permissions to this board. **Upgrade**") **· Remove from board**. [t5-1](screens/auth-s5-t5-1-board-role-menu.png)
- **Observer is paid**, so the observer role is **untested**.
- The Share dialog labels a user who is not in the workspace as a "**Workspace guest**".

### Member (A, `normal`) vs admin (B) on FD Collab Board

| Action by A (member) | Status | Effective (read-back) |
|---|---|---|
| Create, edit, move, archive own cards | 200 | yes |
| Archive another user's card; delete another user's archived card | 200 | **yes** |
| Archive a list; create a label | 200 | **yes** |
| Rename board | **401** "unauthorized permission requested" | no |
| Close board | **401** | no |
| Promote self to admin | **401** "Unauthorized" | no |
| Demote the sole admin | **403** "Cannot demote sole admin" | no |
| Change visibility / background / comment pref / self-join / invitations pref | **200** | **no: silent no-op**. All five values were unchanged on read-back, tested with A as a normal board member on FD Roles Board. On FD Collab Board the same calls also returned 200, and the board's final prefs were unchanged. |
| Edit another user's comment | **401** | no |
| Delete another user's comment | **401** | no |

| Action by B (admin) | Status | Effective |
|---|---|---|
| Edit A's comment | **401** | no: even admins cannot edit others' comments |
| Delete A's comment | 200 | **yes** |
| Demote self while sole admin | **403** "Cannot demote sole admin" | no |
| **Leave the board while sole admin** | **200** | **yes: the board is left with no admin** |

**Adminless board (FD Collab Board):** after B left, only A (member) remained. B then saw a **Join board** button ([t5-3](screens/auth-s5-t5-3-adminless-board.png)), joined as a member, and tried to promote self → **401**. The board now has two members and **no admin**, and neither user can fix that, even though both were workspace admins at the time. FD Roles Board was created for the remaining role tests.

### Workspace roles

- On the free plan, the role control shows "**Upgrade to change permissions** … with Premium. Try Premium free for 14 days". Every member is an admin, and a **normal workspace role is paid** (untested). [t5-4](screens/auth-s5-t5-4-ws-roles-paid.png)
- A workspace member who is **not a board member** (A, after removal from FD Roles Board, still a workspace admin) could still read the workspace-visible board and **create a card on it** (200, effective). This is consistent with the board's "Workspace editing" setting ("Any Workspace member can edit and join this board").

### Guest (A after removal from the workspace, still a member of FD Collab Board)

| Check | Result |
|---|---|
| Remove dialog (REA-shot [t5-5](screens/auth-s5-t5-5-ws-remove-dialog.png)) | Two choices: **Remove from Workspace** ("…retain access to all the boards and cards they are currently a member of…") or **Remove from Workspace and Boards**. Both say "They will receive a notification." |
| After "Remove from Workspace" ([t5-6](screens/auth-s5-t5-6-ws-guest-tab.png)) | Members (1), **Single-board guests (1)**; Collaborators still **2 / 10** (guests count toward the cap) |
| Guest creates a card on the shared board | 200, effective |
| Guest renames the board | **401** |
| Guest changes visibility | 200, **no-op** |
| Guest reads another workspace-visible board in the same workspace | **401**; UI "This board is private · Send request" |
| Guest writes to that board | **401** |
| Guest reads basic workspace info | 200 |
| Guest's home page | Workspace listed under **"GUEST WORKSPACES"** |
| Adding a non-member back to FD Roles Board via Share | Suggestion labelled "Workspace guest"; `isFreeToAdd` → **409** again, then the add → 200 and **effective** |

## 6 · Membership and permission changes while the other session is open

| Change (by B) | A's open session | Tool |
|---|---|---|
| Promote A to admin (A has the board menu open) | **Close board** appears in A's menu **663 ms** later, without reload. [t5-2](screens/auth-s5-t5-2-menu-after-promote.png) | PW mutation observer |
| Demote A to member | **Close board** disappears **958 ms** later | PW |
| Remove A from FD Roles Board (A has a card open; A still a workspace admin) | No access message. A keeps read **and write** access through workspace membership (above) | PW, API |
| Remove guest A from FD Roles Board (A not in the workspace, board open) | **"This board is private"** replaces the board **4.9 s** later, without reload. The cards are no longer rendered. API read and write → **401**. After a reload: "This board is private · Send a request…". [t5-7](screens/auth-s5-t5-7-removed-live.png) | PW, API |

## 7 · T8: notifications caused by another user (A = member of FD Roles Board, B acts)

The @mention went through B's real comment composer (PW keyboard input). The other triggers went through B's API session. A's notifications were read by API; A's bell was watched with a mutation observer.

| Trigger by B | A's notification |
|---|---|
| @mention of A in a comment | `mentionedOnCard`. Autocomplete offered **1 suggestion** (the board member). A's bell went from 2 to 3 **613 ms** after Save. [t8-1](screens/auth-s5-t8-1-mention-autocomplete.png) |
| Add A to the card | `addedToCard` |
| Set a due date (A is a card member) | `changeCard` |
| Comment without mention on A's card | `commentCard` |
| Attach a link | `addAttachmentToCard` |
| Mark the card complete | `markedCompleteCard` |
| Assign a checklist item to A | 200, but **not applied** (item has no member on read-back) and **no notification**: item assignment is a paid "advanced checklists" feature |
| Remove A from the card | `removedFromCard` |
| A watches the list; B creates a card in it | `createdCard` |
| A watches the board; B renames the list | **none** |

The drawer groups notifications **per card**, newest first ("Created card", "Removed you", "Marked card complete", "Attached …", the comment text, "Added a due date …"). The card front shows a red bell with an unread count. [t8-2](screens/auth-s5-t8-2-drawer.png)

## 8 · Inventory sweep (A, admin of FD Parity Board, and a throwaway board)

Method: REA-a11y before each click, PW clicks, REA-shot of each meaningful state, API read-back of results.

### Paid features (shown with Upgrade / Start free trial; **not tested**, no trial started)

| Feature | Where it shows | Screen |
|---|---|---|
| **Views**: Table, Calendar, Timeline, Dashboard, Map | View switcher lists them with locks ("Upgrade for Views"); Board is the only free view | [i01](screens/auth-s5-i01-views-paid.png) |
| **Custom Fields** | Board menu, "Upgrade to add Custom Fields" | [i11](screens/auth-s5-i11-custom-fields-paid.png) |
| **Mirror cards** | Card Actions → Mirror: Inbox/Board tabs, board/list/position pickers, "Start free trial" or "**Create free link card instead**" | [i04](screens/auth-s5-i04-mirror-paid.png) |
| **CSV export** | Print, export, and share: "Export as CSV · Upgrade" | [i02](screens/auth-s5-i02-print-export.png) |
| **List colours** | List menu, "Upgrade to change list colors" | [i06](screens/auth-s5-i06-list-menu.png) |
| **Observer role**, **workspace member roles** | §5 | t5-1, t5-4 |
| **Checklist item assignment** ("advanced checklists") | API 200 but no effect (§7) | — |
| **Collections** | Board settings (session 2) | — |

### Free features observed this session

| Feature | Observation | Screen |
|---|---|---|
| **Print, export, share** | Board link (copy), visibility note, **Print**, **Export as JSON**, **Show QR code** | i02 |
| **JSON export** (API) | `/b/<shortLink>.json` → 200. Top-level board fields plus arrays `actions` (64), `cards` (13), `checklists`, `customFields`, `labels` (8), `lists` (4), `members`, `memberships`, `pluginData`. Structure only; values not saved | — |
| **Email-to-board** | "Add cards via email": board address (masked) + Copy, Reset email address, Email me this address; target list and position (Bottom). "Anyone with this email can add cards as you." | [i03](screens/auth-s5-i03-email-to-board.png) |
| **Starring** | Toggle on and off, read back from `boardStars` | — |
| **Switch boards** | Dialog with Recent / per-workspace tabs, search, star buttons, list view, "Pin switcher as a sidebar" | — |
| **Copy board** | Title, visibility, Workspace, **Keep cards**, **Keep Template cards**, Create (not submitted) | — |
| **Board "Make template"** | Panel opens with a Make template button. Not executed (it would convert the board). Session 2 recorded an Upgrade badge here, so the tier is uncertain | — |
| **Card template** | Card Actions → Make template → "This is a Template card", **Create card from template**, Hide from list. Free. Reverted afterwards | — |
| **Card actions menu** | Join, Move, Copy, Mirror, Make template, Watch, Share, Archive; plus "Create Jira work item" | — |
| **Dates popover** | Start (optional), due date + time, **Recurring** (default Never), **reminder** default "1 Day before", text "Reminders will be sent to all members and watchers of this card." | [i05](screens/auth-s5-i05-dates-recurring.png) |
| **Cover popover** | Size (title under / on cover), 10 colours, colour-blind toggle, attachments, Unsplash photos | — |
| **Emoji reactions** | Picker with search, Frequently used, categories. 👍 applied, then read back (`+1`, by A) | [i08](screens/auth-s5-i08-reaction-picker.png) |
| **Stickers** | Default stickers and a "Taco pack"; **Upload custom sticker** | — |
| **Labels panel** | Board labels, create, colour-blind toggle, search | — |
| **Change background** | Photos, Colors, Custom upload, AI image prompt | — |
| **Activity panel** | Tabs All / Comments; entries link to cards | — |
| **Template gallery** | Create → Start with a template: Top templates list, Explore templates | — |
| **Inbox** | Left panel: Add a card, filter, menu, "Consolidate your to-dos" (email/Slack/Teams capture). Free | [i09](screens/auth-s5-i09-inbox.png) |
| **Planner** | Left panel: week agenda with "3 cards due" today, Connect your calendar account, Today / previous / next, view switch. Free | [i10](screens/auth-s5-i10-planner.png) |
| **List menu** | Add card, Copy list, Move list, Move all cards in this list, Sort by, Watch, Change list colour (paid), **Automation shortcuts** (When a card is added… / Every day, sort list by / Every Monday, sort list by / Create a rule), Archive this list, Archive all cards in this list | i06 |
| **Copy list / Move list** | Copy: Name + Create list. Move: Board + Position | — |
| **Sort list by name** | Result `apple, Banana, Cherry` (**case-insensitive**) | — |
| **Move all cards** | Picker of lists ("Source list (current)", others). All 3 cards moved | — |
| **Close / reopen / delete board** (throwaway board) | Close → "Close board?" popover with **Close**. The closed board shows **Reopen board**. Reopen asks to "Select a Workspace", then confirm (closed → false). **Delete is not on the closed board page** in this version; it is in Boards → **Closed boards** (Reopen / Delete) → "Delete board? All lists, cards and actions will be deleted, and you won't be able to re-open the board. There is no undo." → board API **404** afterwards | [i07](screens/auth-s5-i07-delete-closed-board.png) |
| **Archived items** | Card rows with Restore / Delete; search; "Switch to lists" (lists view not reached this time; list restore was covered in session 2 T7) | — |

## 9 · Accessibility (axe + keyboard, FD Parity Board)

| Check | Result |
|---|---|
| axe on the board view | 3 violations: `meta-viewport` (critical: zoom disabled), `list` (serious: 3 nodes, `<ul>` with non-`<li>` children), `color-contrast` (serious: 1 node); 28 passes |
| axe on the open card dialog | 1 violation: `aria-command-name` (serious: 1 button without an accessible name); 23 passes |
| Keyboard | Card tiles are focusable links. **Enter** opens the dialog and focus moves into it. **Escape** closes it and returns focus to the same card. Skip links to "Board" and "Board switcher" |
| Focus trap | Not confirmed: the Tab-cycle probe gave no result in one run and the opposite in another, so it is reported as **unverified** |

## 10 · Not reached or not inspectable

| Item | Why | Smallest next action |
|---|---|---|
| **Automation builder** (rules, buttons, schedule, due-date) | The `/butler/*` routes load a cross-origin iframe (the Butler service's own origin) that stayed **blank** in headless Chromium, and it is outside REA's same-origin scope. The list-menu automation shortcuts are visible | Open it once in a normal desktop browser, or accept DOC D07 |
| **Power-Ups directory** | "Add Power-Ups" navigates to `/b/<shortLink>/power-ups`; the panel content was not captured | Low value for Flowdeck (Out of scope) |
| Archived-lists view and checklist **Item actions** menu | Selector timeouts this time. List archive/restore and item actions were covered in session 2 | None needed |
| **Real-phone touch drag** | Emulated touch cannot start native drags, and emulation is not proof | Owner runs [PHONE-CHECKLIST.md](../PHONE-CHECKLIST.md) |
| Observer role, normal workspace role, item assignment, Views, Custom Fields, Mirror, CSV, list colours | Paid; no trial was started | None (Flowdeck has no plan gating) |
| Residual: adding Account 2 to Flowdeck Research WS | Fails silently server-side (§2) | Optional support request (draft in HANDOFF); not needed for research |

## 11 · Corrections to earlier evidence

| Earlier statement | Correction |
|---|---|
| E-session2-auth §16 and HANDOFF (session 4): the `isFreeToAdd` 409 "is the first recorded server-side reason" and making B a workspace member should avoid it | **Not the cause.** Route 1 (workspace invite) made no billing call and still failed. In FD Reverse WS the same 409 occurs and the add succeeds. The 409 is cosmetic. |
| Early session-5 reading: a member or guest can change board visibility, background and permission prefs (API 200) | **Wrong.** Read-back shows all five pref writes were **silent no-ops**. Only admins change them. |
| 04 "Not verified": a workspace member's rights on a workspace-visible board they have not joined | **Observed** for a free-plan workspace admin: they can view **and create cards** when "Workspace editing" is on. A *normal* workspace member is a paid role and remains untested. |
| 00 rows 7, 8, 25, 30, 39, 43 "blocked: B not a member" | Unblocked via FD Reverse WS. See the coverage table. |
