# Local workflow hardening — completion evidence

Date: 2026-10-14. Checkout: `work-cli-v0` (local repository).
Scope: common 0x2F workflow mechanics; PROBNAYA topic selection, new visuals,
publication and further editorial intelligence are outside this phase.

## Audit and implementation

The initial audit identified 5 BLOCKER, 8 HIGH, 4 MEDIUM and 1 LOW risks.
Integration added H9 (pairing/replay durability) and a source-eligibility follow-up
to H6. All local corrections are documented individually in
[workflow-hardening-audit.md](workflow-hardening-audit.md), including original
failure, state effect, prior coverage, recovery and correction.

Common 0x2F now owns staged durable creation and ID allocation, advisory locks,
process birth/launch authorization, operation journals and receipts, immutable
run artifact manifests, strict schema/read boundaries, source descriptor reads,
executable identity pins, schedule coalescing, installed runtime binding,
diagnostics/recovery, and a shared CLI/TUI/Web state projection. Relay pairing
and replay cache use durable writes. Publication rules, public-record eligibility,
topic/review decisions, visual templates and editorial task fields are owned by
the trusted editorial kind descriptor, rather than generic task lifecycle code.
The static descriptor contract is documented in [workflows.md](workflows.md).
No DAG engine or new active workflow kind was added.

## Exact guarantees

* A preserved trigger key identifies one visible task in its workspace under
  cooperating locks. Creation commits visibility only after its inputs exist.
  Reserved IDs may have gaps. Removal/restoration of state can invalidate this
  guarantee; unrelated manual keys represent separate intents.
* Critical file replacement uses file fsync, rename and directory fsync.
  Required results/manifests precede terminal task state; acceptance checks
  archived size/SHA-256. Journals replay only matching state and required hashes.
* An image attempt has a durable pending receipt before invocation and is at
  most once per task. Uncertain outcomes are not automatically retried. A receipt
  cannot prove remote completion or charging; external exactly-once is not claimed.
* Local reads may repeat before the evidence checkpoint; committed bytes are
  reused. Local artifact preparation may repeat before its completed archive.
* Decisions accept stable operation IDs and reject payload reuse conflicts.
  Consecutive identical legacy answers and repeated acceptance/publication of
  the current package are idempotent. An intervening decision establishes a new
  intent. Publication confirmation stores a supplied HTTPS URL without publishing.
* Workflow mutations/finalization serialize. New workers need a persisted launch
  gate/token and process birth identity; cancellation is checked at startup and
  commit. Kernel locks release on parent/helper death and never unlink the mutex.

These are cooperative POSIX/process-crash guarantees. They are not an OS sandbox,
external-provider guarantee, physical power-cut certification, or a retroactive
constraint on old released binaries.

## Schemas and recovery

New workflow definitions, frozen snapshots, schedule state, decisions, receipts,
source checkpoints, packages, artifact manifests, scheduler installation/health
and ID sequence use schema 1. Missing version is legacy 0. Future or invalid
versions fail closed. There is no mass migration: only touched legacy files have
adjacent backups and lazy upgrade. Existing task #2 is excluded from upgrades.
Refresh explicitly adopts current bindings/runtime while retaining prior runs
and checkpointed evidence; acceptance/completeness must be established again.

`workflow doctor` reads without repairing, advancing schedules or creating locks.
It reports corrupt/incompatible state, pending journals/external attempts, workers,
locks, source/executable drift, artifact integrity and scheduler health.
`workflow recover <id>` and separate `workflow repair events|locks|staging|temps`
perform explicit bounded repairs with backups. Invalid JSON, conflicting journals
and uncertain external effects require inspection/trusted restoration.
`workflow bindings` repairs Python configuration; `workflow agent repair`
rebinds the installed runtime. Full commands and state-specific instructions are
in [workflow-recovery.md](workflow-recovery.md).

## Verification coverage

Disposable subprocess tests actually SIGKILL at ID reservation, staged inputs,
task visibility, task file fsync/rename/durability, worker before/open gate,
source checkpoint, artifact fsync/rename/durability, archive completion,
result file persistence and intent/state/complete, decision intent/state/complete,
external pending/output persistence, rerun/refresh intent/state, and visible
scheduled task before schedule advance.

