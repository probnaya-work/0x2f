# Task #003 search economy correction — offline candidate only

Implementation: `acdde2e5c47b4aa38f5143cc45b6dd62b58a0e70`. Base: `488b9ef`. No provider calls, Keychain access,
Task #004, retry, fallback, delivery, push or production control.

## Diagnosis and minimum change

Immutable Task #003 evidence was read directly: all **14 referenced native
intents/receipts** still match their recorded SHA-256. Its first response issued
four literal searches (`After creating a Task`, `open it`, `Created Task`, `Task`)
with **zero matches**. The next response proposed four more searches, while only
**two of six tools** remained. Whole-batch pre-effect rejection was correct;
no schema/range/parser disagreement caused this stop. `diagnosis.json` records
the exact calls and evidence references without copying source bodies.

Only the managed instructions and per-request remaining-budget text change.
Prefer small test reads over guessed UI phrases; search code; one locator per
file per batch; after no match, read rather than try synonyms; reserve reads and
one patch. Every count/inference request receives the current remaining turns,
tools, reads and patch allowance from the existing ledgers. Search semantics,
tool surface, manifest checks, atomic persistence, fencing, reconciliation and
no-replay rules are unchanged. No new routing/model/provider/profile/framework.

The search strategy is **instructional**, not a new hard per-file search limit.
The existing six-tool validator remains the hard boundary. Replaying the old
inefficient response batches in a fake fixture still yields NEEDS YOU before
any tool in the oversized second batch executes. No silent partial execution
or larger allowance hides the failure.

## Offline READY proof and its limits

The scripted fixture uses the same brief, approved CLI/test paths, **31,003 and
3,046 byte files**, and 2,122 bytes of repository instructions. It is a miniature
CLI fixture, not a replay or modification of the historical Task or proof that
a real model will choose these ranges/queries.

1. Targeted test read **17–20** plus one source code locator (`"new"`) in one batch.
2. Targeted source read **395–398**; covered locator context is retired from the
   next request, with durable receipts retained by the unchanged mechanism.
3. One multi-file patch adds the next-action output and a deterministic regression.
4. Separate credential-free pinned Node verifier exits **0**, closes its group,
   verifies unchanged artifact bytes, and the actual loop publishes **READY**.

Exactly **one implementation attempt**, **3 inference + 3 count + 1 mock GET**,
**4 tools = 2 reads + 1 search + 1 patch**. Packet **3,346 bytes**, returned results
**1,199 bytes**, cumulative serialized input **31,906 bytes**. Mock counter usage:
**3,093 input / 30 cached / 60 output / 3,153 total**; calculated synthetic
inference amount **$0.0025695**. These are fixture quantities, not live provider
usage or billing. Shared CLI/TUI/Web projections agree on READY; duplicate driver
entry cannot dispatch again; no task delivery occurs. `offline.json` retains
bounded receipt metadata, digests, verifier output and projection without copying
source content.

All envelopes remain unchanged: **1 attempt, 4 inference, 4 count, 1 GET (9 HTTP;
5 unpriced controls)**, **8,192 input + 4,096 output = 12,288 cumulative tokens**,
**$0.024576 published inference maximum**. Total provider billing remains unknown;
no separate published control-request fee is asserted. Also unchanged: **6 tools,
4 reads (1–32 lines / 4 KiB content each), 1 patch, 4 files, 64 KiB source, 8 KiB packet,
24 KiB aggregate results, 32 KiB cumulative serialized input, 120s deadline**.
This proof's returned results are below 8 KiB. Existing stricter project limits,
foreground authorization, scheduled/unattended refusal and unknown-usage stops
still apply. Constants, registry/pricing and project configuration are unchanged.

A wider initial fixture read did hit the existing serialized-input ceiling; the
READY proof deliberately uses targeted ranges. Broad context collection remains
uneconomical and fails closed. Instructions cannot guarantee future real model
compliance; no renewed live GO is inferred from these scripted responses.

## Verification

- Focused managed/economics/projection/foreground: **114/114 pass**, exit 0.
- `npm run check`: exit **0**; explicit `node --check` for each edited file: **0**.
- Exactly **one full suite**: **1,009 tests, 889 pass, 119 skipped, 1 failure**,
  exit **1**. Both new Task #003 cases pass in that full run.
- The existing one-response patch regression returned NEEDS YOU after **33.916s**
  with its **30s fixture deadline**. Its assertion did not retain the blocked code;
  timeout is a timing-based inference, not a proven root cause. One isolated
  diagnostic run passed (**1/1**, 1.729s test time). No full-suite rerun or deadline
  increase. **A clean full-suite verdict was not obtained.**

`verification.json` preserves exact commands, counts, failure and log hashes.
Mock servers and temporary workspaces used fixture teardown; the owned verifier
process group closed. Real tasks and resources were never executed or refreshed.

## Preservation and rollback

All **1,389 existing candidate .work files** are byte/mode identical, including
Tasks #001/#002/#003, owned worktrees, policy, sequence, artifacts and receipts.
No Task #004. Production/stable tracked bytes and package modifications, production
Tasks #2/#3, launchers, LaunchAgent, schedule and runtime binding are unchanged.
The existing healthy scheduler naturally advanced **474 → 481**, changing only
its log/health files; no scheduler control was invoked. Prior tracked evidence
is unchanged. No credential was fetched, inspected, written or logged.

Rollback is a **new revert of `acdde2e5c47b4aa38f5143cc45b6dd62b58a0e70`**, retaining this report and existing
Task history. No project-state migration or rollback is required; none performed.

Verdict: **offline targeted path reaches READY**; clean full-suite qualification
remains unproven. Historical accepted simple live canary GO is unchanged;
ordinary two-file live foreground and unattended remain **NO-GO**. Stop here.
