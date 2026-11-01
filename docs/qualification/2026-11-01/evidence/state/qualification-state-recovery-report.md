# State, execution ownership, and recovery qualification

Baseline: `809e3ab158a7304c9e07e9c6d95ce30542987460`, checkout `/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101`.
Read `AGENTS.md`, `docs/architecture.md`, and `docs/development.md`. Source remained read-only. All executions were deterministic local command/ACP fixtures in scratch directories, with tracked workers killed after reproduction. No real provider API, credential, or external mutation was used.

## Confirmed P1: worker completion overwrites successful user mutations

Contract: task context persists and is rebuilt into the next run; closeWork moves any status to done. Notes/corrections are accepted while a task is working.

Code: worker.mjs reads the task once at line 58, keeps `current = task` at 310, applies the outcome to that old object at 378, and writes it at 243–250. Its catch path similarly reapplies to `task` at 409–414. `withState` serializes worker callbacks in one process; it does not merge state written by actions or other processes.

Minimal reproduction: start a command that writes a started marker and waits for a release marker. Wait for started, call noteWork, confirm context.notes has one entry, release command, wait for ready. Actual context.notes is absent, although task.note remains in events.jsonl. The same sequence with closeWork returns done before release and becomes ready afterward; task.closed remains in the log.

Observed output: `expectedNotes=1, actualNotes=null, eventRetainsNote=true`; `expectedStatus=done, actualStatus=ready, eventRetainsClose=true`.

Impact: silently lost human constraints change the next provider's instructions. Closed tasks reopen. Run metadata may similarly be rolled back. Confidence high: reproduced with the real detached worker.

Remedy/tradeoff: perform short cross-process locked read/modify/write transitions, patch execution-owned fields on fresh Task state, preserve context and done, and validate current execution ownership. Reading fresh state without a lock still has a lost-update window. Do not hold a mutex for the entire provider invocation, which would block notes and decisions.

Verification: gated real worker plus concurrent note, correction, and close; assert state and future prompt preserve constraints and done. Repeat for success, normalized provider failure, exception, interactive callback, and session resume paths.

## Confirmed P1: sequential execution has two public holes

Contract: two runs of one task never execute concurrently; allow/reject continues exactly the same saved session.

A. Live rerun: actions.mjs 229–234 checks only task.status==working. A live ACP permission has status needs_you while its worker is alive. Calling rerunWork starts run 2 while run 1 remains alive. Reproduced with a paused local ACP agent, then rerun to a gated local command: both worker PIDs alive, and run 2 entered its command. After run 2 completed ready, exiting the old ACP agent made its original worker write failed with runs.length=1 and the old provider, while the event log still contained runs 1 and 2.

B. Duplicate resume: actions.mjs 359–364 spawns a resumed worker before an atomic task transition; state stays needs_you until a worker flips it. Two concurrent allowWork calls both succeed. Worker.mjs 328 checks only its startup snapshot and has no ownership claim. Reproduced with a persisted non-live permission and a real local ACP fixture supporting session/load: two workers both entered session/prompt against the same saved session. HTTP idempotency is insufficient for distinct request IDs or CLI/phone callers.

Observed output: `oldWorkerAlive=true,newWorkerAlive=true,runCount=2`; later `expectedRuns=2,actualRuns=1,expectedProvider=gate,actualProvider=fixtureacp,status=failed`. Duplicate-resume output: `actionStatuses=[fulfilled,fulfilled],providerInstancesExecuting=2`.

Impact: concurrent provider edits against one working directory or saved session, plus history loss from late completion. Confidence high: both reproduced through real workers; no source modifications.

Remedy/tradeoff: atomically reserve one execution before spawn; refuse rerun while a live paused worker owns the run, unless cancellation is implemented and completed first. Give every execution attempt a distinct identity and validate it before task-level writes, permission changes, and result.md publication. A run-number-only guard cannot distinguish duplicate resumes of the same run. Defensively prevent stale workers from overwriting the latest task/result/history.

