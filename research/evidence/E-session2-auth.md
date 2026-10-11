# E-session2-auth: authenticated Trello observations (test accounts)

Session 2, 2026-10-11, ~18:45–19:35 UTC. Source ID **O05**. Everything here is **OBS**: seen in Chromium 141 (headless, loopback CDP) while logged in as the owner's two dedicated **test accounts**, called **User A** and **User B** below. Screenshots are in [screens/](screens/), prefixed `auth-`.

**Scope and safety**
- Login used the genuine Atlassian flow. The owner supplied the two emailed one-time codes in chat, and they were typed only into Atlassian's verification form. The form is six one-character boxes and submits automatically when the sixth character is entered.
- All test content is synthetic: workspace **"Flowdeck Research WS"**, board **"FD Parity Board"**, and cards/lists/labels/files created here. The accounts' pre-existing onboarding workspace and starter board were not modified. No real boards and no third-party boards were touched.
- In screenshots, names and emails are replaced by `[user]` / `[email]` and avatars are blurred. In this file, IDs and links are replaced by placeholders.
- **Not a reverse-engineering of Trello's servers.** Network observations show what the web client does. Where a server rule is stated, it is inferred from client-visible behaviour and labelled as such.
- **Disclosure:** during the session, one diagnostic command printed User B's email address (the value of `TRELLO_TEST2_EMAIL`) to the session's tool output. It was never committed, written to a file, or put in a screenshot. Output filtering was then forced on every script.

## 1 · Accounts, onboarding, workspaces

| Observation | Evidence |
|---|---|
| A new account already has a workspace **"Trello Workspace"** and a starter board (User A "My Trello Board", User B "My Trello board"), created by onboarding. Home page: left nav Boards / Templates / Home, workspace list, "Most popular templates", a Jira promo, "Recently viewed". Header: app switcher, logo, search, **Create**, feedback, notifications (bell with count), help, avatar. | — |
| **Create** menu offers only *Create board with AI* / *Create board* / *Start with a template*. **No workspace option.** | [a01](screens/auth-a01-create-menu.png) |
| Account menu: ACCOUNT (name, email, Switch accounts, Manage account) · TRELLO (Profile and visibility, Activity, Cards, Settings, AI Settings, Labs, Theme ›) · **Create Workspace** · Help · Shortcuts. | [a02](screens/auth-a02-account-menu.png) |
| "Let's build a Workspace": **Workspace name\*** (placeholder "Taco's Co."), **Workspace type\*** (Engineering-IT, Education, Operations, Small Business, Sales CRM, Human Resources, Marketing, Other), description (optional). **Continue stays disabled until both name and type are set.** No invite step followed. Trello went straight to `/w/<slug-from-name>`. | [a03](screens/auth-a03-create-workspace-form.png), [a04](screens/auth-a04-create-workspace-invite-step.png) |
| Workspace page (settings-style layout without the app header): Boards / Members / Settings / Upgrade workspace, **FREE** badge, templates suggested for the chosen type, sort ("Most recently active"), collection filter, board search, "Create new board" tile. | [a06](screens/auth-a06-workspace-home.png) |
| Workspace **Members** page: "Collaborators **1 / 10**" (free-plan cap); tabs Members, Single-board guests, Multi-board guests, Join requests; text "Workspace members can view and join all Workspace visible boards and create new boards in the Workspace."; **Invite Workspace members**; member row shows Boards (n), Admin (?), Leave. | [g01](screens/auth-g01-workspace-members.png) |

## 2 · Boards

