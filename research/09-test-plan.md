# 09 · Test plan

Tests are organised by layer. Each case references the journey AC it proves (`03`) and, where relevant, the permission cell (`04`). "Trello parity check" rows are **manual comparisons to run against Trello** once a test account is available. They are the observations this research could not make (10 §Access).

## Layers and tools (INF; final choice depends on stack, see 10)

| Layer | Tool | Runs in |
|---|---|---|
| Unit (ordering keys, search parser, permission policy, Markdown sanitiser) | Vitest / language-native | CI on every PR |
| API integration (real Postgres in a container) | test runner + Testcontainers or service container | CI |
| Realtime (two WebSocket clients) | integration harness | CI |
| End-to-end browser (desktop 1280×800, phone 375×667) | Playwright (already in repo as `playwright-core`) | CI |
| Accessibility | `@axe-core/playwright` | CI |
| Load (one board with 5000 cards, 30 concurrent clients) | k6 | nightly / pre-release |
| Backup/restore drill | compose job | pre-release |

## U · Unit
| ID | Case | Proves |
|---|---|---|
| U1 | Fractional key between any two keys sorts strictly between them; 10 000 random inserts keep order; rebalance triggers > 50 chars | J06.3, J07.2 |
| U2 | Search parser: each operator, negation, quotes, unknown operator → text | J09.2 |
| U3 | Permission policy table: every cell in 04 (generated from one matrix file) | J12, 04 |
| U4 | Markdown sanitiser strips `<script>`, `javascript:` links, inline event handlers | J08.1, J08.6 |
| U5 | Due badge state for (no date, >24 h, <24 h, overdue, complete) | J08.4 |
| U6 | Username/name/initials validation rules | J01.2, 05 |

## A · API integration
| ID | Case | Proves |
|---|---|---|
| A1 | Board CRUD, copy with/without cards | J04.1–4 |
| A2 | List create/rename/move (same + cross board)/copy/archive/restore; delete only when archived; delete cascades cards | J06.1–7 |
| A3 | Card create/edit/move/copy (each keep option)/archive/restore/delete-only-when-archived | J07.1–8 |
| A4 | Cross-board move drops non-member assignees and maps/creates labels; activity entry written | J07.4 |
| A5 | `If-Match` stale version → 409 with current entity; moves not gated | 07 Concurrency |
| A6 | `Idempotency-Key` replay returns identical response, no duplicate card | 06 Conventions |
| A7 | Last-admin protection (board and workspace) | J02.5, 04 inv. 1–2 |
| A8 | Upload over limit → 413 while streaming; MIME sniffing headers; SVG served as attachment | J08.7, 07 |
| A9 | Every endpoint returns 404 (not 403) for boards the user cannot see | J05.4 |
| A10 | Limits: 5001st open card → `limit_exceeded` | 05 limits |
| A11 | Comment edit/delete rules (own; admin deletes non-admin) | J08.6 |
| A12 | Export JSON contains all entities and full activity | J14.1 |
| A13 | Auth: generic login error, rate limit, logout invalidation, reset token single-use | J03.1–3 |

## R · Realtime
| ID | Case | Proves |
|---|---|---|
| R1 | Client B receives A's change with `seq` = previous + 1, p95 < 500 ms on CI hardware | J11.1 |
| R2 | Disconnect B, 10 changes, reconnect with `sinceSeq` → exactly 10 events, in order | J11.2 |
| R3 | `sinceSeq` older than the window → `resync_required` | J11.3 |
| R4 | Removed member receives `board.access_revoked` and gets no further events | J11.4, 04 inv. 5–6 |
| R5 | Visibility private → workspace members' subscriptions dropped / allowed accordingly | 04 inv. 6 |
| R6 | Two clients move the same card simultaneously → both converge to the same final state | 07 |

## E · End-to-end (desktop + phone)
| ID | Case | Proves |
|---|---|---|
| E1 | Setup → invite → second user joins → both see the same board | J01, J02 |
| E2 | Build a board: 3 lists, 6 cards, reorder by drag, reload, order kept | J06, J07.2 |
| E3 | Keyboard-only move of a card with live-region announcement | J07.3, J16.1 |
| E4 | Card detail: description, labels, members, dates, checklist, comment with mention, attachment + cover | J08 |
| E5 | Filter and search flows | J09 |
| E6 | Archive/restore/delete for card and list via Archived items | J06.5–6, J07.6–7 |
| E7 | Two browser contexts: live updates and notification bell | J10, J11.1 |
| E8 | Phone: swipe lists, long-press drag, full-screen card | J15 |
| E9 | Close/reopen/delete board | J13 |
| E10 | Axe scan of key screens: no serious/critical issues | J16.2 |

