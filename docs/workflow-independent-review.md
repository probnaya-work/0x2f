# Independent workflow review and stabilization — 2026-10-14

This review inspected the combined local implementation on `feat/opencode-acp-tui`,
starting at `e5f3a554a5fecc452a00ef4e98a82561095a789a`. The initial working tree
contained 82 changed/untracked files and no staged files. The earlier hardening
report was treated as a list of claims to check, not as proof. Its completion
record is historical; this report records the independently verified result.

## Protected state and recovery

Before editing, a binary Git patch for HEAD/index/working tree, all changed and
untracked bytes, the complete ignored `.work` tree, package files, LaunchAgent
plist/status and schedule records were backed up outside this repository.
A SHA-256/size/path manifest protects all 105 files of task #2, including seven
runs. The final manifest matches the exact original file set and bytes. Actual
task IDs remain 1 and 2. Neither package file was edited or included in the new
commits. Backup archives and operational logs contain private local state and
remain outside Git in an owner-only recovery directory.

The actual schedule was paused while runtime code changed, then the existing
UUID LaunchAgent was repaired against the verified runtime. Original schedule
bytes were restored: every two Lisbon calendar days, 10:00 Europe/Lisbon, next
2026-10-16. A no-due tick created no task. Final doctor is healthy and the agent
is loaded/matching. No real topic selection, publication, generated visual,
engineering execution, push, release or deployment was performed.

## Confirmed defects and minimal corrections

Each R1–R8 scenario failed on the original implementation in a disposable
workspace. The new tests use actual CLI/worker subprocesses, on-disk reads,
explicit SIGKILL assertions and fresh-process recovery.

| ID / severity | Reproduced failure or code evidence | Correction / verification |
|---|---|---|
| R1 HIGH | After `decision.intent-durable`, a new note/answer/close/refresh/rerun could mutate the journal's precondition or overwrite required `answer.json`, making replay conflict or lose intent. | Pending-operation barrier under the shared workflow lock; identical operation retry remains available. Separate CLI processes refuse later mutations byte-for-byte; fresh recovery yields one decision/event. |
| R2 HIGH | Acceptance intent followed by archive tampering was still accepted by replay: only result journals checked manifests. | Acceptance/publication replay checks archived size/SHA-256 before committing approval. Tampered pending acceptance refuses; restoring original bytes permits recovery. |
| R3 HIGH | A valid JSON tail without its newline passed `readEvents`; the next append concatenated two JSON objects and corrupted the log. | Append refuses unterminated tail. Explicit repair backs up and adds the separator for a valid final event; invalid tail removal and interior-corruption refusal remain. |
| R4 HIGH | Public-record `record` was read outside `files`; `.work`/private paths could bypass the source boundary. | Record must be allowlisted, paths share private/traversal validation at definition and descriptor-read boundaries; explicit image paths use that validation too. |
| R5 HIGH | Declared credential value in a material file was persisted into frozen task snapshots. | Check the entire constructed snapshot, including materials/history, before any task allocation. Disposable credential never reaches task state. |
| R6 MEDIUM | Malformed legacy `active` regular file made doctor throw instead of reporting a finding. | Per-lock error containment with read-only `LEGACY_LOCK` finding and unchanged file set. |
| R7 HIGH | Doctor accepted invented workflow review metadata; checkpoint hashes were syntax-checked without comparing saved text, so tampered evidence could be reused. | Doctor validates task identity/workflow/frozen digest. Kind-owned checkpoint validators verify content hashes during diagnosis and execution. Disposable evidence corruption is diagnosed and refuses rerun. |
| R8 MEDIUM | Schedule filename/ID mismatch escaped the per-file catch, aborted all remaining schedules and skipped durable tick health. | Diagnose mismatch per file, continue valid schedules and persist failed health. Separate healthy due task still dispatches. |
| R9 HIGH | LaunchAgent lifecycle swallowed all bootout failures and could remove/rewrite installation files while the old service remained loaded. | Confirm absence after failed bootout; unknown/still-loaded state refuses mutation. Controlled subprocess-boundary tests cover both refusals; actual install/repair/uninstall covers normal lifecycle. Missing/unloaded agent is visible drift. |
| R10 MEDIUM | Unbounded full baseline suite hung in relay-result teardown under load: server close preceded agent stop and fixture removal preceded outstanding persistence. | One ordered teardown awaits agent persistence, stops tailer, closes relay, then removes workspace. Targeted test and final full suite complete. |
| R11 HIGH | Malformed JSON parse failures echoed input snippets in state/event/source diagnostics. A short disposable secret reproduced the leak. | Shared JSON parsing reports a fixed diagnostic without file contents; whole materials are credential-checked before history parsing and snapshot construction. Regression rejects state/event-log content leaks and the same leak in explicit repair refusal. |

