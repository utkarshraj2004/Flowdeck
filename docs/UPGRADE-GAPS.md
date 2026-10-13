# Upgrade audit: gaps against the research (session 3)

Audit of `854f7ed` (PR #4 head), run on 2026-10-12 against the research screenshots and notes in `research/`. "Trello" means an observation recorded in the research; "Flowdeck" means our design decision. The status column is updated as work lands. Measurements before and after: [perf/RESULTS.md](perf/RESULTS.md).

**Priority:** P0 = makes the app feel slow or broken; P1 = visible fidelity or completeness gap in a core workflow; P2 = valuable addition; P3 = larger feature that needs acceptance criteria first.

## Performance (measured, 1,200-card board, production build)

| # | Gap | Evidence | Priority | Status |
|---|---|---|---|---|
| 1 | Every server event re-renders every list and card. The board context value changes on each event and tiles are not memoised. | 576 ms main-thread time per 20 remote events → 324 ms | P0 | Done |
| 2 | Filter typing re-filters and re-renders the whole board on every keystroke | 829 ms to type 8 characters | P0 | Done |
| 3 | Drag-and-drop drop renders the whole board again | 399 ms from drop until the card shows in its new list | P0 | Done |
| 4 | Board snapshot is sent uncompressed | 537 KB on the wire | P0 | Done |
| 5 | Card dialog re-fetches after every action **and** after the echo event | 3 requests per label toggle; 352 ms to open a card | P0 | Done |
| 6 | Single 544 KB JS bundle (admin, search, markdown and drag-and-drop all loaded up front) | 178 KB gzip | P1 | Done |

## Visual and interaction fidelity

| # | Gap (Trello observation → Flowdeck target) | Priority | Status |
|---|---|---|---|
| 7 | Card front: thin label bars with names toggled by `;`/click; completion circle on hover; quick-edit pencil; watching eye badge; consistent SVG icons (now emoji) | P1 | Done |
| 8 | List: compact header, scrolling body, `+ Add a card` with icon, 272 px lists and 256 px cards, collapse | P1 | Done |
| 9 | Board header: icon buttons (filter, star, share, menu), member avatars, visibility | P1 | Done |
| 10 | Card dialog: list chip (move) at the top, completion circle by the title, action chips under the title (Add, Labels, Dates, Checklist, Members), comments and activity in a right-hand column | P1 | Done |
| 11 | Popovers anchored to their button with a title, close button, Esc and outside-click dismissal and focus return (now inline side panels) | P1 | Done |
| 12 | Labels popover: "Search labels…", the full 30-colour palette (subtle / normal / bold × 10 hues), "Remove color", colour-blind toggle | P1 | Done |
| 13 | Top bar: Create menu (board, workspace) and live search dropdown | P2 | Done |
| 14 | Loading skeletons, empty states, an error boundary with recovery (a render error currently blanks the app) | P1 | Done |

## Missing or shallow functionality

| # | Gap | Priority | Status |
|---|---|---|---|
| 15 | Label order is random within a board (labels created in one transaction share `created_at`) → stable `position` (migration) | P1 | Done |
| 16 | Checklist: reorder items by dragging/keyboard, convert an item to a card | P1 | Done |
| 17 | Card templates (mark a card as a template, create cards from it) and board templates (create a board from a template) | P2 | Done |
| 18 | Notification controls: choose which kinds notify you; mark one read/unread | P2 | Done |
| 19 | Shortcuts from the research list: `e` quick edit, `d` dates, `l` labels, `m` members, `t` title, `-` checklist, `s` watch, `;` label names, `z` undo the last archive | P1 | Done |
| 20 | List "Sort by" (name, due date, newest/oldest) | P2 | Done |
| 21 | Recently viewed boards on the home page | P2 | Done |
| 22 | Unread-notification bell badge on watched cards (Trello observation) | P2 | Done (session 4) |

## Larger features (P3): built in session 4 against these acceptance criteria

| # | Feature | Acceptance criteria (summary) | Status |
|---|---|---|---|
| 23 | Table view | Every open card in a board as a sortable row (title, list, labels, members, due, checklist). Inline edit of title/due. Same permissions and live updates as the board. Keyboard navigable. | Done |
| 24 | Calendar view | Month/week grid of cards by due date. Drag to reschedule (base-checked like the dates popover). Cards without dates listed separately. | Done (drag, or Alt+arrow keys) |
| 25 | Automation rules | A trigger (card added to list / moved / due soon) plus an action (move, label, assign, archive). Runs server-side in the mutation transaction, is logged in activity, can be disabled. No silent failures. | Done |
| 26 | Outgoing webhooks / integrations | Per-board signed webhooks on activity events, retried with backoff, with an admin log. No fake integrations. | Done |
| 27 | Email (invites, resets, digests) | Optional SMTP. Every in-app flow keeps working without it. | Done (reset links, invites, digests) |

## Mobile and keyboard

| # | Gap | Priority | Status |
|---|---|---|---|
| 28 | Phone header crowding; board header actions collapse into one menu on phones | P1 | Done |
| 29 | Card dialog on phones: sticky header with the close button, single column, 44 px targets | P1 | Done |
| 30 | Every popover operable by keyboard with visible focus; Esc closes the innermost layer only | P1 | Done |

## Not app performance (measured separately)

- **Codespaces:** container creation, `npm ci` and the first build happen once per codespace; port-forwarding adds network latency on every request. Neither is application performance.
- **Development builds** (`npm run dev`, Vite + `tsx watch`) are not used for any measurement here. All numbers come from production builds.

## Status notes (end of session 3)

- **Done** means implemented, covered by automated tests (`tests/api/upgrade.test.ts`, `tests/e2e/upgrade.spec.ts`, axe in `tests/e2e/a11y.spec.ts`) and inspected in a browser.
- Rows 22–27 were built in session 4 and are covered by `tests/api/automation.test.ts`, `tests/api/email.test.ts` and `tests/e2e/views.spec.ts`.
- The card-open regression on large boards was fixed in session 4: it was a re-render of every card caused by unstable drag-and-drop configuration, not dialog layout ([perf/RESULTS.md](perf/RESULTS.md)).
- **Trello behaviour deliberately not copied:**
  - Space picks a card up for a keyboard move; it does not assign yourself.
  - Moving cards stays possible without a mouse (WCAG 2.5.7).
