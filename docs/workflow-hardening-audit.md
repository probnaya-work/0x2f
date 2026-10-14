# Workflow hardening audit — 2026-10-14

Scope: existing local checkout; no editorial selection/generation; task #2 is
protected by a byte-hash baseline of 105 files. The original schedule is backed
up and paused. Existing package.json/package-lock.json changes are preserved.

The table describes the implementation BEFORE hardening. Test coverage refers
to the existing 670-test suite, including 11 workflow integration cases. Those
cases establish the happy path and a few crashes, not all storage boundaries.

| ID / severity | Concrete failure / state effect | Safe recovery before fix | Existing coverage | Minimal correction |
|---|---|---|---|---|
| B1 BLOCKER | createTask exposes task.json before prompt/snapshot; crash can leave an incomplete visible task; malformed task is silently skipped and ID can be reused | Manual forensic inspection only; trigger may duplicate | Concurrent same trigger, no individual write faults | Stage directory, durable ID sequence, commit visibility last; strict reads and creation receipt |
| B2 BLOCKER | Rename without fsync can lose task/receipt after power loss; a lost image-attempt receipt permits repeating an external call | External result cannot safely be inferred | Completed image call reuse only | Fsync critical files and directories; durable attempt before invocation; uncertain receipt never retried |
| B3 BLOCKER | Worker updates workflow metadata before final outcome, writes result directly, and copies archive non-atomically; crash can advertise complete package with incomplete artifacts | No artifact integrity manifest | Whole-worker SIGKILL, not per-write crash | Immutable run artifact manifest; durable result before terminal task commit; validate receipt on acceptance |
| B4 BLOCKER | Worker pid is saved after spawn using stale task; worker completion/note can be overwritten. A cancelled process can still launch its adapter before handler setup | Early cancel partially mitigated, startup remains ambiguous | One early cancel case | Persist launch token/identity and gate; no adapter before gate; check durable cancellation; merge under task/workflow lock |
| B5 BLOCKER | Signal-0 treats a reused PID as the owner of a lock/run; cancel can signal an unrelated process. Dead-lock reaping has check/unlink races and unbounded loops on malformed active links | Unsafe manual unlink or false working status | Dead nonexistent PID only | Process-birth identity; bounded owner validation; serialize recovery and fail closed on uncertain ownership |
| H1 HIGH | answer/accept append notes before answer.json/events; retries duplicate decisions/publications or error after successful publication record | Human must determine whether action applied | Acceptance/publication separation, no retry receipts | Stable operation IDs, task-authoritative receipts and idempotent repeated decisions |
| H2 HIGH | answer/rerun are locked, but worker, note/correct/close/cancel are not in the same boundary; lost updates or terminal-state races | History can be overwritten | General cancel tests | Shared workflow mutation lock and fenced run finalization |
| H3 HIGH | No data schema versions; unknown/new fields or future runtime can be interpreted as current data | Manual edits; no compatibility boundary | None | Versioned strict readers; legacy read-only/lazy upgrade; backup affected files; fail closed on future schemas |
| H4 HIGH | Corrupt schedule and invalid nextDate/timezone can crash a tick; errors may not reach saved schedule health. Pausing requires a valid definition | Schedule may keep retrying without diagnosis | DST/coalescing valid inputs | Strict independent schedule validator; pause without definition load; durable tick health and explicit error exit |
| H5 HIGH | Trusted adapter executable can be replaced after config; env is inherited; argv/errors/snapshots can carry credentials | Cannot establish executable originally authorized | Adapter failure/timeout fixtures | Pin executable identity in snapshot and verify at execution; explicit command scopes; credential-safe boundary |
| H6 HIGH | Source realpath check followed by separate open is a TOCTOU boundary; .work and task slugs have no uniform path/symlink checks | Stop/manual inspection | No escaping-symlink fixture | Bounded file opens with identity checks; safe task paths; explicit source-root bindings |
| H7 HIGH | One global LaunchAgent label overwrites/rejects another workspace; no repair/uninstall/health, Node/Python/checkouts can drift silently | Hand-edit/reinstall | One real launchd cycle | Workspace identity and labels; install/status/repair/uninstall; runtime/path drift checks and health |
| H8 HIGH | Runtime code can change while a scheduled tick loads mixed modules; schedule JSON alone is not evidence of a healthy installed trigger | Pause manually | None | Maintenance/update gate; installed runtime fingerprint checked before due dispatch |
| M1 MEDIUM | Invalid JSONL is silently skipped; partial tail can combine with next event and corrupt audit chronology | No explicit repair command | Tailer tolerates partial/malformed lines | Strict persistence reader, diagnostic tail classification, explicit truncation repair with backup, event IDs |
| M2 MEDIUM | Workflow ID/version/origin/acceptance/publication are mostly hidden in prose; TUI ANSWER & CONTINUE can rerun after accept | Operator learns special grammar | Existing generic UI/TUI tests | One shared workflow projection and decision model; critical facts on all surfaces |
| M3 MEDIUM | Generic lifecycle code imports editorial decisions; adding a kind requires copying domain assumptions | Code edits in core | No new-kind contract verification | Static kind registry with validation/decision hooks and standard outcomes; no dynamic untrusted code |
| M4 MEDIUM | Local configuration pins a bundled Python path and relies on sibling fonts; there is no drift diagnosis | Manual path edits | Renderer on this machine only | Discovery/doctor/explicit binding repair; portable defaults; absolute requirements documented |
| L1 LOW | Temp files and failed staged artifacts accumulate | Safe owner inspection | No cleanup coverage | Doctor inventory and explicit cleanup; no automatic deletion of historical data |