Tests cover same/different concurrent triggers, answer/rerun, early/active cancel,
active/terminal refresh, lock owner/helper death and loss, PID reuse, wrong launch
token, tampered/future definitions/snapshots, invalid schedule/timezone, corrupt
JSON/JSONL, missing/oversized/symlink sources, changed adapter, timeout, uncertain
external outcome, missing/tampered artifacts, repeated decisions/publication,
private-record exclusion, moved runtime/Node binding, separate agent labels,
missed slots/DST/repeated ticks, and read-only doctor file hashes.

CLI, TUI and Web share workflow ID/version, run/trigger/origin, selected topic,
review, completeness, acceptance, publication, errors and artifact manifest paths.
Acceptance and publication remain separate; accept/defer/reject/published do not
start another run. Historical run metadata remains inspectable. Phone projections
omit private definitions, source roots, executable pins and private decisions.

## Operational results

Hardening and operational verification completed successfully in this checkout.

* `npm run check`: passed; all four Python source files also parse successfully.
* `npm test -- --test-timeout=30000`: **719 passed, 0 failed, 0 skipped**, 103.96 s.
  This includes unit, integration, real vendor CLI/mock API, relay/LAN/crypto,
  PTY/TUI and crash/race workflow tests. Earlier failed iterations exposed real
  persistence and test-teardown races; the final full run is the completion proof.
* Real manual editorial collection: disposable workspace, definition 1.1.1,
  three topics, `needs_you`, no selection, packageComplete false; doctor healthy.
* Real launchd collection: a separate disposable workspace, one scheduled task
  for `schedule:2026-10-14`, three topics, `needs_you`. Repeat tick creates zero
  duplicates. Actual repair retains label/binding; actual uninstall retains task
  and schedule data. No visual, generated asset or personal repost is produced.
* Actual workspace: singleton agent adopted with backup; new agent
  `work.probnaya.0x2f.workflow.2519c81a-c8ab-4939-89e3-d341467d149b`
  installed, loaded, matching with no drift; last tick successful. Schedule resumed:
  every two calendar days, **10:00 Europe/Lisbon**, next **2026-10-16**.
  The no-due restoration tick creates no task. Actual doctor is healthy.
* Actual task set remains IDs 1 and 2. Task #2's **105 file hashes and exact file
  set match baseline**, including all seven runs and previous artifacts. Package
  and lock file bytes match their pre-hardening baseline.

Evidence is retained under `.work/hardening-verification/`: `manual.json`,
`launchd.json`, `scheduler-final.json`, `task-2-preservation.json`, `full-tests.log`,
`check.log`, `changed-files.json` and `git-status.txt`. Original protections and
schedule are retained under `.work/hardening-baseline/`. These are ignored local
operational evidence, not committed application data.

No topic has been chosen, no new visual or final publication package created,
and nothing committed, pushed, released, deployed or published. Task #2 continues
to await a user decision. This verified installation is local; the npm release
and any already-running older UI process have not been updated.

## Remaining limits and concrete follow-ups

* Node >=20 and Python 3/POSIX fcntl are mutation dependencies. Windows needs a
  native lock/descriptor-read backend at the existing helper boundary.
* Trusted command adapters inherit process privileges. Permissions/pins validate
  the protocol, but cannot enforce OS/network isolation, dollars or deliberately
  encoded secrets. Provider limits remain outside this runtime.
* A trusted detached child may survive worker SIGKILL until it exits. A supervised
  adapter/watchdog with persisted child identity and isolated attempt directories
  is a larger execution-node change. Receipts already prevent repeat calls.
* Previously released runtimes cannot be taught retroactively to respect schema
  1. Versioned distribution/update tooling is a follow-up; use the verified checkout
  CLI and restart existing UI processes after source changes.
* Reboot/logout/sleep scheduling semantics are covered by controlled fixtures and
  real launchd load/lifecycle. This phase does not physically reboot the Mac.
  Powered-off/logged-out hosts cannot execute tasks; overdue slots coalesce.


## Git and file inventory

