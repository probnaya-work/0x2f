# Three confirmed P2 fixes, 2026-10-15

This change addresses the independent review of `4e568b7..ca8d9e3` and the two
explicitly requested promotion-test gaps. It adds no supervision role, provider,
dependency or real adapter. No new sub-agent was started.

## Changes

1. `workflow-credentials.mjs` provides one recursive pre-serialization guard for
   string values/keys, nested arrays/objects, Buffer, byte views/ArrayBuffer and
   the JSON Buffer representation. JSON material/input text is inspected after
   decoding too; raw and JSON-escaped credential forms are refused. Diagnostics
   are constant and never echo inspected data. Definition/material/snapshot
   freezing, request/input creation, attempt receipts, adapter output validation,
   editorial JSON/text results, workflow journals and artifact writes apply the
   guard before their persistent serialization/write boundary.
2. Credentialed unpromoted output is restricted from allocation. The service
   revisits closed failure/cancellation receipts and removes the whole output
   only after the native job PID is absent and the recorded group is empty.
   This covers nonzero exit, timeout, cancel, helper death and worker death;
   receipts/reconciliation metadata remain. Ambiguous ownership or a surviving
   group keeps output restricted until reconciliation and safe cleanup. Status,
   shared CLI/TUI/Web projection and doctor expose metadata, not output contents.
   Credential values are not stored for later service cleanup: declared names
   select the discard policy. This exception to ordinary staging retention is
   documented in `workflow-supervision.md`.
3. Raw unattended definitions require their own explicit `commandAdapters:true`.
   Freezing records `permissionDeclarations.commandAdapters`, and defaulting an
   omitted permission no longer grants it. Snapshot validation, preflight,
   attempt allocation and the runner gate require the declaration evidence.
   Legacy normalized snapshots without evidence fail closed for unattended
   execution. Collection inspection remains available; no existing task/history
   was migrated or edited. Generic manual provider permissions are unchanged.

## Regression coverage

- Eleven guard cases: newline, quote, backslash, their combination, Buffer,
  Uint8Array, ArrayBuffer, JSON Buffer, secret key, nested array/object and
  serialized JSON material. Each checks rejection through persistence boundaries
  and scans the complete created tree for raw/escaped/decoded secret values.
- Raw absent/false/true command permission, collection permission non-expansion,
  actual supervised preflight and a digest-valid legacy snapshot without evidence.
- Real fixture processes write a synthetic credential before nonzero exit,
  timeout, cancel, helper SIGKILL and worker SIGKILL. Tests require job/group
  closure, discarded output, no archive, no remaining credential anywhere in the
  persistent fixture tree, and a single ledger invocation.
- An actual stopped helper with deliberately ambiguous owner identity retains
  the writer/output, reports restricted/uncertain metadata without diagnostic
  disclosure, refuses premature cleanup and purges only after group closure and
  explicit reconciliation.
- Stale-run and corrupt-manifest assertions now operate while the receipt is
  `validated`, before `promoted`. A test-only owning-worker barrier holds that
  point; no production pause mechanism was added.
- A separate real promotion caller receives SIGKILL at `attempt.archive-renamed`.
  The owning fixture worker remains alive at its barrier. The test checks that
  the receipt is still validated, the archive exists, corrupt archive replay is
  refused, intact replay promotes and the adapter ledger still has one entry.

No existing timeout or assertion was weakened. Test-only barriers/faults use real
processes and persisted state; identities are not replaced with mock data.

## Bounded verification: NO-GO

The final guard-only suite passed **12/12**. An initial native regression run
passed 9/12: three fixtures failed in `supervisor install` with `Supervisor did
not become healthy`, before their assertions. One bounded confirmation of those
three passed 3/3 without modifying startup behavior. Their original failures are
retained as evidence, not assigned a speculative root cause.

The final candidate then ran the complete focused credential/supervision/
promotion suite five times, without per-test retries or production/test source
edits between runs:

| Run | Pass | Fail | Duration (ms) |
| --- | ---: | ---: | ---: |
| 1 | 62 | 0 | 272476 |
| 2 | 62 | 0 | 260174 |
| 3 | 62 | 0 | 261837 |
| 4 | 62 | 0 | 266344 |
| 5 | 61 | 1 | 242532 |

All runs had zero cancellations/skips. All new credential/permission/process
cleanup cases passed in every run. The fifth run failed:

`validated stale run and corrupted manifest cannot promote`

The `/Stale/` assertion received `Only validated attempts can be promoted`.
The before-cleanup snapshot retained an `uncertain` receipt with
`owner_identity_mismatch`, a manifest and 12-byte output, no archive, and the
owning worker still alive. The existing service reads native job PID before
observing owner birth; normal helper exit between those observations is a
possible explanation, not established here as the unique root cause. The
noncredentialed service transition involved was not changed by these fixes.
This newly exposed instability remains a blocker; it was not hidden by broadening
the assertion, adding sleeps or changing the production lifecycle outside scope.

The sequence stopped at that failure. **The two full-suite runs were not
started**, because the prerequisite five stable focused passes was not achieved.
There was no sixth focused run or individual retry. `npm run check` and the two
supervision Python AST checks passed. General full-suite compatibility is not
claimed for this candidate.

## Preservation and verdicts

The real LaunchAgent, its installation record and schedule retain their exact
pre-phase bytes and still point to the detached stable runtime `4e568b7c5d06`.
The actual native job was inspected read-only. No repair, pause, resume or tick
was run on the real workspace. All 105 task #2 files retain exact size/SHA-256,
without extra/missing files; seven runs remain. The two pre-existing package
modifications retain exact bytes and are excluded from the commit.

Fixture cleanup checks native jobs/processes/plists, IPC handles and kernel
locks. One remaining failed-setup fixture service was uninstalled after checking
its exact workspace/program binding. Its inactive residue was archived privately
only after checking no process references, handles or active locks and no known
synthetic credential residue. No fixture workspaces or IPC directories remained.
Logs, failure snapshots, exact staged diff and recovery archives remain outside
Git. Only source/tests/docs are committed, without amend. No push, PR, merge,
deploy, release, publication, topic choice or real provider call occurred.

- **Trusted supervised local adapter: NO-GO.** The three P2 code paths have
  fixes and regression coverage, but the required stable verification has failed.
  The validated-to-uncertain blocker needs separately scoped investigation.
- **Arbitrary/untrusted command: NO-GO** without OS-level isolation.
- **Network/provider: NO-GO** without provider idempotency/status lookup,
  credential boundaries and provider-side spending limits.
- Existing scheduled collection keeps its previous **GO on the isolated stable
  runtime**. This development candidate was not activated there.
