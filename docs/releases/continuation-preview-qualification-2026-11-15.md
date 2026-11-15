# Continuation preview qualification — 2026-11-15

Local feature candidate on `feat/continuation-preview-20261115`, based on
published 1.0.0. No publication, tag, push or installation replacement.
Package metadata still says 1.0.0; the archive below is an unpublished
development artifact, not the registry's 1.0.0 release.

## Delivered behavior

Local Web and TUI continuation first show the next fresh session's task input.
Retry, reopen, correction and decision-answer flows use the same guarded
start. Cancellation preserves an unsaved correction or answer. CLI keeps its
explicit `preview` and `rerun --preview` commands and existing direct rerun.

A stale or failed confirmation disables Start until a successful refresh.
Refresh cannot silently move an open review to a different run. Web requests
time out after 30 seconds without retrying launch. After an ambiguous response,
authoritative task state clears only the exact draft already consumed; a newer
edit survives. TUI also reconciles a correction saved before a worker-launch
failure. A confirmed answer does not clear an unrelated correction draft.

## Verification

[Machine-readable receipts](continuation-preview-evidence/qualification.json).

| Host | Node | Full suite |
| --- | --- | --- |
| macOS arm64 | 20.20.2 | 904 total · 902 passed · 0 failed · 2 skipped |
| macOS arm64 | 24.22.3 | 904 total · 902 passed · 0 failed · 2 skipped |
| macOS arm64 | 26.11.1 | 904 total · 902 passed · 0 failed · 2 skipped |
| Linux x86_64 | 20.20.2 | 904 total · 899 passed · 0 failed · 5 skipped |
| Linux x86_64 | 24.22.3 | 904 total · 899 passed · 0 failed · 5 skipped |
| Linux x86_64 | 26.13.1 | 904 total · 899 passed · 0 failed · 5 skipped |

macOS skips the Linux-only process test and unavailable Caddy integration.
Linux skips four unavailable native Gemini cases and Caddy. Syntax checks
and the static client build pass. GitHub CI has not run on this branch.

The deterministic real-PTY journey checks cancel, stale rejection, refresh,
scrolling and explicit start; the ordinary lifecycle journey now checks the
default preview before correction, answer and retry. The visual pipeline
checks 39 dark/light terminal frames, including continuation. Web regression
tests cover late preview responses, failed loads, stale confirmation, lost
start responses, advanced runs and preservation of unrelated/newer drafts.

Manual local-browser checks cover both themes, a compact viewport, multiline
Unicode input, provider switching, cancellation, stale rejection, refresh,
scrollable exact input and visible Start controls. The task prompt shown in
the actual DOM equals the persisted run-2 prompt byte-for-byte; the correction
is recorded once. Browser console inspection reported no errors or warnings.
These checks do not establish a physical phone or full accessibility matrix.

Live Codex **0.166.0 → OpenCode 2.2.5** also reached READY in both runs. The
second result includes the continuation's sentinel, receives the exact
reviewed prompt and saves the correction once. This is a small read-only
inspection in a synthetic Git fixture; it does not measure engineering
performance or prove general handoff quality.

## Installed artifact

SHA256: `f8b5b1dfc2e7396e96347b5ee7623e8e296a8a5b009924d39bf4597c12e7d623`.

All 84 shipped source files match the checkout and the separate macOS/Linux
installations. The installed CLI, TUI and detached worker pass the continuation
journey on both hosts with an empty HOME. The verifier is now part of each
GitHub platform/Node matrix job after packing and installing the product:

```bash
node scripts/verify-continuation-installed.mjs --package-root <installed-0x2f>
```

Qualification found and corrected three fixture problems without weakening
behavior assertions: the new PTY test could match an incomplete painted
frame; Claude-resume cleanup could delete a worker-owned directory; relay
cleanup could delete state or close its server before stopping its live agent.
An earlier heavily concurrent run also timed out waiting for the existing LAN
crypto fixture to connect. The final serialized matrices above are clean.

## Scope and release boundary

This feature previews the task prompt. It does not transplant hidden harness
state, freeze checkout files or guarantee that the agent follows instructions.
The context compiler's existing protection/truncation policy is unchanged.
The experimental minimized phone/relay protocol does not gain full prompts.

The local candidate is ready for integration review. Actual branch CI and the
next release's final versioned package remain release steps. No exclusive
market claim or independent external review is inferred from these checks.
