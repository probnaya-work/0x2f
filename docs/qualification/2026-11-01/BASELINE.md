# Independent qualification baseline — 2026-11-01

Baseline commit: `809e3ab158a7304c9e07e9c6d95ce30542987460` (0.1.4).
Verified correction commit: `ac1e7af3bed1ad28fc655e5b58a346ebad400399`.
Isolated branch: `qualification/2026-11-01` in `work-cli-qualification-20261101`.
Initial checkout was clean. Original `work-cli-v0` remains on
`feat/workflow-supervision` with user changes to package.json/package-lock.json;
those changes and all other checkouts were preserved.

Environment: macOS/Darwin arm64, Node v26.11.1, npm 11.20.0, Python 3.9.6,
Europe/Lisbon, 2026-11-01. No local Node 20 binary was found. No build step.
`npm ci --offline --ignore-scripts --no-audit --no-fund` installed the three
locked dependencies successfully. Initial `npm run check` exited 0; independent
negative testing subsequently demonstrated that its original find command
could print JavaScript syntax errors and still return success.

Initial `npm test` was attempted under the restricted sandbox, with output
retained in `evidence/baseline-test.log` (local generated log). Loopback socket
tests failed because the sandbox forbids listen; the run did not complete.
These are environment restrictions, not evidence of product regressions.
Final verification will use an explicitly audited offline fixture suite.

Historical evidence, not rerun or relabeled here:

- [Release 0.1.4](../../releases/0.1.4.md)
- [Observed Codex → OpenCode continuity](../../task-continuity.md) and its
  [original evidence](../../evidence/cross-harness-continuity.json)
- [Managed execution decision](../../decisions/managed-execution.md)
- [Codex observations](../../codex-capability-map.md),
  [Gemini observations](../../gemini-capability-map.md)

Recent lineage: `15eaee0` integrated task continuity, `29db34a` recorded the
managed-experiment closure, `14ea9c6` added explicit Codex configuration opt-out,
`7351b02` persisted reopen instructions, `467a847` registered OpenCode ACP.
No historical capability claim will be upgraded without a real pinned harness
observation. All new execution fixtures use local synthetic providers.
