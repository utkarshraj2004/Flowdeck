# 03 · User journeys and acceptance criteria

Each journey has an ID (J##) and numbered acceptance criteria (AC). Tests in `09-test-plan.md` reference them as `J##.AC#`. The **Ref** column gives the Trello evidence a journey is modelled on. Flowdeck-specific values (lengths, messages) are INF.

Gherkin shorthand: **G** given, **W** when, **T** then.

---

## J01 · First admin sets up the instance  (Ref: INF)
1. G a fresh install, W the operator runs `flowdeck admin create --email a@x`, T a one-time setup link is printed and expires in 24 h.
2. W the admin opens the link and sets name, username and password (≥12 chars), T they are logged in and a default workspace "<Name>'s workspace" exists with them as admin (OBS O01 default workspace).
3. T no account with a default or blank password ever exists.

## J02 · Invite and join a workspace  (Ref: DOC D11)
1. G a workspace admin, W they invite `b@x` as member, T an invite with a 7-day expiry is created and emailed if SMTP is configured; the copyable link is always shown.
2. W B opens the link while logged out, T they can create an account; after submit they are a workspace **member**.
3. W an admin creates an invite link, T anyone with the link joins as member until it is revoked; after revocation, opening it shows "This invite is no longer valid".
4. G a workspace member without invite rights, T the invite button is absent and `POST /workspaces/:id/invites` returns 403.
5. W an admin demotes **or removes** the last admin, **or the last admin tries to leave**, T the server returns `409 last_admin` and the UI explains it. (Trello blocks the demote but **allows the leave**, leaving the board with no admin: OBS O06 §5.)
6. W a workspace admin removes a member, T they choose "remove from workspace" (the user keeps their boards and becomes a guest) or "remove from workspace and boards". The user is notified either way (OBS O06 §5).

## J03 · Log in / log out / reset password  (Ref: INF; D19 SSO later)
1. Wrong password → generic "Email or password is incorrect" (no account enumeration). The 6th failure within 1 min returns 429.
2. Logout invalidates the session server-side; the back button doesn't show board data.
3. Reset sends a single-use token valid 1 h; using it signs out all other sessions.

## J04 · Create a board  (Ref: OBS O01, API A01, DOC D18)
1. W a member submits name "Q4 Roadmap" with visibility Workspace, T the board opens empty with the "Add a list" composer focused; the creator is board admin.
2. Name is required: empty or whitespace-only is rejected inline; more than 200 chars is rejected.
3. Default visibility is the workspace setting (default `workspace`); private boards are visible only to board members.
4. W copying a board with "keep cards" unchecked, T lists and labels are copied, cards are not; the new board has a new short URL.

## J05 · Board navigation  (Ref: DOC D04, INF)
1. Pressing `b` opens the board switcher with type-to-filter; `Enter` opens the board.
2. Starred boards appear first on Home and in the switcher, in the user's star order.
3. A board URL `/b/<shortId>/<slug>` resolves even if the slug is stale (it redirects to the current slug).
4. Opening a board without access shows 404 (no existence leak), plus "Request access" if the board is workspace-visible (later).

## J06 · Lists: create, rename, reorder, move, copy, archive, restore, delete  (Ref: API A01, DOC D03, D24)
1. Adding a list appends it at the end; `Enter` keeps the composer open for the next list; `Esc` closes it.
2. Renaming is inline; blank names revert.
3. Dragging a list to a new slot persists after reload and reaches other open clients within 1 s (p95).
4. "Move list" to another board puts it at the chosen position. Its cards move with it; card members not on the target board are removed and logged.
5. Archiving a list hides it and its cards; it appears under Board menu → Archived items → Lists, with "Send to board" restoring it to its previous position.
6. **Delete** is available only for archived lists, asks for confirmation ("deletes N cards, can't be undone"), and is permanent (DOC D03).
7. "Archive all cards in this list" archives every open card in one action and one activity entry.

## J07 · Cards: create, edit, reorder, move, copy, archive, restore, delete  (Ref: API A01, DOC D24, D25, D03)
1. "Add a card" at the bottom of a list creates a card with the typed title; `Enter` creates and keeps the composer open; titles are 1–512 chars after trimming.
2. Dragging a card within or across lists persists exactly where it was dropped, verified after reload and on a second client.
3. The keyboard alternative: focus the card, press `Space`, use arrow keys, press `Enter`. It produces the same result, and screen readers announce "Moved to <list>, position n of m".
4. The Move dialog offers board → list → position. A cross-board move keeps description, checklists, attachments and comments (DOC D24), drops non-member assignees, and maps labels by matching name+colour or creates the missing labels on the target board (INF; avoids Trello's dropped-label bug, 3P T05).
5. The Copy dialog offers title plus "keep" checkboxes (checklists, labels, members, attachments, comments). The copy gets activity "copied from <card>".
6. Archive removes the card from the list; the card URL still opens with an "archived" banner; Restore returns it.
7. Delete is offered only for archived cards, needs confirmation, and is permanent.
8. Marking a card complete shows a completed state on the due badge; it is independent of archive.

## J08 · Card details  (Ref: DOC D10, D17, D22, D26; OBS O01)
1. **Description:** Markdown editor with preview; saves on blur/`Ctrl+Enter`; `Esc` cancels with an unsaved-changes prompt; ≤16384 chars. A concurrent edit triggers the 3-way prompt (07).
2. **Labels:** pick from board labels, create a label (name optional, colour from 30 + none); colour-blind mode adds patterns on all labels.
3. **Members:** only board members can be assigned; `Space` on a focused card toggles self-assignment.
4. **Dates:** optional start, due date + time, reminder (later). The badge is neutral when > 24 h away, warning when < 24 h, danger when overdue, success when complete (colour + text, never colour alone; DOC D10 colour logic).
5. **Checklists:** add multiple; add, rename, reorder, check and delete items; the card front shows "n/m"; "hide checked items" toggle.
6. **Comments:** Markdown, `@username` mentions notify the mentioned user if they can see the board; `@card` notifies card members; `@board` notifies board members. Authors can edit (marked "edited") and delete their own; board admins can delete non-admins' comments (DOC D22).
7. **Attachments:** upload by picker, drag-drop onto the card, or paste; add a link; image uploads offer "Make cover"; > limit → "File is larger than N MB".
8. **Cover:** colour or image; on the card front it's shown above the title.
9. **Activity:** chronological feed of all changes with actor and time; "Show details" toggles non-comment activity.

## J09 · Board filter and global search  (Ref: DOC D04, D05)
1. `f` opens the filter: keyword, members (incl. "no members"), labels, due (overdue, next day/week/month, no dates), complete/incomplete. Non-matching cards are hidden (not dimmed); list headers show "n of m"; `x` clears.
2. Global search returns cards across boards the user can access, with highlighted terms. Operators behave per 06; unknown operators are treated as text.
3. Archived cards appear only with `is:archived`.

## J10 · Notifications and watching  (Ref: DOC D12)
1. Users are auto-subscribed to cards they create, are assigned to, or comment on (INF).
2. Watching a board/list notifies on new cards; watching a card notifies on comments, due changes, completion, attachments, moves and archive.
3. The bell shows an unread count, updated in real time; "Mark all read" works.
4. No notification is generated for the actor's own action.

## J11 · Real-time collaboration  (Ref: DOC D16)
1. Two browsers on the same board: any create/move/edit/archive in A appears in B within 1 s (p95) without reload.
2. Kill B's network for 30 s while A makes 10 changes; on reconnect B shows all 10 with no duplicates (catch-up by `seq`).
3. Exceeding the replay window triggers a full snapshot reload, keeping the scroll position.
4. Removing B from a private board makes B's view switch to "You no longer have access" within 2 s (Trello: ~4.9 s, OBS O06 §6). If B can still see the board through the workspace, B's view stays readable and only the edit affordances their new role lacks disappear.
5. Changing B's role while B has the board open updates B's affordances without reload within 1 s (Trello: 0.66–0.96 s for admin-only menu items, OBS O06 §6).

## J12 · Permissions in practice  (Ref: 04)
1. An observer sees the board, can comment if the pref allows, and cannot drag cards (drag handles absent; API 403).
2. A guest sees only the boards they were added to; workspace pages show only those boards.
3. Board prefs `comments`, `invitations` and `selfJoin` take effect immediately for all users.

## J13 · Close, reopen, delete board  (Ref: DOC D21)
1. A board admin closes the board; it disappears from Home and is listed under "Closed boards"; the board is read-only if opened.
2. Reopen restores it to its workspace.
3. Delete is available only for closed boards to admins, needs the typed board name, is permanent, and removes blobs via GC.

## J14 · Export and import  (Ref: DOC D09)
1. Any board member exports JSON containing board, lists, cards, labels, checklists, comments, members (id, username, name only) and the full activity history (Flowdeck exports **all** activity, unlike Trello's 1000 most recent; INF).
2. **Later:** import a Trello JSON export into a new Flowdeck board, mapping lists, cards, labels, checklists, comments (as imported text with the original author name) and due dates. Unknown members map to "Imported user" placeholders.

## J15 · Mobile and touch  (Ref: INF; Trello mobile not observed)
1. At 375 px width a board shows one list at a time at ~85 % width, swipeable horizontally; the page body has no horizontal scroll.
2. Long-press picks up a card; dropping on a list edge auto-scrolls to the next list.
3. Card detail opens full-screen with a sticky header and close button; all actions are reachable without hover.
4. Tap targets are ≥ 44×44 px.

## J16 · Accessibility  (Ref: WCAG 2.2 AA; INF)
1. Every journey above is completable with keyboard only.
2. Axe-core reports zero serious/critical violations on S04, S06, S10, S17, S19.
3. Colour contrast ≥ 4.5:1 for text on every built-in board background.

## J17 · Self-hosting operations  (Ref: 08)
1. `docker compose up -d` on a clean host reaches `/readyz` 200 within 60 s.
2. Daily backup produces a DB dump, blob snapshot and manifest; restore onto a fresh host yields identical board exports (byte-equal JSON aside from timestamps).
3. Upgrading N → N+1 auto-runs migrations and keeps all data; starting an older binary against a newer DB refuses with a clear message.

## Parity notes from authenticated observation (OBS O05)

These refine the acceptance criteria above. Source: [E-session2-auth](evidence/E-session2-auth.md). Where Flowdeck deliberately differs, it says so.

| Journey | Trello (observed) | Flowdeck acceptance criterion |
|---|---|---|
| J02 | Workspace creation asks for name + type (type list) + optional description; Continue disabled until both set; no invite step | Type is **optional** in Flowdeck (no marketing segmentation); name required |
| J04.1 | New board has To Do / Doing / Done and the composer open in the first list | W "default lists" is on (default), T the board opens with three lists and the first composer focused |
| J04.2 | Empty title disables Create, hint "Board title is required" | Same |
| J06.1 | List composer stays open after Enter; empty Enter is ignored | Same |
| J06.5 | List archive asks "Are you sure?"; restore from Archived items → Lists → **Restore**; returns to original position | Same; restore to previous position if free, else end |
| J06.6 | No delete button was shown for archived lists in this UI (DOC D03 describes one) | Keep Flowdeck's delete for archived lists (admin only), with confirmation |
| J07.1 | Title limit 16384, over-limit silently refused; empty Enter closes the composer | Limit 512 (INF), **inline error** when exceeded; empty Enter closes |
| J07.2 | Mouse drag within/across lists persisted after reload | Same, plus the second-client check |
| J07.3 | Hover + `.`/`,` (bottom of next/prev list), `>`/`<` (top) | Add the same shortcuts in addition to the accessible Space/arrows flow |
| J07.5 | Copy dialog: name + Keep (checklists, labels, members, attachments, comments, with counts), destination board/list/position; **checked items reset** on copy | Same; document that copied checklist items start unchecked |
| J07.6 | Archived card opens with a banner, add buttons hidden, actions Restore/Delete; toast "Card archived — press Z to undo"; `z` undoes | Same, with undo for archive, move and label/member toggles |
| J07.7 | Delete confirmation states that activity is removed and there is no undo | Same meaning, Flowdeck wording |
| J08.1 | WYSIWYG + Markdown shortcuts, stored Markdown; **last write wins with no warning** (T3) | Flowdeck keeps its 409 + 3-way prompt (07): **deliberately better than parity** |
| J08.4 | Due defaults to tomorrow at the current time; reminder default "1 Day before"; recurring options derived from the date | Same defaults; recurring is Later |
| J08.5 | Checklist default title "Checklist"; item composer focused; progress %; item actions Convert to card / Delete; delete confirmation | Same; "Convert to card" is Later |
| J08.6 | Comment edit shows "(edited)"; delete asks for confirmation | Same |
| J08.7 | Image upload becomes the cover automatically; Links and Files are grouped; over-limit is rejected client-side with an upgrade message | Auto-cover on first image (setting); limit error names the configured size |
| J08.9 | Activity lacks description and label changes | Flowdeck logs them (INF; more useful for a team) |
| J09 | Filter state in URL; `x` clears; search operators work on the results page | Same |
| J10 | Default email frequency **Periodically (hourly)**. Watcher gets notified of another user's comment, due change, attachment, complete and move; notifications grouped per card in the drawer; red bell count on the card front; no self-notifications; non-members are not notified by @mentions | Same rules; group by card in the drawer; card-front unread badge |
| J11 | Cross-user fan-out 0.38–0.91 s (median ≈ 0.44 s); open dialogs update live on archive/delete by another user | p95 < 1 s on LAN; open-card conflict states as in 02 |
| J12 | Non-member opening a workspace board gets "private · Send request"; request appears as a notification for admins with a one-click approve. Public viewers: read-only UI **and** server-side 401 on writes | Same flow (Later); approval must actually add the member and show an error if it can't; every write checked server-side |

## Acceptance updates from two-user observation (OBS O06, session 5)

Source: [E-session5](evidence/E-session5.md). "Trello" is what was observed. "Flowdeck AC" is the testable rule. Where they differ, Flowdeck is deliberately stricter or clearer.

| Area | Trello (observed) | Flowdeck AC |
|---|---|---|
| **Denied writes** | Many forbidden writes return **200 and silently do nothing**: a member changing visibility, background, commenting, self-join or invitation prefs; a checklist-item assignment on the free plan | **J12.4** Every write the actor may not perform returns **403 `forbidden`** (or 404 when the board is invisible to them). The UI shows why. The state is unchanged (test reads it back). **No silent success, ever.** |
| Admin-only board actions | Rename and close: 401. Self-promotion: 401. Demoting the sole admin: 403 | **J12.5** Same outcomes, with Flowdeck codes: `forbidden` 403; `last_admin` 409 |
| Comments | Authors edit their own; nobody edits others' (admins included: 401); admins delete others' comments; members cannot | **J08.6** unchanged, plus: an edit of someone else's comment returns 403 for every role |
| Member deletes | A member can archive others' cards, delete others' archived cards, archive lists and create labels | **J12.6** Default: same, behind the Q8 setting "members can delete archived items" (default on) |
| **Title edits** | The title saves on blur (and Enter); concurrent saves: last write wins; the other user's open dialog updates live | **J07.9** The title saves on Enter or blur; Esc cancels. Concurrent title saves use `If-Match`. The second writer gets a "changed by <name>" notice showing both values and chooses which to keep |
| **Description drafts** | Another user's save never replaces a local draft. The draft shows "Unsaved changes" and the other user's editing avatar. **No warning** that the saved text changed; last save wins silently | **J08.10** The draft is preserved. When someone else saves while you edit, a notice appears at once ("<name> updated the description"). On save, a 409 triggers the 3-way prompt (07). Presence shows who is editing |
| Concurrent move | Both moves succeed; both clients converge on the last one | **J07.10** Same (moves are not version-gated); both clients show the same final list and position within 1 s |
| Card archived or deleted while editing | Archived: banner, the draft stays. Deleted: "Card not found", **the draft is lost** | **J08.11** Archived: banner + draft kept + Restore (if allowed). Deleted: banner "deleted by <name>" + **Copy draft**; the modal stays until closed |
| Real-time | B→A median 504 ms, A→B 443 ms (≤ 702 ms) | **J11.1** unchanged (p95 < 1 s on LAN; target 500 ms) |
| Reconnect | Missed changes appear ~2.75 s after the network returns; the offline toast stays until closed | **J11.2** After reconnect, all missed events are applied within 2 s, without duplicates; the offline notice is replaced by "Back online" |
| Notifications | @mention → mentioned; added to card / removed from card; due change, comment, attachment and completion on a card you are a member of; a new card in a watched list. **A list rename on a watched board does not notify.** The bell updates live (~0.6 s) | **J10.5** Same trigger set (table in 04/06). A board watcher is notified of new cards and lists, not renames. The bell count updates within 1 s |
| Mention autocomplete | Suggests board members only | **J08.6a** `@` suggests board members (Later: also workspace members on workspace-visible boards); non-members are never suggested or notified |
| Guests | A guest edits the boards they belong to, cannot rename a board, cannot see other workspace boards ("This board is private"), and counts toward the collaborator cap | **J12.2** unchanged; Flowdeck has no cap |
| Board delete | Delete is only in the Closed boards list; one-step confirmation | **J13.3** unchanged (typed board name; admin only) |
| Workspace invite failure | One invitation returned 200 with a "Member was invited" toast, but created nothing | **J02.7** An invite either creates a pending invitation, visible in the workspace's Pending tab, or returns an error. Tests read the invitation back. |