| Observation | Evidence |
|---|---|
| Create-board popover: Background picker, **Board title\*** (empty → "👋 Board title is required"; Create disabled), Workspace select (defaults to the current workspace), **Visibility default "Workspace"**, Create, "Start with a template". Esc closes the whole popover. | [a07](screens/auth-a07-create-board-popover.png) |
| Visibility options, with their help text: **Private** "Only board members can see this board. Workspace admins can close the board or remove members." · **Workspace** "All members of the … Workspace can see and edit this board." · **Public** "Anyone on the internet can see this board. Only board members can edit." | [a08](screens/auth-a08-create-board-visibility.png) |
| A new board gets **default lists To Do / Doing / Done**, a random photo background, and the **first list's card composer auto-opened** ("Enter a title or paste a link"). URL `/b/<shortLink>/<slug>`. The page shows an **Inbox** panel on the left and a floating bottom bar *Inbox · Planner · Board · Switch boards*. With the Inbox closed, the app header takes on the board's background colours. | [b01](screens/auth-b01-empty-board.png), [e01](screens/auth-e01-drag-in-progress.png) |
| Board header: name, view switcher, member avatar(s) with admin badge, Power-ups, Automation, filter, star, members, **Share**, `⋯`. | [b01](screens/auth-b01-empty-board.png) |
| Board menu ("Menu" side panel): Share · About this board · Visibility · Print, export, and share · Star · Settings · Change background · Custom Fields *(Upgrade)* · Automation · Power-Ups · Labels · Stickers · Make template *(Upgrade)* · Activity · Archived items · Watch · Copy board · Email-to-board · Close board · Report abuse. | [d01](screens/auth-d01-board-menu.png), [d01b](screens/auth-d01b-board-menu-lower.png) |
| Board **Settings**: Workspace; Permissions: **Commenting** (Members), **Adding and removing members** (Members), **Workspace editing ✓** "Any Workspace member can edit and join this board." (**on by default** for a Workspace board); Complete status "Show complete status on card front ✓"; Covers "Card covers enabled ✓"; Collections *(Premium)*. | [d04](screens/auth-d04-board-settings.png) |
| Commenting options: Disabled ("No one can comment or react.") · Members ("Admins and board members…") · Members and observers · Workspace members ("…observers, and team members…") · Any Trello user ("…provided they can see this board."). Add/remove options: Admins · All members. | [d05](screens/auth-d05-commenting-pref.png), [d05m](screens/auth-d05-members-pref.png) |
| Board prefs read back from the API with the user's own session: `permissionLevel: org`, `comments: members`, `invitations: members`, `selfJoin: true`, `cardCovers: true`, `voting: disabled`, `cardAging: regular`, `showCompleteStatus: true`. | API read |

## 3 · Lists

| Observation | Evidence |
|---|---|
| List composer: textarea "Enter list name…". Empty Enter does nothing and the composer stays open. After a list is added the composer **stays open and focused** for the next one. | — |
| List menu "List actions": Add card · Copy list · Move list · Move all cards in this list · Sort by · Watch · Change list color *(Upgrade)* · Automation (When a card is added to the list / Every day, sort list by / Every Monday, sort list by / Create a rule) · Archive this list · Archive all cards in this list. | [b03](screens/auth-b03-list-menu.png) |
| **Archive list asks for confirmation:** "Are you sure? This list will be archived. [Archive list]". (Archiving a card does not ask.) | [d07](screens/auth-d07-archive-list-confirm.png) |
| Archived items → **Lists** toggle shows archived lists with **Restore** only (no delete button in this view, unlike DOC D03). A restored list returned to its **original position** (first). | [d06](screens/auth-d06-archived-lists.png) |
| Dragging a list by its header reorders lists; this persisted after reload. | [e02](screens/auth-e02-after-moves-reload.png) |

## 4 · Cards: creation, validation, ordering

