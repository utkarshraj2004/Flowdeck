# 01 · Product scope and feature inventory

Flowdeck is a self-hosted, multi-user kanban board for one team (target: up to ~50 users, a few hundred boards, one server). It reproduces Trello's core *working model* (workspaces → boards → lists → cards) under its own brand and design. It is not a pixel copy.

Tiers: **MVP** = phase 1–3 (see 10). **Later** = phase 4+. **Out** = not planned.

## 1. Accounts and identity

| Feature | Trello reference | Evidence | Flowdeck |
|---|---|---|---|
| Sign up / log in with email + password | Atlassian account; email or Google/Microsoft/Apple/Slack SSO | DOC D19 | **MVP**: local email + password (argon2id). Admin-created invites; open sign-up off by default (INF). |
| SSO (OIDC) | Google/Microsoft/Apple/Slack | DOC D19 | **Later**: generic OIDC. |
| Two-step verification | Via Atlassian account; TOTP, security keys, passkeys | DOC D20 | **Later**: TOTP. |
| Profile: full name, username, initials, avatar, bio | — | API A01 (`username` ≥3 chars, `[a-z0-9_]`; `initials` 1–4; `fullName` ≥1, no leading/trailing space) | **MVP**, same validation rules. |
| Preferences: locale, colour-blind mode, email-summary frequency, keyboard shortcuts on/off | — | API A01, DOC D04, D12, D26 | **MVP**: colour-blind patterns, shortcuts toggle. **Later**: locale, email digests. |
| Default personal workspace on sign-up | Auto-created | OBS O01 | **MVP** (INF). |

## 2. Workspaces and membership

| Feature | Evidence | Flowdeck |
|---|---|---|
| Workspace (Trello: "organization") with name, display name, description | API A01, OBS | **MVP** |
| Workspace roles: admin, normal member; guests are board-only | DOC D01, D11 | **MVP** |
| Invite by email, invite link (copyable, revocable) | DOC D11 | **MVP**: email invite token + revocable link. |
| Free plan: everyone is admin; paid plans allow normal role | DOC D11 | **INF**: Flowdeck always has real roles (no plan gating). |
| Workspace limits (10 collaborators / 10 boards on free) | DOC D06 | **Out**: no plan limits; only operational limits (07). |
| Workspace views (cross-board table/calendar) | DOC D08 (Premium) | **Later** |

## 3. Boards

| Feature | Evidence | Flowdeck |
|---|---|---|
| Create board (name 1–16384 chars; in a workspace) | API A01, OBS | **MVP**: name 1–200 chars (INF, tighter). |
| Visibility: private, workspace, public | OBS O01, API A01 | **MVP**: private, workspace. **Later**: public read-only link. |
| Background (colour / image) | API A01, OBS | **MVP**: preset colours + gradients (original). **Later**: uploaded image. |
| Star / favourite boards | API A01 (`boardStars`) | **MVP** |
| Board settings: comment perms, invitation perms, self-join, card covers, card counts, voting | OBS O01, API A01 | **MVP**: comment, invitation, self-join, covers. **Later**: voting, card counts. |
| Close (reversible) → delete (permanent, admin only) | DOC D21 | **MVP** |
| Copy board (keep cards optional) | API A01 (`idBoardSource`, `keepFromSource`) | **MVP** |
| Templates (make template; create from template) | DOC D18, OBS (`isTemplate`) | **Later** |
| Board menu: activity, archived items, settings, labels | DOC D03 | **MVP** |

## 4. Lists

| Feature | Evidence | Flowdeck |
|---|---|---|
| Create, rename (1–16384 chars) | API A01 | **MVP** (name 1–200, INF) |
| Reorder (drag), top/bottom/numeric position | API A01, OBS | **MVP** |
| Move list to another board | OBS, DOC D24 | **MVP** |
| Copy list | API A01 (`idListSource`) | **MVP** |
| Archive / restore; delete only after archive (deletes its cards) | DOC D03 | **MVP** |
| Move all cards in list / archive all cards | API A01 (`moveAllCards`, `archiveAllCards`) | **MVP** |
| List limits (WIP), list colour, collapse | Not inspected | **Later** (N/A for Trello behaviour) |

## 5. Cards

