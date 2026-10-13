# 00 · Coverage table

**Current as of session 5 (2026-10-12).** This table supersedes every earlier version. The old per-session summaries are kept at the end, marked as history.

## How to read it

**Trello status** (what we know about Trello):

| Code | Meaning |
|---|---|
| `OBS` | Observed directly in Trello with the test accounts. **2U** = observed with two different users. |
| `OBS-part` | Partly observed; the gap is named under *Uncertainty* |
| `PAID` | Seen in the UI behind Upgrade / Start free trial. Behaviour **not tested** (no trial was started) |
| `DOC` | Official documentation only (DOC-direct where fetched directly) |
| `API` | Trello's REST API reference only |
| `N/A` | Not applicable (Trello is SaaS) |

**Flowdeck basis** (where the Flowdeck rule comes from):

| Code | Meaning |
|---|---|
| `Parity` | Copy the observed behaviour (own wording and design) |
| `FD` | Flowdeck's own choice: it differs from Trello on purpose, or Trello's behaviour is unknown or paid |
| `HYP` | Rests on an inference about Trello's server that was not directly verified |

**Readiness:**

| Code | Meaning |
|---|---|
| `Ready` | Specified well enough to build |
| `Later` / `Out` | Deliberately not in the MVP |
| `Decision` | Needs the owner's answer (10 §Questions) |

**Evidence IDs:** see [evidence/sources.md](evidence/sources.md).
- `O05` = [E-session2-auth](evidence/E-session2-auth.md)
- `O06` = [E-session5](evidence/E-session5.md)
- `O04` = [E-session2](evidence/E-session2.md)
- `O03` = [E-trello-public](evidence/E-trello-public.md)

