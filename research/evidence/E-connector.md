# E-connector: observations through the authorized Trello connector (OBS)

Session 2026-10-11. All calls were **read-only**. Identifiers, usernames, avatar URLs and board names are redacted.

## Account shape

- `get_me` returns `{ id: "ari:cloud:trello::user/<id>", username, fullName, url, avatarUrl, prefs: { timezone } }`. `timezone` was `null` on this account, so the client must not assume a timezone is set.
- Workspace list: one workspace, auto-generated slug form `userworkspace<digits>`, display name "Trello Workspace". **Observation:** signing up creates a default personal workspace. Flowdeck decision (INF): create a default workspace on first login.
- IDs are Atlassian Resource Identifiers: `ari:cloud:trello::<type>/workspace/<workspaceId>/<objectId>`, with 24-hex object IDs (also seen in API A01). Board URLs use a short link: `https://trello.com/b/<8-char shortLink>/<slug>`.

## Enumerations exposed by the connector schema

These match the official docs, which gives independent confirmation:

| Item | Values observed | Cross-check |
|---|---|---|
| Board visibility | `PRIVATE` (default), `ORG` (workspace), `PUBLIC`, `ENTERPRISE` | API A01 `prefs/permissionLevel: org, private, public` |
| Comment permission | `DISABLED, MEMBERS, OBSERVERS, ORG, PUBLIC` | A01 identical |
| Voting permission | `BOARD, DISABLED, OBSERVERS, PUBLIC, WORKSPACE` | A01 uses `members`/`org` names |
| Invitation permission | `ADMINS, MEMBERS` | A01 identical |
| Board prefs | `selfJoin`, `cardCovers`, `cardCounts`, `isTemplate`, `showCompleteStatus`, `background.key` | D18 templates |
| Label colours | 10 hues × {base, `_dark`, `_light`} = **30** (green, yellow, orange, red, purple, blue, sky, lime, pink, black) | D26 "30 colours + colourless" |
| Custom field types | `checkbox, date, list (dropdown), number, text` | D17 identical |
| Card position | `"top"`, `"bottom"`, or a non-negative number (e.g. `16384`) | A01 `pos` |
| Activity action types | ADD_ATTACHMENT, ADD_CHECKLIST, ADD_MEMBER, COMMENT, COMMENT_FROM_COPIED_CARD, COPY_CARD, COPY_INBOX_CARD, CREATE_CARD, CREATE_CARD_FROM_CHECK_ITEM, CREATE_CARD_FROM_EMAIL, CREATE_INBOX_CARD, DELETE_ATTACHMENT, MOVE_CARD, MOVE_CARD_TO_BOARD, MOVE_INBOX_CARD_TO_BOARD, REMOVE_CHECKLIST, REMOVE_MEMBER, UPDATE_CARD_CHECK_ITEM_STATE, UPDATE_CARD_CLOSED, UPDATE_CARD_COMPLETE, UPDATE_CARD_DUE, UPDATE_CARD_RECURRENCE_RULE, UPDATE_CUSTOM_FIELD_ITEM | D10 recurring, D13 Inbox |
| Card search qualifiers | `label:`, `board:`, `list:`, `member:`, `due:`, `has:`, `is:archived` / `is:closed` | D05 |

## Behaviour documented by the connector

- Archiving a list is a **soft delete (close)**. Archived cards and boards stay retrievable with `filter: "archived"`/`"closed"`. Matches D03 and D21.
- Card "done" is a distinct state (`mark_done` → `dueComplete`), separate from archive. Matches D10.
- Check items can move between checklists **on the same card only**, and can carry an assigned member and a position.
- Activity entries reuse `type` across edits (a list move and a due change are both `updateCard`). The feed distinguishes them by a `displayKey`. **Design note (INF):** Flowdeck should store a specific event type per change rather than a generic one.
- Comments can be edited (`lastEditedAt`), and are actions on the card.
- Attachments carry `name, fileName, url, mimeType, bytes, createdAt, isUpload, isMalicious`. `isMalicious` suggests server-side scanning. Flowdeck decision (INF): optional ClamAV scan, see 07.

## Not done (would need a dedicated test account)

Create/move/archive experiments, permission checks with a second user, real-time propagation timing, concurrent edits, attachment upload limits. See `10-phases-questions.md#access-needed`.
