# Manual real-phone checklist (gap 4: touch drag)

For the owner, about 15 minutes. Headless emulation cannot start native touch drags, so these need a real phone. Use **Account 1** on **FD Parity Board** only, and only the synthetic cards (`RT probe 1–5`, the `XU probe` cards). The board is currently **Public** (synthetic content only). Results feed T2 / J15 in `09-test-plan.md`.

**Setup:** phone browser (not the Trello app, unless noted), logged in as Account 1. Note the phone model, OS version and browser.

| # | Do | Record |
|---|---|---|
| 1 | Open FD Parity Board. | Does a "use the app" prompt appear? List width vs. screen; does the next list peek in? |
| 2 | Swipe horizontally on empty board space. | Does the board scroll between lists? Smooth or snapping? |
| 3 | Press and hold `RT probe 1`. | How long before it lifts (rough seconds)? Vibration? Visual change (tilt, shadow, placeholder)? |
| 4 | While holding, drag it 2 positions down in the same list and release. | Did it land where dropped? Does it stay after reload? |
| 5 | Hold a card and drag it to the right edge of the screen. | Does the board auto-scroll to the next list? Can you drop it in the next list? |
| 6 | Hold a card, then drag it back to its starting slot (or off the list) and release. | Does it return to the start (cancel)? Any accidental move? |
| 7 | Quick tap on a card (no hold). | Opens the card? Full-screen or modal? Can you reach every action without hover? |
| 8 | Press and hold a **list header** and drag it sideways. | Can lists be reordered by touch? |
| 9 | Scroll vertically inside a long list (`Doing`) with one finger. | Does it scroll, or start a drag by mistake? |
| 10 | Optional: repeat steps 3–5 in the **Trello mobile app**. | Same or different behaviour? |

**Report back:** device and browser, then for each step one line (✅ / ❌ / note) and the long-press delay. A screen recording is useful, but crop or blur anything showing your account name, email or avatar before sharing. Restore any moved cards afterwards (or tell me and I'll do it).
