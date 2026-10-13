# Implementation handoff

**Read this first when resuming Flowdeck development.** It records where the implementation stands, how to verify it, and what to do next. Last updated 2026-10-13 (session 4: remaining features, fixes, and consolidation into `main`).

## Where things are

| Item | Value |
|---|---|
| Main branch | `main` holds everything: the research (PRs #2 and #3), the implementation (#4), the interface upgrade (#5) and the session 4 work. They were merged in that order with merge commits; `git log --first-parent main` shows the merges |
| Old branches | `claude/great-ride-udwvvd`, `claude/trello-investigation-resume-kxgrvd`, `claude/hopeful-galileo-us9nkk`, `claude/flowdeck-ui-upgrade` are fully contained in `main`. They were kept (not deleted) |
| Version | 0.1.0 with unreleased additions (CHANGELOG `[Unreleased]`); no tags, no public instance |
| New work | Branch from `main` and open a PR against `main` |

## State at the end of session 1

- **Everything in the first-version scope works end to end.** Gaps are listed in [IMPLEMENTATION-CHECKLIST.md](IMPLEMENTATION-CHECKLIST.md); the main partial items are:
  - touch drag on physical phones;
  - 10 label colours instead of 30;
  - checklist item reordering in the UI;
  - shortcut set;
  - the HTTPS profile, which has not been exercised.
- **Tests:**
  - 21 unit + 46 API/realtime tests (Vitest) pass;
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

**Two parallel implementations were merged.** An earlier push from another session (`673fc7f`) used fixed database credentials, named volumes, and `setup.sh`/`start.sh`/`create-admin.sh` helpers. Its `.devcontainer/` was replaced by the version below, which generates the database password, keeps data under `/workspaces`, and supervises the server. Its stricter WebSocket origin check (`originAllowed` in `server/src/routes/ws.ts`, with `tests/unit/ws-origin.test.ts`) and `FLOWDECK_TRUST_PROXY=true` inside the codespace were kept. A codespace created from `673fc7f` keeps its data in its own named volumes, which this setup does not read; create a fresh codespace.

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

## Session 3: interface and workflow upgrade (branch `claude/flowdeck-ui-upgrade`)

**Branch and PR:**
- Branch `claude/flowdeck-ui-upgrade` was created from `854f7ed` (the head of the implementation PR).
- Its PR targets `claude/hopeful-galileo-us9nkk`, so the implementation PR stays as it is and the upgrade can be reviewed and previewed separately.

**Where to look:**
- Audit and status: [UPGRADE-GAPS.md](UPGRADE-GAPS.md).
- Measurements: [perf/RESULTS.md](perf/RESULTS.md).
- Before screenshots: `docs/screenshots/before/`.

**What changed:**
- Shared UI building blocks:
  - `web/src/components/Popover.tsx`: anchored popover, `MenuItems`, and a layer stack, so Escape and outside clicks reach only the innermost layer. `hasOpenLayer()` mutes page shortcuts.
  - `web/src/board/pickers.tsx`: labels, members, dates, move/copy, cover, attachment and checklist popovers, used by both the card dialog and the quick editor.
- Board files:
  - `CardTile.tsx`: card front and quick editor.
  - `ListColumn.tsx`: list, menu, sort, template picker.
  - `CardModal.tsx`: two-column dialog, checklist reorder and convert.
  - `BoardPage.tsx`: split contexts (`BoardActionsContext` is stable; `BoardContext` changes on every event), memoised columns, shortcuts.
- Server:
  - Migration `0002_label_order_templates.sql`.
  - `POST /lists/:id/sort`, `POST /check-items/:id/convert`.
  - `isTemplate` on cards and boards, `watchedCardIds` in the snapshot.
  - Muted notification kinds (`prefs.mutedNotifications`).
  - `@fastify/compress`.
- Shell, home and account were built by a specialist agent in its own worktree, then merged (`b709314`).

**Verification:**
- `npm run check`: typecheck, 77 unit/API tests, build, 21 browser tests including axe on the new popovers.
- The compose drill (`scripts/compose-smoke.mjs`) passed.
- The new build was run against a database and upload directory written by `854f7ed`: migration 0002 applied, and data, files and URLs were identical.

**Reviews:**
- Two read-only review agents ran: server security/correctness and client React/accessibility.
- Their traced findings were fixed in `2aee7b4`.
- Left open on purpose:
  - sorting a 5,000-card list holds the board lock for its duration;
  - the size of the sort event.

**ECC:**
- Plugin `ecc@ecc` 2.2.3 at project scope, already declared in `.claude/settings.json`.
- After the session reset it was missing from the local plugin cache and was reinstalled with the documented marketplace install. Project settings and hooks were left unchanged.
- How its capabilities were used in this session:
  - The ECC TypeScript rules (`~/.claude/rules/ecc`) guided the code style.
  - The "specialist agent" pattern was applied by giving three agents strict file or read-only ownership (shell UI, server review, client review).
  - No ECC slash commands or hooks were run.

**Open items:**
- Opening a card on a 1,200-card board is about 120 ms slower than before (native layout of the bigger dialog).
- Unread marker on watched card fronts (gap 22).
- Views, automation, webhooks and email (gaps 23–27): acceptance criteria only.
- Real-phone checks: everything mobile was verified with emulation only.

## Session 4: remaining features, fixes, consolidation

**Built (all with tests):**
- **Card-open regression fixed.** A trace and a render count showed that opening or closing a card re-rendered all 12 lists and all 1,200 sortable cards. The dnd-kit sensor options and the `SortableContext` item arrays were new on every render. Hoisting and memoising them fixed it. Large board: 507 → about 290 ms on the same machine, back to back (`docs/perf/RESULTS.md`).
- **Unread markers** (gap 22): built from the user's unread notifications (`unreadCardIds` in the snapshot); live through `notification` and `notifications.unread {cards}`; opening a card reads its notifications. Passed per card, so a new notification re-renders only that card.
- **Table and calendar views** (`web/src/board/views.tsx`, `?view=table|calendar`).
- **Automation** (`server/src/lib/automation.ts`), **webhooks** (`lib/webhooks.ts`), **optional SMTP email** (`lib/mail.ts`) and the **background worker** (`lib/worker.ts`); migration `0003` (additive).
- **v1 audit:**
  - Configurable object limits (`FLOWDECK_LIMIT_*`).
  - Signed-in devices in Account.
  - **Defect fixed:** a WebSocket outlived its session (it kept receiving events after logout, password change or a disabled account); sessions are now re-checked on each heartbeat.
- **Codespaces:** the "waiting for the database" hang. The cause could not be confirmed in the owner's codespace; the reproduced causes were these:
  - the supervisor hid every database error;
  - a lost password file locked the app out forever;
  - a mode-700 `.codespace-data` crash-looped PostgreSQL.

  New `.devcontainer/db-entrypoint.sh` repairs these without touching data, and `flowdeck status` prints the reason and the database log. **An existing codespace needs "Codespaces: Rebuild Container" to pick this up.**

**Verified here:** see the PR description and CHANGELOG for test counts. Email and webhooks are tested only against local sinks (`tests/api/sinks.ts`), never real recipients.

**Not verifiable here:** a real GitHub Codespace (including the owner's "crispy space happiness" and "shiny invention"), real phones, real SMTP providers.

**ECC:**
- Plugin `ecc@ecc` 2.2.3, project scope; `claude plugin list` shows it enabled.
- What was used:
  - its TypeScript and common rules;
  - its hooks (the GateGuard fact-forcing prompts and a hook that blocks bypassing git hooks);
  - the specialist-agent pattern: one agent in its own worktree diagnosed Codespaces and was limited to `.devcontainer/` and `docs/CODESPACES.md`.
- No ECC slash commands were run.

## Decisions made (and why)

| Decision | Reason |
|---|---|
| TypeScript monorepo: Node 22 + Fastify + PostgreSQL + React/Vite | The research default (Q1); one language; maintained libraries |
| Single process, in-process pub/sub | Research Q2 target (≤50 users) does not need a broker |
| Field "base" checks instead of one row version | No false conflicts from label or checklist changes; explicit prompts for text (research 07) |
| Email is optional (SMTP the operator configures), off by default | Research Q5: invite links are shared by hand and resets come from admins; with SMTP, emails are an addition, never a requirement |
| Invite sign-up does **not** create a personal workspace | Teams join the inviting workspace; avoids clutter. The first admin still gets a default workspace (J01.2) |
| Members may delete archived cards and lists | Research Q8 default |
| Workspace viewers are read-only until they join (self-join on by default) | Research Q10, implemented via the existing "Join board" flow |
| Deleting a closed board needs the typed name | Research Q12 |
| Last admin cannot leave | Research 04 invariant 1 (deliberately unlike the reference product) |
| Static site and GitHub Pages deploy removed | Flowdeck needs a server; Pages cannot host it |
| Owner's browser preview via GitHub Codespaces (private port, production build on one origin) | Cloud sessions have no preview; Codespaces needs nothing installed locally; private port + normal Flowdeck auth, no public tunnel |
| Codespace data in a bind-mounted `.codespace-data/` instead of Docker volumes | `/workspaces` is documented to survive rebuilds; volumes may not survive a full rebuild |

## How to resume in a new session

1. `git fetch origin && git checkout main && git pull`, then create a branch for new work.
2. The SessionStart hook runs `scripts/dev-setup.sh`. If tests can't connect to PostgreSQL, run it manually.
3. Verify: `npm run check`. It needs Chromium at `/opt/pw-browsers/chromium` or `CHROMIUM_PATH`.
4. For deployment checks in Claude Code Cloud:
   - start Docker with `dockerd > /tmp/dockerd.log 2>&1 &`;
   - pull `mirror.gcr.io/library/postgres:16-alpine` and `mirror.gcr.io/library/node:22-bookworm-slim`, and `docker tag` them as `postgres:16-alpine` / `node:22-bookworm-slim` (Docker Hub is rate-limited there);
   - run `EXTRA_CA_CERT=/root/.ccr/ca-bundle.crt node scripts/compose-smoke.mjs`.
5. Check CI on `main` and any open PR before new work.

## Suggested next steps (in order)

1. The owner rebuilds or creates a codespace from `main` (docs/CODESPACES.md) and reports what `flowdeck status` shows.
2. The owner runs [research/PHONE-CHECKLIST.md](../research/PHONE-CHECKLIST.md)-style checks on a real phone (long-press, drag between lists, auto-scroll, cancel). This is the only open first-version item.
3. Operations: scheduled backups and their status in the admin page; load test (O4: 5,000 cards, 30 clients); Firefox/WebKit in CI; exercise the HTTPS profile.
4. Roadmap (README → Roadmap): due reminders and recurring dates (worker and SMTP exist now), custom fields, automation buttons and scheduled rules, 2FA/SSO. Trello import only if the owner asks.

## Open questions for the owner

- **License:** none exists. The owner must choose one, or confirm that the code stays proprietary. Nothing was added.
- **Repository metadata:** description and topics could not be set from this session (see the PR description for the exact text).
- Hosting target (LAN, VPN or internet) decides whether the HTTPS profile is required (research Q3).

## Environment notes (names only, never values)

- No secrets are needed for development or tests. Tests create synthetic users in throwaway databases (`flowdeck_test_*`, `flowdeck_e2e`).
- The research session's `TRELLO_TEST*` variables are **not used** by Flowdeck and must not be used for it.
