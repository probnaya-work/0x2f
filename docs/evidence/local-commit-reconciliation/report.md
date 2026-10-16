# Read-only reconciliation of uncertain local commit

Implementation: `6931cec2bd06cc7f30bba32cfcccf01f96c4618d` on
`feat/task-continuity`, based on accepted `dccd5d5`. This is one bounded local
slice. The subsequent commit contains only this evidence bundle. No amend.

## Implemented

`2f reconcile <id>` invokes one shared task action under the engineering lock.
It reads only the bound managed disposable Git repository, records evidence in
its existing task directory, and renders the same projection in CLI/TUI/Web.

Before commit-object creation, durable v2 intent binds task/run, unique delivery
operation, repository/worktree physical identity, expected parent, exact tree,
diff/message/grant digests and Git configuration. It also saves the exact
expected commit identity. A custom `0x2f-operation` commit header preserves the
operation identity while leaving the proposed message unchanged. Existing
bounded hooks and parent-checked HEAD update remain in the delivery path.

The reconciliation result is separate from delivery execution state:

| Result | Evidence and next state |
|---|---|
| APPLIED | Exact intended object bytes and approved diff found; resulting commit receipt; reachability from observed HEAD recorded separately; READY. |
| NOT_APPLIED | Dispatcher stopped before durable effect-start, intended object absent, detached HEAD/refs/reflog unchanged; NEEDS YOU, no executable old grant. |
| UNCERTAIN | Missing proof, identity/config drift, read error, ambiguous history or started effect without object; NEEDS YOU, no success receipt. |

An attempted delivery becomes `reconciled`; an already committed delivery keeps
`committed`. Result/evidence/receipt references are additive task fields. Saved
observations are immutable and timestamped. Concurrent requests publish one
result/revision. Recovery of an already durable result completes its task pointer
without inspecting again or replacing the observation. Unknown outcomes cannot
be retried, and cleanup of uncertain workspace evidence is refused.

## Ten requested scenarios

All use real disposable Git repositories. Reconciliation tests compare object,
ref, reflog, index, stale-lock, config, hook and working-file bytes/mtime before
and after each observation. Process tests actually kill workers with SIGKILL.

| # | Scenario | Verified result |
|---|---|---|
| 1 | Worker dies before effect | NOT_APPLIED; new preview/grant required. |
| 2 | Object written / HEAD updated, worker dies before receipt | APPLIED at both boundaries; unreachable / reachable respectively; no second commit or repair. |
| 3 | Receipt exists | APPLIED; original receipt retained; repeated result identical; normal acceptance works. |
| 4 | Unrelated successor | Intended ancestor found; successor HEAD unchanged. |
| 5 | Changed HEAD / symbolic ref | UNCERTAIN when absence cannot be proven. |
| 6 | Similar message, different tree | UNCERTAIN; no success receipt. |
| 7 | Similar tree, no exact operation | UNCERTAIN; no similarity inference. |
| 8 | Repository / worktree mismatch | UNCERTAIN; no adoption or success receipt. |
| 9 | Concurrent reconciliation | One durable result/revision; identical results. |
| 10 | Hook / process failure | Hook executes once; NOT_APPLIED only before effect; started-but-absent stays UNCERTAIN; no replay. |

Additional regressions cover config drift, missing legacy intent, CLI and shared
surface projection, signature executable suppression and reconciler death after
result persistence. Details: [scenarios](scenarios.json), [review](review.md).

## Verification

Final targeted suite: **17/17**. One ordinary full suite after the final code
candidate: **884 tests, 765 passed, 119 native skipped, 0 failed** (77.44 seconds).
`npm run check` passed; independent syntax verification checked every exit code
for **196 JavaScript files**, plus AST parsing of **7 Python files**. No native
suite, model smoke or provider call was run. [Machine-readable checks](verification.json).

Review found one P1 and one P2. Both were confirmed and fixed with regressions:
configured GPG execution from reflog display, and lost task pointer causing a
saved observation to be rewritten. Review stayed within local delivery and
reconciliation. No broader refactoring or second review was added.

## Preservation and cleanup

Original development HEAD/status/tracked files and stable checkout are unchanged.
Both package files match the historical baseline. Task #2: 105/105 files unchanged,
seven runs; Task #3: 24/24 files unchanged. Production LaunchAgent file/runtime
binding, installation and schedule are unchanged. A natural scheduler tick moved
its run counter 111→112 with exit 0; only `scheduler.log` and
`scheduler/health.json` changed. Health remained successful; no extra/missing
production files. [Preservation evidence](preservation.json).

Confirmed fixture cleanup: zero delivery repositories, workers, lock helpers,
fixture agent files, loaded fixture agents or supervision sockets. Ordinary
suite explicitly used `OX2F_NATIVE_LAUNCHD=0`; it did not register LaunchAgents.
No fixture lifecycle or background-activity registration was performed. Historical
smoke evidence and development worktree are retained. [Cleanup evidence](cleanup.json).

## Limits and scoped verdicts

- **GO — read-only reconciliation in bound self-contained disposable repositories.**
  APPLIED proves exact object existence. It does not assert HEAD advancement,
  successful index installation, clean worktree or readiness for another run.
  Existing acceptance/workspace fences remain; reconciliation repairs nothing.
- **NOT_APPLIED is deliberately narrow.** Object absence after dispatch is never
  treated as proof of no effect. Old/incomplete intent remains UNCERTAIN.
- **Recorded reachability is historical.** Repeated calls return the saved
  observation; live monitoring or refreshing it is outside this slice.
- Included Git configuration, partial clones and alternate object stores are
  refused. Managed worktrees are ownership boundaries, not security sandboxes.
  External Git writers can force an uncertain observation.
- **Previously accepted offline, foreground and minimal local delivery verdicts
  remain scoped as before.** This slice adds no model/harness qualification or
  spending guarantee. No real-model full playbook canary was performed.
- **NO GO for production unattended activation/general arbitrary execution.**
  Earlier supervision qualification is not advanced by these tests. Real-project
  delivery, network delivery and publication remain outside the authorized scope.

No push/PR/merge/deploy/release/publication, provider integration, generic action
ledger, dashboard, runtime migration or production activation was implemented.

## Rollback and next user milestone

Rollback is a separate revert of implementation commit `6931cec` in the isolated
development branch, retaining task history and artifacts. No production rollback
or migration is needed because production was not changed. Do not run the older
local-delivery executor against new v2/reconciled tasks; retain this reader for
those observations. Evidence-only commit can be reverted separately.

Recommendation: choose a **full foreground playbook-canary** as the next user
milestone to verify the complete engineering path before extending delivery to
push/PR. Neither alternative has been started. Work stops at this completed slice.
