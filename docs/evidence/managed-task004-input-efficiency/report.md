# Task 004 input efficiency — offline candidate

Implementation: `f9be6c8106c6c3a11df3fbf3e95978c6180e6799` on
`fix/managed-source-search`. No provider requests or Keychain reads. No new real
Task, replay, delivery, scheduler control or runtime installation.

## Diagnosis from immutable native receipts

The binding constraint was cumulative UTF-8 `JSON.stringify` bytes of **both**
count and inference request bodies. This is the intended existing policy; it is
not an inference-only payload limit. The availability GET has no HTTP body and
is excluded. Inference repeats the entire count body plus 94 bytes of execution
options. No discount for repeated/cached content or count requests was introduced.

| Native turn | Count | Inference | Pair | Cumulative |
|---|---:|---:|---:|---:|
| 1, actual | 4,615 | 4,709 | 9,324 | 9,324 |
| 2, actual | 9,897 | 9,991 | 19,888 | 29,212 |
| 3, rejected projection | 10,271 | 10,365 | 20,636 | 49,848 |

Each original count body has 273 bytes of runtime instructions, 1,409 of tool
schemas, 318 of task intent, 2,246 of repository instructions and 177 of approved
file context. These are additive marginal serialized contributions; framing is
reported separately. Native constraints are empty. The first body's remaining
192 bytes are framing. Thus 4,423/4,615 first-request bytes were fixed context,
not useful source returned by the model's tools.

The second count body additionally carries 110 bytes of call arguments, 370 of
assistant call metadata, 4,440 of serialized source content and 350 of result
metadata; framing is 204. The two reads returned **4,202 raw source bytes**
(1,363 + 2,839); 238 additional source bytes arise from serialization escaping.
Their full structured results consume 4,794 ledger bytes. The empty search adds
140 ledger bytes and no source excerpts. At the projected third count, call
arguments grow to 153, assistant metadata to 557 and result metadata to 488;
source remains 4,440 and framing becomes 210. Complete per-body decomposition
and SHA-256 references are in `evidence.json`.

Across the four actually dispatched bodies: repository instructions consume
8,984 bytes, schemas 5,636, source content 8,880, runtime instructions 1,092, brief
1,272, file context 708, assistant calls/arguments 960, result metadata 700,
framing 792 and inference-only options 188 = **29,212**. Count bodies account for
14,512 of these bytes; inference bodies 14,700. This is duplicated transmission,
not evidence of duplicate provider billing. No deadline or billing failure is
inferred.

`node docs/evidence/managed-task004-input-efficiency/reconstruct.mjs` reproduces
these exact numbers by reading native receipts without modifying them or running
a Task. The third pair is reconstructed, never dispatched.

## Correction

Three small wire changes: transmit the complete brief, constraints, file manifest
and verbatim repository instructions as text instead of nested JSON; transmit a
read result as its JSON metadata header followed by its exact source text; omit
optional provider item IDs/status from function-call history while retaining the
call ID, tool name and exact arguments. All original metadata/results remain in
immutable receipts. The in-memory structured history remains unchanged. Search
outcomes, denials and unresolved calls remain available; existing covered-locator
compaction is unchanged. No role/authority change or source summarization occurs.

The prompt now recommends batched literal code locators and short test windows
instead of broad header reads/prose guesses. It contains no Task-specific paths,
queries, line numbers or patch. The read description omits its duplicated line
range; the exact 1–32 range remains in both schema and runtime validator.
Acceptance commands, executable identity, scope, fencing, packet and verification
contracts remain in the same immutable inputs and external verifier boundary.

No limit or accounting changes: **1 attempt; 4 inference + 4 count + 1 GET;
6 tools, 4 reads, 1 patch, 4 files, 65,536 source bytes, 8,192 packet bytes,
24,576 result bytes, 4,096 bytes/read, 32,768 cumulative serialized input bytes;
8,192 input + 4,096 output = 12,288 inference tokens; 120-second maximum**.
The unchanged qualified model is `gpt-5.4-mini-2026-03-17`. Published inference
maximum remains **$0.024576**. Up to five controls have no separate published fee;
contractual zero fee and fully known total provider billing are not claimed.

## Quantitative offline proof

A disposable 31,003-byte source plus 3,046-byte test, original brief, full actual
repository AGENTS instructions, and provider-shaped call IDs/items use the actual
managed loop and localhost fake Responses transport:

1. Two batched literal searches locate source and regression insertion points.
2. Two targeted reads retain source lines 396–398 and test lines 17–20.
3. One multi-file patch preserves the original Created output and adds the next
   action plus a regression asserting it. The real credential-free Node verifier
   runs outside the model loop; exit 0 and owned process group closed. Only then
   does the Task become READY. CLI/TUI/Web projections agree.