| Observation | Evidence |
|---|---|
| Card composer is a **contenteditable** element. Enter adds the card and the composer **stays open and focused**. Empty or whitespace-only + Enter **closes the composer and creates nothing**. | — |
| **Title limit: 16 384 characters.** 16 384 → created. 16 385 or 17 000 → **silently not created**: no message, text kept in the composer, Add button still enabled. | — |
| Card URL `/c/<shortLink>/<idShort>-<slug>`. `idShort` is a per-board sequence (1, 2, 3 …), visible in URLs and the API. | — |
| **Positions** (API read): lists and cards use numeric `pos`. First item at **140737488355328 (2⁴⁷)**, then steps of **16384 (2¹⁴)**. A moved card took the **midpoint** of its neighbours (e.g. …363520 between …355328 and …371712). A list moved to the front got first − 16384. | API read |
| Card front (testids, top to bottom): cover, label bars, completion circle (shown on hover or when complete), title, badges (watching eye "You are watching this card." · due date · description · comment count · attachment count · checklist `n/m`), member avatars bottom-right, quick-edit pencil on hover. | [b06](screens/auth-b06-card-front-badges.png) |
| **Labels on the card front** are thin unnamed colour bars by default. `;` toggles names on. **Colourless labels are not shown on the card front** (only on the card back). | [b04](screens/auth-b04-card-front-labels.png), [b05](screens/auth-b05-label-names-toggled.png) |

## 5 · Card detail dialog

| Observation | Evidence |
|---|---|
| Modal, two columns (desktop). Header: list chip "To Do ▾" (moves the card), Cover, watch eye (when watching), `⋯` Actions, Close. Left: completion circle, title (textarea; Enter saves), buttons **Add · Labels · Dates · Checklist · Members**, Description. Right (grey): "Comments and activity", **Show details**, "Write a comment…", activity entries. Floating bottom bar: Power-ups · Automations · Comments. | [c01](screens/auth-c01-card-dialog.png) |
| Once content exists the layout changes: a **cover banner** (side areas filled with a matching colour), buttons reduce to *Add · Checklist · Attachment*, and sections **Members (+)**, **Labels (+)**, **Due date** chip with status ("Due soon" in yellow) appear. | [c21](screens/auth-c21-attachments.png) |
| "Add to card": Labels (Organize, categorize, and prioritize) · Dates (Start dates, due dates, and reminders) · Checklist (Add subtasks) · Members (Assign members) · Attachment (Add links, pages, work items, and more) · Custom Fields (Create your own fields). | [c02](screens/auth-c02-card-add-menu.png) |
| Card Actions: Join · Move · Copy · Create Jira work item · Mirror · Make template · Watch · Share · Archive. On an archived card, Archive is replaced by **Restore** and **Delete**, the add buttons are hidden, and a banner reads "This card was archived on Oct 11, 2026 at 6:54 PM". | [c03](screens/auth-c03-card-actions-menu.png), [c07](screens/auth-c07-archived-card-actions.png) |
| Cover popover: Size, Colors, Enable colorblind friendly mode, Attachments, Upload a cover image (tip: drag an image onto the card), Photos from Unsplash, Search for photos. | [c04](screens/auth-c04-card-cover-popover.png) |
| **Description editor is WYSIWYG (ProseMirror)** with Markdown input rules (`## ` → heading, `**x**` → bold, `- ` → list, backticks → code, URLs → links). Toolbar: Text styles, Bold, Italic/format, Lists, Link, Image, Insert elements, Attach, **View Markdown (M↓)**, Help; buttons Save / Cancel / Formatting help. Saved view shows rendered content with an **Edit** button and a collapse chevron. **Search results show the description as Markdown source**, so descriptions are stored as Markdown. | [c05](screens/auth-c05-description-editor.png), [c09](screens/auth-c09-description-markdown.png), [k03](screens/auth-k03-advanced-search.png) |
| Labels popover: "Search labels…", six default labels (green, yellow, orange, red, purple, blue; untitled), per-label edit pencil, **Create a new label**, Enable colorblind friendly mode. Create label: Title, **30 colours** (subtle / normal / bold × green, yellow, orange, red, purple, blue, sky, lime, pink, black), **Remove color** (colourless label), Create. | [c10](screens/auth-c10-labels-popover.png), [c11](screens/auth-c11-create-label.png) |
| Dates popover: month calendar with prev/next month and year; **Start date** checkbox (field disabled until checked, `M/D/YYYY`); **Due date defaults to tomorrow at the current time**; **Recurring**: Never / Daily / Monday to Friday / Weekly / Monthly on the 12th / Monthly on the 2nd Monday (derived from the chosen date); **reminder default "1 Day before"** (options None, At time of due date, 5/10/15 Minutes, 1/2 Hours, 1/2 Days, 1/2 Weeks before); note "Reminders will be sent to all members and watchers of this card."; Save / Remove. | [c12](screens/auth-c12-dates-popover.png), [c13](screens/auth-c13-due-date-set.png) |
| Checklist: popover title defaults to **"Checklist"**; "Generate checklist" *(Upgrade, AI)*. After adding, the **item composer is focused** and Enter keeps adding. Header: Hide checked items, Delete, **progress %** (1 of 3 → 33%). Item hover: set due date, assign member, Item actions (**Convert to card**, Delete). | [c14](screens/auth-c14-checklist.png), [c15](screens/auth-c15-checklist-item-hover.png) |
| Members popover: "Members · Board members · <names>". Clicking toggles membership. Joining adds "joined this card" to the activity. | — |
| Comments: same rich editor; Save; entry shows author, "just now", body, **• Edit • Delete**. After editing, **"(edited)"** appears beside the timestamp. | [c18](screens/auth-c18-comment-posted.png) |
| Attach popover: "Attach a file from your computer · You can also drag and drop files to upload them · Choose a file"; "Search or paste a link\*"; "Display text (optional)"; **Recently viewed** cards and boards; Cancel / Insert. | [c20](screens/auth-c20-attach-popover.png) |
| Uploading an image **automatically made it the card cover** ("Cover" tag). Attachments are grouped **Links** and **Files**, with a type tile (TXT) and "Added just now". | [c21](screens/auth-c21-attachments.png) |
| **Upload limit (free):** 10 485 760 bytes (10 MiB) **accepted**; 11 MiB **rejected client-side** with inline text "That file exceeds the 10MB limit. To upload files up to 250MB, upgrade your Workspace. Start free trial" and toast "File size exceeds 10MB limit". | [i01](screens/auth-i01-upload-over-limit.png), [i02](screens/auth-i02-upload-10mb-exact.png) |
| Activity (with Show details): "added this card to To Do", "set this card to be due tomorrow at 7:00 PM", "added Steps to this card", "completed Draft matrix on this card", "joined this card", "left this card", "attached X to this card" (with **Reply**), "archived this card", "**sent this card to the board**" (restore), "moved this card from To Do to Doing". **No entries for description edits or label changes.** | [c17](screens/auth-c17-activity-details.png), [h02](screens/auth-h02-concurrent-tab2-before-save.png) |
| **Move card**: tabs Inbox | Board; "Select destination": Board, List, **Position (1-based)**; Move. | [c22](screens/auth-c22-move-card.png) |
| **Copy card**: tabs Inbox | Board; Name (prefilled); "Keep…" **Checklists (n), Labels (n), Members (n), Attachments (n), Comments (n)**, all checked by default; Copy to… Board / List / Position; Create card. The copy kept due date, description, comment, attachments and watch status, but its **checklist showed 0/3 while the original was 1/3** (checked state reset). | [c23](screens/auth-c23-copy-card.png), [k02](screens/auth-k02-search-results.png) |