## P · Permissions (generated)
One test per (role × action) cell in `04-permissions.md` over the API, plus an E2E smoke per role (observer, guest, workspace viewer) checking that edit affordances are hidden. → J12.

## O · Operations
| ID | Case | Proves |
|---|---|---|
| O1 | Clean compose up → `/readyz` 200 < 60 s | J17.1 |
| O2 | Backup → wipe → restore → board exports equal | J17.2 |
| O3 | Upgrade N→N+1 with fixture data; older binary refuses newer schema | J17.3 |
| O4 | Load: 5000-card board renders < 2 s (p95, desktop), 30 clients receive events < 1 s | 05 limits, J11 |

## T · Trello parity checks (manual, need a Trello test account)
| ID | What to observe in Trello | Feeds |
|---|---|---|
| T1 | Board, list, card UI layout at 1280 px and 375 px; card-front badges and order | 02 |
| T2 | Exact drag behaviour (placeholder, auto-scroll, touch long-press) | 02, J15 |
| T3 | Two-user concurrent description edit outcome | 07 |
| T4 | Real-time latency and reconnect behaviour (DevTools, WebSocket frame sizes only) | 06 |
| T5 | Role matrix with a second account: observer, guest, workspace normal member on workspace-visible board | 04 unverified rows |
| T6 | Validation messages: empty names, over-length, upload over limit | 03 |
| T7 | Archived items panel, restore position, delete confirmation wording | J06, J07 |
| T8 | Notification triggers and default email frequency | J10 |
| T9 | Keyboard shortcut list at `trello.com/shortcuts` | 01 §6 |
| T10 | Empty, loading, offline and error states | 02 |

### T status after session 2 (2026-10-11, final)

Both test accounts logged in after the owner entered the emailed codes. A synthetic workspace and board were used. User B **could not be added** to any board or workspace (four supported routes failed silently on Trello's side), so cross-user checks were replaced by same-user two-tab checks where possible.

| ID | Status | Evidence |
|---|---|---|
| T1 | **Done**: desktop 1280 px and phone 375 px, logged in; card-front badge order recorded | [E-session2-auth §4, §13](evidence/E-session2-auth.md#4--cards-creation-validation-ordering) |
| T2 | **Mostly done**: mouse drag of cards and lists (placeholder, faded source, target outline) and keyboard moves; persistence after reload. **Touch long-press not reproducible** in emulation. Auto-scroll near edges not measured | [§7](evidence/E-session2-auth.md#7--drag-and-drop-and-keyboard-moves-t2) |
| T3 | **Partial (same user, two tabs)**: last write wins, no warning. Two different users not possible | [§9](evidence/E-session2-auth.md#9--real-time-and-concurrency-t3-t4-with-the-same-user-in-two-tabs) |
| T4 | **Partial**: same-user fan-out 0.44–1.0 s; socket reconnect timing (logged out, O04). Cross-user latency not possible | [§9](evidence/E-session2-auth.md#9--real-time-and-concurrency-t3-t4-with-the-same-user-in-two-tabs), [E-session2 §T4](evidence/E-session2.md#t4-partial--websocket-lifecycle-and-reconnect-obs-o04-logged-out-public-board) |
| T5 | **Blocked**: the non-member "private · Send request" flow, notification and Share/role UI were observed, but B could never become a member, observer or guest | [§11](evidence/E-session2-auth.md#11--sharing-invitations-membership-t5-and-the-blocker) |
| T6 | **Done**: required fields (workspace name + type, board title), card title limit 16384 (silent), list name empty, upload limit 10 MiB with message | [§4, §5](evidence/E-session2-auth.md#5--card-detail-dialog) |
| T7 | **Done**: Archived items panel (cards and lists), restore to original position, card/checklist/comment delete wording, list-archive confirmation, undo with `z` | [§6](evidence/E-session2-auth.md#6--archive-restore-delete-undo-t7) |
| T8 | **Partial**: email frequency default = Periodically (hourly); join-request notification observed; trigger list for another user's actions blocked (needs B) | [§12](evidence/E-session2-auth.md#12--notifications-and-email-settings-t8-partial) |
| T9 | **Done** (O04) | [E-session2 §T9](evidence/E-session2.md#t9--keyboard-shortcuts-obs-o04-trellocomshortcuts-logged-out) |
| T10 | **Done**: loading skeleton, offline (logged out and in), not-found (logged out and in), no-access, empty states, error toasts | [§10](evidence/E-session2-auth.md#10--offline-errors-empty-and-not-found-states-t10) |
