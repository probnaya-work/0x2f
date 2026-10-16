# Foreground playbook canary — completed

Verdict: **GO for the demonstrated foreground flow in a managed disposable
repository, including one explicitly approved capacity continuation and exact
user-granted local delivery.** Production/unattended scope is unchanged.

The implementation, real task patch and evidence are saved together in the
separate development milestone commit containing this report, based on
`00ae2dc6e4d28d3b159f3cd18f245657fd4801ad` on `feat/task-continuity`. Its exact ID is
reported to the user and resolves with `git log -1 --format=%H --` this file.
This development snapshot is separate from the **one task delivery effect** below.
No amend, push, PR, merge, deployment, release or publication.

## Real task and full flow

Task #1 fixed a real defect: truncating `deriveTitle('x' + '😀'.repeat(60))`
split a UTF-16 surrogate pair. The deterministic controller check failed before
dispatch. Task scope was exactly `src/core/title.mjs` and `test/title.test.mjs`.
The current 0x2F repository was cloned locally into a self-contained disposable
repository, then the normal task action created its owned detached worktree.
Production `.work` was not copied or used.

The saved Task completed:

`task → managed worktree → run 1 capacity failure → explicit user authorization → run 2 real Codex patch → run 3 deterministic verification → run 4 bounded review → delivery preview → exact user grant → one local Git commit → durable receipt → READY / LOCAL COMMIT COMMITTED`

The first run read files, then failed with `Selected model is at capacity. Please
try a different model.` Its source/artifact digests matched and no changes were
made. [attempt.json](attempt.json) preserves that historical blocked observation.
The user explicitly authorized one additional foreground attempt. Run #1 was
retained; counters and unknown reservations were not reset.

Two concrete blockers were fixed with small local changes. Foreground playbooks
with `agentRuns=1` start implementation directly, including its own investigation,
then retain deterministic verification and the existing review policy. A narrow
`--foreground --retry-run <failed-run>` continuation accepts only a completed,
unchanged capacity failure with intact handoff/outcome/artifact, intent and live
managed binding. It records the exact user decision, increments limits by one
and builds a fresh handoff. Changed, uncertain, mismatched, consumed and concurrent
repeat requests are refused. Independent-review requirements are not bypassed.
No generic retry/recovery framework, profile or new provider abstraction was added.

AUTO selected Codex because it alone qualified for the foreground subscription
boundary. Both actual sessions used **codex-cli 0.149.1 / gpt-5.6-sol**, observed
from real turn contexts. There was no explicit model override, new provider or
credential. The second handoff was **3,041 bytes**, versus 4,039 audit-history
bytes, and included a prior failure reference rather than the full conversation.

Codex changed only the approved source and test: it removes a trailing high
surrogate before the ellipsis and covers odd/even truncation boundaries. API,
length bound, word-boundary behavior and brief body were preserved. The same
bytes are included in the development milestone. [Continuation](continuation.json)
records the post-review snapshot before delivery.

## Verification and review

The exact saved task artifact passed a controller Unicode regression and
**114/114** title/Web ledger tests. Durable verification records command, cwd,
pinned executable, exit 0, output hash and unchanged source. Existing bounded
review produced a clear **deterministic-policy** receipt. This low-risk task did
not trigger another model or reviewer; no independent-agent review is claimed.

Foreground/continuation targeted tests: **15/15**, plus **2/2** after adding the
user authorization note to the next handoff. One ordinary final full suite on the
combined development candidate (runtime blocker fixes plus byte-identical real
task patch): **895 tests, 776 passed, 119 native skipped, 0 failures**. Task checks
and full integration checks have distinct scopes. Code patch SHA-256 remained
`0b973901bcd9847ae597e35e420a102c8f1da2689052ab6a5cb93e86cac3c377`
before/after the suite and after user delivery, so the suite was not repeated.

`npm run check` passed. Independent exit-checked syntax verification covered
**196 JavaScript files** and AST parsing of **7 Python files**. No explicit native
suite or further provider call ran. [Verification](verification.json).

## Attempts and usage

There were **two provider attempts total**: initial capacity failure plus the one
explicitly approved continuation. The successful run reported **241,512 tokens**:
239,563 input (214,016 cached) and 1,949 output. Failed-run partial session telemetry
was 20,129 tokens; it is not final billing evidence and its task usage remains
unconfirmed. Money and internal model/API call counts remain unknown, not zero.
There are no remaining authorized or queued provider attempts. No hard spending
guarantee is claimed.

## Delivery proof and final projection

User granted the exact preview digest:
`ab32e4abfd1b1f97de1c11397fd8070f86a1938ba977f3059461e11361fbc125`.
The separate Git capability was consumed and produced exactly one task commit:

`7beadd3b12f2ce45534dba0ba41841de3aa1b718`

Parent: `00ae2dc6e4d28d3b159f3cd18f245657fd4801ad`.
Tree: `c5b98cae47c44a1233e5df9a1e19e5718082a81e`.
Message: `fix: preserve Unicode task titles when truncating`. Active hooks: none.

Operation ID: `e13305e1-b6ed-4457-aa07-1e6e5b98f42e`.
Durable receipt under the task directory:
`delivery/ab32e4abfd1b1f97de1c11397fd8070f86a1938ba977f3059461e11361fbc125/receipt.json`.
Receipt digest:
`e7d83198ad294db44483b514e1cae3eb673fbd2c129e7df806002e5996613e7b`.

Post-delivery verification proved receipt/grant/intent hashes, canonical commit
bytes including operation header, exact tree/diff and approved paths, one commit
since the expected parent, HEAD reachability, clean managed worktree, and the
still-valid accepted artifact. Delivery was not invoked again. The private raw
receipt is retained; [delivery.json](delivery.json) is its sanitized evidence.
[delivery-preview.json](delivery-preview.json) remains the historical proposal.

Actual CLI open, real local Web API and TUI projection agree on **READY / NEXT
ACCEPT / LOCAL COMMIT COMMITTED**, resulting commit and receipt reference,
verification/review artifacts, and unknown cost. The Task is retained READY for
user acceptance. This proves real data/projection paths, not a browser/PTY render
of this specific canary. The temporary Web server was closed.

## Preservation, limitations and rollback

Original HEAD/status/tracked files, stable checkout, Task #2 (105 files), Task #3
(24 files), both existing package modifications, LaunchAgent runtime/installation
and editorial schedule are unchanged. Natural scheduler ticks advanced 116→118
with exit 0; only scheduler log/health changed. Health stayed successful. No
fixture agents, delivery test repositories, canary workers or task lock owners
remained; the actual canary and artifacts remain retained for audit.
[Preservation](preservation.json), [cleanup](cleanup.json).

**New evidence:** a real foreground engineering task through scoped implementation,
checks, bounded policy review, explicit delivery permission, one task commit,
durable receipt and shared final projection, preserving continuity across an
explicitly authorized capacity failure. **Not proven by this canary:** completing
that entire flow on its first provider attempt, real risk-triggered independent
review/cross-harness transfer, general real-repository delivery or arbitrary
execution. Existing offline qualifications remain scoped as before. Unattended
production activation and hard spending guarantees remain NO-GO. No scheduled
provider execution or production activation occurred.

Rollback the development milestone with a separate revert; retain Task history,
Git objects and receipt as audit evidence. No production rollback/migration is
needed. The delivered canary commit is an historical effect and is not silently
rewritten or reverted by rollback. This completed milestone stops here; external
delivery and broader rollout have not begun.
