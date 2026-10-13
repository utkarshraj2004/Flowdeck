# Try Flowdeck in your browser with GitHub Codespaces

This guide runs Flowdeck in a **GitHub Codespace**: a temporary development machine that GitHub hosts and that you use entirely in your web browser. You don't need to install Docker, Git, Node.js or anything else on your computer.

> **A development preview, not team hosting.** The codespace's address is private to your GitHub account, the codespace stops when you are idle, and GitHub deletes stopped codespaces after a retention period. Use it to try Flowdeck and to develop it. To run Flowdeck for a team, host it permanently on a server ([README → Run Flowdeck on your server](../README.md#run-flowdeck-on-your-server)).

## What it costs

GitHub Codespaces is billed by **GitHub**, to the account that owns the codespace. It is **separate from Claude and Claude credits**: running Flowdeck in a codespace uses neither.

Personal GitHub accounts include a monthly amount of free Codespaces usage, measured in core-hours and storage. This setup asks for the smallest machine (2 cores). The current allowance, prices and your spending limit are under **GitHub → Settings → Billing and licensing**; see also [GitHub's Codespaces billing documentation](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces). Personal accounts start with a spending limit of $0. With that limit, Codespaces stops working when the free allowance is used up; GitHub does not charge you.

Stop or delete codespaces you are not using. A stopped codespace uses no compute time, but its storage still counts towards the allowance.

## 1. Create the codespace

The Codespaces setup is on the implementation branch `claude/hopeful-galileo-us9nkk` until that pull request is merged.

1. Open https://github.com/utkarshraj2004/Flowdeck and sign in to GitHub.
2. Click the **branch selector** above the file list (it shows `main`), and choose **`claude/hopeful-galileo-us9nkk`**.
3. Click the green **`<> Code`** button → **Codespaces** tab → **Create codespace on claude/hopeful-galileo-us9nkk**.
   - To choose the machine size or region, click **`…`** → **New with options…** instead. Keep **Branch** set to `claude/hopeful-galileo-us9nkk`, **Dev container configuration** set to *Flowdeck (Codespaces preview)*, and pick the **2-core** machine.
4. A browser tab opens with an editor (VS Code for the Web). The first start takes a few minutes: GitHub prepares the machine, then Flowdeck installs its packages, builds, and starts **in the background**. You can use the editor while that happens.

## 2. Open Flowdeck

1. Open a terminal: menu **☰ → Terminal → New Terminal** (or press <kbd>Ctrl</kbd>+<kbd>`</kbd>).
2. Run:

   ```bash
   flowdeck status
   ```

   Wait until it shows `Server: ready` (repeat the command, or follow the progress with `flowdeck logs`; press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop following). `Preview address` is your codespace's private Flowdeck address, of the form `https://<codespace-name>-8080.app.github.dev`.
3. Open the **Ports** tab in the panel at the bottom of the editor. The row **Flowdeck (8080)** shows **Private** under *Visibility*. Hover over its *Forwarded Address* and click the **globe icon (Open in Browser)**. You can also click **Open in Browser** in the notification that appears when Flowdeck starts.

Leave the port **Private**. GitHub then lets only your signed-in GitHub account reach it. Do not change it to Public: that would put the preview on the internet.

## 3. Create the first administrator

In the codespace terminal:

```bash
flowdeck admin you@example.com
```

It prints a **one-time setup link** on your preview address, valid for 24 hours. <kbd>Ctrl</kbd>+click it (<kbd>Cmd</kbd>+click on a Mac), choose your name, username and password (at least 12 characters), and click **Create account**. The link is used up when you submit the form. If it expires before you use it, run `flowdeck reset-link you@example.com` for a new one.

Flowdeck creates your first workspace. Click **Create new board** to start.

## 4. Invite a test teammate

1. In Flowdeck: open your workspace → **Members & settings** → **Members** → **Create invite link**, and copy the link.
2. Because the preview is private to **your** GitHub account, other people cannot open it. To try the teammate experience yourself:
   - open a **private/incognito window** in your browser;
   - sign in to **GitHub with your own account** there (GitHub asks before showing the private port);
   - open the invite link and create a **second Flowdeck account** with a different email, such as `teammate@example.com`.
3. Put the two windows side by side on the same board. In the teammate window, click **Join board**. Changes you make in one window appear in the other within a second.

To work with real teammates, host Flowdeck permanently instead (see the README).

## 5. Stop, resume and restart

| What | How |
|---|---|
| **Stop** | https://github.com/codespaces → **`…`** next to the codespace → **Stop codespace**. In the editor: **☰ → Codespaces: Stop Current Codespace** (Command Palette, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>). GitHub also stops it after a period without activity (30 minutes by default). |
| **Resume** | https://github.com/codespaces → click the codespace's name (or **`…`** → **Open in browser**). Flowdeck starts again automatically; check with `flowdeck status`. The preview address stays the same. |
| **Restart only Flowdeck** | `flowdeck restart` |
| **After pulling or editing code** | `flowdeck restart --rebuild` |
| **Stop only Flowdeck** | `flowdeck stop` (data is kept; start again with `flowdeck restart`) |

Your Flowdeck login survives stopping and resuming. Open browser tabs reconnect on their own once the codespace is running again; reload the page if one doesn't.

## What happens to your data

All Flowdeck data in the codespace (database, uploaded files, the generated database password, logs) lives in the folder `.codespace-data/` of the codespace's copy of the repository. Git ignores that folder, so it is never committed or pushed.

| Event | Flowdeck data |
|---|---|
| Stop and resume (by you, or after idle timeout) | **Kept** |
| Rebuild the container (Command Palette → *Codespaces: Rebuild Container*, normal or full) | **Kept** (it lives under `/workspaces`, which a rebuild keeps) |
| `flowdeck stop` / `flowdeck restart` | **Kept** |
| **Delete the codespace** (by you, or automatically when a stopped codespace reaches GitHub's retention period, 30 days by default) | **Deleted for good**, together with any code changes you have not pushed |

To keep a board, open it, click **⋯ Menu** → **Export as JSON** before you delete the codespace. A deleted codespace cannot be restored.

## Troubleshooting

| Problem | What to do |
|---|---|
| `flowdeck: command not found` | Open a new terminal, or run `.devcontainer/bin/flowdeck status` from the repository folder |
| `flowdeck status` still shows `installing dependencies` or `building` | The first start takes a few minutes. Follow it with `flowdeck logs` |
| `flowdeck status` stays at `waiting for the database: …` | The text after the colon says why, and the last lines of the database log are shown below it (the whole log is `.codespace-data/run/db.log`). Rebuild the container (Command Palette → *Codespaces: Rebuild Container*); your data is kept. On every start the database container makes `.codespace-data` usable for PostgreSQL, sets the database password from `.codespace-data/secrets/postgres-password` if they no longer match, and creates the database if a first start was interrupted. A codespace created before this fix needs one rebuild to get it |
| The database log says `directory "/state/postgres" exists but is not empty` | Only if `.codespace-data/postgres` has **no** `PG_VERSION` file (then it holds no database): rename it with `mv .codespace-data/postgres .codespace-data/postgres.unused`, then rebuild the container. Never delete `.codespace-data` |
| `Phase: … (last recorded before the supervisor ended)` | Flowdeck's supervisor is not running, so the phase is out of date. Run `flowdeck restart` |
| The browser shows *502 Bad Gateway* or the port isn't listed | Flowdeck is not running yet. Check `flowdeck status`; if the supervisor is not running, run `flowdeck restart` |
| The setup or reset link says it is invalid or expired | Each link works once (setup 24 h, reset 1 h). Create another: `flowdeck reset-link you@example.com` |
| `Preview address` starts with `http://localhost` | The terminal is not inside a GitHub codespace (for example a local dev container). Inside a codespace, open a new terminal and run `flowdeck restart` |
| The red *Connection to Flowdeck lost* banner stays after resuming | Reload the page. If it persists, run `flowdeck status` |
| GitHub asks you to sign in when opening the preview | Expected: the port is private. Sign in with the GitHub account that owns the codespace |
| "Your session token is missing or stale" | Reload the page |
| Something else | `flowdeck logs` shows the server log. Rebuild the container (Command Palette → *Codespaces: Rebuild Container*); your data is kept |

## How it is set up (for developers)

| File | Purpose |
|---|---|
| `.devcontainer/devcontainer.json` | Codespaces configuration: forwards port 8080 (private by default) and starts Flowdeck on every start or resume via `postStartCommand` |
| `.devcontainer/compose.yaml` | Two containers: the Node.js 22 workspace and PostgreSQL 16 (not reachable from outside the codespace). The database password is generated on first start into `.codespace-data/secrets/` |
| `.devcontainer/db-entrypoint.sh` | Starts PostgreSQL: prepares `.codespace-data` (owner and permissions), generates the password once, copies the database log to `.codespace-data/run/db.log`, and repairs a password mismatch or a missing database without touching data |
| `.devcontainer/start.sh` | Launches the supervisor in the background and returns at once, so creating or resuming the codespace never waits for Flowdeck |
| `.devcontainer/supervise.sh` | Runs `npm ci` and the build only when needed, waits for PostgreSQL (recording why it is not reachable yet), then runs the production server. The server applies pending migrations on start and is restarted if it exits. It never drops or resets data |
| `.devcontainer/env.sh` | Computes the preview address `https://$CODESPACE_NAME-8080.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`, used for setup and invite links, Secure cookies and the WebSocket origin check |
| `.devcontainer/bin/flowdeck` | The `flowdeck` helper command |

The app serves the web interface, API and WebSocket from **one origin**, the forwarded port 8080. Authentication, authorization, CSRF checks and the login rate limit work exactly as in a normal deployment. The automated tests (`npm test`, `npm run test:e2e`) use their own databases on `localhost` and never touch the codespace's Flowdeck database.
