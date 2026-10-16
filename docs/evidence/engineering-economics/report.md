# Engineering economics baseline

Verdict: **GO for the deterministic, offline cost-aware baseline. Real economical
Codex execution remains NO-GO: no qualified total-token ceiling or economical
model tier is available from the installed harness.** No new provider smoke ran.

Based on `e2b7b19548dac764fbb3a104e33c37a3c4e29cb0`, branch
`feat/task-continuity`. This report, implementation and verification are one
logical commit; its exact ID is returned by `git log -1 --format=%H --` this file
and reported to the user. No production activation or external action.

## Diagnosis before implementation

[diagnosis.json](diagnosis.json) preserves original usage events, line numbers,
source hashes, model observations, controller input parts and returned tool-output
sizes. [normalized-usage.json](normalized-usage.json) applies the new parser and
normalizer to those original sessions, separately from the original Task. It
includes exact original handoff/outcome locations and hashes. Historical canary
[attempt](../foreground-playbook-canary/attempt.json),
[continuation](../foreground-playbook-canary/continuation.json) and
[delivery](../foreground-playbook-canary/delivery.json) remain unchanged.

| Attempt | Input | Cached input (subset) | Output | Reasoning (overlap) | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1: capacity failure, partial | 19,944 | 11,136 | 185 | 0 | 20,129 |
| 2: successful implementation | 239,563 | 214,016 | 1,949 | 479 | 241,512 |
| Observed Task lower bound | 259,507 | 225,152 | 2,134 | 479 | 261,641 |

`241,512` belongs to successful attempt #2, not the Task. Session counters are
cumulative. Seven distinct increases end at 20,337 → 50,823 → 86,423 → 122,159 →
160,733 → 199,460 → 241,512. These snapshots must not be summed. Eight duplicate
events in attempt #1 represent one partial total of 20,129. The old adapter saved
the successful `turn.completed` total once; duplicated accounting did **not**
cause the reported 241,512. Cached input is already inside input, and reasoning
overlaps output. Successful uncached input is a derived 25,547, not a separately
reported metric. Failed-attempt final billing, money, currency and internal
billable API-call count are unknown. Seven counter increases are not proof of
seven billable calls.

Original local session sources (each hash and relevant line recorded in JSON):

- [failed session, token events at lines 16–23](/Users/bogart/.codex/sessions/2026/10/16/rollout-2026-10-16T13-19-09-01a144a6-de4d-7cb0-a560-25c9a43326b8.jsonl:16)
- [successful session, final cumulative event at line 49](/Users/bogart/.codex/sessions/2026/10/16/rollout-2026-10-16T13-29-24-01a144b0-43ff-76c2-8e60-4284b68bfd80.jsonl:49)
- [successful attempt input](/private/tmp/0x2f-canary-3vlJUt/repo/.work/tasks/001-fix-invalid-utf-16-in-truncated-task-titles/runs/2/handoff.json)
- [successful outcome](/private/tmp/0x2f-canary-3vlJUt/repo/.work/tasks/001-fix-invalid-utf-16-in-truncated-task-titles/runs/2/outcome.json)

The continuation used **new `exec`**, a different session ID, and a 3,041-byte
handoff rather than session resume. First input was 2,403 bytes. Raw session user
messages match these inputs. They contained brief, constraints/decisions, selected
snapshot references and, on continuation, the failed attempt reference. Full old
conversation, whole repository and all receipts were not automatically inlined.

The harness independently injected base instructions (18,014 JSON bytes), skills
message (24,470 bytes), multi-agent instructions/mode (2,264/271 bytes), and
environment/recommended plugins (4,159 bytes) into each session. Tool definitions
and exact token attribution to these components are not fully observable.

Successful execution then requested 30,000 output tokens while reading broad
architecture/development, title, tests and Web ledger files. The returned payload
was 41,128 bytes (truncated). A second read repeated title/tests and returned
18,257 bytes. Targeted test outputs added 10,488 and 12,735 bytes, besides tiny
patch receipts. These returned outputs stayed in the growing internal context;
cached input accumulated across subsequent calls. This is direct evidence of
context amplification, not a guessed token-per-byte attribution.

The necessary work was the scoped source/test inspection, patch and deterministic
Unicode check. Broad and repeated reads, verbose repeated test output and the
large harness context were disproportionate to that work. Repository instructions
also required documentation reading; it cannot all be labelled optional. Exact
necessary-versus-excess **token counts are unknown**. The controller cannot remove
the installed harness's independently injected context or enforce its tool-output
size through prompt instructions.

AUTO chose Codex because it alone qualified for foreground subscription execution.
The adapter supplied no explicit model and used `--ignore-user-config`; observed
turn contexts identify `codex-cli 0.149.1 / gpt-5.6-sol`. Why the CLI chose that
internal default is unknown. Neither the existing routing nor the installed model
cache established a cheaper, sufficient tier. Marketing/model-cache descriptions
are not capability or economic qualification.

## Implemented slice

- Immutable per-attempt `runs/<n>/usage.json` and Task snapshots
  `usage/task-after-<n>.json`, digest-referenced from additive Task fields. A mutable
  aggregate cache points to its immutable snapshot. Original Task/run/event layout
  and atomic store writes remain intact. Existing canary records were not migrated.
