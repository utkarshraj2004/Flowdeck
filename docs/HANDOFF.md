# Implementation handoff

**Read this first when resuming Flowdeck development.** It records where the implementation stands, how to verify it, and what to do next. Last updated 2026-10-12 (session 2: GitHub Codespaces preview and ECC).

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

## Session 2: browser preview through GitHub Codespaces, and ECC

**Why:** Claude Code cloud sessions cannot expose a web preview, and the owner does not want to install Docker, Git or development tools locally. GitHub Codespaces is the browser-only way to open Flowdeck. Owner guide: [CODESPACES.md](CODESPACES.md).

**What was added:**
- `.devcontainer/`:
  - Compose stack: the Node 22 workspace image `mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm` plus `postgres:16-alpine` with no published port.
  - `postStartCommand` launches a background supervisor (`supervise.sh`). It runs `npm ci` and the build only when the lockfile or sources changed, waits for the database, then runs `node dist/server/index.js`, which applies migrations, and restarts the server if it exits. It is single-instance (`flock`) and never resets data.
  - The `flowdeck` helper command: `status`, `url`, `admin`, `reset-link`, `logs`, `restart [--rebuild]`, `stop`.
  - The preview URL `https://$CODESPACE_NAME-8080.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` becomes `FLOWDECK_BASE_URL`. That makes setup and invite links use it, sets the Secure cookie, and is accepted by the WebSocket origin check. If the variables are missing in lifecycle commands, `env.sh` reads only those two names from `/workspaces/.codespaces/shared/.env`.
  - All state is in the gitignored `.codespace-data/` (postgres, uploads, the generated DB password, logs). It survives stop/resume and rebuilds and is lost when the codespace is deleted.
- `server/src/index.ts`: the "no users yet" log line uses `FLOWDECK_ADMIN_HINT` when set, so it shows `flowdeck admin …` in Codespaces.

**Verified locally (in Claude Code Cloud, without a real codespace):**
- `devcontainer up` (`@devcontainers/cli` 0.89.0 under `dockerd`) returns within seconds while install and build continue in the background.
- With simulated Codespaces variables, behind a TLS proxy that emulates the forwarded `*.app.github.dev` origin, a Playwright/Chromium run passed:
  - the `flowdeck admin` link uses the preview origin, and setup works;
  - the cookie is `Secure; HttpOnly; SameSite=Lax`, and a reused setup link is rejected;
  - the invite link uses the preview origin, and a teammate signs up and joins;
  - the live update arrives over `wss://…/api/v1/ws` in under 100 ms;
  - anonymous API → 401, POST without CSRF → 403, no unexpected console errors.
- After stop/resume (`docker compose stop` + `devcontainer up`) and after a rebuild (`down` + `up`): both accounts log in, the data is intact, and live updates work.
- One supervisor only on a duplicate start; automatic restart after `kill -9`; `flowdeck stop`/`restart`/`restart --rebuild` work.
- `npm run check` passes.

**Not verifiable here (owner's first launch):** a real codespace's creation, its port forwarder and private-port GitHub sign-in, the real hostname's env vars, idle stop/resume by GitHub, and billing behaviour.

**Test the dev container in a cloud session:**
1. Start `dockerd`, then pull `mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm`, and pull `mirror.gcr.io/library/postgres:16-alpine` tagged as `postgres:16-alpine`.
2. Copy the repo into `<scratch>/ws/Flowdeck` and run `chown -R 1000:1000` on it.
3. Add the proxy CA only to the scratch copy's compose file (`NODE_EXTRA_CA_CERTS` plus a mount). npm in containers needs it here, but it must never be committed.
4. Run `npx @devcontainers/cli up --workspace-folder <scratch>/ws/Flowdeck`.

### ECC (Everything Claude Code)

- **Installed:** ECC 2.2.3 from https://github.com/affaan-m/ECC, through Claude Code's native plugin commands at **project scope**:

  ```
  claude plugin marketplace add https://github.com/affaan-m/ECC --scope project
  claude plugin install ecc@ecc --scope project
  ```

  This added `extraKnownMarketplaces.ecc` and `enabledPlugins["ecc@ecc"]` to `.claude/settings.json`. The existing SessionStart hook is kept. No manual `install.sh` was run, so hooks are not duplicated.
- **Plugin contents:** about 400 skills (including `ecc:docker-patterns`, `ecc:security-review`, `ecc:browser-qa`, `ecc:e2e-testing`, `ecc:frontend-a11y`, `ecc:verification-loop`, `ecc:deployment-patterns`), 71 agents (for example `ecc:typescript-reviewer`, `ecc:security-reviewer`, `ecc:a11y-architect`), plugin hooks on 8 events (standard profile; `hooks_enabled` and `hook_profile` are unset, so ECC's defaults apply), and one MCP definition (`chrome-devtools`, not auto-enabled).
- **Rules:** plugins can't ship rule packs, so `scripts/dev-setup.sh` copies ECC's `rules/common` and `rules/typescript` into `~/.claude/rules/ecc/` whenever the plugin cache exists. It only adds missing files.
- **Verified:** a fresh headless `claude -p` session in this repo listed 395 `ecc:` skills and the ECC agents. A session that was already running when ECC was installed only sees it after a restart.
- **After a cloud-session reset:** the new session reads `.claude/settings.json` and should offer or install `ecc@ecc` from the declared marketplace. Check with `claude plugin list` (expect `ecc@ecc … Status: √ enabled`). If ECC is missing, run the two commands above (or `/plugin marketplace add https://github.com/affaan-m/ECC` and `/plugin install ecc@ecc` inside Claude Code), then start a new session. Run `bash scripts/dev-setup.sh` to restore the rule packs.

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
| Owner's browser preview via GitHub Codespaces (private port, production build on one origin) | Cloud sessions have no preview; Codespaces needs nothing installed locally; private port + normal Flowdeck auth, no public tunnel |
| Codespace data in a bind-mounted `.codespace-data/` instead of Docker volumes | `/workspaces` is documented to survive rebuilds; volumes may not survive a full rebuild |

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

0. The owner launches a real codespace (docs/CODESPACES.md) and reports anything that differs from the local simulation.
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
