# Web appearance, layout and activity-trace repair — 2026-11-01

Implemented in a separate worktree, `fix/web-dark-theme`, based on
`709284ec691e8e6adcfd8d8cde735e35ede8831d`. Package version remains **0.1.4**.
The previously installed executable and qualification checkout were not replaced.
Nothing was published, released or pushed. No model calls were made for this work.

## Behavior

- Web/phone: SETTINGS exposes explicit Light / Dark / System buttons. System is
  the initial preference; the client-origin preference survives reloads, updates
  other tabs, and follows live OS changes when System is selected. Storage failures
  fall back to a functioning session preference. Pairing uses the same preference.
- `theme.js` runs synchronously before CSS and the body in both entrypoints. It
  works with the existing `script-src 'self'` CSP. Local and static client bundles
  serve the same assets; packaged-asset tests cover the new files.
- Light keeps the original canvas, paper, graphite ink, typography and square
  industrial forms. Small secondary-text/placeholder contrast corrections apply
  to both themes. Dark adds graphite surfaces, steel rules and a cool blue accent.
- Header: workspace and machine identity form a compact two-line group. Sound,
  notifications and appearance move into SETTINGS. Project names wrap instead of
  being cut. Hint pairs and count labels wrap as units on narrow layouts.
- Phone navigation and full-result disclosure are real keyboard controls. Opening
  detail focuses its back button, returning restores the task-row focus, and the
  overview under detail is inert. Full-result/preview switching keeps its control
  and focus in place. Live updates preserve reader and nested code-block scroll.
- Responsive desktop creation now populates the provider selector even when the
  page originally loaded at phone width. Drafts and provider selection are retained.
- The existing TUI palette, default theme and `--light` selection are unchanged.

## Why the activity bar was cropped

1. The wide ambient cap was 150px, while the responsive execution column becomes
   120px. Its overflow rule hid the live end. The responsive projection now uses
   a 100px cap, leaving the gap and marker inside the column.
2. A halted mini cell had a data height of zero. The DOM renderer treated it as
   ordinary paint and erased the stop marker. It now draws an explicit 13px stop.
3. Projection x positions and gaps were recalculated differently by CSS in desktop,
   phone and provenance views. All three now place the shared projected geometry
   directly. The live marker uses its actual height.

A quiet axis makes empty lanes readable; the empty state says that activity has
not been reported. Dense traces identify their latest-signal window with a count.
A provider without structured events still gets one ambient shape, never fake
reported dashes or a fabricated completion percentage.

## Verification

Environment: macOS, Node **26.11.1**, npm **11.20.0**, in-app browser. Browser checks
use the real local server with explicitly inert fixture tasks. These are UI and
geometry tests, not a real-harness engineering trial or a human-attention study.

- `npm run check`: passed — [log](evidence/check.log).
- `npm test`: **763/763 passed**, including real TUI PTY regression tests —
  [log](evidence/npm-test.log).
- `npm run build:client -- /tmp/0x2f-dark-client`: passed —
  [log](evidence/build-client.log). This exposed and fixed a pre-existing static
  builder initialization-order error (`VENDOR_CRYPTO_FILES` used before declaration).
- Light and Dark checked at actual CSS widths **320, 354, 654, 1000, 1309px**:
  no horizontal page overflow, no cut project names, no cropped bar cells or marker.
  [Dark geometry](evidence/responsive-geometry.json),
  [Light geometry](evidence/responsive-light-geometry.json).
- Main text/accent on the tested content surfaces: minimum **4.87:1 Light**,
  **5.31:1 Dark**; text selection **9.66:1 / 6.30:1**.
  [Palette measurements](evidence/contrast.json). This is a scoped contrast check,
  not a claim that every decorative or inactive pixel meets text contrast criteria.
- Keyboard focus, actual reload persistence, actual cross-tab pairing preference,
  the System choice, disabled ALLOW and a result containing 90 long paragraphs and
  a diff code block checked in the browser. The full result reaches its tail at
  320px without horizontal overflow; disclosure retains keyboard focus.
  [Mobile reading receipt](evidence/mobile-result.json).
- OS light/dark changes, invalid preference values and unavailable storage are
  exercised deterministically by `test/web-theme.test.mjs`. No OS-wide preference
  was changed during browser checks.
- Dense TUI rules and composed frames checked in both palettes at **60, 80, 100,
  132, 160 columns**. The live end survives pane composition. Existing diff colors
  and selected-text contrast checked in both unchanged TUI palettes.

Mobile means a responsive browser viewport here; no physical phone was used.
The first-paint protection was checked through execution ordering, synchronous
bootstrap tests and the real CSP-served pages, not a high-speed video capture.

## Screenshots and reproduction

[Desktop Dark](evidence/desktop-dark.jpg) · [Desktop Light](evidence/desktop-light.jpg)

[120px lane Dark](evidence/desktop-medium-dark-trace.jpg) ·
[120px lane Light](evidence/desktop-medium-light-trace.jpg)

[Phone Dark](evidence/mobile-dark-trace.jpg) · [Phone Light](evidence/mobile-light-trace.jpg)

[Disabled Dark](evidence/mobile-dark-disabled.jpg) ·
[Disabled Light](evidence/mobile-light-disabled.jpg) ·
[Long result](evidence/mobile-dark-long-result.jpg)

[Pair Dark](evidence/pair-dark.jpg) · [Pair Light](evidence/pair-light.jpg)

Run `node docs/implementation/web-theme-2026-11-01/ui-fixture.mjs` to create a fresh
inert workspace and print its local URL. Ctrl-C closes its server and removes its
scratch task state. `trace-fixture.mjs` supplies dense/coarse geometry cases.
