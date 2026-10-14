# Workflow operations and recovery

Use the checkout CLI (`node src/cli.mjs …`), not an older globally installed
release. Read this together with `docs/workflows.md` and the hardening audit.
No command here publishes, pushes, merges, or deploys.

## Diagnostics

`workflow doctor` is read-only: no task recovery, schedule advance, backup,
lock-directory creation, or file cleanup. It reports definitions/sources,
schedules, task/run origin and review, incompatible schemas, orphaned workers,
artifact integrity, pending local journals, uncertain external attempts, lock
health, and the LaunchAgent binding. A healthy configuration is distinct from
an installed/matching/loaded agent and a successful last tick.

The diagnostic may run while writers are active. Its observations are not a
transactional snapshot of the entire workspace. Stop the affected run before
forensic comparisons or repairs. Broken state is reported, not silently skipped.

## Explicit recovery

| Finding | Action | What is preserved |
|---|---|---|
| Orphaned worker | `workflow recover <task-id>`, then explicit `rerun` | All previous run inputs, evidence and archives |
| Pending local operation | `workflow recover <task-id>` | Replay only if task precondition and required hashes match; events use stable IDs |
| Uncertain image attempt | Inspect provider account and saved output manually | Receipt is retained; recovery/rerun never repeats the call |
| Torn final JSONL line | `workflow repair events <task-id>` | Original log is backed up; interior corruption is refused |
| Dead legacy lock / stale diagnostic | `workflow repair locks` | Stable kernel mutex is never deleted; live/unknown legacy PID is not stolen |
| Interrupted hidden task staging | `workflow repair staging` | Visible tasks/history remain untouched; reserved IDs are not reused |
| Orphaned hidden `.tmp` files | `workflow repair temps <task-id>` | Each temp is backed up; only inactive workflow temps are removed |
| Changed executable, source root or definition | Inspect changes; `workflow refresh <task-id>` | Prior definition and run archives; evidence checkpoint stays frozen |
| Missing/changed required artifact | Restore exact archived bytes or select/changes and rerun | Historical acceptance/publication is not rewritten automatically |
| Missing Python binding | `workflow bindings <workflow-id> <python-executable>` | Definition backup; existing tasks unchanged until explicit refresh |
| Moved checkout, changed Node/runtime/plist | `workflow agent repair` after checks | Workspace identity, workflow data, schedule cadence |
| Invalid JSON or future schema | Restore the affected file from trusted backup / use compatible runtime | Doctor does not guess or manufacture state |

A pending journal blocks later task mutations until explicit recovery or a retry
of the identical operation finishes it. Recovery rechecks acceptance/publication
artifact integrity and the required run inputs/definition backups. A pending
journal conflicting with a newer task is refused. Do not delete the
journal to make the refusal disappear: inspect its before/next state and recover
from a trusted backup. Local recovery does not establish an external provider's
outcome. Automatic startup recovery skips pending workflow journals so it cannot
invalidate their preconditions; explicit recovery finishes them first.

## Storage and compatibility

New definitions, frozen snapshots, schedules, decisions, operation/adapter
receipts, source checkpoints, packages, artifact manifests, scheduler installation
and health records use `schemaVersion: 1`. Missing schema version is legacy 0;
legacy tasks can be inspected without rewriting them. Future/invalid versions
are refused. Schema version and the user-facing definition version are separate.
The workspace `task-sequence.json` is version 1 and rejects invalid counters.

There is no mass migration. Only an explicitly touched legacy definition,
schedule or refreshed/answered task is backed up under its adjacent `.backups/`.
Task #2 is excluded from these changes and remains byte-identical to its baseline.
New execution from an old/unpinned snapshot requires explicit refresh.

`refresh` invalidates acceptance/completeness and adopts current executable/root
bindings and runtime fingerprint. It keeps collected source bytes, historical
results and definitions. It does not silently recollect evidence or select a topic.
A runtime upgrade may require refresh even when the definition's content version
is unchanged. Existing UI processes must restart after code changes.

Previously shipped binaries cannot be retroactively taught to reject new metadata.
Do not mutate these workflows using an older npm release. This checkout rejects
future schemas; an installation fingerprint blocks its scheduled dispatcher when
code/paths/executables drift. This is not a guarantee about arbitrary old binaries.

## Guarantees and boundaries

* A persisted trigger key has one visible task per workspace, under the workflow
  lock. A crash before visibility leaves no visible task; allocated IDs may have
  gaps. A crash after visibility replays that task, not a second creation or
  automatic execution retry. This depends on preserved task state and filesystem
  support for atomic rename/fsync; deletion/restoration of older backups resets
  the operator's state of knowledge.