| # | Feature | Evidence | Trello status | Remaining uncertainty | Flowdeck basis | Readiness | Backend + DB |
|---|---|---|---|---|---|---|---|
| 1 | Sign-up / login | O05 §1, E-session2-auth §15, D19 | OBS (Atlassian flow: email → password → emailed code or "Security review") | — (Flowdeck uses local accounts) | FD | Ready | Yes |
| 2 | SSO (OIDC) | D19 | DOC | Provider list for the team | FD | Later | Yes |
| 3 | Two-step verification | D20, §15 | OBS-part (2SV/passkey offered at login) | — | FD | Later | Yes |
| 4 | Onboarding (default workspace) | O05 §1 | OBS | — | Parity | Ready | Yes |
| 5 | Profile and account settings | O05 §1, A01, D26 | OBS-part (account menu) | Settings pages not inspected in detail | FD | Ready | Yes |
| 6 | Workspaces (create, settings) | O05 §1, O06 §2 | OBS 2U | — | Parity (type optional) | Ready | Yes |
| 7 | Workspace roles (admin / member / guest) | O06 §5, D11 | OBS 2U (free: all admins; guests tab; remove dialog); **normal role PAID** | Normal workspace member's rights (paid) | FD (real roles, no plan gating) | Ready | Yes |
| 8 | Invitations (email, link) | O06 §2, D11 | OBS 2U (email/name invite works in a fresh workspace) | Invite-link expiry and revoke not exercised; one account pair fails silently (residual) | FD | Ready | Yes |
| 9 | Board create / copy | O05 §2, O06 §8 | OBS (create); OBS-part (copy dialog, not submitted) | Copy result | Parity | Ready | Yes |
| 10 | Board visibility (private / workspace / public) | O05, O06 §5–6 | OBS 2U | Public link edge cases | Parity (public: Later) | Ready | Yes |
| 11 | Board settings (comments, invites, self-join, covers…) | O05 §2, O06 §5 | OBS 2U (non-admin writes are silent no-ops) | — | Parity + FD (403, not silent 200) | Ready | Yes |
| 12 | Board navigation, starring, switcher | O06 §8 | OBS | — | Parity | Ready | Yes (stars) |
| 13 | Board templates | O06 §8, D18 | OBS-part (panel, gallery) | Board template tier (Upgrade badge in O05, none in O06); what a template copies | FD | Later | Yes |
| 14 | Close / reopen / delete board | O06 §8, O06 §5 | OBS (member close → 401) | — | Parity | Ready | Yes |
| 15 | Lists: create, rename, reorder | O05 §3 | OBS | Position renumbering when keys get close | FD (fractional keys) | Ready | Yes |
| 16 | Lists: move, copy, move all, archive all, sort | O06 §8 | OBS (move all, sort executed; copy/move dialogs) | — | Parity (sort: Later) | Ready | Yes |
| 17 | Lists: archive, restore, delete | O05 §6 | OBS (archive/restore); no delete button seen | — | FD (delete archived list, admin) | Ready | Yes |
| 18 | Cards: create, edit title | O05 §4, O06 §3 | OBS 2U (title saves on blur) | — | Parity + FD (inline length error) | Ready | Yes |
| 19 | Cards: reorder, move (list / board) | O05 §7, O06 §3 | OBS 2U (concurrent move converges) | Labels on cross-board move (bug vs docs) | FD (J07.4) | Ready | Yes |
| 20 | Cards: copy with keep options | O05 §5 | OBS | — | Parity | Ready | Yes |
| 21 | Cards: archive, restore, delete | O05 §6, O06 §5 | OBS 2U (members may delete others' archived cards) | — | Parity (configurable, Q8) | Ready | Yes |
| 22 | Card complete state | O05, O06 §7 | OBS 2U | — | Parity | Ready | Yes |
| 23 | Description (Markdown) | O05 §5, O06 §3 | OBS 2U (last write wins; draft kept; no warning) | — | FD (409 + 3-way merge; better than parity) | Ready | Yes |
| 24 | Labels | O05 §5, O06 §5 | OBS 2U | — | Parity | Ready | Yes |
| 25 | Card members | O06 §7 | OBS 2U | — | Parity | Ready | Yes |
| 26 | Start / due dates, badges | O05 §5, O06 §8 | OBS | — | Parity | Ready | Yes |
| 27 | Due reminders | O06 §8, D10 | OBS-part (option + "sent to members and watchers") | Delivery and timing | FD | Later | Yes |
| 28 | Recurring due dates | O06 §8, D10 | OBS-part (Recurring dropdown, default Never) | Options and rules | FD | Later | Yes |
| 29 | Checklists and items | O05 §5, O06 §7 | OBS; **item assignment PAID** (API 200, no effect) | Item due/assignee behaviour (paid) | Parity (assignee/due: Later) | Ready | Yes |
| 30 | Comments, mentions, edit/delete | O05 §5, O06 §5, §7 | OBS 2U (admins delete but cannot edit others' comments) | — | Parity | Ready | Yes |
| 31 | Emoji reactions | O06 §8 | OBS (free) | — | Parity | Later | Yes |
| 32 | Attachments (file, link) | O05 §5, O06 §7 | OBS 2U | — | FD limits | Ready | Yes (+ file store) |
| 33 | Covers (colour / image, size) | O05 §5, O06 §8 | OBS | — | Parity | Ready | Yes |
| 34 | Card and board activity | O05, O06 §8 | OBS | — | FD (also logs description/label changes) | Ready | Yes |
| 35 | Custom fields | O06 §8, D17 | **PAID** | Behaviour | FD | Later | Yes |
| 36 | Mirror cards | O06 §8, D13 | **PAID** ("link card" is the free alternative) | Sync semantics | FD | Out | Yes |
| 37 | Global search + operators | O05 §8, D05 | OBS | Ranking | FD subset | Ready | Yes |
| 38 | Board filter | O05 §8 | OBS | — | Parity | Ready | No (client) |
| 39 | Notifications (in-app) and watching | O05 §12, O06 §7 | OBS 2U (full trigger table) | Which board-watch events notify (list rename did not) | Parity + FD | Ready | Yes |
| 40 | Email notifications / digests | O05 §12 | OBS-part (settings; default Periodically) | Delivery | FD | Later | Yes (+ SMTP) |
| 41 | Keyboard shortcuts | O04 | OBS | — | FD set | Ready | No |
| 42 | Real-time updates | O06 §4 | OBS 2U (both directions 388–702 ms; reconnect catch-up 2.75 s; socket shapes) | Trello's replay mechanism | FD contract (06) | Ready | Yes |
| 43 | Concurrent edits | O06 §3 | OBS 2U (5 cases) | — | FD (better than parity) | Ready | Yes |
| 44 | Refresh / persistence | O05, O06 §4 | OBS 2U | — | Parity | Ready | Yes |
| 45 | Mobile layout and touch | O05 §13, O03 | OBS (layout); **touch drag unverified** | Real-phone long-press, drag, auto-scroll ([PHONE-CHECKLIST](PHONE-CHECKLIST.md)) | FD (J15) | Ready | No (client) |
| 46 | Offline editing | D27, O05 §10, O06 §4 | OBS (web: no offline queue) | — | FD | Out | Yes |
| 47 | Accessibility | O06 §9 | OBS (axe: 3 board + 1 dialog violations; keyboard open/close works) | Focus trap unverified | FD (WCAG 2.2 AA) | Ready | No (client) |
| 48 | Empty / loading / error states | O04, O05 §10, O06 §3 | OBS | — | FD (same 404 for missing and no access) | Ready | No (client) |
| 49 | Views: Table, Calendar | O06 §8, D08 | **PAID** | Behaviour | FD | Later | Yes |
| 50 | Views: Timeline, Dashboard, Map, Workspace views | O06 §8, D08 | **PAID** | — | FD | Out / Later | Yes |
| 51 | Inbox, Planner | O06 §8, D13 | OBS (free; Planner offers calendar connect) | Calendar sync | FD | Out | Yes |
| 52 | Automation (rules, buttons, scheduled, due commands) | O06 §8, §10, D07 | OBS-part (list-menu shortcuts; builder iframe blank, outside REA scope) | Trigger/action catalogue | FD | Later | Yes (+ worker) |
| 53 | Power-Ups / integrations | O06 §10, A01 | OBS-part (panel only) | — | FD | Out (webhooks: Later) | Yes |
| 54 | Webhooks | A01 | API | — | FD | Later | Yes |
| 55 | Export JSON | O06 §8, D09 | OBS (free; structure seen) | — | FD (full activity) | Ready | Yes |
| 56 | Export CSV, print, QR | O06 §8 | OBS (Print, QR free); **CSV PAID** | — | FD | Later | Yes |
| 57 | Import (Trello JSON → Flowdeck) | O06 §8, D09 | OBS (export structure) | Field-level mapping needs a full sample export | FD | Decision (Q6) | Yes |
| 58 | Plan limits (free: 10 collaborators etc.) | O05 §1, O06 §5 | OBS (guests count toward the cap) | — | FD (no plan gating) | Out | — |
| 59 | Object limits | D14, T04 | DOC | Per-card limits dated | FD (configurable) | Ready | Yes |
| 60 | Self-hosting, backup, restore, upgrade | — | N/A | — | FD (08) | Ready | Yes |
| 61 | Email-to-board | O06 §8 | OBS (free) | Inbound mail handling | FD | Later | Yes (+ inbound mail) |
| 62 | Stickers | O06 §8 | OBS (free, custom upload) | — | FD | Out | Yes |
| 63 | Card templates | O06 §8 | OBS (free) | — | Parity | Later | Yes |
| 64 | Join board / request access | O05 §11, O06 §5 | OBS 2U ("Join board" for workspace members; "Send request" for others) | — | Parity (request: Later) | Ready | Yes |
| 65 | Last-admin protection | O06 §5 | OBS 2U (demote blocked; **leaving is allowed**, so the board ends up adminless) | — | FD (block both) | Ready | Yes |

## Summary (session 5)

**What changed:** the membership blocker was resolved with a workspace created by Account 2 (FD Reverse WS). T3, T4 (two-way), T5 (member, admin, guest) and T8 (member triggers) now have **two-user** evidence, and paid features are marked. Five rows were added (61–65).

**Counts** (computed from the table above, 65 rows):
- **Trello status:** 57 observed (49 `OBS`, 8 `OBS-part`); 20 of the 57 were observed with two users (`2U`). 4 are paid-only (`PAID`: 35, 36, 49, 50) and 3 more have a paid part (7 normal workspace role, 29 item assignment, 56 CSV). 2 `DOC`, 1 `API`, 1 `N/A`.
- **Readiness:** 43 Ready · 14 Later · 1 Out/Later · 6 Out · 1 Decision (Q6).
- **Unverified Trello behaviour that matters for MVP parity:** real-phone touch drag (45); focus trap in the card dialog (47); Trello's replay mechanism after reconnect (42; Flowdeck defines its own). Everything else in the MVP is observed or is a deliberate Flowdeck choice.

## History (superseded; kept for traceability)

- **Session 4 (2026-10-12):** one recorded board-share invitation failed with an `isFreeToAdd` 409 and a no-op 200. **Superseded:** the 409 was later shown not to be the cause ([E-session5 §11](evidence/E-session5.md#11--corrections-to-earlier-evidence)).
- **Cross-user round (2026-10-11):** B as a logged-in public viewer: latency A→B, watcher notifications, read-only enforcement.
- **Session 2, authenticated (2026-10-11):** 29 rows gained OBS evidence from single-user work.
- **Session 2, first attempt and original pass (2026-10-11):** login stopped at email verification; the original pass had 0 observed rows (13 DOC+OBS via connector, 25 DOC, 6 API, 11 Partial, 4 Not inspected, 1 N/A). Those counts no longer apply.
