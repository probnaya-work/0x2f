# Bounded supervision stabilization, 2026-10-15

Scope: local stabilization of `feat/workflow-supervision` after `e603627`,
without provider integration, architecture expansion or production external
adapter activation. The preceding verified editorial runtime is `4e568b7c5d06`.

## Scheduled execution is isolated from development

The actual scheduler originally referenced the failing development checkout.
The real schedule was paused before any source edits. A detached stable worktree
at `4e568b7c5d063720a5296fe4730c7cbf06892125` was created outside that checkout.
Its locally available dependencies were copied; private `.work` was not copied.
Using the stable runtime's supported `workflow agent repair` command installed
its CLI as ProgramArguments while retaining the original state workspace as
WorkingDirectory. The installation fingerprint now belongs to the stable source,
package and pinned interpreters. Launchd's own `print` confirmed both bindings.

The schedule was then resumed. A stable-runtime no-due tick returned `[]` and
doctor returned healthy with no issues and unlocked workflow/task-create locks.
Next slot remains **2026-10-16 10:00 Europe/Lisbon (09:00 UTC)**. A development
runtime doctor/tick sees the intentional scheduler/runtime mismatch; it must
not repair this production agent back onto the development checkout.

## Exact saved failures and evidence limits

The saved default post-commit suite passed 768/772; these four tests failed:

| Area | Test | Exact error | Observed lifecycle and classification |
| --- | --- | --- | --- |
| Startup/health | `crash consistency / creation / create.inputs-durable` | `Expected needs_you, received failed: Lock helper timed out; Python 3 with POSIX fcntl is required.` | Next task's worker failed before expected review completion. Inspector/helper latency or lock contention is unresolved; not proven to be test flakiness or contamination. |
| Startup/health | `acceptance replay rechecks archive bytes before committing approval` | `Expected needs_you, received failed: Unattended workflow is blocked: supervisor absent, unhealthy or drifted.` | Initial package generation failed, before the approval replay/tamper assertion. Exact health/binding branch is not recorded; unresolved. |
| Identity observation | `real child/grandchild/open output descriptors / worker-kill` | `Timed out: grandchild` | Tree did not reach its PID-file barrier before worker fault injection. An earlier failure can prevent the barrier; exact receipt/identity at that instant is unavailable. |
| Startup/health | `real CLI / detached worker / saved package / decisions / immutable history` | `Lock helper timed out; Python 3 with POSIX fcntl is required.` | Test process failed acquiring a mutation lock. Saved stack names the helper timer, without the lock root or current phase. Exact holder/startup state is unresolved. |

The bounded-concurrency repeat passed 769/772 and failed different cases:
creation at `task.json.renamed` with `Only validated attempts can be promoted`,
successful attempt with `Timed out: promotion`, and the `both` tree case with
an undefined observed group instead of the expected PGID. This introduces the
output validation/promotion area as well as identity observation.

Those old logs did not retain before-cleanup process/file inventories. Final
cleanup inventory was empty, but that does not establish what existed at the
failure instant. No retrospective PID, file, descriptor or lock ownership is
invented. Different test names across runs demonstrate timing-dependent symptoms;
they do not prove one common root cause, cross-test pollution or mere load.
Optional private diagnostics now capture receipts, native identity records,
task statuses, lock-owner metadata, relative file inventory and selected live
PID/group/command observations before cleanup. They omit environment values,
task contents and adapter stdout. A collection race is explicitly recorded.

## Confirmed defects and bounded fixes

1. **Product defect in identity semantics:** the native inspector returned
   `unknown` for both an unobservable live process and an exited process;
   `attemptIdentityMatches` collapsed either to false. Service/runner watchdogs
   interpreted false as worker loss. In particular, the service could demote a
   validated attempt to reconciliation during a transient observation failure.
   Observation now returns `alive`, `gone`, `mismatch` or `unknown`. ESRCH proves
   absence; failed inspection of a live/inaccessible PID remains unknown.
   Unknown never authorizes GO, promotion or a signal. Watchdogs do not invent
   worker death from unknown; existing cancellation/deadline checks still apply
   where the native owner is verified. Promotion still takes workflow/attempt
   locks and rechecks the full worker/run/token/digest/manifest/group fence.
2. **Test observation race:** PID-file presence preceded successful native birth
   observation. Tree tests now capture all three actual birth/group identities
   while the processes are alive, inside the existing barrier/deadline, before
   sending either fault. The real-process group assertions remain unchanged.
3. **Confirmed incorrect test expectation:** a new targeted failure in `both`
   asserted runner liveness *after* worker SIGKILL. The watchdog was already
   entitled to kill the runner. Authority is now asserted before both signals;
   signals follow synchronously with no identity await between them. No assertion
   or timeout was weakened. This confirms this race, not every older failure.
