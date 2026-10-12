# 07 · Ordering, concurrency, persistence, attachments

## What is known about Trello

| Fact | Evidence |
|---|---|
| Positions are `top`, `bottom`, or a positive number; example default spacing `16384`. | API A01, OBS O01 |
| Changes reach other open clients in well under a second via WebSockets, with polling fallback (historic description). | DOC D16 |
| Archive is reversible; delete is permanent and only possible after archive. Deleting a list deletes its cards. No recovery after delete. | DOC D03, D21 |
| Moving a card across boards keeps description, checklists, attachments and comments, **not** activity history, and drops members not on the target board. Labels may be dropped (open bug). | DOC-direct D24, 3P T05 (labels not mentioned by D24) |
| JSON export includes the 1000 most recent actions. | DOC D09 |

| **Observed positions:** first item at 140737488355328 (2⁴⁷), then +16384 (2¹⁴); a move takes the midpoint of its neighbours; moving to the front uses first − 16384. | OBS O05 (API read with the test account's own session) |
| **Restore returns the card/list to its original position.** | OBS O05 |
| **Concurrent description edit: last write wins, no warning;** the other client's open draft is not replaced. | OBS O05 (same user, two tabs) |
| Edits made offline are not queued (toast "changes will not be saved"; the composer does nothing). | OBS O05 |
| Card title limit 16384 (silently refused above); upload limit 10 MiB on free (client-side check). | OBS O05 |

| Card archived / deleted by another user while open: the open dialog updates live (archived banner) or is replaced by "Card not found". Matches Flowdeck's conflict-state rule. | OBS O05 §14 (cross-user) |

**Two different users, both editing (OBS O06, [E-session5 §3–4](evidence/E-session5.md#3--t3-conflicting-edits-by-different-users-fd-collab-board)):**

| Case | Trello outcome |
|---|---|
| Both save the **title** | Last write wins. The other user's open dialog updates live. No warning. Titles save on blur. |
| Both save the **description** | Last write wins. A local draft is never replaced by the other user's save. No warning. |
| One saves while the other drafts | The draft is kept, marked "Unsaved changes", with the other editor's avatar shown. No notice that the saved text changed. |
| Both **move** the same card | Both 200; both clients converge on the last move. |
| Card **archived** while the other user types | Archived banner; the draft stays. |
| Card **deleted** while the other user types | "Card not found"; the draft is lost. |
| One client **offline** while the other makes 3 changes | No offline queue. On reconnect, all 3 changes appear after 2.75 s, without reload or duplicates. |
| **Reload** | Identical state for both users. |

**Still not observed:** renumbering when positions get very close, and Trello's server-side replay mechanism (its frames carry a per-channel index; how a reconnecting client uses it was not seen).

## Flowdeck decisions (INF)

### Ordering
- **Fractional indexing** with base-62 string keys (e.g. the `fractional-indexing` algorithm, CC0/MIT implementations). A new key is generated between neighbours, so a move updates exactly **one row**.
- Server-authoritative: the client sends `{before|after|top|bottom}`, and the server computes the key inside the transaction, locking the neighbour rows (`SELECT … FOR UPDATE` on the list's open cards window) to avoid duplicate keys.
- Collision guard: a unique index on `(list_id, position)` for open cards. On violation, retry once with a jittered key.
- Key-length guard: if a key exceeds 50 chars, rebalance that list in one transaction and emit `list.reordered` with all positions.
- Archived items keep their key. On restore, a card returns to its old key if that position is free, otherwise it goes to the bottom.

### Concurrency
| Situation | Rule |
|---|---|
| Two users move the same card | Last write wins on `list_id`/`position`. Both see the final state via `seq`-ordered events. No 409 for moves (moves are not `If-Match` gated). |
| Two users edit the same scalar field (name, due) | `If-Match` version check → 409 with current value. The client shows "Updated by X — reload / overwrite". |
| Title editing | Saves on Enter or blur. `If-Match`. On 409 the client shows "changed by <name>" with both values. (Trello: silent last write wins, OBS O06.) |
| Description editing | Per-field version. While someone else edits, show their presence; when their save lands, show "<name> updated the description" at once (Trello shows nothing). When a 409 arrives while editing, the client shows a 3-way diff (base / theirs / mine) and lets the user pick. Later: CRDT (Yjs) collaborative editing. |
| Checklist toggles, label/member add-remove | Set semantics (idempotent add/remove), no conflict. |
| Card archived/deleted while another user has it open | Event updates the open modal (02 Conflict state); further edits get `404` or `409 archived`. |
| List archived while someone adds a card to it | Reject with `409 list_archived`. |
| Cross-board move while the target board is closed | Reject with `409 board_closed`. |

### Persistence and durability
- Every mutation is one Postgres transaction: row change + `activity` row (with `seq`) + notification fan-out rows. Realtime events publish **after commit** only.
- Optimistic UI: apply locally, roll back on error, retry idempotently (same `Idempotency-Key`) up to 3 times on network failure.
- Refresh behaviour: `GET /boards/:id` is the source of truth. The client cache is memory-only (no offline writes in MVP).
- Timestamps in UTC. Display in the user's timezone pref, falling back to the browser's (OBS O01: the timezone may be null).

### Attachments
| Requirement | Decision |
|---|---|
| Storage | Local filesystem volume by default (`/data/blobs/ab/cd/<sha256>`); S3-compatible backend optional (MinIO etc.). Content-addressed and deduplicated by SHA-256. |
| Size | Default 25 MB per file, configurable (Trello: 10 MB free / 250 MB paid per file, uploads only, not links: DOC-direct D30). Enforced while streaming (no full buffering); 413 when exceeded. |
| Types | All types allowed. Served with `Content-Disposition: attachment` except images/PDF previews; `X-Content-Type-Options: nosniff`. SVG never served inline. |
| Previews | Server generates thumbnails (≤400 px WebP) for images; covers use the thumbnail. |
| Links | `kind=link` attachments store the URL only, with no server-side fetch in MVP (avoids SSRF). |
| Scanning | Optional ClamAV sidecar; `scan_status` gates downloads when enabled (OBS: Trello exposes `isMalicious`). |
| Access | Download URLs go through the API with an auth check. No public blob URLs. Public boards (later) use signed, expiring URLs. |
| Deletion | Remove attachment row → decrement `ref_count` → a GC job deletes the blob when the count is 0 and the blob is older than 24 h (so backups taken in that window stay consistent). |
| Quotas | Per-instance storage usage shown in admin, optional per-workspace quota. |
| Access (Trello, DOC-direct D30) | Since 2023-12-01 Trello attachment URLs require board access (public boards excepted); deleting a card deletes its files; uploaded images automatically become the cover. Flowdeck already serves files only through authenticated, permission-checked routes (INF). |

### Why Flowdeck differs from Trello here (deliberate)

Trello's observed rule is per-field last write wins, with **no notice**, plus draft preservation. That loses work silently when two people edit the same description: the first saver's text is overwritten without either user being told. Flowdeck keeps Trello's good parts (drafts never overwritten, live updates of read-only views, moves converge without prompts) and adds three things:
1. a version check on title, description and due date;
2. an immediate notice when someone else saves the field you are editing;
3. the 3-way prompt on conflict.

Cost: one extra column per row and a small client merge dialog. See J07.9, J08.10, J08.11.
