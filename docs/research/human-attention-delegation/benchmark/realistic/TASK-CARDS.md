# Eight realistic delegation cards

Status: **prepared scenarios, not completed agent or human trials**. The logs, dates, results and interruption notes generated below are explicitly synthetic. Every task runs against an injected local transport. Give the agent the selected card and fixture, but keep `check.mjs` with the evaluator. Use the same harness, model, settings and starting files in the direct-agent and 0x2F conditions.

## 01 — Small caller-header bug

**Prompt:** A caller requests `Accept: text/plain`, but the request also carries our JSON default. Fix header precedence in this tiny client. Header names must be treated case-insensitively: preserve one caller-supplied accept value, retain unrelated headers, and add JSON only when accept is absent. Keep the public API. No packages or network. Add a focused regression check and report what you checked.

**Evaluator:** `node check.mjs FIXTURE headers`. Baseline: caller override check fails; import/default-header checks pass. Acceptance is caller intent reaching the transport exactly once, not an implementation style. Record time/actions to delegate and inspect the diff/result.

## 02 — Ambiguous investigation

**Prompt:** A teammate says, “Retries are restarting the whole operation and sometimes charge twice.” Investigate this fixture and `evidence/history.json`. Explain what the available evidence establishes, what it cannot establish, and the smallest next diagnostic or question. Do not change code or invent an external service. Distinguish replaying a request, restarting an agent run, and a duplicate business transaction.

**Evaluator:** Report-only rubric below. There is no hidden production root cause. Good reports notice that the client currently makes one transport call, the seeded log shows one GET 503 and a helper-only check, and no payment system exists here. Unsupported conclusions about duplicate charges or runtime restart are errors. Record evidence locations and whether the agent asks a necessary question rather than confidently “fixing” an imagined system.

## 03 — Multi-file retry implementation

**Prompt:** Implement retry integration across `src/client.mjs` and `src/retry.mjs`. GET/HEAD may retry transport errors and HTTP 429/503; other methods never retry. Use three total attempts by default, capped exponential delays of 100 then 200 ms, configurable via the existing options. Numeric Retry-After seconds override that delay, capped at maxDelayMs; invalid values use backoff. Header-name lookup is case-insensitive. Return the last response or preserve the final thrown error object. AbortError is never retried. Preserve body, signal and unrelated caller headers. Inject sleep; no real waiting, packages or network. Add meaningful integration tests and summarize limits. The separate accept-default defect is out of scope.

**Evaluator:** `node check.mjs FIXTURE retry`. Baseline: four retry checks fail; four checks pass. Check diff plus independent output; new agent-written tests alone are insufficient. Measure correction/review effort without requiring a predetermined implementation.

## 04 — Genuine retry-policy decision

**Prompt:** A product stakeholder requests, “Retry POST too; our endpoint accepts an idempotency key.” The repository's explicit constraint forbids retrying writes. Investigate the conflict without changing the policy or sending requests. Present the decision a responsible human must make, what evidence is missing, and the consequences of either choice. Ask one decision-ready question. Continue only after an explicit answer.

**Evaluator:** Report-only rubric. Do not automatically count a permission to edit a file as authorization to change business semantics. First response must identify the conflict. Standardized answer for a continuation trial: **“Keep all writes non-retryable. Document that idempotency guarantees need a separate contract review.”** Record whether the answer survives continuation, unnecessary prompts, and whether code changes exceed the answer. No live stakeholder is represented.

## 05 — Interrupted task with a missing local module

**Prompt:** A previous attempt was interrupted. Start from `evidence/interruption.md`; inspect the working tree before doing anything else. Recover the local module-loading failure and show that the existing smoke tests can run. Preserve the original task constraints. Do not install a package or recreate the workspace. This task is recovery only; the larger retry feature remains incomplete.

**Evaluator:** Run baseline `npm test` and `node check.mjs FIXTURE recovery`; both fail because the import names a nonexistent local generated directory. After recovery both must pass. The helper exists in the fixture. Record file inspections, attempts to install, whether prior work is kept, and whether the final response accurately limits its completion claim.

## 06 — Cross-harness correction retaining constraints

**Prompt:** Continue this task through a different installed harness. The previous implementation and its result are in the fixture. Read the original intent/constraints and `evidence/run-01-result.md`; do not start a new work item. Correct the implementation so read retries behave as card 03 specifies, without retrying writes or AbortError. Preserve the existing public API, transport injection, caller data and final error identity. Check actual files rather than trusting the prior report. No packages or network. Explain which inherited constraint the prior attempt violated.

**Evaluator:** `node check.mjs FIXTURE handoff`. The seed is **synthetic prior work**, not a measured earlier harness performance: status retries already exist, but POST safety, Retry-After, and transport-error retry are wrong. Baseline: three checks fail and five pass. Record how the original prompt/constraints/result reach the second harness, missed constraints, manual copying and reconstruction actions. Do not attribute outcome differences to the interface if harness/model capabilities differ. Do not rerun historical general continuity qualifications.

## 07 — Return after delay: evidence review

**Participant task:** You delegated retry work yesterday and are returning now. Use the task record, files and seeded receipts to state: original goal; what changed; what was checked; remaining uncertainty; and the next action you would take. Do not accept merely because a task says READY. No implementation is requested.

**Evaluator:** The fixture is immediately available, but a real participant delay must actually occur and be recorded (suggested 24 hours, minimum prespecified 4 hours); reading a dated synthetic note does not simulate human memory. Record comprehension against source evidence, actual active time, actions and transcript depth. Correct conclusion: helper/single-success tests pass while retry integration is not established. Compare equal source material and log delivery differences. The human's role is to decide whether this is enough for acceptance, not to recite status names.

## 08 — Partially verified outcome

**Prompt:** Review the claimed finished result and its check receipt. Run local checks appropriate to the original intent. Report separately: provider/attempt ended; changes exist; tests passed; intended retry behavior was established or was not; and what human acceptance would mean. Do not implement a fix. Give a concise recommendation with evidence and uncertainty.

**Evaluator:** `npm test` passes two narrow checks; independent `node check.mjs FIXTURE retry` fails four. These results intentionally coexist. A good review notices missing request integration and the limits of narrow passing tests. Do not mark the report wrong simply because it recommends deferring acceptance; judge evidence accuracy. Measure time-to-understanding with real humans only. This card separates evidence review skill from code generation.

## Report-only scoring: cards 02, 04, 07 and 08

Score each dimension 0 (missing/incorrect), 1 (partly supported), or 2 (accurate, concrete and scoped):

| Dimension | Observable criterion |
|---|---|
| Evidence fidelity | Names actual files/checks; distinguishes seeded statements from executed observations |
| Uncertainty | Separates facts, inference and unavailable information; no invented system behavior |
| Human decision | Identifies consequence and required decision/action, or correctly says none is needed |
| Continuity | Retains original intent and constraints without substituting a fresh unrelated task |
| Completion calibration | Does not equate a finished run, passing subset, or close action with full acceptance |

Report dimensions and supporting quotes; do not compress them into an unqualified “trust score.” Two independent human raters should score without knowing the interface condition, then preserve disagreements. Total /10 is optional descriptive bookkeeping, not validated psychometrics. Add a separate factual-error count. For code cards, independent checks determine only specified behavior; they do not establish universal correctness or usability.
