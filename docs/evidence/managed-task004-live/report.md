# One real managed foreground qualification — Task #004: NO-GO

## Execution

The user authorized exactly one attended qualification experiment using the
existing managed Responses lane and normal foreground credential path. Current
branch: `fix/managed-source-search`. Accepted offline implementation/evidence:
`2d0c100` / `219ec91`. Those completed suites were not repeated.

The checkout was clean, the requested next-action feature was absent, and the
existing two-file manifest/verifier and **4/9, 12,288-token, 24,576-microUSD,
120-second, one-attempt** project policy were intact. Existing policy explicitly
permits an authorized foreground experiment with unpriced controls; it provides
no unattended exception. Ordinary live NO-GO was not overridden as a general
production approval.

Pricing observation was stale. Official model/pricing/token-count documentation
was fetched and reviewed at **2026-10-28T08:22:05Z**. The same snapshot and standard
rates remain published: **$0.75 input, $0.075 cached input, $4.50 output per million**.
Only the registry observation timestamp changed, in preparation commit
`aa30653f7d50644281f697ae746e562a090e8a9b`. No model, rate, tool, limit or execution code changed.
Sources and the calculation are retained in `pricing.json`:
[model](https://developers.openai.com/api/docs/models/gpt-5.4-mini),
[pricing](https://developers.openai.com/api/docs/pricing),
[token counting](https://developers.openai.com/api/docs/guides/token-counting).
The existing **$0.024576 published inference maximum** remains separate from
**up to 5 unpriced controls (4 counts + 1 GET)**; no separate published control fee
was found, no contractual zero fee is claimed, total provider billing is unknown.

Metadata-only `2f-next auth status` returned configured. The normal runtime then
retrieved its existing dedicated Keychain credential in memory. No new key,
import, credential file, token print/hash or billing setup was introduced.

The exact original brief was passed to one real **`2f-next new`** invocation.
No provider/model flags, precomputed patch, source-line hints or scripted tool
sequence were supplied. The normal allocator produced **Task #004**:
`004-after-creating-a-task-print-one-concise-next-act`, **run 1**, attempt
`edd90ba6-8fc1-4337-956f-350cc855e529`. Requested provider: **AUTO**; selected provider:
**managed-openai**, harness **0x2f-responses-v1**, requested and observed model:
**gpt-5.4-mini-2026-03-17**. Its task-owned worktree binds exactly to the preparation
commit. Foreground elapsed time: **8.407925s**.

## Outcome and exact boundary

**NEEDS YOU / MANAGED_INPUT_LIMIT. READY was not reached.** The CLI subprocess
exited 0 because it successfully reported the terminal Task, not because the
engineering task succeeded.

| Response | Model-selected calls | Result |
|---|---|---|
| 1 | Read source f1 lines 1–32; read test f2 lines 1–32 | 1,686 + 3,108 serialized result bytes; neither read truncated |
| 2 | Literal source f1 search `new task` | zero matches; 140 result bytes |

All ranges and calls were valid. The executor did not find the relevant creation
section. **3 tools = 2 reads + 1 search**, **0 patches**, **4,934 result bytes**.
Immutable packet: **3,375 bytes**; source manifest remains the two
approved files, 31,003 and 3,046 bytes. No changes to either file, no regression
patch, no verifier invocation, no review/delivery/grant/commit for the Task.
The retained worktree is clean and `patch.diff` is empty. Shared CLI/TUI/Web
projections all report the same terminal state; no UI runtime or Task refresh
was started to obtain them.

Before the third count/inference pair, cumulative serialized API input was
**29,212 / 32,768 bytes**, leaving **3,556**.
Read-only reconstruction from the exact persisted second input, response and
search result yields **10,271 count-body bytes +
10,365 inference-body bytes**, projecting **49,848**
cumulative bytes. This reconstruction made **no request**. The existing preflight
for both bodies rejected dispatch; **no request-6 intent/receipt exists**.
Two inference slots, three tool slots and 9,039 token capacity remained. The
binding constraint was cumulative request serialization, including both count
and inference bodies, not the token, money, tool or per-read ceiling.

## Actual usage, receipts and cleanup

Exactly **5 API requests: 1 availability GET + 2 counts + 2 inference requests**.
Three unpriced controls actually dispatched. Native request intents/receipts,
IDs, digests, proposed calls, remaining-budget instructions and tool-result
references are preserved by `execution.json`; **22 native evidence references**
include the Task, workspace, exact input manifest, usage journal and managed
request/tool records. Original native evidence remains in `.work`; approved
source bodies were not copied again into this report.

| Inference | Input | Cached | Output | Reasoning | Total |
|---|---:|---:|---:|---:|---:|
| 1 | 900 | 0 | 74 | 0 | 974 |
| 2 | 2,249 | 0 | 26 | 0 | 2,275 |
| Total | **3,149** | **0** | **100** | **0** | **3,249** |

Both native usage responses also report zero cache-write tokens. Calculated
inference-only cost: **$0.00281175**; the usage ledger rounds up to **2,812 micros**.
Provider-reported complete billed amount: **unknown**. This amount and the
published inference maximum are not a claim about full provider billing.

Exactly **one provider attempt** and one Task allocation. No retry, continuation after terminal state,
second model sequence, fallback, terminal replay, manual result repair or delivery.
Every dispatched request has a durable receipt; pendingRequest is null. The
owned foreground CLI process group closed normally; no cleanup signal was needed.
The credential helper exited through its normal path. No verifier process group
was spawned. The Task and its clean worktree are retained for inspection.

The current audit preserves all **1,388 other pre-existing .work files** exactly;
the single authorized existing-file change is allocator `task-sequence.json`
advancing to the actual new ID. **503 new files** are all under the new Task or
its owned worktree. Tasks #001–#003, their worktrees, receipts and artifacts remain
byte/mode identical. `preservation.json` includes the new terminal Task's full
31-file digest manifest. Production/stable tracked bytes, packages, LaunchAgent,
schedule, runtime binding, existing launchers and prior evidence are preserved.
No scheduler control was invoked. Independent pattern scans of the new Task and
outputs found no secret-shaped material; that audit did not retrieve the key.

## Qualification and concrete remaining work

**NO-GO for ordinary two-file managed live foreground remains. Unattended NO-GO
remains.** Historical simple live-canary GO and offline qualification PASS are
unchanged; they do not substitute for this failed real-model experiment.

This run demonstrates normal AUTO routing, the existing authentication path,
real provider/model identity and usage, durable receipts, bounded client-owned
reads/search, pre-dispatch input enforcement and process cleanup. It does not
establish successful independent source discovery, a meaningful regression patch,
verifier success, READY, broad reliability or production/unattended approval.

The concrete gap is economical source discovery and request composition: broad
header reads were repeatedly carried in both request bodies, followed by an empty
literal search; the remaining byte allowance could not support another interaction.

**Exactly one recommended next milestone:** make a real two-file source-discovery
and patch sequence fit the unchanged **32 KiB cumulative serialized-input
allowance**, using this actual Task #004 trace as the regression evidence. No
additional provider/model/lane or larger budget is implied. This milestone was
**not started**. Stop after preserving this single terminal execution.
