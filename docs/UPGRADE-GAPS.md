# Upgrade audit: gaps against the research (session 3)

Audit of `854f7ed` (PR #4 head), run on 2026-10-12 against the research screenshots and notes in `research/`. "Trello" means an observation recorded in the research; "Flowdeck" means our design decision. The status column is updated as work lands. Baseline measurements: [perf/baseline-854f7ed.json](perf/baseline-854f7ed.json), produced by `scripts/perf/bench.mjs`.

**Priority:** P0 = makes the app feel slow or broken; P1 = visible fidelity or completeness gap in a core workflow; P2 = valuable addition; P3 = larger feature that needs acceptance criteria first.

## Performance (measured, 1,200-card board, production build)

| # | Gap | Evidence | Priority | Status |
|---|---|---|---|---|
| 1 | Every server event re-renders every list and card. The board context value changes on each event and tiles are not memoised. | 366 ms of long tasks per 20 remote events | P0 | Open |
| 2 | Filter typing re-filters and re-renders the whole board on every keystroke | 829 ms to type 8 characters | P0 | Open |
| 3 | Drag-and-drop drop renders the whole board again | 399 ms from drop until the card shows in its new list | P0 | Open |
| 4 | Board snapshot is sent uncompressed | 537 KB on the wire | P0 | Open |
| 5 | Card dialog re-fetches after every action **and** after the echo event | 3 requests per label toggle; 352 ms to open a card | P0 | Open |
| 6 | Single 544 KB JS bundle (admin, search, markdown and drag-and-drop all loaded up front) | 178 KB gzip | P1 | Open |

## Visual and interaction fidelity

| # | Gap (Trello observation → Flowdeck target) | Priority | Status |
|---|---|---|---|
| 7 | Card front: thin label bars with names toggled by `;`/click; completion circle on hover; quick-edit pencil; watching eye badge; consistent SVG icons (now emoji) | P1 | Open |
| 8 | List: compact header, scrolling body, `+ Add a card` with icon, 272 px lists and 256 px cards, collapse | P1 | Open |
| 9 | Board header: icon buttons (filter, star, share, menu), member avatars, visibility | P1 | Open |
| 10 | Card dialog: list chip (move) at the top, completion circle by the title, action chips under the title (Add, Labels, Dates, Checklist, Members), comments and activity in a right-hand column | P1 | Open |
| 11 | Popovers anchored to their button with a title, close button, Esc and outside-click dismissal and focus return (now inline side panels) | P1 | Open |
| 12 | Labels popover: "Search labels…", the full 30-colour palette (subtle / normal / bold × 10 hues), "Remove color", colour-blind toggle | P1 | Open |
| 13 | Top bar: Create menu (board, workspace) and live search dropdown | P2 | Open |
| 14 | Loading skeletons, empty states, an error boundary with recovery (a render error currently blanks the app) | P1 | Open |

## Missing or shallow functionality

| # | Gap | Priority | Status |
|---|---|---|---|
| 15 | Label order is random within a board (labels created in one transaction share `created_at`) → stable `position` (migration) | P1 | Open |
| 16 | Checklist: reorder items by dragging/keyboard, convert an item to a card | P1 | Open |
| 17 | Card templates (mark a card as a template, create cards from it) and board templates (create a board from a template) | P2 | Open |
| 18 | Notification controls: choose which kinds notify you; mark one read/unread | P2 | Open |
| 19 | Shortcuts from the research list: `e` quick edit, `d` dates, `l` labels, `m` members, `t` title, `-` checklist, `s` watch, `;` label names, `z` undo the last archive | P1 | Open |
| 20 | List "Sort by" (name, due date, newest/oldest) | P2 | Open |
| 21 | Recently viewed boards on the home page | P2 | Open |
| 22 | Unread-notification bell badge on watched cards (Trello observation) | P2 | Pending |

## Larger features: acceptance criteria first (P3, pending)

| # | Feature | Acceptance criteria (summary) | Depends on |
|---|---|---|---|
| 23 | Table view | Every open card in a board as a sortable row (title, list, labels, members, due, checklist). Inline edit of title/due. Same permissions and live updates as the board. Keyboard navigable. | Board store (done) |
| 24 | Calendar view | Month/week grid of cards by due date. Drag to reschedule (base-checked like the dates popover). Cards without dates listed separately. | Table view patterns |
| 25 | Automation rules | A trigger (card added to list / moved / due soon) plus an action (move, label, assign, archive). Runs server-side in the mutation transaction, is logged in activity, can be disabled. No silent failures. | Server rule engine, worker for time triggers |
| 26 | Outgoing webhooks / integrations | Per-board signed webhooks on activity events, retried with backoff, with an admin log. No fake integrations. | Worker, secrets storage |
| 27 | Email (invites, resets, digests) | Optional SMTP. Every in-app flow keeps working without it. | SMTP config, worker |

## Mobile and keyboard

| # | Gap | Priority | Status |
|---|---|---|---|
| 28 | Phone header crowding; board header actions collapse into one menu on phones | P1 | Open |
| 29 | Card dialog on phones: sticky header with the close button, single column, 44 px targets | P1 | Open |
| 30 | Every popover operable by keyboard with visible focus; Esc closes the innermost layer only | P1 | Open |

## Not app performance (measured separately)

- **Codespaces:** container creation, `npm ci` and the first build happen once per codespace; port-forwarding adds network latency on every request. Neither is application performance.
- **Development builds** (`npm run dev`, Vite + `tsx watch`) are not used for any measurement here. All numbers come from production builds.
