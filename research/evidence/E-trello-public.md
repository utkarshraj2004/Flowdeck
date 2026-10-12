# E-trello-public: Trello observed live (logged out, read-only)

Session 2026-10-11 ~17:30 UTC, after the owner updated the network allowlist. Everything here is **OBS**: seen in a real browser (Chromium 141, headless) or captured by REA 6.4.0.

**Scope and limits:** Logged out. The only board inspected is Trello's own **public** "Trello Development Roadmap" board (`/b/nC8QJJoZ`), which anyone can view. Actions were **view only**: open, read, screenshot. An earlier script that also tried a logged-out drag of a card was blocked by the session's safety classifier and never ran, so permission behaviour on mutation is **not** observed. No account was used. People's avatars are hidden in screenshots (local CSS) and the one visible username was redacted.

## Reachability

| Host | Status |
|---|---|
| `trello.com`, `id.atlassian.com`, `api.atlassian.com`, `atl-onetrust-wrapper.atlassian.com`, `support.atlassian.com`, `developer.atlassian.com`, `www.atlassian.com` | reachable |
| `id-frontend.prod-east.frontend.public.atl-paas.net` | **403 (egress policy)**. Atlassian login JS. **Blocks login** ([screens/obs-login-js-error.png](screens/obs-login-js-error.png): "JavaScript load error") |
| `trello-bifrost.prod-east.frontend.public.atl-paas.net`, `ds-cdn.prod-east.frontend.public.atl-paas.net`, `atlassian-cookies.prod-east.frontend.public.atl-paas.net`, `fd-assets.prod.atl-paas.net` | 403. Trello/Atlassian front-end assets (board still rendered without them) |
| `assets.ctfassets.net`, `images.ctfassets.net`, `videos.ctfassets.net`, `dam-cdn.atl.orangelogic.com` | 403. Marketing-page media (not needed for the app) |
| `cdn.cookielaw.org` | 403. Cookie-consent library (not needed) |
| `o55978.ingest.sentry.io` | 403. Error telemetry (do not allow; not needed) |

Proxy error for every blocked host: `connect_rejected: gateway answered 403 to CONNECT (policy denial or upstream failure)`. Browser: `net::ERR_TUNNEL_CONNECTION_FAILED`.

`trello.com/login` → 302 → `id.atlassian.com/login?application=trello&continue=…`; `trello.com/signup` → `id.atlassian.com/signup?application=trello--direct-signup`. **Login is Atlassian-account based (OBS).**

## Login check (second allowlist update, 2026-10-11)

> *Reconciled 2026-10-12:* historical. Later sessions had all four variables present, Full network access, and both accounts logged in. See [E-session2-auth](E-session2-auth.md) and `../HANDOFF.md`.

- `*.atl-paas.net` now reachable (`id-frontend…`, `trello-bifrost…`, `fd-assets…` → 200). The Atlassian login page renders: **"Log in to continue"** with an Email field (`name=username`, `autocomplete=username`), a password field (`autocomplete=current-password`, revealed after Continue), "Remember me", **Continue**, then **Passkey**, **Google**, **Microsoft**, **Apple**, **Slack**, "Can't log in?", "Create an account" → [screens/obs-login-page.png](screens/obs-login-page.png). No credentials were entered.
- No CAPTCHA widget was present on load, but the page tried and failed to reach two CAPTCHA providers (proxy 403, `net::ERR_TUNNEL_CONNECTION_FAILED`): `99a173f17960.edge.captcha-sdk.awswaf.com` (AWS WAF CAPTCHA SDK) and `www.recaptcha.net` (Google reCAPTCHA), plus `google.com`. These are likely needed if Atlassian challenges the login.
- **Login not attempted:** `TRELLO_TEST_EMAIL` / `TRELLO_TEST_PASSWORD` / `TRELLO_TEST2_*` were **not present** in this session's environment (checked by name only). The Trello connector is still bound to the owner's real account, so it was not used for experiments.

## REA on Trello

| Tool | Target | Result |
|---|---|---|
| `inspect-web-page` | `https://trello.com/` and the public board | ✓ (**no `target_not_allowed`** once the page loads). Board: 4572 DOM nodes; **accessibility tree 3452 nodes** (with `--include-accessibility-text`): 235 `listitem`, 202 `link`, 108 `button`, 52 `heading`, 51 `list`, 2 `dialog`. Completeness `policy_filtered`: other origins are excluded by REA's default same-origin scope; script sources, storage keys and JSON shapes need explicit opt-in flags. |
| `capture-web-screenshot` | both | ✓ |
| `analyze-web-bundle` | board | ✓. Static scan of the 2 retained scripts: React fingerprint (medium confidence); **337 endpoint candidates** (148 GraphQL queries, 79 mutations, **11 subscriptions**, REST-style calls such as `/1/token/approve`, `/file/upload`) |
| `observe-web-session` | board | ✓ (6 timeline entries) |
| network / WebSocket sections | board | empty, because REA attaches after load ("prior activity unavailable", a documented limitation). Playwright independently saw a **WebSocket to `trello.com`** opened by the logged-out board page. |

The earlier `target_not_allowed` was caused by Chrome's error page (no committed `https` document), not by REA's target configuration. No REA config change was needed.

**Caution on bundle names:** they are identifiers present in client JavaScript. They show what the web client *refers to*, not how Trello's servers are built. Used below only as hints (labelled OBS-client).

## Observed UI

