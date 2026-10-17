# Task #002: bounded interaction correction

Implementation: `3aba2b672656693bb9c7ea354d2a0541dac65a05` on the existing `fix/managed-source-search`
branch in the durable foreground checkout. Evidence is committed separately.
No new Task, provider/model/adapter, execution lane, credential flow or delivery.

## Diagnosis from immutable inputs and request receipts

Task #002 requested **`read_task_file(file_id="f2", start_line=1, line_count=220)`**
(lines 1–220), call `call_9neZOhpBEhW9LZ2S7dxGVxeB`, in inference receipt 5.
That request satisfied the advertised JSON parameter schema: its integer fields
had no numeric bounds. It violated the tool description and runtime's **32-line**
validator. This was a schema/runtime mismatch, not a parser or source-drift error.
The complete batch (including a pending source search) was rejected before effects.

Both **2/2 inference responses** and both counts were already used. No turn was
available to correct the range or consume a read result before preparing a patch.
Preserved totals: two searches, zero reads/patches, **3,038 tokens** (2,906 input,
1,024 cached input, 132 output). Task #001 remains MANAGED_INPUT_LIMIT.

The first source query `Task ID` found nothing. The unexecuted `createTask` query
would also find nothing: the frozen source calls `createWork` at line 396 and
prints `Created #` at line 398. The test's `foreground` hits are 12, 17, 30, 33.
The economical minimum is **three responses**: batch two precise searches →
batch targeted reads → one multi-file patch, then the external verifier.
For example, source lines 390–405 and test lines 17–33 fit advertised ranges.
A fourth response gives room for one additional lookup or bounded range correction
only when the original cumulative byte/token/tool/deadline budgets still fit.
`diagnosis.json` preserves request identities, hashes, schema and arguments;
it copies no source excerpts.

## Correction and unchanged envelope

The read schema and runtime now both require an integer start ≥1 (safe-integer
maximum) and **1–32 lines**, with **4 KiB content maximum**. Nullable broad reads
are no longer advertised/accepted for new calls; historical tasks remain readable.
Invalid ranges are never clamped. The whole batch is denied before source/patch
effects; bounded denial receipts consume the existing tool/result ledger. Only
range errors may return to the model within a remaining response of the same
attempt. Last-turn errors stop at NEEDS YOU. Unknown tools, ownership, drift,
uncertain responses and restart still stop without replay or fallback.

| Maximum | Value |
|---|---|
| Attempt | 1; no retry, continuation run or fallback |
| Inference / token-count / availability | **4 / 4 / 1**, **9 HTTP total** |
| Control requests | **5**, unpriced_control_request; no separate published fee; contractual zero fee not claimed |
| Cumulative inference tokens | **8,192 input + 4,096 output = 12,288** |
| Per inference | 4,096 input, at most 2,048 output within remaining cumulative output |
| Published billable inference maximum | **$0.024576**, unchanged; total provider billing unknown |
| Tools / successful reads / patches | **6 / 4 / 1**; denied calls consume tools too |
| Approved files / writable small-task scope | 4 / 2 |
| Approved source / packet | 64 KiB / 8 KiB |
| Read content / search serialized result / aggregate results | 4 KiB / 4 KiB / **24 KiB (existing ceiling unchanged)** |
| Serialized API input / end-to-end deadline | **32 KiB / 120 seconds**, unchanged |
| Patch replacement / external verifier | Existing 64 KiB per-file replacement; verifier ≤5 seconds, 64 KiB output |

Each inference has a preceding exact token count. Input is charged cumulatively;
known output reservations settle to validated usage before a later response.
Unknown usage retains the reservation and stops. Receipt remaining-cost fields
now reflect the same cumulative published envelope. Full immutable input packets
retain fencing/check identities. Repeated model input omits redundant metadata
and retires locator call/result pairs only after their hits are covered by a
successful targeted read; unread locations and rejected results remain durable.
Full brief, constraints and repository instructions are preserved.
CLI preview and shared CLI/TUI/Web projection show actual inference/count/GET
requests, their separate maxima, controls and unknown total billing accurately.

## Offline proof and verification

The fixture reproduces the two approved paths and **31,003 / 3,046-byte** files,
the original brief, comparable repository instructions and the actual CLI output
behavior. Source insertion is at line 398; the regression test runs that CLI in
a credential-free child. Sequence: **search source + search test → read source
(lines 396–398) + read test (17–20) → one patch changing both files → separate
pinned deterministic verifier → READY**. No delivery exists.

Captured: **3 inference, 3 counts,
1 availability, 5 tools
(2 searches, 2 reads, 1 patch)**; one attempt. Packet **3346 bytes**;
results **1807 bytes** (below 8 KiB as requested);
serialized input **31908 bytes**. Synthetic usage:
**3,093 input / 30 cached / 60 output / 3,153 total**; calculated synthetic
inference cost **$0.0025695**. Provider-reported billing is unavailable: this is
an offline fixture. Model remains `gpt-5.4-mini-2026-03-17`.

**111 focused tests pass**, plus **11 final-change targeted checks** (overlapping,
not 122 distinct tests). `npm run check` exits **0**. The **single final full
suite exits 0: 1,007 tests, 888 pass, 119 skipped, zero failures**;
203,228.730917 ms. No successful full suite was repeated.
Two initial focused failures exposed real pricing evidence aging past 24 hours;
missing-credential rehearsals now use explicit fresh clock fixtures, while a
separate stale-price test proves the real gate still refuses before credentials.
No production price timestamp was changed. Other regressions cover four-response
cumulative ceilings, pre-inference budget stops, denial payloads, last-turn stops,
unknown tools, no fifth response, one/two-response compatibility, shared projections,
foreground-only credential access and crash/no-replay boundaries.
Real provider requests and Keychain reads/modifications: **zero**.

## Preservation, verdict and next boundary

All **914 existing `.work` files** retain exact bytes and modes,
including Task #001 (25 files), Task #002 (30 files), both owned worktrees,
configuration, sequence, intents, artifacts and receipts. No Task #003 exists.
`work-manifest.json` preserves the before hashes; `preservation.json` records
an equal canonical after mapping and independent production/launcher checks.
Production/stable tracked bytes, package modifications, Task #2 (105 files),
Task #3 (24 files), existing 2f, 2f-next launcher, prior delivery receipt,
LaunchAgent configuration, editorial schedule and runtime binding are unchanged.
The existing scheduler naturally advanced **231 → 232**; only its log/health
files changed. No scheduler control was invoked; health remains healthy.

- **Live bounded canary: GO**, historical accepted evidence only; no renewed live GO.
- **Ordinary two-file foreground: OFFLINE CANDIDATE**, based on the exact-shaped
  deterministic READY fixture; live behavior remains unproven.
- **Unattended: NO-GO**. Opaque execution policy is unchanged and is no fallback.

A final separately user-authorized Task #003 is justified as the next experiment,
**but is not currently runnable under the preserved project policy**. It still
explicitly caps model/provider calls at **2/5**; new initialization defaults are
4/9, but existing policies are never overwritten or silently upgraded. Using
4/9 requires a separate approved policy edit. The price evidence observed at
`2026-10-16T15:54:35Z` is also stale under the existing 24-hour gate and needs
fresh supported evidence before any live attempt. Neither prerequisite was
changed here. Large context or extra failed searches can still exhaust the
unchanged 32 KiB serialized-input allowance and stop safely.

Rollback: a new revert of implementation `3aba2b672656693bb9c7ea354d2a0541dac65a05`; preserve `.work`
and all prior/evidence receipts. No further milestone or live task was begun.
