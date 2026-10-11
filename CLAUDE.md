# Flowdeck

Static website (plain HTML/CSS/JS). No backend, database, framework, build step, or environment variables.

## Structure
- `site/` – the entire public website; only this folder is deployed.
- `scripts/validate.mjs` – required files, JS syntax, local link/asset checks.
- `scripts/browser-check.mjs` – Chromium (Playwright) check of nav, CSS, JS, mobile layout.
- `.github/workflows/ci.yml` – validation on PRs and pushes to `main`.
- `.github/workflows/deploy-pages.yml` – manual GitHub Pages deploy (re-runs validation first).
- `research/` – Trello-equivalent product research and build specification (docs only; start at `research/README.md`).

`site/` currently holds placeholder pages; replace them with real content.

## Commands
- Preview: `npm run dev` (serves `site/` on port 8000)
- Validate: `npm run validate`
- Browser check: `npm run test:browser` (uses `/opt/pw-browsers/chromium`, or set `CHROMIUM_PATH`)
- Everything: `npm run check` – run before every commit.
- Setup: `npm ci` (only dependency: `playwright-core`; a SessionStart hook runs it).

## Conventions
- Use relative paths in `site/` (e.g. `styles.css`, never `/styles.css`) so it works under `/<repo>/` on Pages.
- Add pages/assets inside `site/` only.

## Deployment
Merge to `main`, then run the "Deploy to GitHub Pages" workflow manually. Never publish without the user's approval.

## Credentials
Never commit secrets, tokens, keys, or `.env` files; `.gitignore` blocks them. Never print or paste credentials. The site needs none.
