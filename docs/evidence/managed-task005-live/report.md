# Task 005 — real managed foreground qualification: NO-GO

Outcome **B: input budget exhausted**. Candidate `a9cd9f1` includes accepted
implementation `f9be6c8`; no code, limits, routing or pricing snapshot changed.
One authorized normal `2f-next new` invocation used the original brief without
source hints, provider/model flags, patch or scripted sequence. The actual ID was
**005**, run **1**, attempt `e6d17fef-281d-4b68-a367-d27736244ecd`.
AUTO selected **managed-openai / 0x2f-responses-v1 /
gpt-5.4-mini-2026-03-17**. Elapsed **8.046s**, final
**NEEDS YOU / managed_input_limit**, pending request null.

## Product result

**No useful verified patch.** Zero patches, empty diff, no verifier/review/delivery,
no READY. The model did not locate the CLI creation branch. There was one attempt,
no retry, fallback, continuation, manual repair or second execution. CLI exit 0
means the terminal Task was reported, not engineering success.

| Inference | Actual client-owned calls | Result |
|---|---|---|
| 1 | f1 searches `open it`, `Task ID`; f2 search `foreground` | first two empty; test matches at 12, 17, 30, 33 |
| 2 | f1 and f2 reads, lines 1–32 each | 1,363 + 2,839 source bytes; no truncation |

Structured results: searches **140 + 140 + 1,765**, reads **1,686 + 3,108** =
**6,839 bytes**. Exact content remains in native bounded tool receipts; queries,
ranges, source hashes, result references and receipt hashes are in `evidence.json.gz`.
The read results were produced locally after inference 2 and **never reached a
third inference**. Source f1's header contains imports, not the creation section.
Five of six tools were spent; only one remained before any patch.

## Exact wire budget

| Pair | Count JSON | Inference JSON | Cumulative |
|---|---:|---:|---:|
| 1, sent | 4,516 | 4,610 | 9,126 |
| 2, sent | 7,017 | 7,111 | **23,254** |
| 3, projected, never sent | 11,385 | 11,479 | **46,118** |

Remaining allowance was **9,514**. The next pair needed **22,864**, exceeding the
32,768 limit by **13,350**. No request-6 intent or receipt exists. Reconstruction
uses native inputs/responses/results and the committed compaction rules; it does
not replay the Task or issue an API request. Both actual count and inference
UTF-8 JSON bodies remain charged: **11,533 count + 11,721 inference**. No accounting
defect was observed.

Of actual 23,254 bytes: repository instructions **8,676**, schemas **5,580**,
runtime instructions **1,112**, brief **1,272**, constraints **8**, file context
**716**, call arguments **258**, assistant call metadata **630**, search excerpts
**3,250**, tool-result metadata **828**, framing **736**, inference options **188**.
Read source is absent from dispatched bodies. Third-pair projection adds those
reads and retains the test locator: match 33 is outside the 1–32 read, so existing
conservative compaction correctly retains that unresolved locator, including some
overlapping excerpts.

## Comparison and classification

Task 004 used 29,212 bytes, three tools and 3,249 tokens, also without a patch.
Task 005 used fewer bytes after two pairs, but ordering differs: its reads were not
yet transmitted. This is **not a causal improvement in useful engineering work**.
The same Task-005 trajectory under the prior assembler would have consumed
**24,142**; the correction saved **888 bytes (3.68%)**. It works mechanically,
but did not make the real flow succeed.

Offline READY used two useful locators, two targeted reads and a patch in three
inferences: **32,330**, leaving 438 bytes. Real behavior used prose guesses and
broad header reads despite the guidance. Its projected three-pair cost is
**13,788 bytes above that completed fixture**, far beyond the fixture margin.
The live model independently chose an ineffective strategy. Repeated stateless
context/count bodies and the strict cumulative envelope amplify that failure.
This observation does not prove general model incapability or that every efficient
trajectory needs more bytes. Nor does it prove that raising the byte cap alone
would succeed: only one tool slot remained and the creation code was still unknown.

**The 32 KiB cumulative count-plus-inference budget is not established as adequate
for ordinary autonomous two-file discovery. Its suitability is a product decision,
not another instruction-compression exercise.** No further compression, fixture,
budget increase or architectural change was implemented.

## Usage, checks, cleanup and preservation

Exactly **5 provider HTTP requests: 1 GET + 2 count + 2 inference**; all receipted.
Usage by inference: **852 input + 85 output = 937**; **1,429 + 74 = 1,503**.
Total **2,281 input, 0 cached/cache-write, 159 output, 0 reasoning, 2,440 tokens**.
Calculated inference-only cost **$0.00242625** (ledger rounds up to 2,427 micros).
Published inference maximum remains **$0.024576**; three controls dispatched out
of five allowed, no separate published fee and no contractual zero fee claimed.
Complete provider billing remains **unknown**. Official
[model](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and
[pricing](https://developers.openai.com/api/docs/pricing) pages were checked;
stored rates match and the existing snapshot was still within 24 hours.

Existing accepted verification remains applicable: **894 pass, 119 skips, 0 fail**;
no suites were repeated because no execution code changed. The Task's pinned
verifier did not run. Read-only ledger, byte reconstruction, empty-diff and pure
CLI/TUI/Web agreement checks passed. All surfaces show NEEDS YOU / MANAGED_INPUT_LIMIT.

Owned process group **38436** closed normally; no cleanup signal needed and no
verifier group was spawned. The dedicated credential was used only through the
normal authorized foreground path; no downloaded key file, new key or credential
write. Pattern audit found no new secret-shaped material; its one worktree match
was byte-identical committed fake-key fixture source. Audit did not retrieve the
real credential. Native bound secret guard also remained active.

All **1,891** pre-existing candidate `.work` files excluding allocator are
byte/mode identical, including Tasks 001–004 and their worktrees/receipts/artifacts.
Only `task-sequence.json` advanced **4 → 5**. The **522** new files comprise
33 Task files and 489 owned-worktree files; Task/worktree are retained and clean.
Production/stable files, packages, HEADs, LaunchAgent, schedule, runtime/launcher
bindings and prior evidence are unchanged; no production `.work` change was
observed in this experiment. Full quantitative records, preservation manifests
and native evidence hashes are in `evidence.json.gz`.

## Decision and single next milestone

**Ordinary managed live foreground remains NO-GO; unattended remains NO-GO.**
Historical simple-canary GO and offline PASS are unchanged.

Next milestone: **agree a usable bounded execution envelope for an ordinary
small two-file Task, then prove the original improvement reaches verified READY
through normal AUTO without user source guidance**. First resolve whether the
32 KiB cumulative-wire ceiling is appropriate while retaining the token/cost
ceilings; also account for discovery tool capacity. This is an explicit product
budget decision, not an automatic limit increase or a promise that more bytes
fix poor navigation. No next milestone or additional Task was started.