| Fixture request pair | Prior representation | Compact representation |
|---|---:|---:|
| 1 | 4,615 + 4,709 | 4,516 + 4,610 |
| 2 | 6,220 + 6,314 | 5,941 + 6,035 |
| 3 | 5,885 + 5,979 | 5,567 + 5,661 |
| Total | **33,722 (blocked)** | **32,330 (READY)** |

Savings: **1,392 bytes**, leaving **438 bytes (1.34%)**. On this fixture, compact
initial context saves 540 cumulative bytes, omitted optional item metadata 720,
and read representation 78; shorter schema text saves 84, while longer discovery
guidance costs 30. Both count and inference bodies remain fully charged.
The prior total is a reconstruction of the same scripted fixture's wire bodies
under the old assembler, not another provider execution.

Actual fixture: 3 inference + 3 counts + 1 GET; 5 tools = 2 searches + 2 reads +
1 patch; 1,877 structured result bytes; 3,392 packet bytes; one attempt, no
fallback/retry/replay/delivery. Mock usage is 3,153 tokens, not real tokenization.
The unchanged cumulative token guards are independently exercised through four
responses. Immutable patch digest:
`fdbf26d0a53a7ca596886d1502d236b306d9e006f4d3d415a0361ca11e965596`.

This fixture changes discovery strategy relative to Task 004: its source/test
bodies are representative standalone executable files, not copies of the real
CLI, and the verifier path differs (packet +17 bytes). It does not prove that the
live model independently chooses these queries/ranges or produces this patch.

The **exact bad native prefix still cannot fit**: compact shadow serialization
would consume 28,152 after two pairs and project 47,762 after three. No source was
discarded to make that path fit. An additional runtime regression uses the same
broad-reads → empty-search pattern with synthetic comment headers and approved
file sizes; it stops at NEEDS YOU / MANAGED_INPUT_LIMIT after two pairs, before
request-6 intent, patch or verifier. It preserves one attempt and does not replay.
The synthetic header text, file names and call IDs differ from native evidence;
the exact historical numbers come only from the read-only native reconstruction.

## Verification and preservation

Focused managed/economics/projection/foreground: **117/117**, plus the final new
input-boundary regression **1/1**. `npm run check`: exit 0; final changed-test
syntax check: exit 0. One final `npm test`: **1,013 tests, 894 pass, 119 expected
skips, 0 failures**, exit 0. Full suite was not repeated. One initial negative
fixture assertion expected undefined instead of the existing null verification;
only that assertion was corrected and that test rerun. After full-suite success,
only a source comment was clarified; executable code did not change.

The new unit regression proves verbatim instruction/source preservation including
quotes, backslashes, Unicode and CRLF; projection does not mutate structured
history or denials. Existing suites retain range correction, drift/symlink,
request/token/result limits, credentials-before-dispatch gates, unattended
refusal, fencing, crash/no-replay and verifier-failure behavior. Logs/digests and
summary results are in `evidence.json`; full logs remain under
`/private/tmp/0x2f-task004-input-correction`.

All **1,892** existing candidate `.work` files, including Tasks 001–004, worktrees,
receipts, artifacts, configuration and allocator lastId=4 are byte/mode identical.
Aggregate manifest before/after:
`db542cec3504f5b32623e01e3b07d2285c484724b00c4d4aaca589e8038605ce`.
Production/stable tracked files, HEADs, package modifications, LaunchAgent and
launcher bindings are identical. Only the already running production scheduler's
`scheduler.log` and `scheduler/health.json` advanced naturally; no scheduler
operation was issued. Retained evidence was not edited. No credential was read,
printed, persisted or provisioned; tests remove inherited provider credentials
and use fake localhost transport/key fixtures, with native LaunchAgents disabled.

## Verdict and rollback

**Offline candidate PASS; eligible for consideration of one separately authorized
attended foreground qualification. No live attempt is authorized or executed here.**
Historical simple-live-canary GO is unchanged. Ordinary two-file live foreground
and unattended remain **NO-GO**. There is no renewed live GO.

The remaining uncertainty is real-model source discovery, valid economical ranges,
patch quality and actual tokenization/protocol usage under this representation.
The byte margin is small; four available turns do not guarantee that four pairs
fit. Broad reads still exhaust it safely. A future authorized normal foreground
Task must independently locate both sections, patch both approved files, pass the
pinned deterministic verifier and reach READY within every unchanged limit, with
one attempt and no retries/fallback/delivery, to establish narrow live evidence.

Rollback: revert implementation commit `f9be6c8` locally; preserve these reports
and all Task history. No production rollback or `.work` migration is involved.
Stop after this correction; no further hardening or new milestone started.
