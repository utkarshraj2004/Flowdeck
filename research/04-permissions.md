# 04 · Role and permission matrix

## Trello's model (what the evidence supports)

| Fact | Evidence |
|---|---|
| Workspace roles: **admin** and **normal**. On free workspaces all members are admins by default; on Standard/Premium, admins can set members to normal. | DOC D11 |
| Workspace admin on free plan does **not** get board control; they must be invited as board admin. On Standard/Premium, workspace admins have admin status on **all** workspace boards, including private ones. | DOC D11 |
| Board membership types: **admin**, **normal**, **observer**. | API A01 (`boards_memberships.type`), DOC D01 |
| **Observer**: view cards, download attachments, comment and vote (if enabled), export; cannot move/edit cards, upload, **tick checklist items**, or change settings. Premium feature (3P T01's Enterprise claim is contradicted by DOC-direct). Only workspace/board admins can make someone an observer; a share link can add people as observers. | DOC-direct D01, D02 |
| **Guest**: board member who isn't in the workspace; can be observer/normal/admin on that board; can't see other workspace boards. | DOC D01 (via community lesson) |
| Only board admins remove users and change commenting permissions. | DOC D01 |
| Only board admins (and Premium workspace admins) close a board; only admins delete a closed board; reopening may be admin-only. | DOC D21 |
| Comments: edit/delete own only; board admins can delete non-admins' comments. | DOC D22 |
| Board prefs control who may comment (`disabled/members/observers/org/public`), invite (`admins/members`), vote, and whether workspace members can self-join. Defaults: comments = **members**, add/remove members = **all members**. Self-join ("Workspace editing") needs a non-private board in a workspace. | OBS O01, API A01, DOC-direct D02 |
| Visibility: private (board members), workspace (workspace members can view), public (anyone with link, read-only). | OBS O01, API A01 |
| @mention of a non-member notifies only if the board is workspace-visible. | DOC D22 |
| Moving a card to a board where its members aren't members removes those members. | DOC D24 |

**Not verified** (*updated session 5, 2026-10-12*): a *normal* workspace member (a **paid** role) on a workspace-visible board they have not joined; whether normal members can create invite links on paid plans (DOC D11 gap); the **observer** role (paid). *Resolved in session 5:* a free-plan workspace member (who is always an admin) who is not on a board can view **and edit** a workspace-visible board when "Workspace editing" is on ([E-session5 §5](evidence/E-session5.md#5--t5-roles-and-permissions)).

### Observed with the test accounts (OBS O05)

| Fact | Evidence |
|---|---|
| Board visibility help text: Private = only board members see it, and **workspace admins can close the board or remove members**; Workspace = all workspace members can see **and edit**; Public = anyone can see, only members edit. | [E-session2-auth §2](evidence/E-session2-auth.md#2--boards) |
| "Workspace editing" (self-join) is **on by default** for a Workspace board. Defaults `comments: members`, `invitations: members`. | same |
| A logged-in non-member opening a workspace board sees "This board is private" with **Send request**; the admin gets a notification with a one-click approval. | [§10–11](evidence/E-session2-auth.md#11--sharing-invitations-membership-t5-and-the-blocker) |
| Invite roles offered on the free plan: Member; Observer shown as an upgrade. Link invites: "join as member" / "join as observer (upgrade)". | same |
| Free workspace collaborator cap shown as "1 / 10". | [§1](evidence/E-session2-auth.md#1--accounts-onboarding-workspaces) |
| **Logged-in public viewer (non-member) on a public board:** read-only board and card back; no composers, no drag, no comment box (commenting = Members); list menu = Watch only; card actions = Copy, Mirror, Watch, Share; board menu without Share/Settings/background/Close. Can **watch** cards and receives watcher notifications. Writes through the API are refused with **401 "unauthorized card permission requested"**, so the server enforces it, not just the UI. | [E-session2-auth §14](evidence/E-session2-auth.md#14--cross-user-round-owners-manual-step-2026-10-11-19452000-utc) |
| @mention of a non-member on a public board: not suggested by autocomplete and **does not notify** them (consistent with DOC D22). | same |
| *Superseded by session 5 (below):* member and guest rows are now observed with two users; observer stays untested (paid). | — |

### Observed with two users, every write read back (OBS O06, session 5)

Free-plan boards in a workspace created by Account 2. "No-op" = the API returned **200** but the read-back showed no change. Source: [E-session5 §5–6](evidence/E-session5.md#5--t5-roles-and-permissions).

| Action | Board admin | Board member | Guest (board member, not in workspace) | Workspace member not on the board | Observer |
|---|:-:|:-:|:-:|:-:|:-:|
| View the board | ✓ | ✓ | ✓ | ✓ (workspace-visible) | paid, untested |
| Create / edit / move / archive cards | ✓ | ✓ | ✓ | ✓ (create observed; "Workspace editing" on) | — |
| Archive others' cards, delete others' archived cards, archive lists, create labels | ✓ | ✓ | (create card observed) | — | — |
| Rename board, close board | ✓ | **401** | **401** (rename) | — | — |
| Change visibility, background, commenting, self-join or invite prefs | ✓ | **200 no-op** | **200 no-op** | — | — |
| Promote self to admin | — | **401** (also after self-joining an adminless board) | — | — | — |
| Join the board (self-join, "Workspace editing" on) | — | — | — | ✓ ("Join board" → member) | — |
| Demote the sole admin (or self, as sole admin) | **403** "Cannot demote sole admin" | **403** | — | — | — |
| **Sole admin leaves the board** | **200: allowed → board left with no admin** | — | — | — | — |
| Edit another user's comment | **401** | **401** | — | — | — |
| Delete another user's comment | ✓ | **401** | — | — | — |
| Read another workspace-visible board in the same workspace | ✓ | ✓ | **401** ("This board is private") | ✓ | — |
| Assign a checklist item (advanced checklists, paid) | 200 no-op | — | — | — | — |

**Live changes while the affected user has the board open:**
- Promote: admin-only menu items appear after 0.66 s.
- Demote: they disappear after 0.96 s.
- Removing a guest: the board is replaced by "This board is private" after 4.9 s, and API reads and writes return 401.
- Removing a board member who is still in the workspace does **not** revoke access to a workspace-visible board.

**Workspace (free plan):**
- All members are admins; the normal role is paid.
- "Remove from Workspace" keeps board memberships and turns the user into a single-board guest. "Remove from Workspace and Boards" removes everything.
- Guests count toward the 10-collaborator cap.
- On the home page, a guest sees the workspace under "Guest workspaces".

## Flowdeck model (INF)

Flowdeck keeps Trello's shape but removes plan gating. Instance-level **system admin** is added for self-hosting.

Roles:
- **System admin** (instance): manage users, invites, backups, storage. Not implicitly a board member. Can break-glass grant themselves workspace admin, which is audited.
- **Workspace admin / workspace member.**
- **Board admin / board member / board observer.** A workspace member who is not on a board's member list is a **workspace viewer** of workspace-visible boards.
- **Guest**: a board role held by a user who is not in the workspace.

### Workspace actions

| Action | WS admin | WS member | Guest | Non-member |
|---|:-:|:-:|:-:|:-:|
| View workspace, its members, workspace-visible boards | ✓ | ✓ | ✗ | ✗ |
| Create board in workspace | ✓ | ✓ | ✗ | ✗ |
| Invite member (email / link) | ✓ | setting (default ✗) | ✗ | ✗ |
| Change roles, remove members, revoke links | ✓ | ✗ | ✗ | ✗ |
| Convert guest → member | ✓ | ✗ | ✗ | ✗ |
| Edit workspace settings, delete workspace | ✓ (delete needs ≥1 other admin confirmation or typed name) | ✗ | ✗ | ✗ |
| Admin access to every board in workspace (incl. private) | ✓ (Trello paid-plan behaviour, D11) | ✗ | ✗ | ✗ |

### Board actions

Legend: ✓ allowed · ✗ denied · P = depends on board pref.

| Action | Board admin | Board member | Observer | WS viewer (workspace-visible board, not joined) | Public viewer (OBS O05 for logged-in viewers) |
|---|:-:|:-:|:-:|:-:|:-:|
| View board, cards, attachments | ✓ | ✓ | ✓ | ✓ | ✓ |
| Join board (self-join) | — | — | — | P `selfJoin` | ✗ |
| Create / edit / move / copy / archive lists and cards | ✓ | ✓ | ✗ | ✗ | ✗ |
| Restore archived; **delete** archived card or list | ✓ | ✓ restore, ✓ delete (INF: members can delete; configurable) | ✗ | ✗ | ✗ |
| Labels: apply | ✓ | ✓ | ✗ | ✗ | ✗ |
| Labels: create / edit / delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| Upload / remove attachments | ✓ | ✓ (remove: own uploads only, admin any — INF) | ✗ | ✗ | ✗ |
| Comment | P `comments` | P | P (`observers`+) | P (`org`+) | P (`public`) |
| Edit / delete own comment | ✓ | ✓ | ✓ | ✓ if commenting allowed | ✗ |
| Delete others' comments | ✓ (non-admins' comments) | ✗ | ✗ | ✗ | ✗ |
| Invite to board | ✓ | P `invitations` (default: members may, DOC-direct D02) | ✗ | ✗ | ✗ |
| Tick checklist items | ✓ | ✓ | ✗ (DOC-direct D01) | ✗ | ✗ |
| Change member roles, remove members | ✓ | ✗ (may remove self) | ✗ (may leave) | — | — |
| Change board settings / visibility / background | ✓ | ✗ (INF: background ✓) | ✗ | ✗ | ✗ |
| Close / reopen board | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete closed board | ✓ | ✗ | ✗ | ✗ | ✗ |
| Export board JSON | ✓ | ✓ | ✓ | ✓ | ✗ (INF) |
| Watch board / card | ✓ | ✓ | ✓ | ✓ | ✗ |

### Invariants (enforced server-side)

1. A board always has ≥1 admin. Removing, demoting **or leaving** as the last admin is rejected (`409 last_admin`). Trello allows the leave and ends up with an adminless board that nobody can repair (OBS O06), so Flowdeck deliberately differs. A workspace admin can always recover a board (break-glass, audited).
2. A workspace always has ≥1 admin.
3. Card member set ⊆ board members. On a move across boards, members not on the target board are dropped and an activity entry records it (DOC D24).
4. All permission checks run on the server for every REST call and every WebSocket subscription. The UI only hides affordances.
5. Leaving a private board revokes its WebSocket subscription immediately.
6. A board visibility change takes effect for subscriptions immediately: unauthorized sockets receive `board.access_revoked` and are unsubscribed.
7. **No silent no-ops.** A write the actor is not allowed to make returns `403 forbidden` (or `404` if the board is invisible to them). It never returns 2xx while ignoring the change. Each test in §P reads the state back.
8. Role changes are pushed to the affected user's open sessions (`board.member_role_changed`) and the client re-derives its affordances. The server re-checks every later request anyway.

### Test linkage

Each ✓/✗ cell is a test case in `09-test-plan.md` §P (generated table-driven).
