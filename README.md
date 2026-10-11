# Flowdeck

A static website (HTML, CSS, JavaScript) developed in Claude Code Cloud and published with GitHub Pages. Nothing needs to be installed on your computer.

> The pages in `site/` are placeholders. Ask Claude to build the real site.

## Layout
| Path | Purpose |
|---|---|
| `site/` | The website. Only this folder is published. |
| `scripts/` | Validation and browser checks |
| `.github/workflows/` | CI and Pages deployment |
| `CLAUDE.md` | Instructions Claude Code reads every session |

## Work in Claude Code Cloud
1. Open the Claude Code web app (claude.ai/code) and start a session on this repository.
2. Describe the change you want. Claude edits files in its cloud container.
3. Dependencies install automatically at session start (`npm ci`).

## Run the checks
Ask Claude to run `npm run check`, or run it in the session terminal:
- `npm run validate` – required files, JavaScript syntax, broken links/assets
- `npm run test:browser` – navigation, styling, scripts, mobile layout (Chromium)

The same checks run on GitHub for every pull request (Actions tab).

## Development preview (not the public site)
Ask Claude to run `npm run dev`; it serves `site/` at `http://localhost:8000` inside the cloud container. Open it through the preview/port link your Claude Code Cloud session offers, or ask Claude to take a screenshot. It is private to your session and disappears when the session ends.

## Deploy to the public website
The public site is a separate thing: GitHub Pages, at `https://<your-username>.github.io/Flowdeck/`.

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Each release:
1. Open a pull request; wait for **CI** to pass; merge to `main`.
2. **Actions → Deploy to GitHub Pages → Run workflow** (branch `main`).
3. The workflow re-validates that commit and only then publishes `site/`.

Note: GitHub Pages is public for free plans even for private repositories; check your plan before deploying.