Branch: `feat/opencode-acp-tui`. Work remains local and uncommitted. No commit,
push, PR, deployment, release or publication is performed in this phase.
The checkout was already dirty. Prior tracked changes included README,
package.json/package-lock.json, CLI, actions/router/store/runtime/server/worker;
the editorial subsystem, examples, setup scripts and workflow tests also existed
locally before hardening. Their work is retained. Both package files match their
saved pre-hardening bytes, so their Git diff belongs to the earlier work.

The following inventory is the final combined working-tree diff/untracked set;
it deliberately does not mislabel every file as newly created by hardening.
Generated operational evidence in ignored `.work` is separate.

| File | Git state |
|---|---|
| `README.md` | modified tracked |
| `docs/workflow-hardening-audit.md` | untracked |
| `docs/workflow-hardening-report.md` | untracked |
| `docs/workflow-recovery.md` | untracked |
| `docs/workflows.md` | untracked |
| `examples/workflows/engineering/public-record.json` | untracked |
| `examples/workflows/engineering/workflow.json` | untracked |
| `examples/workflows/probnaya-editorial/examples.md` | untracked |
| `examples/workflows/probnaya-editorial/history.json` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-004-mpa-in-service.png` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-005-the-issue.png` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-006-work-and-field.png` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-007-before-first-observation.png` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-007-chinotto-what-continues.png` | untracked |
| `examples/workflows/probnaya-editorial/references/fig-008-holder-relation.png` | untracked |
| `examples/workflows/probnaya-editorial/references/heard-public-field.png` | untracked |
| `examples/workflows/probnaya-editorial/references/observation-alexis.png` | untracked |
| `examples/workflows/probnaya-editorial/references/observation-mostafa.png` | untracked |
| `examples/workflows/probnaya-editorial/rules.md` | untracked |
| `examples/workflows/probnaya-editorial/template.md` | untracked |
| `examples/workflows/probnaya-editorial/visual-reference.md` | untracked |
| `examples/workflows/probnaya-editorial/workflow.json` | untracked |
| `package-lock.json` | modified tracked |
| `package.json` | modified tracked |
| `scripts/install-workflow-launchagent.mjs` | untracked |
| `scripts/setup-editorial.mjs` | untracked |
| `src/cli.mjs` | modified tracked |
| `src/core/actions.mjs` | modified tracked |
| `src/core/durable.mjs` | untracked |
| `src/core/faults.mjs` | untracked |
| `src/core/lock-helper.py` | untracked |
| `src/core/lock.mjs` | untracked |
| `src/core/process-identity.mjs` | untracked |
| `src/core/router.mjs` | modified tracked |
| `src/core/runs.mjs` | modified tracked |
| `src/core/source-reader.py` | untracked |
| `src/core/store.mjs` | modified tracked |
| `src/core/workflow-adapters.mjs` | untracked |
| `src/core/workflow-artifacts.mjs` | untracked |
| `src/core/workflow-doctor.mjs` | untracked |
| `src/core/workflow-scheduler.mjs` | untracked |
| `src/core/workflow-schema.mjs` | untracked |
| `src/core/workflow-sources.mjs` | untracked |
| `src/core/workflow-transaction.mjs` | untracked |
| `src/core/workflows.mjs` | untracked |
| `src/nodes/local.mjs` | modified tracked |
| `src/recover.mjs` | modified tracked |
| `src/relay/agent.mjs` | modified tracked |
| `src/relay/project.mjs` | modified tracked |
| `src/runtime.mjs` | modified tracked |
| `src/server.mjs` | modified tracked |
| `src/tui/app.mjs` | modified tracked |
| `src/tui/model.mjs` | modified tracked |
| `src/tui/view.mjs` | modified tracked |
| `src/web/app.js` | modified tracked |
| `src/web/ledger.mjs` | modified tracked |
| `src/web/workflow.mjs` | untracked |
| `src/worker.mjs` | modified tracked |
| `src/workflows/adapters.mjs` | untracked |
| `src/workflows/decisions.mjs` | untracked |
| `src/workflows/editorial-schema.mjs` | untracked |
| `src/workflows/editorial.mjs` | untracked |
| `src/workflows/provider.mjs` | untracked |
| `src/workflows/registry.mjs` | untracked |
| `src/workflows/visual.py` | untracked |
| `src/workflows/visual_plate.py` | untracked |
| `test/claude-resume.test.mjs` | modified tracked |
| `test/cli-rerun.test.mjs` | modified tracked |
| `test/codex-integration.test.mjs` | modified tracked |
| `test/e2e-security.test.mjs` | modified tracked |
| `test/gemini-integration.test.mjs` | modified tracked |
| `test/lan-mode.test.mjs` | modified tracked |
| `test/observed-files.test.mjs` | modified tracked |
| `test/provider-integration.test.mjs` | modified tracked |
| `test/relay-config-race.test.mjs` | modified tracked |
| `test/relay-projection.test.mjs` | modified tracked |
| `test/relay.test.mjs` | modified tracked |
| `test/runs.test.mjs` | modified tracked |
| `test/task-context.test.mjs` | modified tracked |
| `test/workflow-fixture.mjs` | untracked |
| `test/workflow-hardening.test.mjs` | untracked |
| `test/workflow.test.mjs` | untracked |


## Subsequent independent review

The original completion claims above are historical. A fresh review reproduced
additional persistence, integrity, source, diagnostic, scheduler lifecycle and
test-teardown defects. Corrections, current verification and the unresolved
worker-SIGKILL execution-supervision boundary are recorded in
[workflow-independent-review.md](workflow-independent-review.md).


## Final stabilization closure — scoped GO / NO-GO

This section supersedes the earlier uncommitted inventory and operational
snapshot above. It closes the review on `feat/opencode-acp-tui`; it does not
implement execution supervision or activate another adapter.

### GO: the current scheduled PROBNAYA editorial collection

**GO only for the current configured local collection stage:** collect explicitly
allowed local/public evidence, save topic drafts, and stop at `needs_you` for a
human decision. The verified configuration has `previewFirstTopic:false`, no
configured image adapter, `imageGeneration:false`, `network:false`, and
`externalChanges:false`. No selection, rendering, generated asset, repost,
publication, external mutation or paid call is part of this scheduled scope.

`commandAdapters:true` remains necessary for the existing trusted local Git and
Python helpers. Here, “without external adapters” means that no separately
configured command/image/network service is enabled; it does not mean that the
implementation never launches a local helper process. This GO accepts the
reviewed cooperative local persistence limits. A helper crash can fail collection
and require explicit recovery; it does not authorize an automatic external retry.

The GO is conditional on those configuration restrictions remaining in force,
valid explicit source permissions/bindings, a matching loaded runtime/LaunchAgent,
healthy doctor state, and the existing source/schema/integrity checks. Pausing
schedules and restarting/rebinding after runtime changes remains required.
Changing scope or enabling an external adapter requires a new verdict.

### NO-GO: unattended command / image / network adapters

**NO-GO for unattended workflows with separately configured command, image or
network adapters.** The surviving-adapter issue remains **HIGH**: a real probe
confirmed that an independently detached adapter survives its worker's SIGKILL.
Its continued activity can escape cancellation and race later mutable output.
A pending receipt prevents another uncertain invocation but cannot stop an
already running process, establish a remote outcome or prevent provider charges.

External unattended adapters are **not considered safe after arbitrary worker
SIGKILL**. Passing normal timeout/SIGTERM tests or enabling a permission flag does
not change this verdict. Network adapters are currently refused by the supported
configuration contract; this report does not introduce or enable them.

The second verdict can become GO only for a specifically reviewed adapter and
scope after all of these acceptance conditions are met:

1. **Supervision/watchdog and durable ownership:** a supervisor independent of
   the worker owns and tracks the adapter and its process tree, with durable
   attempt/launch identity and a launch handshake that closes the unowned-spawn
   window. Worker death cannot leave a silently unmanaged attempt. A surviving
   attempt is stopped or remains under verified independent ownership, and the
   affected task/slot fails closed until reconciliation. Supervisor failure has
   a tested OS supervision/containment or equivalent fail-closed policy too;
   arbitrary adapter daemonization is not assumed safe.
2. **Isolated attempt output ownership:** each attempt writes into its own
   contained directory. Late or orphaned writers cannot mutate another attempt,
   the current package, task metadata, evidence or completed run archives.
   Promotion occurs atomically under the task/workflow lock only after current
   ownership/run/token and size/SHA-256 validation; an expired owner cannot commit.
3. **Uncertain external effects stay uncertain:** durable invocation intent and
   receipts survive restart; a lost response never causes automatic replay of
   an external call. Use provider idempotency/reconciliation where available,
   otherwise require explicit operator reconciliation. GO must state its
   at-most-once/uncertainty boundary, never claim remote exactly-once completion.
4. **Explicit capability and resource review:** the particular command/image/
   network capability is implemented and separately authorized, with executable
   identity, scoped source/output permissions, bounded environment/credentials,
   output/duration limits and credential-safe diagnostics. A paid provider needs
   a provider-enforced hard spending limit; the present command interface cannot
   enforce a dollar budget. Publication or another irreversible action retains
   its separate permission and receipt boundary.
5. **Independent process-level verification:** new-process disk-state tests kill
   the worker at spawn/ownership, invocation, output and promotion boundaries;
   exercise supervisor failure, SIGTERM, timeout, restart/recovery and concurrent
   cancel/rerun. They prove no unmanaged local adapter/process tree, no late
   output promotion/history corruption and no duplicated external invocation by
   counting the actual side effect. A real disposable launchd lifecycle, clean
   read-only doctor, full suite/check and scoped independent review must pass.

The next implementation phase is **supervision/watchdog and isolated attempt
output ownership**, followed by that verification and a new scoped review. It is
explicitly outside this stabilization phase. No LLM/image adapter, topic choice
or publication was added here.

### Existing local commits and provenance boundaries

Both implementation commits already exist; neither was amended or rewritten.
Two additional test-only corrections and a small adjacent relay startup fix
were needed during post-commit verification:

| Commit | Scope |
|---|---|
| `4411eb70d9d8ba21c4a3fee231de2d6ac46dd2dd` | Workflow runtime/durability/scheduler/recovery, surface integration, tests/docs **and** the statically required editorial kind/compositor/public fixtures; 75 files. |
| `ea434ab9f94f2890e9e8ed9731e62b3784467caa` | Adjacent relay durability/projection and its tests; 8 files. |
| `592dd6848ed12ef3b34fb73dcda9fe10b8126bca` | Test-only closure correction: bounded retries deleting the disposable Codex fixture home; one file, five cleanup calls. |
| `c307c91fa520c28372c2d96aaa76b60217da91c4` | Test-only closure correction: verify terminal ACP worker exit before fixture deletion while preserving the live permission pause; one file. |
| `184d49d7b22851e996e54b94bbb0c55a865bef40` | Documentation-only initial closure: scoped verdicts, ownership requirements, Git state and staged evidence. |
| `4eda77dc13a663986d8bd5b670f8536541fb7f40` | Adjacent relay startup fix and regression: serialize config polls through pairing-key preparation; 2 files. |

The provenance categories remain distinct even though the first commit is one
coherent dependency unit:

* Runtime/durability/scheduler/recovery: `src/core/workflow-*`, locks/durable/source
  helpers, shared actions/store/runs, worker/node/recovery/runtime and CLI/TUI/Web
  integration, scheduler installer, workflow/hardening/stabilization tests and
  operational documentation.
* PROBNAYA editorial/compositor/public fixtures: `src/workflows/`,
  `examples/workflows/probnaya-editorial/`, the setup script, local visual
  compositor and nine public reference PNGs. Workflow fixtures/integration tests
  exercise this kind alongside the generic persistence contract. Engineering
  examples remain inactive proposals.
* Adjacent relay: `src/relay/agent.mjs`, `src/relay/project.mjs` and the six
  relay/LAN/security/projection/teardown test files in the second commit.

A runtime-only first commit would be inconsistent: `workflow-schema.mjs` imports
`src/workflows/registry.mjs`, the static registry immediately imports the editorial
implementation, and the workflow suites use the editorial example fixtures.
Splitting those file sets without changing code would leave missing imports or
missing fixtures. Introducing placeholder kinds or reworking these dependencies
just for commit splitting would expand this phase. The existing coherent commit
is retained; no reset, rebase, amend or history rewrite is used. The subsequent
report-finalization commit changes only this document. The test-only closure
commits do not change production runtime, adapter behavior or scheduling.
The first post-commit full run had 730 passes and one `ENOTEMPTY` teardown
failure in a disposable Codex home during background plugin-clone writes.
Bounded filesystem cleanup retries address that fixture race; they do not
implement supervision or change the HIGH adapter verdict. A subsequent run
also had 730 passes and one ACP fixture `ENOTEMPTY` failure: terminal state
preceded the worker's final write/exit. Its terminal-status wait now observes
and asserts worker exit before deletion; live permission waits are unchanged.

The full repeat after the initial documentation closure had one further relay
pairing regression (730 passes): overlapping config polls connected the transport
before the first poll had derived its pairing key. A dedicated real relay/agent
test held the KDF promise and reproduced `online` before key readiness. Eight
production lines serialize config polling, with a stopped-state recheck after
reading configuration. The targeted pairing/race suite then passed all six tests.
This adjacent availability fix adds no adapter/capability or supervision. Scheduling
was paused for the production runtime update, then restored after verification.

### Exact staged evidence for report finalization

Before each new commit, the exact staged bytes are inspected and archived.
For `592dd6848ed12ef3b34fb73dcda9fe10b8126bca`, the staged allowlist was exactly
`test/codex-integration.test.mjs`, and its binary staged diff SHA-256 was
`e6c6c097d7cf58a81940ab4d5955f59bd05e7da2e17523c10d959c18eb84f389`.

For `c307c91fa520c28372c2d96aaa76b60217da91c4`, the staged allowlist was exactly
`test/acp-interactive-e2e.test.mjs`, and its binary staged diff SHA-256 was
`a767517e9d8cc1c431a7409753f12c6d8ea0bd0d1667b73d28fcc70883e36075`.

For `4eda77dc13a663986d8bd5b670f8536541fb7f40`, the staged allowlist was exactly
`src/relay/agent.mjs` and `test/relay-config-race.test.mjs`; its staged diff SHA-256
was `1b8f844e5e5679b48fd267f0357268592a3582f2c4e1ac18c82fadabe16baaae`.
For the initial report commit `184d49d7b22851e996e54b94bbb0c55a865bef40`, it was
exactly this document, with staged SHA-256
`e91c6ee0b1464ac8852c461087f83bd73d5e53f2101a866e41e1a434abd3fb27`.

Before the final documentation follow-up commit, the complete binary-capable staged diff,
its path list/stat and SHA-256 are saved in the private recovery directory.
The staged allowlist is exactly `docs/workflow-hardening-report.md`; `git diff
--cached --check` must pass. Added lines are checked for machine-specific absolute
user paths and credential/runtime data. The old machine-specific checkout path
in this report is removed. Package/lock and ignored `.work`, recovery archives,
operational logs and generated runtime outputs are excluded.

Existing implementation commit diffs are immutable and can be reconstructed
exactly with `git show --binary`. Their archived diffs are identified separately
as retrospective commit evidence; they are not misrepresented as pre-commit
captures. The report-finalization commit identity is supplied in the final chat
and Git history (`git log -1 --format=%H -- docs/workflow-hardening-report.md`),
so no self-referential commit hash is embedded in its own contents.

### Post-implementation-commit verification and final working tree

Post-implementation verification of committed HEAD
`4eda77dc13a663986d8bd5b670f8536541fb7f40` completed on 2026-10-14:

* Full `npm test -- --test-timeout=30000`: **732 passed, 0 failed, 0 skipped**,
  100.44 seconds, including the new pairing-key readiness regression.
* `npm run check`: **passed** after the adjacent relay commit.
* Actual workspace doctor: **healthy**; existing UUID LaunchAgent
  **loaded/matching**, schedule **unpaused**, next due **2026-10-16 at 10:00
  Europe/Lisbon**. Runtime binding was repaired after the relay source change;
  original schedule bytes were restored and a no-due tick created no task.
* Task #2: **all 105 original file sizes/SHA-256 and exact paths match**,
  including all seven runs. Actual task IDs remain **1 and 2**. No topic was
  selected and no real editorial task/publication was created by verification.
* Original `package.json` and `package-lock.json` bytes match their pre-review
  backups and remain excluded from every new commit.

The final documentation-only follow-up is followed by a full suite, check and
read-only state verification once more. Its own commit identity and post-commit
results are recorded in private staged/evidence metadata and the final chat,
rather than embedding a self-referential commit hash. Any failed repeat keeps
this phase open. All scoped GO conditions and the external-adapter NO-GO remain
as stated above.

Final Git state after this documentation commit:

```text
 M package-lock.json
 M package.json