## 6 · Archive, restore, delete, undo (T7)

| Observation | Evidence |
|---|---|
| Hover + `c` archives the card. Toast: **"Card archived · Press "Z" to undo"**. **`z` restored it** (observed). Toasts stack bottom-left and stay until closed. | [c08](screens/auth-c08-after-archive-shortcut.png) |
| Archived items panel: back arrow, Search, **Lists** toggle, cards grouped "Past 7 days", each with **Restore** and **Delete**. Empty state "No archived cards" / "No archived lists". | [d02](screens/auth-d02-archived-items.png) |
| **Restore puts the card back at its original position** (top of To Do), and the same for a list. | — |
| Delete card confirmation: **"Delete card? All actions will be removed from the activity feed and you won't be able to re-open the card. There is no undo." [Delete]**. | [d03](screens/auth-d03-delete-card-confirm.png) |
| Delete checklist: **"Delete Steps? Deleting a checklist is permanent and there is no way to get it back." [Delete checklist]**. Delete comment: **"Delete comment? Deleting a comment is forever. There is no undo." [Delete comment]**. | [c16](screens/auth-c16-delete-checklist-confirm.png), [c19](screens/auth-c19-delete-comment-confirm.png) |
| *Accidental but informative:* a script error typed text into the card title. After Enter saved the title, the remaining keystrokes fired **shortcuts on the open card**: `c` archived it, `s` watched it, Space tried to self-assign and showed the error toast **"We couldn't add you to the card · Wait a moment then try it again."** The title was repaired and the card restored. | [c06](screens/auth-c06-description-rendered.png) |