| Feature | Evidence | Flowdeck |
|---|---|---|
| Create (name required, from list footer), quick-add | API A01, DOC D04 (`n`) | **MVP** |
| Edit title, description (Markdown, 0–16384) | API A01 | **MVP** |
| Reorder within list, move across lists/boards | API A01, DOC D24 | **MVP** |
| Copy card with chosen parts (checklists, labels, members, attachments, comments) | DOC D25, API A01 | **MVP** |
| Archive / restore; delete only after archive | DOC D03 | **MVP** |
| Mark complete (`dueComplete`) | OBS, DOC D10 | **MVP** |
| Labels (30 colours + colourless; per board; colour-blind patterns) | DOC D26, OBS | **MVP** with original palette names. |
| Members (assign board members; removed when moved to a board where they aren't members) | DOC D24 | **MVP** |
| Start date, due date (+time), reminder, overdue badge colouring | DOC D10 | **MVP**: dates + badges. **Later**: reminders (need email/notifications worker). |
| Recurring due date | DOC D10 | **Later** |
| Checklists: multiple per card, items with state, position, assignee, due | OBS, API A01 | **MVP**: items with state + position. **Later**: item assignee/due. |
| Comments: Markdown, @mentions, @card/@board, edit/delete own, admin deletes others | DOC D22 | **MVP** |
| Emoji reactions on comments | DOC D23 | **Later** |
| Attachments: upload file, add link; set image as cover | API A01, OBS | **MVP** |
| Cover: colour or image, size | API A01 (`idAttachmentCover`), connector newsletter (3P) | **MVP**: colour + image cover. |
| Activity feed per card / per board | OBS, DOC D22 | **MVP** |
| Custom fields (checkbox, date, dropdown, number, text) | DOC D17, OBS | **Later** |
| Voting, stickers | API A01 | **Out** (stickers); voting **Later** |
| Mirror cards across boards | DOC D13 | **Out** (complex; revisit) |
| Watch / subscribe card, list, board | DOC D12, API A01 | **MVP** (in-app notifications) |

## 6. Find and navigate

| Feature | Evidence | Flowdeck |
|---|---|---|
| Global search with operators (`@member`, `#label`, `label:`, `due:day`, `due:N`, `has:attachments`, `is:archived`, `board:`, `list:`, negation `-`) | DOC D05, OBS | **MVP**: subset (text, `@`, `#`, `due:`, `has:`, `is:`, `board:`, `list:`, `-`). |
| Board filter (members, labels, due, keyword) | DOC D04 (`f`, `x`) | **MVP** |
| Keyboard shortcuts (`?` help, `b` boards, `f` filter, `x` clear, `t` title, `j`/`k` move, `n` new card, `m` members, `d` due, Space assign self) | DOC D04 (b, f, x, t, j, k); 3P for the rest | **MVP**, with own help sheet. |
| Notifications (in-app bell), email (never / periodic / instant) | DOC D12 | **MVP**: in-app. **Later**: email. |

### Observed additions (O03)

| Feature | Evidence | Flowdeck |
|---|---|---|
| List collapse button; "Collapse all lists" | OBS O03 | **MVP** |
| Filter by activity recency; "collapse lists with no matching cards"; any/all match | OBS O03 | **MVP** (any/all), activity filter **Later** |
| Undo last action | OBS-client O03 (`TrelloUndoAction`) | **Later** |
| Copy/paste cards via clipboard | OBS-client O03 | **Later** |
| Merge cards | OBS-client O03 | **Out** |
| Auto-archive (with undo) | OBS-client O03 | **Out** |
| Request access to a board | OBS-client O03 (`SendRequestAccess`) | **Later** |

## 7. Collaboration and sync

| Feature | Evidence | Flowdeck |
|---|---|---|
| Real-time updates across clients (sub-second) | DOC D16 (WebSockets + polling fallback, historic) | **MVP**: WebSocket per board, polling fallback. |
| Offline mobile editing with sync | DOC D27 (historic) | **Out** for MVP; responsive web only. |

## 8. Views, automation, integrations, data portability

| Feature | Evidence | Flowdeck |
|---|---|---|
| Board view | DOC D08 | **MVP** |
| Table, Calendar, Timeline, Dashboard, Map | DOC D08 (Premium) | **Later**: Table + Calendar. **Out**: Map. |
| Inbox, Planner (calendar sync) | DOC D13 | **Out** |
| Automation (rules, card/board buttons, scheduled, due-date commands) | DOC D07 | **Later**: simple rules (trigger → action). |
| Power-Ups / integrations | API A01 (`powerUps`), D07 | **Out**; **Later**: outgoing webhooks. |
| Webhooks | API A01 (`/webhooks`) | **Later** |
| Export JSON (board incl. recent actions); CSV | DOC D09 | **MVP**: JSON export. **Later**: CSV. |
| Import | DOC D09 says Trello can't import its own JSON/CSV | **Later**: import a **Trello JSON export** into Flowdeck (strong migration value). |

## 9. Cross-cutting

| Feature | Evidence | Flowdeck |
|---|---|---|
| Responsive layout, touch drag | N/A (not observed) | **MVP** (INF), see 02 |
| Accessibility (keyboard alternative to drag, live-region announcements) | No official Trello statement found; WCAG 2.1.1, 2.5.7 | **MVP**: WCAG 2.2 AA target (INF) |
| Empty / loading / error states | N/A | **MVP** (INF), see 02 |
| Object limits (5000 open cards/board, 475 open lists, 950 labels…) | DOC D14 | **MVP**: enforce configurable limits (07). |