Run prompts/snapshots and refresh definition backups are now required hashed
journal inputs. Decisions/refresh also journal a post-commit `task.updated`, so
other open surfaces reload committed state after their earlier narrative event.
These changes address the same R1/R2 storage boundary without new workflow
features. Legacy task #2 is inspected only; no lazy upgrade is applied to it.

## Storage, execution and review boundaries

Inspection verified hidden creation staging and durable sequence allocation;
file fsync/rename/directory fsync ordering; task commit and idempotent journal
receipts; run/token/identity fencing; explicit cancellation requests; immutable
completed run archives; acceptance/publication separation; unknown-schema refusal;
source descriptor traversal; executable pins; bounded output; and trusted kind
registration. Advisory locks use a stable kernel mutex and release when their
holder's parent pipe closes. PID diagnostics are not lock ownership.

These mechanisms are cooperative guarantees. State-path checks and executable
pin verification do not provide an OS sandbox against a same-user process that
ignores the protocol. macOS identity uses ps birth time at second resolution
plus command hash: the PID-reuse test rejects an observed different birth, but
this is not a cryptographic process handle or proof against identical reuse in
that same second. The runtime fingerprint detects observable loaded/on-disk
drift; updates must still pause scheduling and restart UI processes. It does
not make a changing multi-module checkout an atomic distribution.

Local journal replay is restricted to decision/result/rerun/refresh. Other
lifecycle/context mutations serialize and write task state atomically, but an
abrupt crash between state and event append may leave an incomplete narrative
log. Event replay is not a universal event-sourced reconstruction of task state.
Acceptance validates the archived package; mutable current artifacts may change
while a new run is incomplete. Evidence SHA-256 detects accidental modification,
not an adversary who rewrites both data and hashes.

Known declared credential values are rejected, including snapshot materials.
This does not establish that arbitrary source prose or a trusted executable
cannot contain/encode an undeclared secret. Adapter environment is inherited;
credentialEnv is a declaration for checks, not an environment sandbox. Visual
PNG checking establishes signature/dimensions and archive byte integrity; it
is not a complete PNG decoder or typography/content approval.

Relay acknowledgment persistence occurs after shared action execution. Completed
saved receipts survive restart, but a crash between an arbitrary relay mutation
and saving its acknowledgment can leave uncertainty. Workflow decision receipts
provide their own idempotency; generic relay mutations have no external
exactly-once guarantee. Atomic pairing writes do not replace a cross-process
compare-and-swap protocol for configuration changes.

## Execution redesign boundary: open HIGH limitation

A dedicated real-process probe reproduced the known worker-SIGKILL limitation:
the detached visual adapter remained alive after its owning worker was killed.
The probe explicitly killed that adapter group, recovered the disposable task,
and removed the workspace. No model, image service or paid call was involved.

Preventing this reliably, and preventing a surviving adapter from racing a
later run's mutable output directory, needs execution supervision/watchdog and
isolated attempt output ownership. This part was stopped before redesign as
requested. Receipts suppress another uncertain external attempt; they do not
terminate an already running process or prove its remote result. Normal timeout
and SIGTERM/cancel are separately tested to terminate the actual adapter group.
This checkpoint is not a claim that unattended external adapters are safe after
arbitrary worker SIGKILL. No new generator or executor was enabled.

## Test quality and final verification

The existing workflow suites invoke real CLI and detached worker processes with
real temporary Git sources. Visual/image services are deterministic local argv
fixtures; no real paid service is tested. Crash injection deliberately targets
fixed durable boundaries with real process death rather than simulating restart
inside a mocked store. Some older helpers catch arbitrary CLI failures and some
races use in-process Promise.all: those cases alone do not establish that every
advertised crash point was reached or exhaust all OS interleavings. New tests
assert SIGKILL and use fresh CLI processes around the uncovered journal gaps.
No fuzzed power-cut, hardware fsync certification or physical reboot is claimed.