## 7 · Drag-and-drop and keyboard moves (T2)

| Observation | Evidence |
|---|---|
| Cards and lists use **native HTML5 drag-and-drop** (`draggable=true`; drop targets marked `data-drop-target-for-element`; lists also `data-drop-target-for-external` for file drops). | DOM |
| During a drag the **source card stays in place, faded**. The target list gets a **blue outline** and a **grey placeholder** the height of the card. | [e01](screens/auth-e01-drag-in-progress.png), [e03](screens/auth-e03-reorder-in-progress.png) |
| Card between lists, card within a list, and list reorder all worked with the mouse and **persisted after reload**. | [e02](screens/auth-e02-after-moves-reload.png) |
| Keyboard: hover + `.` moved the card to the **bottom** of the next list; hover + `>` to the **top** of the next list. | — |
| **Touch long-press drag: not reproduced.** Synthetic touch events in desktop Chromium do not start native HTML5 drags, so this needs a real phone. | [m03](screens/auth-m03-mobile-touch-drag.png) |

## 8 · Search and filter

| Observation | Evidence |
|---|---|
| `/` focuses the header search ("Search Trello"). Typing shows a live dropdown: **CARDS** (title · board : list) and "Advanced search". | [k01](screens/auth-k01-search-dropdown.png) |
| Advanced search `/search?q=…` with operators `label:Spec due:week -list:Done` returned exactly the two matching cards. Side filters: sort by last updated; last 24 h / week / month / year; board; include closed boards and archived cards; starred boards only; include card descriptions; Save this search. | [k03](screens/auth-k03-advanced-search.png) |
| Board filter: keyword narrows cards live. The header shows **match count + "Clear all"**. `x` clears. **Filter state is kept in the URL (`?filter=…`) and in localStorage per board and member**, so it survives a reload. | [k04](screens/auth-k04-board-filter-active.png) |

## 9 · Real-time and concurrency (T3, T4), with the same user in two tabs

User B could not be added (§11), so two tabs of User A (separate pages and sockets, same account) were used. This shows client fan-out and conflict handling, **not** permission-filtered cross-user delivery.

| Check | Result |
|---|---|
| T4 latency: card created in tab 1, time until visible in tab 2 (5 trials) | Local (optimistic) 138–199 ms. **Other tab 438–1018 ms** (median ≈ 484 ms). [h01](screens/auth-h01-realtime-tab2.png) |
| T3 concurrent description edit: both tabs open the editor; tab 1 saves "TAB ONE"; tab 2 (still editing) saves "TAB TWO" | **Last write wins.** No conflict warning. Tab 2's open draft was **not** replaced when tab 1 saved. After tab 2 saved, both tabs and a reload showed "TAB TWO". [h02](screens/auth-h02-concurrent-tab2-before-save.png), [h03](screens/auth-h03-concurrent-final.png) |

## 10 · Offline, errors, empty and not-found states (T10)

