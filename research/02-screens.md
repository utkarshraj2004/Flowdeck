# 02 · Screens, layouts, components, interaction states

**Evidence status:** *Reconciled 2026-10-12:* Trello's UI **has been observed**, logged out (O03, [E-trello-public](evidence/E-trello-public.md)) and logged in (session 2, [E-session2-auth](evidence/E-session2-auth.md)). The sentence that follows describes the original pass only. *Original:* Trello's UI was **not observed** in this session (trello.com blocked, see README). Screen names and contents below come from DOC descriptions (board menu, archived items, card back, shortcuts) plus **Flowdeck design decisions (INF)**. Layout measurements, copy and animations are Flowdeck's own. Do not treat anything here as a measured Trello layout.

> **Update:** logged-out Trello UI has now been observed (O03). Measured facts: lists 272 px / cards 256 px; list header = name + card count + collapse; card dialog is a two-column modal (main: title, description, attachments split Links/Files; side: "Comments and activity" with "Show details"); floating Power-ups/Automations/Comments bar; filter options and board-menu items as listed in [E-trello-public](evidence/E-trello-public.md). On phones Trello keeps 272 px lists and opens cards in a clipped modal — Flowdeck deliberately improves on this (J15).

## Global shell (INF)

- **Top bar:** Flowdeck logo (original), board switcher (`b`), global search (`/`), create button, notifications bell with unread count, avatar menu.
- **Workspace sidebar** (collapsible; drawer below 768 px): workspace switcher, Boards, Members, Settings, starred boards.
- **Breakpoints:** ≥1024 desktop · 768–1023 tablet · <768 phone. Board columns scroll horizontally on every size. Page body never scrolls horizontally except the board canvas.

## Screen inventory

| ID | Screen | Key components | Source |
|---|---|---|---|
| S01 | Log in | email, password, "forgot password", error banner | INF (D19 for SSO options later) |
| S02 | Accept invite / set up account | token-validated form: name, username, password | INF |
| S03 | Password reset (request, set new) | — | INF |
| S04 | Home / boards list | starred boards, recent, per-workspace grid, "Create board" tile, closed boards link | DOC D21 (closed boards at bottom) + INF |
| S05 | Create board dialog | name, workspace, visibility, background swatches, "start from template" (later) | OBS (prefs), DOC D18 |
| S06 | Board | header (name inline-edit, star, visibility badge, members avatars, filter, menu); list columns; "Add list" column | DOC D03, D04 |
| S07 | List column | header (name inline edit, card count optional, ⋯ menu), card stack, "Add a card" composer | API A01, OBS (`cardCounts`) |
| S08 | List menu | add card, copy list, move list, move all cards, archive all cards, archive list, watch | API A01 |
| S09 | Card front (tile) | cover, labels strip, title, badges (due, checklist n/m, comments, attachments, description, watching), member avatars | DOC D10 (due colours), INF |
| S10 | Card detail ("card back") modal / full-screen on phone | title, list breadcrumb, actions (members, labels, dates, checklist, attachment, cover, move, copy, archive, watch), description editor, checklists, attachments, activity/comments | DOC D22, D24, D25 |
| S11 | Popovers: labels picker (+ create/edit label, colour-blind toggle), members picker, dates picker (start, due, time, reminder), move/copy dialogs (board → list → position) | — | DOC D26, D10, D24 |
| S12 | Board menu | about/description, activity, archived items (cards / switch to lists, restore, delete), settings, labels, copy board, close board | DOC D03, D21 |
| S13 | Board settings | visibility, comment permission, invitations, self-join, covers | OBS O01 |
| S14 | Board members / share dialog | invite by email/username, invite link, role per member (admin / member / observer) | DOC D01, D02 |
| S15 | Workspace members | members, guests, pending invites, role change, remove, invite link | DOC D11 |
| S16 | Workspace settings | name, slug, description, default board visibility, delete workspace | INF |
| S17 | Search results | query box with operator hints, cards grouped by board, boards | DOC D05 |
| S18 | Notifications panel | unread/all, mark read, link to card | DOC D12 |
| S19 | Account settings | profile, password, colour-blind mode, keyboard shortcuts toggle, sessions | DOC D04, D26 |
| S20 | Keyboard shortcut help (`?`) | modal list | DOC D04 |
| S21 | Closed boards | reopen (choose workspace), delete (admin) | DOC D21 |
| S22 | Admin console (self-hosted only) | users, invites, storage usage, backups status, version | INF |
| S23 | Error pages | 403 (no access + "request access"), 404 (board/card gone or archived), 500 | INF |

## Interaction states (required for every data screen)

| State | Requirement (INF) |
|---|---|
| Loading | Skeleton for lists/cards; no layout shift > 0.1 CLS. Spinner only for actions > 300 ms. |
| Empty | Board with no lists: inline "Add a list" composer focused. Workspace with no boards: create-board tile + one-line explanation. Search with no results: show operators help. Archived items empty: explanatory text. |
| Error (network) | Non-blocking toast "Changes couldn't be saved — retrying"; optimistic change reverted after final failure; offline banner when the WebSocket is down > 5 s. |
| Error (permission) | Read-only mode: hide/disable edit affordances; explain why on attempt. |