- Separate attempt/provider/harness/model, routing and continuation reasons,
  complete/partial outcome, counter scope/identity/semantics, available categories,
  metric sources and source hashes/lines, explicit unknown cost/currency, context
  parts and limits. Interrupted execution also gets an unknown attempt ledger;
  no effect replay follows. Duplicate settlement is idempotent.
- Cumulative snapshots replace earlier snapshots, duplicate identities count once,
  delta events require explicit identities, resumed session totals aggregate once,
  incompatible/reset counters become unknown. Unknown is never zero.
- New foreground dispatch installs one deterministic policy. Small scope means at
  most two writable files, four relevant files and a brief up to 4,096 bytes;
  standard is larger; review-required/sensitive, more than eight writes or more
  than two directories is high-risk/cross-cutting. Existing qualified providers
  are ranked by the minimum **observed sufficient** cost/capability tier, preserving
  existing order for ties. No native model/tier claim was invented.
- One implementation-first primary for the new foreground policy. Another executor
  requires the existing observable failure/review boundary and remaining budget.
  Subjective uncertainty does not switch harnesses. A small task cannot spend a
  second attempt after either capacity failure or a failed check. Unknown/partial
  usage and unsupported next-call ceilings block continuation.
- Versioned bounded handoff contains current intent/constraints, applicable
  repository instructions, selected file hashes/bytes/snapshot locations and
  purpose-specific evidence with machine-readable inclusion reasons. Full audit
  references stay outside dispatched content, digest-bound and rechecked. Prior
  prose is omitted except a bounded failure summary. Full failing output is a
  durable artifact; only the last 1,024 bytes enter the prompt. Instruction or
  snapshot drift stops dispatch.
- CLI/TUI/Web use the same usage/routing projection. Legacy tasks remain readable;
  new ledger-less policy tasks say zero dispatches and unknown cost. The UI does
  not relabel unknown money as confirmed zero.

## Guarantees and remaining blockers

| Scope | Hard, enforced by controller/qualification | Soft | Unknown/unproven |
| --- | --- | --- | --- |
| Small | ≤8,192 controller-input bytes; ≤1 provider attempt; 120,000ms driver deadline, or lower configured limit | 8,000 total-token target; 4,096-byte autonomous tool-output instruction | Native total tokens, internal calls, money, harness-injected context, autonomous tool output, full process-tree termination |
| Standard/high-risk | ≤16,384 input bytes; ≤2 attempts; 300,000ms driver deadline, or lower configured limit | 32,000 total-token target; same output instruction | Same native unknowns |

The driver deadline bounds waiting and later dispatch, **not** proven termination
of all descendant effects. Existing exact deterministic check receipts and original
budget reservations remain in force. Budgets are not reset by capacity failure.

Before dispatch the qualified maximum tokens must fit the remaining token target,
and a sufficient tier must have evidence. A context-window size is not a total
spending ceiling. Installed `codex exec --help` exposes no qualified total-token
or internal-call bound; no enforcement experiment here proves one. Consequently
the current native small-task upper bound is **zero new provider attempts**: it
stops with `token_ceiling_unproven`. If a future existing executor qualification
proves ≤8,000 total tokens and sufficient small tier, one attempt can fit that
envelope. 8,000 is not claimed as today's native hard ceiling or expected actual
usage. There is no evidence-based monetary upper bound.

No optimizer, provider abstraction, pricing service, profiles UI, generic workflow
engine, unattended execution, or new hardening programme was added. Tool-output
instructions are conservative guidance, not asserted harness enforcement. No
provider smoke ran; fixture qualification does not prove real economical execution.

## Verification, preservation and rollback

Verification results are saved in [verification.json](verification.json): 85/85
targeted tests, one full suite (796 passed, 119 native skipped, zero failures),
`npm run check`, and independent exit-checked syntax for 199 JavaScript and 7 Python
files. Final review after that suite found one post-call gap: observed token overrun
could block another dispatch but still permit READY. The small final guard now
blocks READY for unknown/partial or over-target tokens; both drivers and their
existing flows passed 50/50 targeted tests after this change, including 22 economics
regressions. The full suite was not repeated over that final delta. Regressions exercise cumulative/delta/session accounting,
unknown/partial/failed/successful attempts, immutable archives, context/log limits,
instruction drift, least sufficient tier, observable secondary routing, no blind
retry, both existing drivers and shared projections/legacy reads.

[preservation.json](preservation.json) compares fresh read-only before/after
inventories. Main/stable checkouts, Task #2 (105 files), Task #3 (24 files), protected
packages, LaunchAgent file/binding, scheduler installation and editorial schedules
are unchanged. Only natural scheduler log/health advanced, with exit 0. The existing
delivery receipt still hashes to
`e7d83198ad294db44483b514e1cae3eb673fbd2c129e7df806002e5996613e7b`.
No new delivery effect, commit in the canary, provider call or publication occurred.

Rollback: a separate revert of this development commit restores previous dispatch
behavior; preserve Task history, usage archives and old receipts. No production
rollback or migration is required. Offline economics/context regression verdict
becomes GO. Prior demonstrated foreground functional flow remains historical
evidence. Practical native economic execution, hard native spending guarantees and
unattended production execution remain NO-GO. This bounded slice stops here.