| Observation | Evidence |
|---|---|
| Logged in, connection dropped: toast **"You are offline. Changes made now will not be saved."** "Add a card" did nothing (no composer, no card), nothing was queued, and nothing appeared after reconnect or reload. | [l01](screens/auth-l01-offline-logged-in.png), [l02](screens/auth-l02-offline-edit.png), [l03](screens/auth-l03-after-reconnect-reload.png) |
| Logged in, unknown board: **"Board not found. This board may be private. If someone gave you this link, they may need to share the board with you or invite you to their Workspace."** Unknown card: **"Card not found. This card may be on a private board…"**. Page title "Error \| Trello". **These differ from the page for an existing private board** (below), so a logged-in user can tell whether a board exists, unlike the logged-out view (O04). | [l04](screens/auth-l04-loggedin-board-404.png), [l05](screens/auth-l05-loggedin-card-404.png) |
| Existing Workspace board, viewer not in the workspace (User B): **"This board is private · Send a request to this board's admins to get access. If you're approved to join, you'll receive an email."**, the account shown with Switch account, a consent line ("…share your Atlassian account information, including your email address, with the board admins"), **Send request**. After sending: "Request sent · You'll get an email if you're approved to join." | [f01](screens/auth-f01-userB-no-access.png), [f02](screens/auth-f02-userB-request-sent.png) |
| Empty states seen: new list with only "Add a card"; "No archived cards"; "No archived lists"; "There are no requests to join this board."; "No unread notifications". | various |

## 11 · Sharing, invitations, membership (T5), and the blocker

| Step | Observation |
|---|---|
| User A's notification for B's request | Drawer "Notifications" (toggle **Only show unread**, `⋮`, Mark all as read). Entry: board thumbnail · "**[B] wants to join your board FD Parity Board. They are not a member of the board's Workspace Flowdeck Research WS.** just now" · **Share board**. [f03](screens/auth-f03-userA-notifications.png) |
| A clicks **Share board** in the notification | Modal **"[B] has joined your board · ✓ You can start collaborating together · Added to board: [B] · Go to board"**, plus a board tip "Someone wants to join this board! See all of this board's members and join requests in the share menu." **But B was not added:** the API listed only A, the Share dialog showed 1 member, and B still saw "This board is private". [f04](screens/auth-f04-share-dialog-request.png), [f09](screens/auth-f09-userB-after-approval.png) |
| Share dialog | "Share board": "Email address or name" + role (**Member** \| **Observer** "Add people with limited permissions to this board." *Upgrade*) + Share; "Share this board with a link · Create link"; tabs **Board members (n)** / **Join requests**; member row: name (you), @username • Workspace admin, role dropdown. Searching by bare username returned no suggestion; searching by email returned one. [f05](screens/auth-f05-share-dialog.png), [f08](screens/auth-f08-invite-role-options.png), [f11](screens/auth-f11-share-suggestion.png) |
| A shares with B by email | Client sent `PUT /1/boards/<board>/members/<memberId>` → **HTTP 200**, with B's member ID verified. **Membership still not created**, no toast, B got no notification. [f10](screens/auth-f10-share-after-add.png), [f12](screens/auth-f12-userB-after-invite.png) |
| Invite link | "Anyone with the link can join as a member · Copy link · Delete link · Change permissions" (Can join as member "Board members can view and edit cards, lists, and some board settings." / Can join as observer "Board observers can view and comment." *Upgrade*). B opening it: `/invite/accept-board` "**[A] shared FD Parity Board with you.** Join board · Not [B]? Switch accounts". After Join: "**Unfortunately, this link has been deactivated. Ask a board or Workspace member to create a new link.**" A's dialog still showed the link as active. [f13](screens/auth-f13-share-link-created.png), [f15](screens/auth-f15-link-permissions.png), [f14](screens/auth-f14-userB-invite-link.png), [f16](screens/auth-f16-userB-board.png) |
| Workspace invite | "Invite to Workspace": email/name → selection chip → **Send invite**; "Invite someone to this Workspace with a link: Create link". After Send invite: still 1/10 collaborators, B in no new workspace, no notification. [g02](screens/auth-g02-invite-workspace-dialog.png), [g02b](screens/auth-g02b-invite-workspace-selected.png), [g03](screens/auth-g03-workspace-after-invite.png) |
| Account state | Both accounts `confirmed: true`, `activityBlocked: false` (own-session API read). |

