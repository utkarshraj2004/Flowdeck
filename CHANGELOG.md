# Changelog

All notable changes to Flowdeck are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added — interface and workflow upgrade (session 3)
- Board interface:
  - Card fronts with thin label bars (names with `;`), a completion circle, a quick-edit button and icon badges.
  - Compact list headers with collapse; a sectioned list menu with Sort by.
  - Anchored popovers for labels, members, dates, move/copy, cover and menus. They are keyboard operable, and Escape closes only the innermost layer.
- Card dialog in two columns: list chip (move), completion toggle, action chips, Add menu, card actions menu, links and files listed separately, comments and activity on the right. A single column with a sticky bar on phones.
- 30 label and cover colours (subtle, normal and bold of 10 hues); the original 10 are unchanged.
- Quick edit on the card front, and shortcuts `e l m d t - s z ; < >`.
- Templates:
  - Card templates (“Make template”, “Create from template”).
  - Board templates (Settings → “Use this board as a template”, offered in Create board).
- Checklists: reorder by drag or keyboard; convert an item to a card.
- Notifications:
  - Per-kind settings in Account; access changes are always delivered.
  - Mark one notification read or unread; a drawer with “Only show unread”.
- Top bar Create menu (board, workspace), live search suggestions, help button, recently viewed boards and templates on Home.
- Undo toast after moving a card to another list; an error boundary with recovery instead of a blank page.
- `scripts/perf/bench.mjs`, a reproducible benchmark of a production build. Results are in `docs/perf/RESULTS.md`.

### Changed
- Performance:
  - Server events re-render only the changed lists and cards.
  - Filter typing is deferred.
  - The card dialog refreshes once per change instead of twice.
  - Brotli/gzip compression: the board snapshot is 537 KB → 45 KB on a 1,200-card board.
  - Code splitting: first-render JS is 178 → 101 KB gzip.
- Database migration `0002` (additive):
  - `labels.position`, so labels keep a stable order (it was effectively random for the default labels);
  - `cards.is_template` and `boards.is_template`.
  - Verified against a database written by the previous build: all data, files and URLs are unchanged.
- Icons: Lucide (ISC), bundled per icon.

### Fixed
- Lists:
  - The list sort, “Archive all cards” and “Move all cards” routes re-check the list's board under the lock, so a concurrent move can't make them act on another board.
  - Converting an item re-checks the card's board the same way.
- Dialogs return focus to their opener even when a field inside autofocuses.
- Keyboard:
  - A keyboard card move can't freeze the board; Tab leaves it and cancels.
  - Board shortcuts work while a card has focus and stay quiet while a popover or dialog is open.

### Added — browser-only preview
- GitHub Codespaces dev container (`.devcontainer/`, guide in `docs/CODESPACES.md`): Node.js 22 + PostgreSQL 16, background install/build/start that survives resume and rebuild, private forwarded port on one origin, generated database password, and a `flowdeck` helper (`status`, `admin`, `reset-link`, `logs`, `restart`, `stop`).
- Development: the ECC Claude Code plugin is enabled at project scope; `scripts/dev-setup.sh` adds its common and TypeScript rules.

### Added — first working version (0.1.0, not yet released)
- Self-hosted application: Node.js 22 + Fastify 5 server, PostgreSQL 16, React 19 web client, Docker Compose deployment.
- Accounts: first administrator via a one-time CLI setup link, login and logout, password change, admin-issued reset links, user disable, administration page.
- Workspaces with admin and member roles, reusable and email-bound invitation links, sign-up through an invitation, member removal (keep boards as guest or not), last-admin protection.
- Boards with private/workspace visibility, backgrounds, stars, settings, copy, close/reopen/delete, JSON export. Board roles: admin, member, observer, guest and workspace viewer, with self-join.
- Lists and cards with persistent fractional ordering, drag and drop (mouse, touch long-press), keyboard moves, Move/Copy dialogs, cross-board moves with label mapping, archive/restore/delete.
- Card details: Markdown description, labels, members, start/due dates with badges, completion, checklists, comments with @mentions, file and link attachments, colour/image covers, activity.
- Real-time collaboration over WebSocket with gap-free per-board sequence numbers, reconnect replay, polling fallback, half-open connection detection, editing presence, explicit conflict prompts and unsaved-change protection.
- In-app notifications and watching, board filters (saved in the URL), global search with operators, keyboard shortcuts, responsive phone layout, accessibility work (axe-clean key screens).
- Operations: automatic migrations with downgrade refusal, health endpoints, backup/restore scripts, optional Caddy HTTPS profile, compose smoke test.
- Tests: 21 unit, 46 API/realtime, 16 browser tests and a deployment smoke test; GitHub Actions CI.
- Documentation: README, architecture, operations, implementation checklist, handoff, dependency notices, contributing and security policy.

### Changed
- WebSocket origin check also accepts the host reported by a trusted reverse proxy (`X-Forwarded-Host`, only with `FLOWDECK_TRUST_PROXY=true`), as used by the Codespaces port forwarder.
- Replaced the static-site placeholder (`site/`, page validation scripts and the manual GitHub Pages deploy workflow) with the application. GitHub Pages is not used for Flowdeck.

### Fixed
- Keyboard focus could escape the card dialog on the first Tab while the card was loading (found by CI; regression test added).

### Security
- Setup, reset and invite tokens are redacted from request logs.
