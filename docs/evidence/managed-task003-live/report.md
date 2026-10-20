# One authorized foreground Task #003 — NO-GO

Pricing/preparation commit: `43538ec2d9775b6f6c575ab33ffdd68f3290a589`. Exactly one real foreground
invocation of the existing `2f-next new` command, with the unchanged Task #002
brief and configured two-file scope. No new provider/model/adapter or execution
logic, no retry, fallback, repair attempt, delivery, push or publication.

## Authorized preparation

Only project `limits.modelCalls` **2 → 4** and `limits.providerCalls` **5 → 9**
changed in `.work/engineering.json`, using the existing atomic durable writer.
Money remains **24,576 USD micros**, tokens **12,288**, attempts **1**, deadline
**120,000 ms**. All existing file/source/packet/tool/read/patch/result/input/output
limits are unchanged. The sequence advances 2 → 3 only to allocate the new Task.
Old Task snapshots retain their original policies and bytes.

Official model/pricing/token-count documentation was opened and checked at
**2026-10-20T22:11:34Z**. The existing registered snapshot
`gpt-5.4-mini-2026-03-17` remains listed and standard rates remain **$0.75 input,
$0.075 cached input, $4.50 output per million tokens**. Only the registry's
observation timestamp changed; `pricing.json` preserves sources and findings.
The unchanged cumulative allocation, **8,192 input + 4,096 output**, implies
**$0.024576 published billable inference maximum**. Control requests remain
unpriced_control_request: **5 maximum (4 counts + 1 GET)**, no separate published
fee found, no contractual zero-fee or complete-billing guarantee. Total HTTP
maximum is 9. Requests use the existing standard/default endpoint and service tier.

Existing dedicated foreground Keychain configuration was checked through the
metadata-only status operation. The existing foreground execution retrieved the
credential through its private boundary. No new key, credential import/write,
plaintext download/env-file/Codex credential read, key print or key hash occurred.

## Real outcome, not a fixture claim

Task **#003** is **NEEDS YOU / MANAGED_TOOL_LIMIT**, attempt
`d19e9a97-30fd-443b-a206-c5227123697d`. **It did not reach READY.** Verifier and delivery did not run.
The subprocess exited 0 because the CLI successfully reported the stopped Task;
that exit code is not task success. Foreground elapsed time: **8.282s**.

Inference 1 requested four literal searches: source `After creating a Task`,
`open it`, `Created Task`, and test `Task`. **All four returned no matches**
(case-sensitive literal search); their four receipts contain 560 total result
bytes. No source read or patch occurred.

Inference 2 proposed another four searches: source `task id`, `task.json`,
`print`, and test `open`. The entire batch was rejected **before any of those
four calls executed**, because 4 completed tools + 4 proposed tools would exceed
6. There was no partial execution, hidden continuation, third inference, fallback,
second attempt or Task #004. `requests.json` preserves every request/receipt
identity and digest, usage, exact search arguments and completed tool receipts.
Native immutable inputs and journals remain in the initialized Task directory.

| Actual request | Input | Cached | Output | Reasoning | Total |
|---|---:|---:|---:|---:|---:|
| Availability GET | — | — | — | — | — |
| Count 1 | 879 | — | — | — | — |
| Inference 1 | 879 | 0 | 109 | 0 | 988 |
| Count 2 | 1,090 | — | — | — | — |
| Inference 2 | 1,090 | 0 | 106 | 0 | 1,196 |
| Inference cumulative | **1,969** | **0** | **215** | **0** | **2,184** |

**5 API requests: 2 inference, 2 counts, 1 availability**; three controls actually
dispatched. **8 proposed tool calls, 4 executed searches, 0 reads, 0 patches**.
Calculated inference-only cost at published rates: **$0.00244425** (ledger stores
2,445 rounded-up micros). Provider-reported complete billing: **unknown**.
Serialized API input: **21,468 bytes**; packet: **3,375 bytes**; returned results:
**560 bytes**. Spending, time and effect bounds held; the product task failed.

No files changed by Task #003. Its managed worktree at the preparation commit is
clean, and no artifact patch, verifier receipt, grant, delivery receipt or commit
was created for the Task. Code/pricing and report commits in the development
branch are preparation/evidence, not Task delivery.

## Verification and preservation

Before the live invocation: **10 focused pricing/budget checks pass**,
`npm run check` exits **0**. Exactly **one full suite**, exit **0**:
**1,007 tests, 888 pass, 119 skipped, zero failures**, 176,655.467084 ms.
All those tests used offline fixtures and disabled native LaunchAgent tests.
No successful suite was repeated. The one actual foreground Task was then run
through the installed command, without transport injection or authentication bypass.

Captured CLI output and pure TUI/Web projections agree on NEEDS YOU, the exact
reason, usage and preserved bounds. Pure projection reads did not refresh or
mutate old tasks; no background UI runtime was launched.

Of the **914 previously existing `.work` files**, **912 remain byte/mode
identical**. The only authorized changes are project limits and Task ID sequence.
Every Task #001/#002 file and both existing owned worktrees are unchanged.
The prior committed hash manifest is referenced by `preservation.json`.
Production/stable tracked bytes, package modifications, production Tasks #2/#3,
prior receipts, existing 2f/2f-next launchers, LaunchAgent, schedule and runtime
binding are preserved. The existing scheduler naturally advanced **473 → 474**,
changing only its log/health files; no scheduler control was invoked and health
remains healthy.

The exact-value/encoded-value credential guard covered all guarded managed writes.
An independent scan of the new durable Task, logs and evidence found no key
material; the clean worktree also proves no new credential-bearing source file
was written. The audit did not retrieve or hash the credential. Native helper and
foreground child exited; no verifier process was spawned. Task/worktree/evidence
are deliberately retained. Presence query and authorized retrieval are not claimed
to be zero Keychain reads; there were no Keychain writes.

## Verdict and stop

- Historical small live canary: **GO**, unchanged accepted evidence only.
- Ordinary two-file **live foreground: NO-GO**, demonstrated by Task #003 stopping
  before any read/patch/verifier. Prior deterministic READY proof remains offline
  evidence and does not substitute for real model success.
- Unattended: **NO-GO**.

The remaining concrete blocker is economical source discovery: real model queries
returned no usable evidence and the next proposed batch did not fit the unchanged
tool allowance. Nothing was changed to hide that failure or enlarge the envelope.
Project 4/9 limits and refreshed official pricing remain as explicitly authorized.
Stop after this attempt; no Task #004, retry, fallback, delivery or rollout.