**Conclusion:** all four supported ways of adding User B (approving the request, sharing by email, invite link, workspace invite) **failed silently** on Trello's side. The cause is not visible from the client (possibly anti-abuse limits on new or relay-address accounts; unverified). Nothing was bypassed. **T5 (role matrix) and T8 (notification triggers for another user) could not be exercised.**

## 12 · Notifications and email settings (T8, partial)

| Observation | Evidence |
|---|---|
| Account Settings → Email notifications → **Frequency: Never / Periodically / Instantly**, help "Email notifications can be sent 'Instantly' (as soon as they occur) or 'Periodically' (hourly)…". **Default on a fresh account: Periodically** (radio selected; API `minutesBetweenSummaries: 60`, `sendSummaries: true`). | [j01](screens/auth-j01-account-settings.png) |
| Per-category email opt-outs (watched items only): Comments · Due dates · You're removed from a card · Attachments added · Cards created · Cards moved · Cards archived (or unarchived). Also: Allow desktop notifications, Suggestions, Marketing emails, Cookie preferences, **Colorblind friendly mode**, **Enable keyboard shortcuts**, Applications. | [j01](screens/auth-j01-account-settings.png) |
| Due-reminder default lead time from API `minutesBeforeDeadlineToNotify: 60`. Note that the Dates popover itself defaulted the reminder to "1 Day before". | API read |

## 13 · Mobile, logged in (T1)

| Observation | Evidence |
|---|---|
| 375 × 812, touch, iPhone user agent: header shrinks to logo · search icon · Create · `⋯`. Board header: name, view switcher, filter, `⋯`. Lists stay **272 px**, the next list peeks in, and there is no page-level horizontal scroll. The bottom bar is icon-only; its tooltip "Board **g+b**" shows a `g`-prefixed navigation shortcut not on the shortcuts page. | [m01](screens/auth-m01-mobile-board.png) |
| Card dialog becomes **near full-width (359 of 375 px), one column**, with the same sections stacked; the floating bottom bar is icon-only. | [m02](screens/auth-m02-mobile-card.png) |

## 14 · Cross-user round (owner's manual step), 2026-10-11 ~19:45–20:00 UTC

The container restarted between turns. Both browser profiles were still logged in, so **no new email verification was requested** this time. (This says nothing about future sessions or new devices.)

### Membership as verified, not as assumed

