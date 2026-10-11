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

**Not verified (still, after session 2: login blocked, see [E-session2](evidence/E-session2.md)):** exact behaviour of a *normal* workspace member on a workspace-visible board they haven't joined (view only vs. edit); whether workspace normal members can create invite links on paid plans (DOC D11 gap).

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

| Action | Board admin | Board member | Observer | WS viewer (workspace-visible board, not joined) | Public viewer |
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

1. A board always has ≥1 admin. Removing or demoting the last admin is rejected (`409 last_admin`).
2. A workspace always has ≥1 admin.
3. Card member set ⊆ board members. On a move across boards, members not on the target board are dropped and an activity entry records it (DOC D24).
4. All permission checks run on the server for every REST call and every WebSocket subscription. The UI only hides affordances.
5. Leaving a private board revokes its WebSocket subscription immediately.
6. A board visibility change takes effect for subscriptions immediately: unauthorized sockets receive `board.access_revoked` and are unsubscribed.

### Test linkage

Each ✓/✗ cell is a test case in `09-test-plan.md` §P (generated table-driven).
