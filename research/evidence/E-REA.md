# E-REA: REA installation, verification, and Trello reachability

Session 2026-10-11 (UTC ~17:10). The owner explicitly authorized installing REA.

## Installation

| Step | Result |
|---|---|
| Requirement check | Node.js **22.22.0** (REA needs 22.x ≥ 22.19) ✓ · npm ✓ · Chrome-family browser: Playwright Chromium **141.0.7390.37** at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` ✓ |
| Install | `npm install rea-agents@6.4.0` into the session scratchpad (not the repo): "added 144 packages" ✓ |
| Version | `rea --version` → **6.4.0** (matches npm `latest`, and `package.json` of `morluto/rea` at commit `23d50ea`) |
| `rea doctor` | `healthy: false`, **only** because native engines (Hopper, Ghidra, IDA) are absent. Those are needed for binary analysis, **not** for website analysis. Node and host checks pass. |
| MCP registration (`rea setup`) | Not run. The website tools were used through the CLI, which REA documents as having the same contracts as MCP. Registering the MCP server would need an agent restart, and this ephemeral container is discarded at session end. |

Earlier in this session (before authorization), the same install was refused by the session's auto-mode permission classifier ("Create Unsafe Agents"). With explicit authorization it succeeded.

### Browser setup used by REA
A dedicated headless Chromium with a **loopback-only** debugging endpoint and a throwaway profile:
```
chrome --headless=new --no-sandbox --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir=<scratchpad>/rea-profile --password-store=basic --no-first-run --window-size=1280,800
```
The container runs as root, and Chromium refuses to start as root without `--no-sandbox` (first attempt failed: "Running as root without --no-sandbox is not supported"). Playwright, which the repo's browser check uses, sets the same flag by default. The CDP port is bound to 127.0.0.1 only, per REA's guidance.

## REA website tools tested

Target: Flowdeck's own placeholder page served at `http://127.0.0.1:8765/index.html` (a page we own, used to prove the toolchain).

| Tool | Result | Evidence returned |
|---|---|---|
| `list-browser-targets` | ✓ | browser product/protocol, 1 page target |
| `inspect-web-page` (`--observation-ms 1000 --include-accessibility-text`) | ✓ | 49 DOM nodes, accessibility tree, 1 script, resources, network, console, storage summary, explicit limitations ("raw headers, bodies, cookies, storage values … are never retained") |
| `capture-web-screenshot` | ✓ | PNG 1280×608, 16 132 bytes, sha256 `74f3d41d…` → [screens/rea-local-verification.png](screens/rea-local-verification.png) |
| `analyze-web-bundle` | ✓ | chunks, routes, endpoints, WebMCP declarations, source maps |
| `observe-web-session` (`--observation-ms 2000`) | ✓ | 5 timeline entries |

Not tested: `capture-browser-scenario`, `compare-web-captures`, `compare-web-screenshots`, `inspect-web-event-listeners`, `export-web-scripts`, `observe-web-execution`. They depend on the same CDP and Playwright providers, and can be tested once a real target is reachable.

## Trello reachability: blocked

| Probe | Result |
|---|---|
| `curl https://trello.com/`, `/login`, `api.trello.com`, `id.atlassian.com`, `support.atlassian.com` | `CONNECT tunnel failed, response 403` |
| Egress proxy status | `trello.com:443 — gateway answered 403 to CONNECT (policy denial or upstream failure)` |
| Chromium via Playwright `goto https://trello.com/login` | `net::ERR_TUNNEL_CONNECTION_FAILED` → [screens/trello-blocked-2026-10-11.png](screens/trello-blocked-2026-10-11.png) |
| REA `inspect-web-page` on the Trello tab | `target_unavailable / target_not_allowed`. The tab holds Chrome's error page rather than a committed `https://trello.com` document, and REA only inspects allowed committed HTTP(S) pages. |
| REA `capture-web-screenshot` on the Trello tab | same `target_unavailable` |

**Conclusion:** REA works in this environment. Trello cannot be investigated with it until the environment's network policy allows Trello and Atlassian hosts. Nothing was bypassed; no proxy or TLS settings were altered.

## Unblock and resume

1. Allow these hosts in the environment's network settings: `trello.com`, `*.trello.com`, `id.atlassian.com`, `*.atlassian.com`, plus any asset/CDN hosts the login page needs (unknown until the first page loads; REA's `inspect-web-page` resource list will name them, likely including Atlassian's `*.atl-paas.net`).
2. Create a **dedicated Trello test account** (not your real one) with its own empty workspace, ideally plus a second test account for permission and collaboration checks.
3. Provide the test account credentials as environment variables, never in chat or in the repo: `TRELLO_TEST_EMAIL`, `TRELLO_TEST_PASSWORD`, and optionally `TRELLO_TEST2_EMAIL` and `TRELLO_TEST2_PASSWORD`. A new session picks them up. Atlassian may require email verification or a CAPTCHA on first login; if so, complete that once yourself.
4. In the new session: reinstall REA (one command, about 11 s), start the browser as above, log in to the test account, create a synthetic board, and run `inspect-web-page`, `capture-web-screenshot`, `observe-web-session` and `capture-browser-scenario` across the parity checks T1–T10 in `09-test-plan.md`.