| Check (each account's own session) | Result |
|---|---|
| Board memberships (`/1/boards/<id>/memberships`), seen by A and by B | **Only User A (admin).** User B is **not** a board member. |
| B's own board list | Does not include FD Parity Board. |
| Workspace memberships | Only User A. B gets 401 on the workspace member list. |
| Board change history (`updateBoard`, membership actions) | **19:38:13 UTC: User A changed visibility `org → public`.** No add-member, invite or role action exists. |
| Why B "can access" | The board is **Public**, so B reads it as a logged-in **public viewer**, not as a member. |

So the owner's manual step made the board public; it did not add B. Adding B was not retried here (four routes had already failed silently, §11). Tests that need B as a **member** (two-user edit conflicts, member/observer/guest rows) remain blocked. Everything else below uses B as a logged-in public viewer.

### T5 · Logged-in public viewer (non-member) on a public board

| Area | Observation | Evidence |
|---|---|---|
| Board header | Views, facepile, filter, star, globe ("Public"), menu. **No Share, no Power-ups, no Automation.** | [n01](screens/auth-n01-userB-public-viewer-board.png) |
| Lists and cards | No "Add a card" and no "Add another list". **No card is draggable** (0 of 9 have `draggable`). The list menu contains only **Watch**. | [n01](screens/auth-n01-userB-public-viewer-board.png), [n02](screens/auth-n02-userB-list-menu.png) |
| Board menu | About this board · Visibility: Public · Print, export, and share · Star · Labels · Activity · Archived items · Watch · Copy board · Report abuse. (No Share, Settings, Change background, Automation, Power-Ups, Stickers, Make template, Email-to-board, Close board.) | [n03](screens/auth-n03-userB-board-menu.png) |
| Card back | Read-only: list chip is not a dropdown; a card icon replaces the completion circle; no Add/Labels/Dates/Checklist/Members buttons; title not editable; Power-ups/Automations greyed; **no comment box** (commenting = Members). Labels, due date, description, attachments and activity are visible. | [n04](screens/auth-n04-userB-card-back.png) |
| Card actions | **Copy · Mirror · Watch · Share** only. | [n06](screens/auth-n06-userB-card-actions.png) |
| Keyboard shortcuts | Hover + `c` (archive) and Space (join) did **nothing**: no toast, and no write request left the browser. The UI simply omits the action. | [n05](screens/auth-n05-userB-shortcut-attempts.png) |
| Server enforcement | One direct write each with B's own session: `PUT /1/cards/<id>` (rename) → **401 "unauthorized card permission requested"**; `POST /1/cards/<id>/actions/comments` → **401**, same message. | API |
| Watching | A non-member **can watch** a card on a public board (Actions → Watch; API `subscribed: true`). | [n08](screens/auth-n08-userB-watching-card.png) |

### T4 · Updates between the two accounts

| Check | Result |
|---|---|
| A creates a card; time until it is visible on B's open board (5 trials) | **383, 442, 410, 876, 914 ms** (median ≈ 440 ms) |
| A moves a card to another list (`.`); time until B sees it in the new list | 854 ms |
| A archives a card **B has open** | B's open dialog updated live with the banner "This card was archived on …" ([n11](screens/auth-n11-userB-card-archived-by-A.png)) |
| A deletes (from Archived items) a card **B has open** | B's dialog was replaced live by the full-page **"Card not found."** view ([n12](screens/auth-n12-userB-card-deleted-by-A.png)) |
| Receiving updates as a non-member | Public viewers receive live board updates the same way members do (latency in the same range as the same-user test). |

### T8 · Notifications triggered by another user

| Trigger by A | B (watching the card, non-member) | Evidence |
|---|---|---|
| Comment on the watched card | `commentCard` notification ✓ | [n09](screens/auth-n09-userB-notifications-from-A.png) |
| Add due date | `changeCard` ("Added a due date of tomorrow at 7:49 PM") ✓ | same |
| Attach link | `addAttachmentToCard` ✓ | same |
| Mark complete | `markedCompleteCard` ✓ | same |
| Move to another list | `changeCard` ("Moved to list Doing") ✓ | same |
| **@mention** of B (B is not a member) | Autocomplete offered **no suggestion**; with the full username typed, **no notification** reached B. The comment was deleted right afterwards because the board is public. | [n10](screens/auth-n10-mention-autocomplete.png) (username blacked out) |
| A's own actions | A received **no** notifications for A's own actions; A's list held only three "requestAccessBoardNotInOrganization" items. | API |

Drawer presentation (B): notifications are **grouped under one card header** (cover strip, title with complete tick, due chip, "Board: List"), then the actor and one line per action with "just now", the comment text in a bubble, and a reaction button. **Card-front badge:** a red bell with the unread count ("5") appears on the watched card for B. The comment composer has a **"Watch" checkbox** next to Save. Moving a card with `,` shows the toast **"Card moved left · Undo"** (an Undo *button*, unlike the "press Z" hint on archive).

### Also observed

- A copied card's activity says "copied this card from <card> in list <list>" and **"copied comment by <author> from card <card>"**: copied comments keep their original author ([n04](screens/auth-n04-userB-card-back.png)).

### Still blocked or unverified after this round

- **T3 between two different users**: B cannot edit (401), so no two-user conflict was possible. Same-user result (§9) stands: last write wins, no warning.
- **T5 member, observer and guest rows**: need B as an actual member. Observer is a paid feature anyway.
- **@mention and "added to card" notifications for a member**: need B as a member.
- **Touch drag on a real phone**: unverified (emulation cannot start native drags).
