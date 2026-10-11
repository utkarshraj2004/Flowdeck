# 00 · Coverage table

**Status:** `DOC` = covered by official docs (second-hand) · `DOC+OBS` = docs plus connector observation · `API` = API reference only · `Partial` = docs incomplete or conflicting · `Not inspected` = no usable evidence.

**Readiness:** `Ready` = spec complete enough to build · `Ready (FD)` = buildable from Flowdeck's own decisions; Trello parity unverified · `Decision` = needs an answer from you (10 §Questions) · `Later` / `Out` = deliberately not in MVP.

**Backend + DB:** whether the self-hosted multi-user version needs server-side state for this feature. Every shared feature does, so for a multi-user tool almost everything is **Yes**.

| # | Feature | Evidence | Status | Remaining uncertainty | Readiness | Backend + DB |
|---|---|---|---|---|---|---|
| 1 | Sign-up / login (email + password) | D19, INF | DOC | Trello UI flow not observed; Flowdeck uses local accounts | Ready (FD) | Yes |
| 2 | SSO (OIDC) | D19 | DOC | Provider list for your team | Later | Yes |
| 3 | Two-step verification | D20 | DOC | — | Later | Yes |
| 4 | Onboarding (default workspace) | O01 | DOC+OBS | Trello onboarding screens not seen | Ready (FD) | Yes |
| 5 | Profile and account settings | A01, D04, D26 | API | Settings layout | Ready | Yes |
| 6 | Workspaces (create, settings) | A01, O01, O05 | OBS | — | Ready | Yes |
| 7 | Workspace roles (admin / member / guest) | D01, D02, D11 | DOC-direct | Normal member's rights on workspace-visible boards not joined | Ready (FD) | Yes |
| 8 | Invitations (email, link, revoke) | D11 | DOC | Link expiry behaviour; who can invite on paid plans | Ready (FD) | Yes |
| 9 | Board create / copy | A01, O01, O03, O05 | OBS (create) | Copy-board dialog not opened | Ready | Yes |
| 10 | Board visibility (private / workspace / public) | O01, A01, O05 | OBS | Public-board link behaviour | Ready (public: Later) | Yes |
| 11 | Board settings (comments, invites, self-join, covers, counts, voting) | O01, A01, O05 | OBS | — | Ready | Yes |
| 12 | Board navigation, starring, switcher | D04, A01, O03 *(+O03)* | DOC | UI not observed | Ready (FD) | Yes (stars) |
| 13 | Board templates | D18, O01, T07 | DOC | What templates copy | Later | Yes |
| 14 | Close / reopen / delete board | D21 | DOC | Reopen permission edge | Ready | Yes |
| 15 | Lists: create, rename, reorder | A01, O01, O05 | OBS | Renumbering when keys get close | Ready | Yes |
| 16 | Lists: move to board, copy, move-all / archive-all cards | A01, D24 | DOC | — | Ready | Yes |
| 17 | Lists: archive, restore, delete | D03, O05 | OBS (archive/restore) | Delete button not shown in the UI observed | Restore position rule | Ready | Yes |
| 18 | Cards: create, edit title | A01, O05 | OBS | — | Ready | Yes |
| 19 | Cards: reorder, move (list / board) | A01, D24, T05, O05 | OBS (within board) | Label behaviour on cross-board move (bug vs docs) | Ready (FD rule J07.4) | Yes |
| 20 | Cards: copy with keep-options | D25, A01, O05 | OBS | — | Ready | Yes |
| 21 | Cards: archive, restore, delete | D29, O05 | OBS | — | Ready | Yes |
| 22 | Card complete state | D10, O01, O05 | DOC+OBS | — | Ready | Yes |
| 23 | Description (Markdown) | A01, O05 | OBS (WYSIWYG, stored Markdown) | Exact dialect edge cases | Ready (FD: CommonMark + GFM) | Yes |
| 24 | Labels (30 colours + none, colour-blind patterns) | D26, O05 | OBS | Pattern artwork (Flowdeck draws its own) | Ready | Yes |
| 25 | Card members | D24, A01, O05 | OBS (self only) | Assigning another user (blocked) | Ready | Yes |
| 26 | Start / due dates, badge states | D10, O05 | OBS | — (5 badge states documented) | Ready | Yes |
| 27 | Due reminders | D10 | DOC | Needs email/notification worker | Later | Yes |
| 28 | Recurring due dates | D10, O01 | Partial | Rules and limits | Later | Yes |
| 29 | Checklists and items | A01, O05 | OBS | Item assignee/due UI | Ready (assignee/due: Later) | Yes |
| 30 | Comments, mentions, edit/delete | D22, O05 | OBS (own comments) | Mentions of another user (blocked) | Ready | Yes |
| 31 | Emoji reactions | D23 | DOC | Emoji set | Later | Yes |
| 32 | Attachments (file, link) | A01, D30, O05 | OBS | — | Ready (FD limits) | Yes (+ file store) |
| 33 | Covers (colour / image) | A01, O05 | OBS | Full-size cover not set | Ready (FD) | Yes |
| 34 | Card and board activity | O01, D22, O05 | OBS | — | Ready | Yes |
| 35 | Custom fields | D17, O01 | DOC+OBS | Plan tier (irrelevant) | Later | Yes |
| 36 | Mirror cards | D13 | DOC | Sync semantics | Out | Yes |
| 37 | Global search + operators | D05, O05 | OBS | Doc inconsistency (`has:member`); ranking | Ready (FD subset) | Yes |
| 38 | Board filter | D04, O03, O05 | OBS | Filter UI options | Ready (FD) | No (client-side over loaded board) |
| 39 | Notifications (in-app) and watching | D12, O05 | Partial (OBS drawer + join request) | Trigger list documented; UI not observed | Ready | Yes |
| 40 | Email notifications / digests | D12, O05 | OBS (settings) | — (default Periodically) | Later | Yes (+ SMTP) |
| 41 | Keyboard shortcuts | D04, O04 | OBS | — (full list observed) | Ready (FD set) | No |
| 42 | Real-time updates | D16, D28, T06, O03, O04, O05 | Partial (OBS same-user fan-out) | Two-user latency; payload semantics (not inspected) | Ready (FD contract, 06) | Yes |
| 43 | Concurrent edits | O05 | Partial (OBS same user, last-write-wins) | Two different users | Ready (FD rules, 07) | Yes |
| 44 | Refresh / persistence | D16, O04, O05 | OBS | — | Ready (FD) | Yes |
| 45 | Mobile layout and touch | O03, O05 | Partial (OBS layout; touch drag not reproducible) | All Trello mobile UI | Ready (FD, J15) | No (client) |
| 46 | Offline mobile editing | D27 | Partial (2016-17) | Current status | Out | Yes |
| 47 | Accessibility | — | Not inspected | No Trello conformance statement found | Ready (FD WCAG 2.2 AA) | No (client) |
| 48 | Empty / loading / error states | O04, O05 | OBS | — | Ready (FD, 02) | No (client) |
| 49 | Views: Table, Calendar | D08, O03 *(+O03)* | DOC | Behaviour details | Later | Yes |
| 50 | Views: Timeline, Dashboard, Map, Workspace views | D08, O03 *(+O03)* | DOC | — | Out / Later | Yes |
| 51 | Inbox, Planner | D13 | DOC | — | Out | Yes |
| 52 | Automation (rules, buttons, scheduled, due commands) | D07, T07 | DOC | Trigger/action catalogue | Later | Yes (+ worker) |
| 53 | Power-Ups / integrations | A01, D07 | API | — | Out (webhooks: Later) | Yes |
| 54 | Webhooks | A01 | API | — | Later | Yes |
| 55 | Export JSON | D09 | DOC | Exact schema (not needed) | Ready | Yes |
| 56 | Export CSV, print | D09 | Partial | Print not documented | Later | Yes |
| 57 | Import (Trello JSON → Flowdeck) | D09 | DOC (Trello itself can't import) | Trello export schema (needs a sample export) | Decision (Q6) | Yes |
| 58 | Plan-specific limits (free 10 boards / 10 collaborators etc.) | D06, T03 | DOC | — | Out (no plan gating) | — |
| 59 | Object limits (cards/lists/labels per board) | D14, D15, T04 | Partial | Per-card limits dated | Ready (configurable) | Yes |
| 60 | Self-hosting, backup, restore, upgrade | — (Trello is SaaS) | N/A | — | Ready (FD, 08) | Yes |

## Summary

**Session 2, authenticated ([E-session2-auth](evidence/E-session2-auth.md)):** with the test accounts logged in, **29 rows gained observed (OBS) evidence** (6, 9, 10, 11, 15, 17–26, 29, 30, 32–34, 37–40, 42–45, 48). The main remaining gaps are multi-user: roles and permissions for a second user (7, 8, 25, 30 mentions), cross-user real-time and conflicts (42, 43), and touch drag (45). These are blocked because Trello silently refused every way of adding User B. Readiness is unchanged: every MVP row was already buildable from Flowdeck decisions; parity details are now much firmer.


**Session 2 (2026-10-11, [E-session2](evidence/E-session2.md)):** both test-account logins stopped at Atlassian's emailed verification code, so **no authenticated behaviour was observed**. Rows changed this session: 7, 17, 21, 26, 32, 39, 40, 41, 42, 44, 48. New evidence: full shortcut list (OBS), logged-out loading/offline/not-found states (OBS), the two client WebSockets and their reconnect timing (OBS), and eleven official pages read directly (DOC-direct). The original-pass counts below are kept for traceability. Session 2 alone: **1 feature fully observed** (41), **3 partially observed** (42, 44, 48), **7 upgraded to DOC-direct** (7, 17, 21, 26, 32, 39, plus 40 still Partial). Readiness counts are unchanged; no row moved to or from Ready.


Counts computed from the table above:

- **60 features** inventoried. **0** observed in the Trello UI. Update: Trello now loads; logged-out UI for boards, lists, card fronts, card dialog, filter, board menu, views and phone layout is observed (O03, [E-trello-public](evidence/E-trello-public.md)). Rows below marked *(+O03)* gained observed evidence; status counts below are from the original pass.
- **Evidence status:** 13 DOC+OBS (cross-checked through the connector) · 25 DOC · 6 API only · 11 Partial (incomplete or conflicting docs) · 4 Not inspected · 1 N/A (self-hosting; Trello is SaaS).
- **Readiness:** 41 Ready (19 Ready, 19 Ready (FD), 3 Ready with a later sub-part) · 13 Later (incl. 1 Out/Later) · 5 Out · 1 needs a decision (Q6, import).
- **Backend and database:** 54 Yes · 5 No (board filter, keyboard shortcuts, mobile layout, accessibility, UI states; still served by the app) · 1 n/a (plan limits).