4. **Explicit trust declaration:** schema rejects `unattendedAdapters:true`
   without the reviewed supervision policy, even for a collection definition.
   Shared CLI/TUI/Web output states that the contract trusts a local executable,
   requires inherited group and attempt outputs, and provides no OS sandbox.

The socket is listening with owner-only permissions before `owned` is persisted;
the runner records the blocked gate's native identity and `running` before GO.
Install readiness requires the existing fresh heartbeat, native identity,
executable pins and matching runtime/plist. A missing/unobservable process is
never promoted to healthy by the changes here. Validation and promotion retain
their locked, monotonic transitions; no new writer or automatic external retry
was introduced. Startup/health and lock-helper historical failures remain
unproven until the final verification evidence resolves their scope.

## Verification boundary

Before changes, the seven selected historical failing scenarios passed five
targeted runs (35 passes). After the confirmed fixes, eight targeted scenarios,
including a real delayed inspector-process regression, passed five consecutive
runs (40 passes). The first intermediate run exposed the `both` assertion race
described above and is retained as evidence. No full suite was used during these
iterations. Final focused/full/check results and scoped verdicts follow below.

Trusted local adapters require a pinned, reviewed executable that preserves the
native group, does not daemonize or hand off work/descriptors, and writes only to
its supplied attempt directory. Arbitrary/untrusted command adapters remain
**NO-GO** without OS-level isolation. Network/provider adapters remain **NO-GO**
without provider idempotency/status lookup, a credential boundary and provider-side
spending limits. Local supervision cannot prove remote effect completion.

No push, PR, merge, deploy, release, topic selection or publication is authorized
or performed. Package changes are protected pre-existing work, excluded from
commits. Task #2 and its 105 files are protected by the pre-phase size/SHA-256
manifest; all seven runs and the single original state tree remain in place.

## Final bounded verification and verdicts

- Focused native suite: **41/41**, zero failures/skips.
- Two consecutive unchanged full suites: **773/773 + 773/773**, zero failures,
  cancellations or skips; 267396 ms and 241353 ms respectively. No per-test retry
  or code change occurred between them. No third full suite was run.
- `npm run check` and both supervision Python AST checks passed.
- One additional disposable real CLI/worker/launchd flow reached `needs_you` with
  one promoted attempt, sealed archive and empty native group; its workspace was
  removed by normal cleanup.
- Native inventory found zero fixture processes, supervision jobs or plists.
  Fifty-eight inactive previous fixture residues were checked for process
  references, open handles and active kernel locks, archived privately, then
  removed from temporary storage. Seventy-two stale owner-only IPC directories
  were also checked for absent native jobs/open handles and removed without
  connecting to their sockets or signalling any PID. No fixture workspace or IPC
  directory remained. Recovery
  evidence/archives are intentional retained files outside Git.
- Stable runtime doctor was healthy, without issues. The real scheduler was
  loaded/matching, unpaused, and both production mutation locks were unlocked.
- All 105 task #2 files retained exact sizes/SHA-256, no extra/missing files;
  seven runs retained. Both protected package files retained exact baseline bytes.

**Existing scheduled collection: GO on the isolated stable runtime.**

**Trusted supervised local adapter: NO-GO for rollout pending independent
fresh-context review and closure/classification of the historical lock/health
failure evidence.** The candidate has passed the bounded verification above;
this does not manufacture a root cause for the uninstrumented historical errors.
The confirmed identity semantics and test races are fixed. No external adapter
was activated for the real workspace.

**Arbitrary/untrusted command adapter: NO-GO without OS-level isolation.** The
remaining surviving-adapter HIGH includes group/session escape, daemonization,
descriptor/work handoff and writes outside staging. This phase does not claim
safety for such executables after arbitrary worker SIGKILL.

**Network/provider adapter: NO-GO** until provider idempotency/status lookup,
credential boundary, reconciliation and provider-side spending limits are
implemented and verified. No real provider or credential was connected.

Review provenance: the author performed a separate invariant/diff inspection of
spawn ownership, restart, fencing, archive promotion, uncertainty, fail-closed
scheduling and credential persistence. This is not independent fresh-context
review. Session rules require explicit authorization for a reviewer-agent; that
question was sent and no authorization was received. An independent review is
therefore still outstanding, rather than reported as completed. The two passing
full-suite logs, intermediate failure, exact staged diffs and preservation/cleanup
checks are retained in private evidence. Local commits contain source/tests/docs
only; their identities are in the final Git log and closure report.