### Board (desktop 1280×800) — [obs-d1](screens/obs-d1-public-board-desktop.png)
- Logged-out global header: logo, Features / Solutions / Plans / Pricing / Resources menus, "Log in", "Get Trello for free". Cookie banner: Preferences / Only necessary / Accept all.
- **Board header:** board name (an editable input element exists but is read-only here), view switcher icon + chevron, member facepile with "+8" overflow, filter button, visibility icon (globe = Public), `⋯` menu.
- **Lists:** fixed width **272 px**; cards **256 px**; rounded light-grey columns on the board background. List header = name, **card count** (e.g. "4"), and a **collapse** button (`→←`). Logged out: no "Add a card" / "Add a list" composers.
- **Card fronts:** full-bleed **image cover** cards with the title overlaid (28 of 174), normal covers above the title (30), plain cards, a **link card** rendered as a smart-link preview, badges for description and attachment count (e.g. "≡ 📎 2"). A read-only "done state" element exists on 31 cards.
- Data-testid inventory (structure only): `board-header`, `board-canvas`, `list`, `list-header`, `list-name`, `list-collapse-button`, `list-cards`, `list-card`, `card-front-cover`, `full-cover-card`, `card-front-badges`, `badge-card-description`, `card-attachments-count`, `filter-popover-button`, `view-switcher-button-more`.

### Card dialog (desktop) — [obs-d2](screens/obs-d2-card-dialog-desktop.png)
- URL changes to `/c/<shortLink>/<slug>` (deep-linkable).
- Large modal, **two columns**. Header: list-name chip (e.g. "Live (Jan-March 2021)"), the cover image, **Share** and **Close** buttons.
- Left: card icon + **title**; **Description** (rich text); **Attachments**, grouped into **Links** (smart-link row) and **Files** (type tile "PNG", name, "Added <date>", "Cover" tag, open-in-new button).
- Right (grey panel): **"Comments and activity"** with a **"Show details"** toggle; entries show avatar, actor, action text ("added this card to <list>"), and a timestamp link.
- Floating bottom bar: **Power-ups · Automations · Comments** (Comments active).

### Filter popover — [obs-d3](screens/obs-d3-filter.png)
Tooltip "Filter cards **F**". Sections: **Keyword** ("Search cards, members, labels, and more."); **Members** (No members, Select members); **Card status** (Marked as complete / Not marked as complete); **Due date** (No dates, Overdue [red], Due in the next day [yellow], Due in the next week, Due in the next month); **Labels** (No labels, each label, Select labels); **Activity** (Active in the last week / two weeks / four weeks, Without activity in the last four weeks); toggle "Collapse lists with no matching cards"; match mode "Any match".

### Board menu (logged-out viewer) — [obs-d4](screens/obs-d4-board-menu.png)
About this board · Visibility: Public · Print, export, and share · Labels · Activity · Archived items · Collapse all lists · Report abuse.

### Views switcher — [obs-d5](screens/obs-d5-views.png)
Board · Table · Calendar · Dashboard · Timeline · Map (shown to a logged-out viewer; plan gating not visible here).

### Phone (iPhone 13 profile, 390 px, touch) — [obs-m1](screens/obs-m1-board-phone.png), [obs-m2](screens/obs-m2-card-phone.png)
- Interstitial sheet "Trello is better on the mobile app" with **Go to mobile app** / **Not now**.
- Header collapses to logo + hamburger. Board header keeps the name (ellipsised), view switcher, filter and menu.
- Lists keep the **same 272 px width**; the next list peeks at the right edge; no page-level horizontal scroll (`scrollWidth ≤ innerWidth`).
- Tapping a card opens the same modal, not full-screen; content (title, description) overflows to the right and is clipped; the floating Power-ups/Automations/Comments bar is icon-only.

### Not observed (needs login / test account)
Creating or editing anything, drag-and-drop, card composer, archive/restore, permissions for members/observers/guests, real-time propagation between two users, notifications, shortcut help dialog (`?` produced no dialog when logged out), account settings, workspace pages.

## Client-code hints (OBS-client, from `analyze-web-bundle`)
- **Real-time:** GraphQL subscriptions `TrelloBoardUpdated`, `TrelloBoardUpdatedAttachments`, `TrelloWorkspaceUpdated`, `TrelloMemberUpdated`, `TrelloMirrorCards`, plus job-progress subscriptions; client flag `useGraphqlWebsocketPings`; flags `trello_web_max_first_active_delay` / `trello_web_max_first_idle_delay`, `trello_web_disconnect_active_clients`, `trello_web_take_trello_offline`. Consistent with DOC D16 (socket push + active/idle tuning).
- **Card/list operations referenced:** `AddCardToList`, `MoveCard`, `BulkMoveCards`, `CopyCard`, `ArchiveCard`, `DeleteCard`, `TrelloMergeCards`, `SetCardCover`, `TrelloMarkCardComplete/Incomplete`, `UpdateDueComplete`, `TrelloAddLabelsToCard`, `TrelloRemoveLabelsFromCard`, `AddMemberToCardShortcut`, `SubscribeToCardShortcut`, `AddList`, `UpdateListName`, `UpdateListPosition`, `TrelloUpdateBoardName`, `TrelloUpdateBoardVisibility`, `TrelloUpdateBoardBackground`, `TrelloBoardHeaderAddBoardStar`.
- **Undo:** `TrelloUndoAction`, `UndoAutoArchivedCard` (an auto-archive feature exists).
- **Clipboard:** `CanPasteCardFromClipboard*`, `ClipboardAddCardToList`, `ClipboardAddCardFromFile` (copy/paste cards).
- **Other:** card composer limits (`CardComposerLimits`), access requests (`SendRequestAccess`, `BoardAccessRequests`), AI board builder and planner (out of Flowdeck scope).
