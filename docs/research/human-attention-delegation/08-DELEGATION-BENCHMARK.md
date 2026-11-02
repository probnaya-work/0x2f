# 08 — Delegation benchmark

This package contains **executed mechanical experiments** and a **prepared human evaluation protocol**. It does not claim measured human delegation benefit. The critical observed result is that task continuity works while completion clarity still depends on evidence outside the status.

## Reproduction and safety

From the audited repository root, with existing dependencies, Node ≥20, Git and Python available:

```sh
node docs/research/human-attention-delegation/benchmark/run.mjs
node docs/research/human-attention-delegation/benchmark/capture-tui.mjs
node docs/research/human-attention-delegation/notes/human-factors-probe.mjs
node docs/research/human-attention-delegation/evidence/lifecycle-trust-probe.mjs
python3 docs/qualification/2026-11-01/harness-scenario-followup/verify-evidence.py
```

These are offline fixtures or saved-evidence checks. They do not call models, repeat live qualifications, install global software or change product code. Workspaces are generated under the OS temporary directory and removed. `run.mjs --keep` is an optional debugging mode; generated paths are printed. A prior kept scratch workspace was used only for research and removed at cleanup. Reproduction overwrites research evidence files, so copy the directory first if preserving this checkpoint matters.

For browser inspection, `benchmark/serve-fixture.mjs` creates a separate disposable workspace and a loopback-only server on an ephemeral port, with only deterministic providers exposed to UI selection. Its narrow Web client was inspected manually via browser automation. Stop it with SIGTERM; it removes its owned workspace. This is not a hosted relay or public service. The environment required approved loopback access for socket-based tests; a sandbox-denied initial run is retained separately and not counted as product failure.

## Executed experiment 1: actual CLI/worker paths

[run.mjs](benchmark/run.mjs) creates eight disposable Git repositories, initializes `.work`, configures two command descriptors for the same [fixture executable](benchmark/fixture-agent.mjs), and drives the actual CLI and detached worker. Native binaries are set to nonexistent paths; explicit fixture routing is used. No real users or agents are simulated as empirical participants.

The clamp task is deliberately small: it isolates state, evidence and interaction mechanics. It is not a realistic estimate of complex engineering productivity. A separate realistic retry-client task pack below supports later human/agent comparisons.

| Case | Initial → final task state | Runs | Post-setup scripted CLI commands | Measured submission latency | Independent check |
|---|---|---:|---:|---:|---|
| Small boundary implementation | READY → DONE | 1 | 4 | 66.14 ms | Upper, lower and in-range assertions passed |
| Investigation, no edits | READY → DONE | 1 | 4 | 67.33 ms | No code correctness oracle; report-only fixture |
| Multi-file implementation/docs | READY → DONE | 1 | 4 | 69.59 ms | Code assertions and documentation assertion passed |
| Policy decision | NEEDS YOU → DONE | 2 | 6 | 72.05 ms | Answer retained in next-run prompt; code assertions passed |
| Local dependency interruption | FAILED → DONE | 2 | 5 | 68.60 ms | After fixture repair and retry, assertions passed |
| Different execution descriptor | READY → DONE | 2 | 6 | 70.14 ms | Note/result supplied to run 2; run 1 result unchanged |
| Fresh-process reopening | READY → DONE | 1 | 6 | 68.57 ms | State persisted; no elapsed human delay |
| Partially verified result | READY → DONE | 2 | 6 | 68.99 ms | Initial negative-input assertion failed, corrected attempt passed |

Final receipts: [results](evidence/benchmark-results.json), [command outputs/timings](evidence/benchmark-transcript.json). Recorded revision is read from Git; dirty state identifies research files. All eight completed their intended assertions. Final DONE is scripted closure, not a claim all eight produced verified engineering outcomes. Investigation has no correctness oracle. A true model may ignore context despite its presence; string-matching fixtures cannot test that risk.

**Counts:** commands exclude setup, independent verification subprocesses, disk polling and filesystem repair, and include a redundant capture `open`. Recovery actions separately count marker repair+retry for the failure (two), rerun after answer (one), and note+rerun for correction (two). Scripted answer/correction counts are one each. Those choices were authored by the experiment; they are not empirical measures of which human interruptions were necessary. Null human-time fields are intentional.

**What this advances beyond prior qualification:** it tests whether a partial outcome can be distinguished by an independent acceptance assertion and corrected on the same task in a new run, and whether the presentation/interaction can retrieve that distinction. The descriptor switch only checks context transport and unchanged artifacts; it does not repeat or enlarge real cross-harness reliability claims.

## Executed experiment 2: direct executable calibration

Five pairs use freshly initialized disposable repositories, the **same deterministic executable and exact initial prompt**, directly versus through 0x2F. Setup is outside both timing endpoints. Fixed wrapped-first order, tiny n and disk polling preclude workflow conclusions.

