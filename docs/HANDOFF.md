# Implementation handoff

**Read this first when resuming Flowdeck development.** It records where the implementation stands, how to verify it, and what to do next. Last updated 2026-10-12 (first implementation session).

## Where things are

| Item | Value |
|---|---|
| Implementation branch | `claude/hopeful-galileo-us9nkk` (`git log -1` shows the head) |
| Implementation PR | https://github.com/utkarshraj2004/Flowdeck/pull/4 (draft; base `claude/trello-investigation-resume-kxgrvd`) |
| Based on | Research branch `claude/trello-investigation-resume-kxgrvd` at `6f5f60e` (PR #3), which is based on PR #2's branch `claude/great-ride-udwvvd` |
| Research PRs | #3 and #2 are **open and unmerged** (draft). Do not merge them without the owner's approval |
| Merge order, when approved | PR #3 → `claude/great-ride-udwvvd`, PR #2 → `main`, then retarget the implementation PR to `main` (its diff will then show only the application) |
| Version | 0.1.0, unreleased; no tags, no public instance |

## State at the end of session 1

- **Everything in the first-version scope works end to end.** Gaps are listed in [IMPLEMENTATION-CHECKLIST.md](IMPLEMENTATION-CHECKLIST.md); the main partial items are:
  - touch drag on physical phones;
  - 10 label colours instead of 30;
  - checklist item reordering in the UI;
  - shortcut set;
  - the HTTPS profile, which has not been exercised.
- **Tests:**
  - 18 unit + 46 API/realtime tests (Vitest) pass;
  - 16 Playwright browser tests (desktop, phone, tablet touch, axe) pass;
  - the Docker Compose smoke test passes (build, restart, backup, wipe, restore, identical export and file bytes).
  - All pass locally in Claude Code Cloud and in GitHub Actions on PR #4. The first CI run caught one intermittent focus bug in the card dialog; it is fixed, and a regression test was added.
- `npm audit`: 0 known vulnerabilities (vitest and concurrently were updated during the session).
- **Bugs found by the tests and fixed this session:**
  - login rate-limit key;
  - `is:archived` search;
  - half-open WebSocket not detected;
  - filter checkbox flicker under router transitions;
  - list drag collision;
  - phone auto-scroll never stopping;
  - avatar contrast;
  - unlabeled selects;
  - composer race on Esc;
  - focus escaping the card dialog while it loads;
  - tokens in request logs.

## Decisions made (and why)

| Decision | Reason |
|---|---|
| TypeScript monorepo: Node 22 + Fastify + PostgreSQL + React/Vite | The research default (Q1); one language; maintained libraries |
| Single process, in-process pub/sub | Research Q2 target (≤50 users) does not need a broker |
| Field "base" checks instead of one row version | No false conflicts from label or checklist changes; explicit prompts for text (research 07) |
| No email at all in v1 | Research Q5 default: invite links are shared by hand; resets come from admins |
| Invite sign-up does **not** create a personal workspace | Teams join the inviting workspace; avoids clutter. The first admin still gets a default workspace (J01.2) |
| Members may delete archived cards and lists | Research Q8 default |
| Workspace viewers are read-only until they join (self-join on by default) | Research Q10, implemented via the existing "Join board" flow |
| Deleting a closed board needs the typed name | Research Q12 |
| Last admin cannot leave | Research 04 invariant 1 (deliberately unlike the reference product) |
| Static site and GitHub Pages deploy removed | Flowdeck needs a server; Pages cannot host it |

## How to resume in a new session

1. `git fetch origin && git checkout claude/hopeful-galileo-us9nkk && git pull`. If the PR was merged, start a new branch from `main`.
2. The SessionStart hook runs `scripts/dev-setup.sh`. If tests can't connect to PostgreSQL, run it manually.
3. Verify: `npm run check`. It needs Chromium at `/opt/pw-browsers/chromium` or `CHROMIUM_PATH`.
4. For deployment checks in Claude Code Cloud:
   - start Docker with `dockerd > /tmp/dockerd.log 2>&1 &`;
   - pull `mirror.gcr.io/library/postgres:16-alpine` and `mirror.gcr.io/library/node:22-bookworm-slim`, and `docker tag` them as `postgres:16-alpine` / `node:22-bookworm-slim` (Docker Hub is rate-limited there);
   - run `EXTRA_CA_CERT=/root/.ccr/ca-bundle.crt node scripts/compose-smoke.mjs`.
5. Check the implementation PR's CI and review comments before new work.

## Suggested next steps (in order)

1. Get CI green on the PR, and fix anything that only fails on GitHub runners.
2. The owner runs [research/PHONE-CHECKLIST.md](../research/PHONE-CHECKLIST.md)-style checks on a real phone against a Flowdeck instance (long-press, drag between lists, auto-scroll, cancel).
3. Small gaps:
   - checklist item drag in the UI;
   - remaining shortcuts (`e`, `d`, `l`, `m`, `t`);
   - list collapse;
   - more label colours;
   - session list in account settings;
   - configurable limits.
4. Operations:
   - scheduled backups and their status in the admin page;
   - load test (O4: 5,000 cards, 30 clients);
   - Firefox/WebKit in CI;
   - exercise the HTTPS profile.
5. Roadmap items in the README (SMTP, templates, views, 2FA/SSO). Trello import only if the owner asks.

## Open questions for the owner

- **License:** none exists. The owner must choose one, or confirm that the code stays proprietary. Nothing was added.
- **Repository metadata:** description and topics could not be set from this session (see the PR description for the exact text).
- Hosting target (LAN, VPN or internet) decides whether the HTTPS profile is required (research Q3).

## Environment notes (names only, never values)

- No secrets are needed for development or tests. Tests create synthetic users in throwaway databases (`flowdeck_test_*`, `flowdeck_e2e`).
- The research session's `TRELLO_TEST*` variables are **not used** by Flowdeck and must not be used for it.
