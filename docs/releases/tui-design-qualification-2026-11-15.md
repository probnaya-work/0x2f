# TUI design qualification — 2026-11-15

**First-use evaluation — GO** for the checked local CLI/TUI/desktop scope with an installed, authenticated supported harness. **Public release — NO-GO for broad phone and operated-hosting claims.** The [physical and HTTPS gates](public-release-qualification-2026-11-14.md#physical-evidence-and-remaining-release-gates) remain open. This pass improves the terminal surface; it adds no new platform or harness capability claim.

Unpublished candidate: **0.3.1-rc.8**. Tarball SHA256:
`c3bc75e58b8785f8688507b3dca97a9376f80a72fd111a564e7c7bc599b4947a`.

The package has 87 files, including 84 source files. Every shipped source file matches the separate macOS and Linux installations. Compared with rc.7, shipped source changes are restricted to `src/tui/view.mjs`, `src/tui/theme.mjs`, `src/tui/model.mjs`, and the ACP client version string. Execution, authority, persistence and Web/mobile rendering are unchanged. The owner's current phone preview remains on rc.7.

[Artifact](0.3.1-rc.8-evidence/artifact.json), [source manifest](0.3.1-rc.8-evidence/source-manifest.json), [Linux installed match](0.3.1-rc.8-evidence/linux-verification.json).

## What changed and why

The owner asked for clearer orientation and more room in both themes, while retaining the graphite, cool blue and green code direction.

- The task rail uses 36 columns at 120 columns, down from 46. Selected titles may use two lines; other rows retain provider signatures. Group headings no longer carry repeated long rules, and the live clock no longer competes with task identity.
- The selected task opens with its identity and one compact run line. The current outcome or question precedes task/node bookkeeping and history. Completed traces are collapsed; `t` restores them. Saved full reports remain under `r`, with a maximum prose measure of 96 cells.
- The primary action is pinned and filled with the existing accent. Other actions retain neutral labels. Global navigation has fewer competing shortcuts; full help and existing key bindings remain available.
- The composer has a labeled, padded editing field, a visible caret and review position, and an explicit Start action. Its field edges, caret and recovery actions fit even at 60×18 without relying on color.
- The light theme uses white reading and input surfaces against the existing cool canvas. Dark retains its graphite ground with a quieter rail and a separate input surface. Semantic foregrounds have at least 4.5:1 contrast on normal, selected, reading, rail and editing backgrounds; the primary label has the same minimum contrast.
- Long decision paragraphs have spacing. Permission operations render in full instead of occupying an eight-character label slot. Permission paths inside an isolated execution checkout read relative to that checkout; paths outside it remain explicit. This changes display only.

## Verification on this artifact

| Host | Node | Result |
|---|---|---|
| macOS arm64 | 26.11.1 | 881 total · 880 pass · 0 fail · 1 Linux-only skip |
| Linux x86_64 | 20.20.2 | 881 total · 877 pass · 0 fail · 4 absent Gemini-binary skips |

Both complete runs include Caddy 2.10.2 loopback integration. `npm run check` passes on both hosts. These are local authenticated vendor-harness fixtures and synthetic provider journeys, not fresh live model evaluations. The earlier live model evidence and six-version matrix retain their rc.1/rc.7 attribution; they are not relabeled as rc.8 results.

[macOS full log](0.3.1-rc.8-evidence/macos-node26.txt), [macOS receipt](0.3.1-rc.8-evidence/macos-verification.json), [Linux full log](0.3.1-rc.8-evidence/linux-node20.txt), [syntax](0.3.1-rc.8-evidence/check.txt).

The installed macOS package was driven through **37 actual PTY frames**, with zero structural failures. Both palettes cover creation, working, permission, ready, decision, failure, report, diff, help, populated lists, long drafts and resizing. Ready/draft captures include 60×18, 80×24 and 120×36. The reviewer inspected representative SVG frames in the browser; the optional model reviewer was disabled. SVGs render actual captured terminal cells with fixed metrics. Native terminal app/font rendering remains uninspected.

Regression coverage keeps the caret and Start/recovery visible, checks field edges without color, keeps results ahead of bookkeeping, expands saved traces, and distinguishes inside/outside checkout permission paths. The real-PTY golden path now reads wrapped question prose from the detail pane, so a neighboring task row cannot interrupt the assertion. The same complete question and tradeoff assertions are retained.

[Capture checks](0.3.1-rc.8-evidence/tui-report.json), [dark result](0.3.1-rc.8-evidence/tui-ready-120x36.svg), [light result](0.3.1-rc.8-evidence/tui-ready-light-120x36.svg), [light composer](0.3.1-rc.8-evidence/tui-composer-long-light-80x24.svg), [minimum window](0.3.1-rc.8-evidence/tui-ready-light-60x18.svg), [permission](0.3.1-rc.8-evidence/tui-needs-you-permission-light-120x36.svg), [long question](0.3.1-rc.8-evidence/tui-overview-many-light-80x24.svg).

Initial Linux setup attempts omitted example files and pointed at the Caddy directory rather than its binary; those staging mistakes were corrected before the final complete run. They are not product findings. Original main remains clean; all changes remain uncommitted in the isolated audit worktree. There has been no push, tag, publication or production deployment.

Matching PNG screenshots for visual sign-off: [both themes and both states](tui-final-screenshots-2026-11-15.md).