Verification: live permission rerun and close/reopen paths, concurrent allow/reject across processes with distinct keys, duplicate session resumes, old-worker late events/failure/completion. Assert exactly one executing provider and immutable earlier runs. Check both task.json and task-level/per-run result files.

## Confirmed P2: dead live permission cannot recover

Contract: startup recovery turns interrupted executions into honest crashed failures and leaves genuine human decision stops intact.

Code: recover.mjs 126–129 skips every non-working task. Interactive permissions are needs_you with blockedOn.live=true while still owned by a worker. actions.mjs 339–344 trusts the live flag, writes permission.json, and returns working without any worker liveness check.

Minimal reproduction: create live local ACP permission; SIGKILL its real worker; wait for signal-0 liveness to fail; run recoverInterruptedRuns; call allowWork. Recovery returns zero tasks, persisted state stays needs_you/live, allowWork claims working, and its permission file has no consumer. Same state follows a host reboot while paused.

Observed output: `workerAlive=false,recoveredCount=0,actualPersistedStatus=needs_you,actualBlockedLive=true,allowReturnStatus=working,permissionFileExists=true`.

Impact: restart does not make the task honest or the permission actionable. User sees a successful grant that cannot progress. Rerun/close remain manual escape hatches, so this is P2 rather than a total data-loss blocker. Confidence high.

Remedy/tradeoff: include needs_you/live in execution recovery under the same ownership lock; finalize dead live workers as failed/crashed or explicitly downgrade to a supported non-live session-resume path. Keep non-live decisions/permissions unchanged. Refuse a live grant without a matching live worker/lease instead of returning false continuation.

Verification: kill/reboot at live pause, restart runtime, expect one terminal recovery and rerunnable task; allow cannot claim progress. Live paused worker survives runtime restart untouched. Non-live needs_you/decision states remain intact; repeat recovery is idempotent.

## Confirmed P2: each local launch leaks the parent's log descriptor

Code: nodes/local.mjs 44 opens run.log via fsSync.openSync; spawnWorker returns child.pid without closeSync on success or failure. Creation, rerun, and resume each take this path.

Minimal reproduction: recording spawn seam captures opts.stdio[1], call startExecution 32 times, fstat each captured FD after return. Actual 32 distinct FDs remain open (11,12,13,14,15,...). The child owns its duplicated stdio handles; the parent does not need its original open FD after spawn.

Impact: a persistent serve/UI runtime grows its open-FD count with task volume until EMFILE prevents filesystem work and launches. Confidence high.

Remedy: closeSync(logFd) in finally immediately around spawn; retain child handles. Attach asynchronous spawn error handling as a separate robustness concern.

Verification: after a successful spawn or synchronous spawn failure, fstat captured parent fd must fail with EBADF, while real child output still reaches run.log. Count stable descriptors across repeated create/rerun/resume.

## Existing regression coverage

Ran `node --test test/actions.test.mjs test/task-context.test.mjs test/recover.test.mjs test/acp-interactive-e2e.test.mjs test/node-local.test.mjs`: 49/49 passed in 1.14s while the above counterexamples reproduced.

Why they miss: action note/close tests use inert fake execution nodes; continuity tests add constraints only between completed runs; live ACP E2E covers allow/reject but neither death nor rerun; recovery tests exclude all non-working states but only exercise decision needs_you, not live permissions; node-local tests assert a numeric stdio FD but never assert closure; resume tests invoke actions one at a time.

Reproductions: `/tmp/qualification-state-recovery.mjs` and `/tmp/qualification-duplicate-resume.mjs`. The former prints all state-loss/live-rerun/live-recovery counterexamples. Scratch evidence roots printed by scripts; initial confirmed state-root was `/var/folders/f8/tlxp54cx22ngqflyh25cvvkc0000gn/T/qualification-state-ENeT2v`.