| Machine measurement | Median |
|---|---:|
| 0x2F CLI submission return | 70.34 ms |
| 0x2F observed completion plus worker-exit wait | 201.78 ms |
| Direct executable completion | 44.69 ms |

[Raw pairs](evidence/calibration.json) retain separate endpoints; wrapped observation includes 25 ms disk polling and process-exit waiting. This is an overhead calibration, not an ordinary Codex/Claude interaction trial. It establishes no human speed advantage and no model-quality difference. Comparing wrapped submission alone with direct completion would be invalid; both are retained to expose the distinction. Real task execution would dominate this tiny fixture cost. Do not market the difference or infer a productivity ratio.

## Executed experiment 3: actual PTY and information availability

[capture-tui.mjs](benchmark/capture-tui.mjs) uses the existing real-PTY driver and deterministic ACP fixture. It captured empty, permission, READY, actual diff, decision, 80×24 READY and CLOSED screens. The scenario has three runs, one permission and one decision, ending in canonical `done`; the visible label is CLOSED. [Action batches](evidence/tui-actions.json) record 15 keys/text batches through closure, excluding final quit and programmatic resize. This is not 15 human gestures in a user study: text batches may contain many characters.

Both [PTY READY](evidence/tui-ready.txt) and [unclipped pure-projection probe](notes/human-factors-probe.json) show that full brief and written result/verification are absent while ACCEPT is present. The pure probe prevents confusing scroll/clipping with missing content. The browser captures [collapsed](evidence/web-mobile-partial-collapsed.png) and [expanded](evidence/web-mobile-partial-expanded.png) partial results: the negative-input verification caveat is behind disclosure. No comprehension outcome is inferred.

Research capture development had three runner-only mistakes: nonexistent `waitForSize` instead of `waitForFrame`; an immediate waiter that rejected transient READY before closure; and expecting visible DONE instead of CLOSED. These were corrected in the research script. Earlier logs are retained. The final run exited zero and emitted no stdout; its evidence is the action receipt and [captured CLOSED screen](evidence/tui-done.txt), not the empty `tui-capture-verified.log`. They are not product bugs.

## Executed experiment 4: trust, context and mutable evidence

The [lifecycle probe](evidence/lifecycle-trust-probe.mjs) and [output](evidence/lifecycle-trust-probe.json) show:

- READY can coexist with absent/failed checks or unrecognized blocker/decision prose. Explicit valid decision protocol works; recognized whole-task blocker wording becomes FAILED.
- With synthetic 17,051-character results, 20 prior runs yielded 343,074 characters of next-run prompt and 100 yielded 1,713,635. Verification occurs twice per prior result; multiline note presentation is flattened. These are characters, not tokens, observed context failures or typical user workloads.
- A later human edit changed the current HEAD-relative diff for the same recorded file path. This establishes mutable presentation scope, not an immutable run patch.
- Pure closure maps all four active statuses to DONE; it does not establish cancellation or accepted correctness.

The [human-factors probe](notes/human-factors-probe.mjs) also demonstrates a synthetic long permission losing consequential scope under remote minimization. It proves information loss, not an exploited incident or representative permission failure rate.

## Regression and saved live evidence

`npm run check` passed. The first socket-constrained test attempt hit environment restrictions and was interrupted; retain it as an environment failure, not a runtime qualification. A loopback-enabled current-host `npm test` completed **715 tests: 713 passed, 2 failed, 0 skipped**. Both failures concerned auth-failure retry against real binaries using local mock APIs, not paid vendor requests.

[Diagnostic copies](benchmark/diagnose-retry.mjs) add assertion messages without changing production. Targeted rerun: Gemini passed, Codex failed with “still has execution processes in local process group …”. This is direct evidence that overlap safety can prevent immediate retry; it does not establish whether the best correction belongs in provider teardown, transient readiness, recovery UI, or test scheduling. The next engineering mission must not suppress this guard to get green tests. Logs and modified test copies are retained in `evidence/`.

The isolated credential-free regression script [check-isolated.mjs](benchmark/check-isolated.mjs) records a separate no-native-harness baseline: **715 total, 704 passed, 1 failed, 10 skipped**. The distribution test failed with `ENOTCACHED` because the deliberately offline fresh npm cache lacked `@noble/ciphers`. This is a fixture-environment limitation; the current-host distribution test passed. [Log](evidence/isolated-test.log) and [receipt](evidence/isolated-checks.json) retain it; neither run is represented as green. To reproduce with cached public packages, pass a preseeded cache directory as the script's optional argument; it copies that cache into temporary storage without modifying the source. The recorded run used no cache argument. No rerun was made merely to replace a failure with a green headline.

