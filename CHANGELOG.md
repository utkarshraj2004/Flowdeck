# Changelog

All notable changes to Flowdeck are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