Implementation and verification status will be recorded alongside this audit.
Exactly-once external execution is not claimed: a receipt can prevent retries,
but cannot prove what a remote provider did after an interrupted invocation.


## Disposition after implementation

| Risk | Status / concrete correction |
|---|---|
| B1 | Fixed: durable sequence; hidden task staging contains prompt/run/snapshot before visibility; corrupt visible tasks block allocation instead of being skipped. Trigger-bearing task is the creation receipt. Reserved IDs can have gaps. |
| B2 | Fixed for the local persistence contract: critical writes fsync the file, rename, then fsync directories; directory creation is synced. Pending external receipt precedes invocation. No physical power-cut certification is claimed. |
| B3 | Fixed: handlers return workflowPatch; durable per-run archive/manifests/results precede terminal state. Local journals verify hashes during replay; acceptance checks archive integrity. |
| B4 | Fixed for workflow workers: unique launch token, durable gate, process birth binding, durable cancellation checks, fresh state under shared lock. Legacy provider behavior is preserved rather than claiming this guarantee for every harness. |
| B5 | Fixed for cooperating POSIX runtimes: kernel advisory lock, bounded acquisition, diagnostic-only PID/owner file, EOF release and observed lock-loss fencing; new worker cancellation checks birth identity. Legacy live/unknown owners fail closed. |
| H1 | Fixed: operation IDs, payload identity, before-state preconditions, required-file hashes and idempotent event IDs; consecutive repeated answers and current-package publication are harmless. Intervening decisions permit a new intent. |
| H2 | Fixed: workflow answer/rerun/note/correct/cancel/close/refresh and final state serialize through one common lock. Worker checks run/token at commit. Execution slot is intentionally global across workflow kinds. |
| H3 | Fixed in this checkout: explicit schema 1, legacy read without rewrite, affected-file backups, frozen per-run metadata, explicit refresh/restart after runtime change, future-version refusal. Arbitrary previously shipped binaries cannot be retroactively constrained. |
| H4 | Fixed: strict independent schedule validation, O(1) overdue coalescing, pause without definition loading, per-file visible errors and durable tick health. Corrupt schedule JSON still requires explicit restore. |
| H5 | Fixed at the trusted adapter boundary: explicit scopes, executable realpath/inode/size/hash, output bounds and declared-credential rejection. No OS sandbox or protection against deliberately encoded secrets is claimed. |
| H6 | Fixed for allowed sources: root identity plus descriptor-relative O_NOFOLLOW read closes the check/open symlink race. State paths/slugs reject symlinks and traversal. A same-user actor ignoring the protocol remains outside the cooperative guarantee. |
| H7 | Fixed: workspace UUID labels; install/status/repair/uninstall; persisted binding, live loaded status and separate health; legacy singleton adoption only for its workspace. |
| H8 | Fixed for this runtime: loaded-code fingerprint and installed binding checked before dispatch; worker rechecks its creation fingerprint. Updating code during tests actually exercised this refusal. Paused scheduling remains the update procedure. |
| M1 | Fixed: strict JSONL reader, fsynced append, journal event IDs, read-only diagnosis; explicit tail-only repair with backup. |
| M2 | Fixed: one DOM-free workflow projection in CLI/TUI/Web, historical run origin/version metadata; acceptance/publication displayed separately; decisions do not automatically rerun after accept/published/defer/reject. |
| M3 | Fixed within the current contract: static trusted kind descriptors own definition/snapshot validation, bindings, execution and decisions; core owns transactions/lifecycle. Engineering stays inactive; schema extensions require reviewed code. |
| M4 | Fixed for this Mac and portable defaults: active definition uses python3 after Pillow preflight, explicit bindings repair with backup, Node/Python/checkout drift diagnostics. POSIX Python dependency is now explicit; a Windows backend remains a proposal. |
| L1 | Fixed locally: doctor reports hidden task staging and temp artifacts; explicit staging/temps repair, temp backups, no automatic history deletion. |