Fake-node API/unit tests verify action routing, not process lifecycle. Real
provider/mock-API and PTY tests supplement them. CLI/TUI/Web use shared actions
and workflow projection; decisions that accept/defer/reject/publish do not
continue execution. The suite's existing full PTY journey is primarily the
ordinary task flow; this review does not claim a new browser-driven editorial
journey. Historical run definitions and publication receipts remain distinct.

* `npm test -- --test-timeout=30000`: **731 passed, 0 failed,
  0 skipped**, 105.99 seconds.
* Focused workflow/hardening/stabilization/relay tests before the last three
  added process/lifecycle assertions: **68 passed, 0 failed**, 83.88 seconds.
* `npm run check`: passed. An independent exit-checked syntax pass covered 159 JS and all 5 Python files,
  including the four Python source files omitted by the existing check script.
  The existing find-based JS check alone does not aggregate child exit failures;
  the independent pass verifies those exits.
  No additional type checker or linter is configured in package scripts.
* Manual CLI flow: real disposable Git source, `needs_you`, one topic, no
  selection/visual/repost, packageComplete false.
* Doctor: healthy clean disposable workspace, intentionally damaged source
  checkpoint diagnosed; exact file hashes unchanged across both diagnostic calls.
* Real launchd: separate disposable workspace, `schedule:2026-10-14`, one task,
  `needs_you`; repeat tick creates no duplicate. Actual repair retains UUID;
  uninstall retains state and removes the temporary agent. Both workspaces removed.
* Actual workspace: all 105 protected SHA-256 values and paths match, seven
  historical runs remain; package/lock bytes and original schedule bytes match.
* Nine versioned reference PNG hashes match history. Example text contains no
  absolute user paths, private `.work` snapshots or credential values. Attribution
  is the supplied public publication reference, not private contributor records.

The initial sandbox run could not use ps or localhost listeners and is not counted
as implementation evidence. Subsequent process/network/launchd checks ran with
those specific host permissions. Test logs, operational probes, preservation
manifests and backup checksums are retained privately beside the recovery archive.

## Provenance and Git disposition

OpenCode/ACP (`8701c81`) and cancellation (`e5f3a55`) are already committed in the
starting HEAD. No separate new OpenCode/ACP implementation is present in the
82-file local diff. Workflow integration builds on those contracts. The local
pre-hardening binary patch proves earlier tracked edits to README, package files,
CLI/actions/router/store/runtime/server/worker; it does not prove authorship or
chronology of every untracked file. Core files contain overlapping first-version
and hardening hunks; no invented per-author attribution is used.

The table inventories every initial changed/untracked path. Existing workflow
implementation and confirmed fixes belong in the local workflow checkpoint.
Adjacent relay durability/projection/tests belong in a separate local commit.
Package files remain unstaged. Added review paths are
`test/workflow-stabilization.test.mjs`, `test/relay-result.test.mjs` (modified),
and this report. Runtime `.work`, `.review`, relay/data, dependencies, generated
outputs, logs and environment files remain ignored. No accidentally added
runtime/generated path was found in the initial untracked inventory.

