# External workflow attempts on macOS

This boundary is for reviewed, local, unpaid command adapters that preserve
launchd's inherited process group. A definition must declare `commandAdapters`
and `unattendedAdapters`, a supervision policy with `processGroup:"inherit"`,
`daemonizes:false`, `unattended:true`, `network:false`, `paid:false`, and only
credential **names**. It is not an OS sandbox. Executables which detach, change
session/group, pass descriptors to unrelated processes, delegate work to other
services, or intentionally write outside their own outputs remain NO-GO.

Every output-producing compositor, including `python3` running the repository compositor, uses this boundary. The existing editorial collection mode (preview disabled, no image adapter,
no network or external changes) does not depend on supervision.

## Why two launchd roles

| Mechanism | Worker death | Supervisor death | Spawn/ownership gap |
|---|---|---|---|
| Worker-owned detached child | Can survive | No independent owner | Open |
| Long-lived user supervisor alone | Can observe loss | Can leave descendants alive | Needs another owner |
| Inherited worker group | Group termination helps ordinary cancel | Arbitrary worker SIGKILL is insufficient | Open |
| launchd service + one native job per attempt | Attempt helper observes birth loss | launchd closes the attempt job group | Adapter blocks on GO inside the already owned job group |

The workspace service uses KeepAlive, reconciles durable receipts, and independently watches worker loss/cancel/deadline, including a stopped attempt helper. Each
attempt uses a separate UUID-scoped native job, no KeepAlive, and
`AbandonProcessGroup:false`. macOS launchd owns the group before our runner
spawns anything. Its group cleanup survives runner SIGKILL. This behavior is
documented by Apple's [launchd plist manual](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)
and must also pass the real native tests on the target host. The service never
relaunches an external call. Logout/reboot can lose local work but cannot prove
whether a remote side effect occurred. Login loads the service again; retained
attempt jobs refuse any receipt past `prepared`, and a prepared attempt cannot
release GO for a dead worker.

Lifecycle also checks authoritative native program arguments against the workspace/runtime/attempt binding before signals or deletion. A damaged installation cannot target another workspace.

Ownership inspection uses libproc birth seconds **and microseconds**, boot
identity, a unique native job label, and group membership. The ABI comes from
Apple's [proc_bsdinfo definition](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/proc_info.h).
PID alone, second-resolution `ps lstart`, and a process name are insufficient.
Inspection distinguishes a verified live birth, proven absence, birth mismatch
and unknown observation. A failed inspector of a live/inaccessible PID is unknown,
not worker death. Unknown cannot authorize GO, promotion or signalling; watchdogs
retain the existing deadlines and require verified native ownership for signals.
Production signals target the validated native job; they never use a raw PID
or PGID. Unknown identity, reused groups, corrupt receipts, or uninspectable
native state block signals/promotion and require explicit investigation.

## Gate, outputs, receipts

1. Serialize intent allocation and persist the request and payload digest.
   Attempt identity binds task/slug/run, operation, definition/runtime digest,
   launch token, worker birth identity, executable pin, policy and limits.
2. Persist the native job plist and bootstrap it. The runner persists its own
   native owner and group before exposing the ownership handshake.
3. Spawn a Python gate **without** a new session/group. The gate applies file,
   descriptor, CPU and core-dump limits and blocks on an exact GO message.
   Persist the child identity and `running` intent before releasing GO.
   A runner death during this gap closes its native group; the adapter cannot
   have started a side effect before the gate is released.
4. Give the adapter only its own staging output path and copied inputs; never
   a current/accepted task artifact path. Track descendants after main exit.
   Completion requires no remaining adapter group members. A descendant holding
   an output descriptor delays completion and is terminated at the deadline.
5. Drain/close stdout and stderr, check successful exit, PNG header/dimensions when declared, exact allowed regular files, no symlinks, byte limits
   and SHA-256. Known credential bytes in outputs are refused and scrubbed once
   the group is closed. Raw stdout/stderr are discarded and never persisted.
   Seal files read-only and persist a manifest and validated receipt.
6. After the native runner/group has disappeared, take workflow and attempt
   locks, recheck worker/run/token, definition/runtime digests, cancellation,
   manifest and bytes, then atomically rename staging to the attempt archive.
   Replay after rename rechecks archived hashes. A stale/cancelled/uncertain
   attempt cannot promote. The archive is immutable by runtime protocol and
   read-only permissions, not protected against a malicious same-user actor.

The allowed state transitions are checked at every write, with receipt integrity
and optimistic version fencing in addition to kernel locks:

