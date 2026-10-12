# Performance: before and after the upgrade

Measured on 2026-10-12, with the same script, the same machine and the same synthetic data for both builds. The runs were back to back.

- **Before** is `854f7ed`, the head of the implementation PR before this upgrade.
- **After** is the upgrade branch.

Raw results are in `before-854f7ed-{large,typical}.json` and `after-{large,typical}.json`.

## How to reproduce

```bash
npm run build                                   # the build you want to measure (production build)
node scripts/perf/bench.mjs --root . --port 18181 --out result.json             # 12 lists × 100 cards
node scripts/perf/bench.mjs --root . --port 18182 --cards 25 --out typical.json # 12 lists × 25 cards
# Compare with another commit: git worktree add /tmp/old <sha>, then npm ci and npm run build there, then pass --root /tmp/old.
# --profile <dir> writes CPU profiles of filter typing, board load and card open.
```

What the script does:

1. It creates a throwaway database and starts `node dist/server/index.js`.
2. It seeds three synthetic users and one board through the public API:
   - labels on every third card, members on every fifth;
   - due dates and descriptions on every seventh, checklists on every eleventh, comments on every thirteenth.
3. It measures in headless Chromium. Timings are medians of 5 runs.

Scope of the numbers:

- This is **application performance only**. Every run uses a production build on localhost.
- These costs are excluded and would come on top:
  - Codespaces container start, `npm ci` and the first build happen once per codespace.
  - Port-forwarding latency applies to every request in a codespace.
  - The development build (`npm run dev`) is slower.

## Results

| Metric | Large board, before | Large board, after | Typical board, before | Typical board, after |
|---|---:|---:|---:|---:|
| Cards / DOM nodes | 1,200 / 8,511 | 1,200 / 12,302 | 300 / 2,264 | 300 / 3,406 |
| Board snapshot on the wire | 537 KB (uncompressed) | **45 KB** (brotli) | 137 KB | **12 KB** |
| JS before first render (gzip) | 178 KB (one file) | **101 KB** (+ chunks loaded on demand) | 178 KB | **101 KB** |
| Board load (navigation → all cards in DOM) | 288 ms | 297 ms | 151 ms | 141 ms |
| A teammate's new card visible | 151 ms | **83 ms** | 55 ms | **32 ms** |
| Main-thread time for 20 remote edits | 576 ms | **324 ms** | 344 ms | **247 ms** |
| Type 8 characters in the filter | 935 ms | **684 ms** | 317 ms | **249 ms** |
| Drop a dragged card → shown in the new list | 342 ms | **131 ms** | 92 ms | **42 ms** |
| Add a card with the composer | 167 ms | **107 ms** | 58 ms | 54 ms |
| Open a card (click → dialog content) | 344 ms | 464 ms ⚠ | 173 ms | 167 ms |
| Toggle a label in the card dialog | 155 ms, 3 requests | 167 ms, **2 requests** | 106 ms, 3 requests | 111 ms, **2 requests** |

**Reading the table:**
- Board-load numbers move by about ±30% between identical runs on this machine. The first baseline run measured 513 ms for the same build. Treat differences under about 50 ms as noise.
- **Regression still open:** opening a card on the 1,200-card board takes about 120 ms longer. A profile shows little React work (about 60 ms); most of the time is the browser's own layout and paint of the larger two-column dialog. On the typical board the difference is gone. Next things to try: a lighter dialog shell rendered first, then the comments column.
- The label toggle now shows the change at once (optimistic) and makes one write plus one refresh. Before, it made one write plus two refreshes. The measured time includes waiting for the checkbox to settle.

## What changed, guided by profiles

| Change | Why (measured) |
|---|---|
| Split board context; memoised lists and cards with per-list card arrays that keep their identity | Every server event re-rendered all 1,200 cards |
| Filter re-computed at lower priority in one pass | 935 ms of typing work on the large board |
| Card dialog refreshes once per burst; optimistic toggles | 3 requests per label toggle |
| Brotli/gzip compression | 537 KB snapshot |
| Code splitting and preloading (board, dialog, admin, search, Markdown) | One 544 KB bundle; a direct board URL now fetches its code in parallel with sign-in |
| Hover-only controls rendered just for the active card; badge icons as CSS masks | The redesigned card front first tripled the DOM (26k nodes) |
| Cached `Intl.DateTimeFormat` instances | `formatDate` cost 66 ms of board load |
| Removed a decorative backdrop blur | Repaint cost under the dialog |

**Not done, on purpose:** list virtualisation. With the changes above, a 1,200-card board loads and reacts within about 0.3–0.7 s on this machine. Virtualisation would break find-in-page, keyboard focus moves into off-screen cards, and drag targets. Revisit it if boards much larger than the 5,000-card limit are needed, or if slower devices fall short.
