# 02 · Screens, layouts, components, interaction states

**Evidence status:** Trello's UI was **not observed** in this session (trello.com blocked, see README). Screen names and contents below come from DOC descriptions (board menu, archived items, card back, shortcuts) plus **Flowdeck design decisions (INF)**. Layout measurements, copy and animations are Flowdeck's own. Do not treat anything here as a measured Trello layout.

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
| Conflict | If an open card is deleted/archived remotely: banner in card detail; if moved: breadcrumb updates live. |
| Stale | On reconnect, refetch board snapshot (06). |
| Archived card opened by URL | Banner "This card is archived" with Restore (if allowed) and Delete. DOC D03 |

## Drag-and-drop and touch (INF; Trello behaviour not observed)

- Pointer: drag cards between lists and positions; drag lists horizontally. Placeholder shows target slot; auto-scroll near edges.
- Touch: long-press 300 ms to pick up; board scrolls horizontally with one-finger pan when not dragging.
- **Non-drag alternative** (WCAG 2.5.7): Move dialog (board → list → position) on every card and list. Keyboard: focus card, `Space`/`Enter` to pick up, arrows to move, `Enter` drop, `Esc` cancel, with `aria-live="polite"` announcements.

## Accessibility baseline (INF)

WCAG 2.2 AA: 4.5:1 text contrast on every board background (scrim behind list headers); labels never rely on colour alone (name text or pattern, mirroring DOC D26 colour-blind patterns); focus visible; dialogs trap focus and restore it; all icons have accessible names; reduced-motion respected.

## Branding (INF)

Original name, logo, palette, icon set (e.g. Lucide, ISC licence) and illustrations. Do not use Trello's blue, logo shapes, "Butler", "Power-Up", or "card back" as UI copy.