The Python stdlib lock helper is a deliberate trade-off: pure Node symlink lock
reaping lacks an atomic compare-and-unlink primitive, and PID/birth checks alone
cannot close a reaper race. The mutex inode is never removed. No npm dependencies
were added or changed by hardening.

Remaining proposals: native Windows lock/descriptor-read backend; a supervised
adapter process/watchdog with persisted process identity and isolated per-attempt
output directories; stronger versioned distribution/update tooling for old
installed runtimes. Evidence for the adapter proposal: runArgv uses detached
process groups, so SIGKILL of a worker can leave a trusted child until it exits.
The durable external receipt prevents repeated calls, but does not supervise an
already-started provider after the worker is gone. These require larger execution
architecture changes, rather than defensive checks or a claim of OS isolation.

Final verification records are listed in the hardening completion report.

## Additional failures found during integration

| ID / severity | Evidence / effect | Correction / regression |
|---|---|---|
| H9 HIGH | Pairing config was written in place; a concurrent poll could read empty JSON and discard a live connection. An acknowledgment could reach the phone before its replay cache was durable, so restart could repeat a mutation. | Atomic fsynced pairing writes; serialized acknowledgment persistence before delivery, explicit uncertain failure on persistence error. Real relay/LAN restart tests and delayed-write polling regression. |
| H6 follow-up HIGH | Editorial source collection could checkpoint the body of an unpublished public record before checking eligibility. | Validate eligibility first; exclude private body bytes before checkpointing. Disposable regression verifies no private text in saved evidence. |
| Test lifecycle | Terminal task state precedes the final notification and process exit. Immediate fixture deletion caused ENOTEMPTY in Claude/Gemini/Codex integration; overloaded pairing fixtures timed out before a valid answer. | Wait for each fixture's detached writer to exit before teardown. Pairing timeout permits the normal ceremony under full-suite load; assertions and fault scenarios are retained. |


## Subsequent independent review

The original completion claims above are historical. A fresh review reproduced
additional persistence, integrity, source, diagnostic, scheduler lifecycle and
test-teardown defects. Corrections, current verification and the unresolved
worker-SIGKILL execution-supervision boundary are recorded in
[workflow-independent-review.md](workflow-independent-review.md).