```

The remaining `package.json` modification is the pre-existing `0x2f` dependency
entry; `package-lock.json` contains its pre-existing dependency resolution.
Both files retain their protected pre-review bytes and remain unstaged. There
are no other modified files, untracked files or staged changes at completion.
Ignored private runtime and recovery evidence are retained locally.

## Supervision phase closure — 2026-10-14

Branch: `feat/workflow-supervision`, based on verified checkpoint
`4e568b7c5d063720a5296fe4730c7cbf06892125`.

### Scoped verdicts

- **GO: current scheduled PROBNAYA editorial collection**, with preview disabled,
  no image/network adapter and no external changes. It remains independent of
  supervisor installation. The real definition was not changed.
- **GO: supervised local command execution under the reviewed contract**, on the
  verified macOS launchd host. Required assumptions: stable reviewed runtime;
  healthy matching service/native bindings; pinned executable; explicit command
  and unattended permissions; local/unpaid operation; inherited job group; no
  daemonizing, group/session escape or descriptor/work handoff; only declared
  staging outputs; declared credentials and bounded resources. Every compositor,
  including the repository Python compositor, uses this boundary. This is a
  technical scoped verdict based on native evidence, not an external peer-audit
  certificate or an OS sandbox claim.
- **NO-GO: unattended network/provider and paid adapters**. The policy rejects
  these capabilities. Local process control cannot settle a remote effect or
  enforce provider spending. GO requires implemented and tested provider request
  identity/account binding, idempotency or result/status lookup where available,
  manual resolution when an outcome cannot be established, no automatic uncertain
  retry, a new operation/attempt identity for conscious retry, and an independently
  enforced provider-side hard spending cap for paid operations. The provider
  integration must pass crash/restart/uncertainty tests; merely adding metadata or
  setting a boolean is insufficient. No provider exactly-once guarantee is made.

### Architecture and demonstrated changes

A KeepAlive workspace watchdog and a separate launchd job per attempt replace
worker-owned unmanaged output processes. The native job owns the group before
spawn; a blocked gate receives GO only after child ownership/running intent is
persisted. Both helper and independent watchdog observe worker loss/cancel/time
limits; launchd group cleanup handles helper SIGKILL, including simultaneous
worker/helper death. Native program arguments bind lifecycle actions to the
correct workspace/runtime/attempt; microsecond libproc birth plus boot identity
fences PID reuse. Production signals use native job handles, never raw PID/PGID.

Receipts have integrity/version fencing and monotonic state transitions:
`prepared → owned → running → exited → validated → promoted`, plus cancelling,
cancelled, failed, uncertain, needs_reconciliation and explicit reconciled states.
A repeated intent cannot spawn another call. Unresolved attempts block later
external intents across runs. Reconciliation never retries a call; cleanup is
explicit and retains receipts/archives.

Owned process/stream closure, exact regular-file allowlists, size limits, optional
PNG header/dimension checks and SHA-256 precede atomic staging→archive rename.
Promotion rechecks run/token/worker/definition/runtime/cancel fences and archived
bytes. Stale attempts cannot overwrite another archive. Minimal allowlist env,
owner-only bounded UTF-8 IPC, discarded raw stdout/stderr and credential-output
refusal protect receipts/events/diagnostics from declared credential values.
Doctor and the shared CLI/TUI/Web projection expose worker and external states
separately. See [workflow-supervision.md](workflow-supervision.md) for the full
contract, state machine, failure matrix and inspection/reconciliation commands.

### Review and verification provenance

The separate manual invariant review fixed inspection-process group counting,
canonical workspace/channel binding, spawn/GO ordering, independent watchdog for
a stopped helper, state/version fencing, cross-run uncertainty barriers, output
validation before promotion, credential packet/output handling, and native job
binding before lifecycle actions. Black-box tests use independent observations:
actual birth identities, group membership, open-descriptor writes, effect ledgers
and immutable archive bytes. No independent reviewer-agent was launched because
explicit user authorization for that agent was not received. This report does not
claim that another reviewer audited the implementation.

The pre-change real editorial worker experiment reproduced the old HIGH: adapter,
child and grandchild survived worker SIGKILL, and late output grew from 5 to 35
bytes. Only that birth/command-bound fixture group was terminated. In the new
boundary, 40 process-level tests cover the real editorial worker, native Python,
children/grandchildren, worker/helper/service SIGTERM/SIGKILL, stopped-helper
watchdog, pre/post-GO crash windows, login-style native job redelivery, timeout,
cancel, late writers, stale/concurrent/double intents, PID/identity ambiguity,
executable and runtime/plist drift, damaged receipts/manifests/installations,
unexpected/oversized/symlink/invalid PNG outputs and declared credentials.
Known and uncertain provider outcomes are simulated with local fixture ledgers;
no actual network/image/LLM/paid provider was connected.

Final pre-commit full suite: **772/772 passed**, zero failures/skips.
`npm run check` passed; both new Python helpers also passed AST checks.
The full suite and checks are repeated after this closure commit; their actual
exit/results and this commit's own hash are recorded in the final chat/private
verification evidence, avoiding a self-referential Git hash in this file. A
failed repeat reopens the affected scope. Native inventory after cleanup showed
zero fixture processes and zero temporary supervision LaunchAgent plists/jobs.

### Real state preservation

The real schedule was paused during runtime editing. After verification, its
original bytes were restored exactly: unpaused, every two days, next slot
**2026-10-16 10:00 Europe/Lisbon (09:00 UTC)**. The real scheduler LaunchAgent is
loaded and matches the new runtime fingerprint. Its label remains
`work.probnaya.0x2f.workflow.2519c81a-c8ab-4939-89e3-d341467d149b`.
An initial bootstrap returned transient native error 5 immediately after bootout;
a subsequent explicit scheduler-only repair succeeded after unload completed.
No external attempt/call was repeated by this operational retry.

Doctor on the actual workspace returned healthy with no issues. Task #2 retains
all **105 original files**, exact sizes/SHA-256, no extra/missing files and all
seven runs. Actual task IDs remain `[2, 1]`; no new real task, topic selection,
publication or history update was made. Both package files retain the protected
pre-phase bytes. No supervisor was installed for the real collection-only
workspace; it does not need one for its current scheduled scope.

### Commits and remaining boundaries

Implementation: `9d08d3a146031240eb7d4e33f0b597fce42566fa`
(`feat(workflow): supervise isolated external attempts with launchd`).
The core boundary, permissions/schema, dispatch adoption and their regressions
are coupled in this commit: splitting them could advertise new permissions while
leaving an output process on the old unmanaged path. The separate documentation
closure commit contains this final report; its identity is in the final Git log.
Before each commit the exact binary staged diff, path list and SHA-256 are retained
in private evidence. The implementation diff was 23 files, 1087 additions and 33
deletions, SHA-256
`4e164f30d0f21cdf5dd116531c4485df565d8a0592c70b12f9027361ab7e183b`.

The former surviving-adapter HIGH is closed only for the supported, reviewed
inherited-group contract. **Remaining HIGH / NO-GO**: an executable that escapes
its group/session, daemonizes, hands off work/descriptors or writes outside its
owned staging can still survive/control effects outside this boundary. Such
executables are not approved for unattended use. Arbitrary unreviewed external
adapters and remote side effects are not declared safe after arbitrary worker
SIGKILL. Same-user compromise, hostile runtime/executable changes and comprehensive
filesystem/network/memory isolation are outside this trust boundary. Generic
non-workflow providers receive no new supervision guarantee from this phase.

Next stage: an explicitly reviewed provider capability contract with status/
idempotency/account/budget enforcement, independent peer review when authorized,
and stronger OS isolation before widening the executable/write/escape contract.
No supervision expansion or real provider integration is silently assumed.

Expected final tracked working-tree remainder is only the original unstaged
`package.json` and `package-lock.json` modifications. They are neither amended nor
committed. No `.work`, recovery archives, operational logs, runtime outputs,
credentials or absolute user paths are included in these commits. No push, PR,
merge, deploy, release or publication was performed.