**Observed in Trello (OBS O04, logged out; [E-session2 §T10](evidence/E-session2.md#t10--loading-offline-and-error-states-obs-o04-logged-out)):** skeleton header and list placeholders while loading; on connection loss, a bottom-left toast "You are offline. Changes made now will not be saved." while the board stays readable; no service worker, so a reload while offline fails; an unknown board or card shows the same "Sign up to see this board" page as a private one, so existence is not disclosed. **Flowdeck decision (INF):** keep the skeleton and the offline toast. Error pages S23 must not reveal whether a board exists to someone without access (403 and 404 look identical to non-members).

**Due badge colours (DOC-direct D10):** light grey > 24 h away · yellow within 24 h · red overdue (first 24 h) · light pink overdue > 24 h · green complete. Flowdeck uses the same states with its own palette.
| Conflict | If an open card is deleted/archived remotely: banner in card detail; if moved: breadcrumb updates live. |
| Stale | On reconnect, refetch board snapshot (06). |
| Archived card opened by URL | Banner "This card is archived" with Restore (if allowed) and Delete. DOC D03 |

## Drag-and-drop and touch (INF; Trello mouse behaviour observed in O05, touch not)

**Trello (OBS O05, [E-session2-auth §7](evidence/E-session2-auth.md#7--drag-and-drop-and-keyboard-moves-t2)):** native HTML5 drag; the source card stays in place, faded; the target list gets a blue outline and a grey placeholder the height of the card; drops persist after reload. Hover + `.`/`,` moves a card to the bottom of the next/previous list, and `>`/`<` to the top. Touch drag was not reproducible in emulation.


- Pointer: drag cards between lists and positions; drag lists horizontally. Placeholder shows target slot; auto-scroll near edges.
- Touch: long-press 300 ms to pick up; board scrolls horizontally with one-finger pan when not dragging.
- **Non-drag alternative** (WCAG 2.5.7): Move dialog (board → list → position) on every card and list. Keyboard: focus card, `Space`/`Enter` to pick up, arrows to move, `Enter` drop, `Esc` cancel, with `aria-live="polite"` announcements.

## Accessibility baseline (INF)

WCAG 2.2 AA: 4.5:1 text contrast on every board background (scrim behind list headers); labels never rely on colour alone (name text or pattern, mirroring DOC D26 colour-blind patterns); focus visible; dialogs trap focus and restore it; all icons have accessible names; reduced-motion respected.

## Branding (INF)

Original name, logo, palette, icon set (e.g. Lucide, ISC licence) and illustrations. Do not use Trello's blue, logo shapes, "Butler", "Power-Up", or "card back" as UI copy.

## Observed Trello screens and states (OBS O05)

Source: [E-session2-auth](evidence/E-session2-auth.md). Flowdeck copies **structure and behaviour**, never wording or artwork; it writes its own copy.

| Area | Trello behaviour observed | Flowdeck decision (INF) |
|---|---|---|
| Create board | Popover: background, title (required, inline hint), workspace, visibility (default Workspace, with a one-line explanation per option) | Same fields; default visibility from workspace setting |
| New board | Starts with three lists (To Do / Doing / Done) and the first list's composer open | Offer "Start with To Do / Doing / Done" checkbox, default **on** |
| Card composer | Enter adds and keeps the composer focused; empty/whitespace Enter closes it; over-length titles are **silently** refused | Keep the rapid-entry behaviour; show an inline error instead of silently refusing (better than parity) |
| Card back | Two columns (desktop) → one column (phone, near full width); once populated, Members / Labels / Due date become sections and the button row shrinks; cover banner on top | Same layout rules |
| Description | WYSIWYG with Markdown shortcuts; stored as Markdown; "View Markdown" toggle; Save / Cancel / Formatting help | Same: CommonMark storage, rich editor with Markdown input rules and a source toggle |
| Labels on card front | Thin unnamed bars; `;` or a click toggles names; colourless labels hidden on the front | Same |
| Due badge | Neutral > 24 h, yellow "Due soon" < 24 h, red overdue, pink > 24 h overdue, green complete | Same states, own palette, text never colour-only |
| Destructive confirmations | Card delete, checklist delete, comment delete and **list archive** confirm; card archive does **not** confirm but shows an undo toast ("press Z") | Same pattern: confirm permanent actions; archive = undo toast |
| Toasts | Bottom-left, stacking, persistent until closed: archive + undo, upload-limit error, "couldn't add you to the card", offline | Same placement; auto-dismiss non-errors after 8 s (INF) |
| Offline | Toast "offline, changes will not be saved"; edit affordances do nothing; no queue | Same for MVP (no offline queue) |
| Not found / no access | Logged in: "Board not found…" differs from "This board is private · Send request" (existence is revealed). Logged out: identical page for both | **Flowdeck: identical 404 for missing and no-access** to non-members; "Request access" only for workspace members on workspace-visible boards |
| Search | `/` focuses header search; live dropdown (cards, boards); Advanced search page with filters and saved searches | MVP: header search + results page; saved searches later |
| Filter | Keyword/members/labels/due/activity; header shows match count and "Clear all"; `x` clears; state in URL and per-user local storage | Same; state in URL query |
| Mobile | Compact header; lists stay 272 px with the next one peeking; icon-only bottom bar | Same widths; no app-promo interstitial |

## Observed in session 5 (OBS O06, two users)

Source: [E-session5](evidence/E-session5.md). Screens in `evidence/screens/auth-s5-*`.

| Screen / state | Trello (observed) | Flowdeck decision |
|---|---|---|
| S10 card back, **someone else editing** | Description heading shows the other user's avatar with a pencil icon; the local editor keeps its draft with an **"Unsaved changes"** badge and **Discard changes** ([t3-3](evidence/screens/auth-s5-t3-3-draft-vs-saved.png)) | Show "<name> is editing" presence on the description, and on save conflict show the 3-way prompt (07). **Never silently overwrite** another user's newer text |
| S10 card archived **while editing** | Archived banner at the top; editor stays open with the draft | Same, plus "Copy your draft" so it is not lost |
| S10 card deleted **while editing** | View becomes "Card not found."; draft lost ([t3-5](evidence/screens/auth-s5-t3-5-deleted-while-editing.png)) | Keep the modal with a "This card was deleted" banner and a **Copy draft** button (better than parity) |
| S06 board after **access removed** | Live switch to "This board is private · Send request" ~5 s later ([t5-7](evidence/screens/auth-s5-t5-7-removed-live.png)) | Live switch within 2 s to Flowdeck's no-access page (J11.4) |
| S06 board with **role changed** | Admin-only menu items appear/disappear live (<1 s) | Same: permissions in the client follow `board.member_role_changed` events |
| S06 adminless board | Members see **Join board**; nobody can become admin ([t5-3](evidence/screens/auth-s5-t5-3-adminless-board.png)) | Unreachable in Flowdeck (last admin cannot leave, 04 invariant 1) |
| S14 share dialog | Email/name field, role select, Share; "Share this board with a link · Create link"; tabs **Board members (n)** / **Join requests**; per-member role menu Admin / Member / Observer (paid) / Remove from board ([t5-1](evidence/screens/auth-s5-t5-1-board-role-menu.png)) | Same structure; Observer is a normal role in Flowdeck |
| S15 workspace members | "Collaborators n / 10"; tabs Members / Single-board guests / Multi-board guests / Join requests; Invite Workspace members dialog (email/name + Create link); per-row Boards (n), role, Remove/Leave ([m5](evidence/screens/auth-s5-m5-reverse-invite-after.png)) | Same tabs (guests, pending invites, join requests); no plan cap |
| S15 remove member | Two-choice popover: **Remove from Workspace** (keeps board memberships, user becomes a guest) or **Remove from Workspace and Boards** ([t5-5](evidence/screens/auth-s5-t5-5-ws-remove-dialog.png)) | Same two choices |
| S18 notifications drawer | "Only show unread" toggle, Mark all as read, grouped per card, newest first, each with actor and relative time ([t8-2](evidence/screens/auth-s5-t8-2-drawer.png)) | Same grouping |
| Mention autocomplete | Typing `@` + letters lists matching **board members** only ([t8-1](evidence/screens/auth-s5-t8-1-mention-autocomplete.png)) | Same; non-members never suggested |
| S12 board menu panels | Print/export/share (link, Print, Export JSON, QR; CSV paid), Email-to-board, Stickers, Change background (photos, colours, upload), Activity (All / Comments), Copy board (Keep cards / Keep template cards) | MVP: export JSON, activity, copy board, background colours. Later: print view, email-to-board |
| S08 list menu | Add card, Copy list, Move list, Move all cards, Sort by, Watch, list colour (paid), automation shortcuts, Archive list, Archive all cards ([i06](evidence/screens/auth-s5-i06-list-menu.png)) | MVP items as in J06; Sort by: Later |
| S21 closed boards | Board page shows **Reopen board** only; **Delete lives in the Closed boards dialog** with a one-step "Delete board? … There is no undo." ([i07](evidence/screens/auth-s5-i07-delete-closed-board.png)) | Keep J13.3 (typed board name) — stricter on purpose |
| Dates popover | Calendar, start (optional), due date + time, **Recurring** (Never), **reminder** (1 Day before) with "Reminders will be sent to all members and watchers of this card." ([i05](evidence/screens/auth-s5-i05-dates-recurring.png)) | Same fields; recurring and reminders Later |
| Offline (two users) | Toast stays until closed even after reconnect; missed changes appear ~2.75 s after reconnect ([t4-2](evidence/screens/auth-s5-t4-2-after-reconnect.png)) | Auto-hide the offline toast on reconnect and show "Back online" |