| Path | Category | Git disposition |
|---|---|---|
| `README.md` | documentation | commit |
| `docs/workflow-hardening-audit.md` | documentation | commit |
| `docs/workflow-hardening-report.md` | documentation | commit |
| `docs/workflow-recovery.md` | documentation | commit |
| `docs/workflows.md` | documentation | commit |
| `examples/workflows/engineering/public-record.json` | inactive engineering contract | commit reusable example |
| `examples/workflows/engineering/workflow.json` | inactive engineering contract | commit reusable example |
| `examples/workflows/probnaya-editorial/examples.md` | editorial-specific defaults | commit reusable example |
| `examples/workflows/probnaya-editorial/history.json` | editorial-specific defaults | commit reusable example |
| `examples/workflows/probnaya-editorial/references/fig-004-mpa-in-service.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/fig-005-the-issue.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/fig-006-work-and-field.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/fig-007-before-first-observation.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/fig-007-chinotto-what-continues.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/fig-008-holder-relation.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/heard-public-field.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/observation-alexis.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/references/observation-mostafa.png` | compositor and public visual fixtures | commit public originals; no runtime output |
| `examples/workflows/probnaya-editorial/rules.md` | editorial-specific defaults | commit reusable example |
| `examples/workflows/probnaya-editorial/template.md` | editorial-specific defaults | commit reusable example |
| `examples/workflows/probnaya-editorial/visual-reference.md` | editorial-specific defaults | commit reusable example |
| `examples/workflows/probnaya-editorial/workflow.json` | editorial-specific defaults | commit reusable example |
| `package-lock.json` | pre-existing unrelated dependencies | keep unstaged; preserve bytes |
| `package.json` | pre-existing unrelated dependencies | keep unstaged; preserve bytes |
| `scripts/install-workflow-launchagent.mjs` | scheduler/LaunchAgent | commit |
| `scripts/setup-editorial.mjs` | editorial-specific implementation | commit |
| `src/cli.mjs` | workflow core and surface integration | commit |
| `src/core/actions.mjs` | workflow core and surface integration | commit |
| `src/core/durable.mjs` | workflow core and surface integration | commit |
| `src/core/faults.mjs` | workflow core and surface integration | commit |
| `src/core/lock-helper.py` | workflow core and surface integration | commit |
| `src/core/lock.mjs` | workflow core and surface integration | commit |
| `src/core/process-identity.mjs` | workflow core and surface integration | commit |
| `src/core/router.mjs` | workflow core and surface integration | commit |
| `src/core/runs.mjs` | workflow core and surface integration | commit |
| `src/core/source-reader.py` | workflow core and surface integration | commit |
| `src/core/store.mjs` | workflow core and surface integration | commit |
| `src/core/workflow-adapters.mjs` | workflow core and surface integration | commit |
| `src/core/workflow-artifacts.mjs` | workflow core and surface integration | commit |
| `src/core/workflow-doctor.mjs` | doctor/recovery | commit |
| `src/core/workflow-scheduler.mjs` | scheduler/LaunchAgent | commit |
| `src/core/workflow-schema.mjs` | workflow core and surface integration | commit |
| `src/core/workflow-sources.mjs` | workflow core and surface integration | commit |
| `src/core/workflow-transaction.mjs` | workflow core and surface integration | commit |
| `src/core/workflows.mjs` | workflow core and surface integration | commit |
| `src/nodes/local.mjs` | workflow core and surface integration | commit |
| `src/recover.mjs` | doctor/recovery | commit |
| `src/relay/agent.mjs` | adjacent hardening: relay durability/projection | commit separately |
| `src/relay/project.mjs` | adjacent hardening: relay durability/projection | commit separately |
| `src/runtime.mjs` | workflow core and surface integration | commit |
| `src/server.mjs` | workflow core and surface integration | commit |
| `src/tui/app.mjs` | workflow core and surface integration | commit |
| `src/tui/model.mjs` | workflow core and surface integration | commit |
| `src/tui/view.mjs` | workflow core and surface integration | commit |
| `src/web/app.js` | workflow core and surface integration | commit |
| `src/web/ledger.mjs` | workflow core and surface integration | commit |
| `src/web/workflow.mjs` | workflow core and surface integration | commit |
| `src/worker.mjs` | workflow core and surface integration | commit |
| `src/workflows/adapters.mjs` | editorial-specific implementation | commit |
| `src/workflows/decisions.mjs` | editorial-specific implementation | commit |
| `src/workflows/editorial-schema.mjs` | editorial-specific implementation | commit |
| `src/workflows/editorial.mjs` | editorial-specific implementation | commit |
| `src/workflows/provider.mjs` | editorial-specific implementation | commit |
| `src/workflows/registry.mjs` | editorial-specific implementation | commit |
| `src/workflows/visual.py` | compositor and public visual fixtures | commit public originals; no runtime output |
| `src/workflows/visual_plate.py` | compositor and public visual fixtures | commit public originals; no runtime output |
| `test/claude-resume.test.mjs` | tests | commit |
| `test/cli-rerun.test.mjs` | tests | commit |
| `test/codex-integration.test.mjs` | tests | commit |
| `test/e2e-security.test.mjs` | tests | commit |
| `test/gemini-integration.test.mjs` | tests | commit |
| `test/lan-mode.test.mjs` | tests | commit |
| `test/observed-files.test.mjs` | tests | commit |
| `test/provider-integration.test.mjs` | tests | commit |
| `test/relay-config-race.test.mjs` | tests | commit |
| `test/relay-projection.test.mjs` | tests | commit |
| `test/relay.test.mjs` | tests | commit |
| `test/runs.test.mjs` | tests | commit |
| `test/task-context.test.mjs` | tests | commit |
| `test/workflow-fixture.mjs` | tests | commit |
| `test/workflow-hardening.test.mjs` | tests | commit |
| `test/workflow.test.mjs` | tests | commit |
