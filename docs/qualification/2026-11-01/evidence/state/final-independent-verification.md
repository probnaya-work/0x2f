# Independent final counterexample verification

Result: no remaining actionable objection in the requested cache, permission-occurrence, displayed-gesture, or asynchronous-spawn counterexamples.

Production source remained read-only. Verification used scratch workspaces, an inert node, local fake ACP subprocesses, EventEmitter spawn-failure fixtures, and loopback-only HTTP/relay tests. No real provider, credential, or external service was used. The full suite was not repeated here; root owns the final broad checks.

- Cross-route cache probes to POST `/`, `/api/health`, and `/app/app.js` now return 404 without private task data. The unauthenticated original API route returns 401. The authenticated same-route retry still returns the original task once.
- Missing, empty, and stale displayed occurrence IDs return 409 for both ALLOW and REJECT. No permission file is created, and the current request remains unchanged. A current displayed ID returns 202 and writes the correct occurrence.
- Two different sequential operations reuse RPC request ID 100. The first legitimate grant includes its occurrence nonce; replaying that old grant after the second operation surfaces leaves it unanswered across multiple polling intervals. The current second nonce rejects exactly the second operation. Final provider responses are ALLOW then REJECT.
- A child emitting asynchronous EAGAIN is caught as a launcher UiError. The analogous action/node failure is caught and durably records failed/crashed. Both checks exit zero, close the parent log descriptor, and never unref the failed child as a successful launch.
- Five selected existing regressions pass across HTTP, encrypted relay commands, phone snapshots/events, and TUI ALLOW/REJECT. Source review also confirmed desktop/mobile Web handlers and TUI intents carry their displayed occurrence through the server/relay action boundary.

Exact outputs and asserted standalone scripts are in `final/observed-results.txt` and the adjacent three `.mjs` files. Earlier failing baseline and second-review observations remain preserved in the parent evidence directories.