* Image attempts are **at most once per task**, with a durable pending receipt
  before invocation. A receipt does not prove remote execution or charging.
  Failure between receipt and invocation can suppress a call that never happened.
  Exactly-once external execution is not claimed.
* Local source collection can repeat before its checkpoint commits. Committed
  source bytes are reused. Local artifact preparation can repeat; immutable
  completed run archives are separate from mutable current package files.
* Decisions support explicit `operationId`; reuse with a different payload fails.
  Consecutive identical legacy answers are deduplicated. The same selection after
  an intervening defer is a new decision. Repeated acceptance/publication of the
  same current package is harmless. Two different manual trigger keys remain
  different intents.
* Result files and archived artifacts precede terminal state. Manifests verify
  byte length and SHA-256. Acceptance checks integrity; publication confirmation
  records a supplied HTTPS URL separately and makes no network call.
* New workflow workers have a unique launch token, a persisted gate, and process
  birth identity. They cannot start adapters before the gate. Cancellation is
  durable and rechecked at startup/finalization. PID alone is not authority to
  signal a new workflow worker.
* POSIX kernel advisory locks use a small Python 3 stdlib `fcntl` helper. A dead
  parent closes its pipe and releases the lock; owner.json is only diagnostics.
  Writes are fenced when helper loss is observed. Locks are cooperative, not a
  security boundary against another process ignoring the protocol. Live operations
  do not expire; contending acquisition has a bounded timeout.

Files use owner-only modes, bounded reads, atomic replacement, file and directory
fsync. New directory entries are synced too. These are process-crash durability
checks, not a physical power-cut or filesystem/hardware certification. In-place
JSONL append can leave a torn tail; it is detected and repaired only explicitly.
A complete final JSON event without its newline also blocks append;
`workflow repair events` backs it up and adds the missing separator without
discarding that event.

## Permissions and portability

Source IDs/roots and files are explicit; roots are bound to real path and inode.
POSIX source reads walk directory descriptors with `O_NOFOLLOW`, preventing a
symlink swap between validation and file open. Outputs and public records are
bounded/validated. Adapter executable real path, inode, size and SHA-256 are pinned
in the snapshot and verified at invocation, including reused visual receipts.
Known credential values from declared credentialEnv names are rejected in config/material snapshots,
source/output and saved binary output; stderr and environment dumps are not saved.
This is not protection against arbitrary trusted code deliberately encoding or
writing a secret outside the protocol.

`commandAdapters`, `localArtifacts`, `imageGeneration`, and `readSources` are
checked separately. Network adapters and external publication/git mutations are
not implemented. Trusted command adapters can technically use their inherited
process privileges: there is **no OS sandbox**. A config permission cannot prevent
an arbitrary executable from contacting the network or modifying external files.
Use only executables you trust; provider-side spending limits remain necessary.

Node >=20 and Python 3 with POSIX fcntl are required for mutations on macOS/Linux.
`WORKFLOW_LOCK_PYTHON` can bind the helper interpreter. Visual rendering additionally
requires Pillow and the configured fonts; `workflow bindings` verifies Pillow.
Portable definitions use executable names and workspace-relative roots/fonts;
frozen task snapshots intentionally contain exact absolute bindings for audit.
Windows needs a native locking/source-read backend; this is an explicit follow-up,
not an inferred portable guarantee.

## LaunchAgent lifecycle

`workflow agent install|status|repair|uninstall` uses one UUID label per workspace.
Repeated install keeps that identity. Repair rebinds the workspace, CLI, Node,
Python and runtime fingerprint. Uninstall stops/removes the agent and installation
record, retaining all workflow/schedule/task data. A prior singleton agent is
adopted only if its plist identifies this workspace; its plist is backed up.
Failed bootout is followed by a read-only loaded-state check. Unknown or still
loaded state refuses removal/replacement instead of reporting a false uninstall.

Absolute paths in a LaunchAgent are necessary and are checked for drift. Pausing
an individual schedule preserves nextDate and does not require a valid workflow
definition. A corrupt schedule needs explicit file restoration. Tick health is
stored under `.work/scheduler/health.json`, including paused/no-due checks and
visible errors. A due task consumes its slot even if its worker later fails.

The calendar is every two local calendar days, at the configured local HH:MM.
DST, host timezone, sleep and missed dates are handled by date coalescing, not an
elapsed 48-hour timer. Login/load triggers a tick; a powered-off/logged-out host
cannot run. Multiple missed dates coalesce to the latest due date, without backlog.
Controlled fixtures cover these calculations; no physical reboot is claimed.