Saved live evidence re-verification passed: **82 utility tests; 715 runtime tests at the historical checkpoint, 705 passed/10 skipped**. It also preserved fresh-session continuity, overlap refusals and artifact identity. This check rereads saved artifacts; it does not issue new harness requests. [Receipt](evidence/prior-evidence-verification.log).

## Prepared realistic task suite

The [realistic task pack](benchmark/realistic/README.md) supplies a dependency-free retry-client repository generator, [eight task cards](benchmark/realistic/TASK-CARDS.md) and independent acceptance checks. Its injected transport/clock avoid real requests. Tasks cover a header boundary bug, ambiguous investigation, multi-file retry policy, an explicit owner choice, interrupted dependencies, seeded continuation, delayed-return review and partially verified output. Generated repositories are disposable. Setup and exact baseline expectations are recorded with the pack; **baseline fixture checks are not agent completion or human evaluation**.

Executed pack validation: eight smoke runs and five task-specific baseline checks matched expected passes/failures. An evaluator-authored positive implementation passed ten acceptance checks; a local-import repair passed two recovery checks; overwrite refusal was verified. The narrow original smoke suites deliberately pass despite missing retry integration, while task 05 has a deliberate missing import. [Baseline receipt and positive controls](evidence/realistic-pack-baseline.json) retain these distinctions. None represents a task solved by an agent.

Example setup (use an absent destination child):

```sh
node docs/research/human-attention-delegation/benchmark/realistic/generate.mjs /tmp/0x2f-human-study-new/fixtures all
node docs/research/human-attention-delegation/benchmark/realistic/check.mjs /tmp/0x2f-human-study-new/fixtures/task-03 retry
```

The second command intentionally exits nonzero on the incomplete baseline. Use the pack's setup recipe to create a genuinely fresh directory and pin/copy Git baselines before an interface comparison.

For a real comparison, mirror the generated baseline into independent 0x2F/direct conditions; pin identical provider/model/version, auth class, tool policy and budget. Start from the same repository files and task text. Use current native resume/review/notifications; use an actual alternate-harness workflow or saved summary for cross-harness tasks. No live model trial was added here: the new questions concern human return/evidence, while technical continuity was already qualified.

## Short human protocol for founder and unfamiliar developers

**Participants:** run the founder pilot separately, then recruit a small initial set of unfamiliar developers later with their consent. No outreach occurred. An initial qualitative sample can expose problems; it cannot establish market size. Do not pool founder expertise with novice timing.

**Conditions:** current 0x2F; current direct harness; native harness plus task/result template; optional isolated fidelity/return variant after confirmed fixes are reviewable. Use counterbalanced order and matched task variants, not the same puzzle repeated after learning. Pin the same model and capabilities for interface effects. If a provider cannot expose equivalent operations, record the mismatch and avoid attribution to interface design.

**Two sessions:** first contact and ordinary task on day 1; return after several actual hours or next day. Include one decision, one controlled interruption and one result with deliberately incomplete verification. Some tasks may be replayed from identical saved artifacts to isolate review from model variance; label those as replay. Have a separate unscripted second-task choice to test repeated preference.

**Procedure:** give intent and normal documentation; start timing before installation/config where relevant; do not coach shortcuts. Delegate, leave for unrelated work, return, explain what happened, choose evidence to inspect, accept or correct, and state what would justify integration. Ask neutral questions, not “did our attention layer help?” For mobile, include a bounded clarification and an insufficient-scope permission; perform no real destructive operation.

**Record independently:**

| Metric | Operational definition |
|---|---|
| Time to delegate | Intent available → accepted submission; separate typing/setup and machine wait |
| Intervention burden | Requests, answers, manual checks and corrections; later independent coding of necessity/ambiguity |
| Human active time | Observed configuring, reading, checking, correcting, integrating; pause during unrelated work/machine wait |
| Time to understanding | Return → correct explanation of intent, changes, uncertainty, decisions and next action against answer key |
| Recovery cost | Active time/actions from failure discovery → safe resumed attempt; preserve outside-app work |
| Completion clarity | Correct conclusions about evidence/acceptance; missed defects, skipped checks and unsafe inferences |
| Interaction efficiency | Actions/navigation/surface switches/decisions, reported separately from quality |
| Trust/satisfaction | Actual participant answers only; confidence calibration compared with correctness |
| Repeated choice | Voluntary next-task tool choice and stated reason; follow up on actual reuse later |

Set a meaningful active-time target and quality noninferiority rule before analyzing. With a small pilot, report paired observations, raw distributions and failure cases; do not invent statistical certainty. Treat missed consequential defects as failures even if completion is faster. A finding of equal native-plus-template performance should reverse the separate-product recommendation.