```text
prepared → owned → running → exited → validated → promoted
    └────────────── cancelling → cancelled / needs_reconciliation
    └────────────── uncertain / needs_reconciliation
exited → failed
uncertain / needs_reconciliation / cancelled / failed / exited / validated
    → reconciled (operator decision; never promotion or automatic invocation)
```

An orphaned pre-terminal receipt can also be reconciled explicitly, only after native job/group closure is proven.

A repeated operation ID returns the existing receipt and rejects changed payload.
A new external intent for a task is blocked while any earlier attempt is unresolved,
including attempts from older runs. Reconciliation records `confirmed-effect`,
`confirmed-no-effect` or `abandon`. A conscious retry needs a new operation and
attempt ID. Reconciliation/cleanup never execute the adapter. Uncertain staging
is retained. Cleanup removes staging only after explicit resolution and another
proof that no owned or surviving group remains; receipts and archives remain.

## Permissions, credentials and provider boundary

The preflight requires a healthy installed service, matching source/runtime
fingerprint and plist, pinned Node/Python/adapter identities, explicit permissions,
reviewed group contract, timeout 100..3600000 ms and outputs ≤64 MB. The gate caps
per-file bytes, descriptors (256), CPU seconds and disables core dumps; the runner
caps discarded stdout/stderr (500 KB) and wall time. These are bounded resources,
not comprehensive memory, filesystem or network isolation. Trusted executables
must honor their reviewed write/child contract.

At most 32 declared credentials (8 KB each, 64 KB total) are delivered in one bounded, strictly decoded UTF-8 packet. Only a minimal environment (PATH, locale, operation ID and declared credential
names) is delivered over an owner-only local socket. Loader/interpreter controls
such as NODE_OPTIONS, DYLD_*, LD_*, PYTHON*, PATH and WORKFLOW_* cannot be credential
names. Values are never saved in requests, receipts, logs or diagnostics. A local
same-user compromise and malicious executable are outside this trust boundary.

Provider metadata can carry a credential-free request identity, idempotency key
and status-lookup reference. Fixture ledgers model known and uncertain outcomes.
No real network, image or paid provider is enabled. Local process exit cannot
establish remote completion; no exactly-once guarantee is made. Network/provider
GO requires an implemented provider contract with verified idempotency or status
lookup, explicit manual resolution when neither can settle the outcome, and an
independently enforced provider-side spending cap for paid operations. Until
those capabilities and failure tests exist, network/paid policies are refused.

## Inspection and explicit recovery

```sh
2f workflow supervisor install
2f workflow supervisor status
2f workflow supervisor repair
2f workflow doctor
2f workflow attempt status
2f workflow attempt status <attempt-id>
2f workflow attempt cancel <attempt-id>
2f workflow attempt reconcile <attempt-id> confirmed-effect
2f workflow attempt reconcile <attempt-id> confirmed-no-effect
2f workflow attempt reconcile <attempt-id> abandon
2f workflow attempt cleanup <attempt-id>
2f workflow supervisor uninstall
```

Repair replaces only the service after closing verified active native attempts;
it does not rerun calls or clear uncertainty. Uninstall retains installation
identity as a disabled tombstone so old receipts remain inspectable. Neither
operation proceeds through ambiguous owner identity. Doctor is read-only and
reports installed/running/matching/healthy service, definition unattended safety,
active attempts, incomplete handshake, identity mismatches, surviving groups,
unpromoted staging and pending reconciliation. CLI/TUI/Web use the same task
projection and show external state separately from workflow worker state.

## Verification record

The private pre-change process experiment reproduced the previous HIGH with a
real workflow worker, adapter, child and grandchild: worker SIGKILL left the
three adapter processes alive, and output bytes continued growing. Birth/command-bound
identities and the group owner were captured; only that fixture group was killed.
`test/workflow-supervision.test.mjs` exercises actual disposable native jobs,
real owning workers and process trees. The final hardening report records the
completed test counts, scoped verdicts, schedule/task preservation and commit
closure. A test failure keeps the affected scope NO-GO until corrected.

The completed process suite contains 40 native checks, including actual editorial
worker SIGKILL, child/grandchild open-descriptor writers, stopped helper watchdog,
helper and service death, pre-GO fault windows, login-style job redelivery, stale
run/operation IDs, damaged manifest/receipt/installations, limits, credentials,
and isolated native Python execution. No independent reviewer-agent was run
without explicit user authorization; a separate manual invariant review and
black-box native verification were performed. This is not an external peer
review attestation. The final report identifies this review provenance explicitly.
The bounded follow-up, stable scheduler/runtime separation and historical evidence
limits are recorded in [workflow-supervision-stabilization.md](workflow-supervision-stabilization.md).
