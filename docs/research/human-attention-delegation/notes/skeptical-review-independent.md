# Independent skeptical review

2026-11-01. Reviewed the competition/strategy initial note, human-factors source/projection probes, lifecycle/trust initial note and probe, deterministic benchmark runner/fixture/transcripts/results/calibration, and the relevant production boundaries. Final numbered reports were not yet present. No production changes or external claims newly researched in this review.

## Verdict

The investigation supports a short **fidelity and correctness mission** much more strongly than it supports a market position. Repairing omitted results or falsely promised steering is justified even if the “human attention” thesis is rejected. A compact return account is worth testing, but neither its demand nor the necessity of a separate application has been established. Do not convert a collection of sensible fixes into evidence that an independent product must exist.

The emerging direction is sensible only with two amendments: include the remote permission information boundary among immediate correctness questions, and weaken “auth-available defaults” to transparent diagnostics unless reliable, cheap, noninvasive authentication evidence exists.

## Strongest findings and their limits

**TUI result and intent omission is directly demonstrated.** The written result exists through shared `getWork`, the full brief exists in the TUI view model, and the unbounded detail projection displays neither. The primary action remains ACCEPT. Source confirms `buildRight` renders a shortened title and `taskModel` contains no written result field (`src/tui/view.mjs:298`, `src/tui/model.mjs:224`). The fixture is an inert execution, not a real provider trace, but that does not weaken the deterministic missing-data finding. Investigative tasks with no changes are a particularly consequential case: the result is the deliverable. This supports restoring access to evidence; it does not prove a specific layout is usable or that every result must fill the default screen.

**Mobile constraint copy contradicts implementation.** The working-task placeholder says “a constraint for the rest of this run” and explanatory text says “applies from here without stopping this run” (`src/web/app.js:3194`, `:3233`). Submission only records a note; no path delivers it into the current provider session (`:2512`; `src/core/actions.mjs:514`). The next run receives it. This is a concrete false affordance. Correcting it needs no speculation about user psychology and does not require implementing live steering.

**Remote permission decisions may lack consequential detail.** The probe proves `projectBlockedOn` removes raw input, truncates plannedChange at 200 characters and reduces outside-workspace paths to a basename while leaving `canAllow` true (`src/relay/project.mjs:113`). An outside `deploy.sh` cannot be disambiguated by path alone, and a consequential command tail can disappear. This is not proof of a real mistaken approval: the synthetic raw command and long plannedChange were constructed, and some providers supply a good description/options. Nevertheless, there is a correctness invariant worth investigating: a user should be able to inspect the consequential scope of the operation they authorize. Information minimization is intentional and must not be “fixed” by blindly exporting all sensitive local tool input. Inspect full real permission shapes locally; decide how to reveal sufficient sanitized detail or require local review when it cannot fit. This belongs at least as high as onboarding diagnostics.

**READY/verification separation is real but does not mandate new states.** Both probes show READY despite absent/limited/failed checks. The historical Codex qualification demonstrates actual missing coverage despite 56 passing tests, subsequently repaired through OpenCode. This supports honest evidence presentation and task-specific acceptance. It does not establish that 0x2F must run checks itself, mark every untested investigation failed, or produce a numerical confidence score. Many valid tasks produce a recommendation rather than executable code. Overly elaborate assurance could increase unnecessary work.

## Corrections and meaningful disagreements

My own initial note overgeneralized the two-action decision boundary into a product opportunity. `answerWork` does leave NEEDS YOU; **TUI and Web/mobile already compose ANSWER & CONTINUE** (`src/tui/app.mjs:115`, `src/web/app.js:2493`). The deterministic CLI benchmark intentionally uses `answer` then `rerun`. Its extra command is not proof that the user must perform two interactions in every surface. Preserve the low-level contract, qualify the CLI finding, and do not recommend rebuilding a combined interaction already present.

“Stop orchestration” is justified as a scope boundary for this mission, not a universal ban on future work. Running tasks in a shared checkout creates attribution risk. If actual repeated use involves concurrent tasks, some isolation policy may become a prerequisite for trustworthy review; refusing to consider that because it feels insufficiently minimal would confuse founder aesthetic with user safety. Conversely, the present evidence does not justify a fleet manager, auto-failover or worktree dashboard.

Default selection is less directly established as a major pain than TUI omission and misleading mobile copy. `available()` explicitly means executable resolution only (`src/providers/index.mjs:158`); authentication validity is known to surface only during execution for some providers. A “binary installed” label can be honest now; “authenticated/ready” can become a false promise if built from stale token-file presence. A safe first-use diagnostic plus actionable auth failure may outperform complex preflight. Do not initiate extra model calls or inspect unrelated credential material merely to make a green indicator.

## Benchmark audit

The benchmark earns its name as a **reproducible mechanical fixture suite**. It uses actual CLI, action, store and worker paths with two command descriptors, deliberately absent native binaries and no model requests. The partial implementation is independently rejected before correction; earlier run input/output remains inspectable. Null human-time fields and explicit caveats are appropriate.

It cannot answer which workflow respects attention better:

- The fixture decides what to do by matching literal prompt strings and `scenario.json`. It cannot forget a constraint, misunderstand an answer, over-ask, get distracted, or respond differently to long history. Passing proves supplied context is present and mechanical paths work, not that agents reliably use it.
- Intervention and recovery counts are assigned by the script. Zero does not mean zero required human interventions; one means one scripted intervention. They do not include brief drafting, task-quality review, provider setup or choosing whether to accept. Counts should not be compared to real user effort.
- “Return” means fresh CLI processes in one immediate test run. It tests persistence, not delayed memory, resumption cost or reorientation. Every CLI invocation is already fresh; no human interruption occurred.
- `scriptedCliCommands` counts only the per-case slice after setup and omits independent verification commands, polling and recovery file creation. It is a path-specific command count, not complete interaction cost. Investigation is closed without correctness verification by the script; DONE should not count as a verified engineering outcome.
- Calibration fixed wrapped-first order, n=5 and 25ms polling; wrapped includes detached worker exit wait. Direct setup is **not** identical despite a source comment saying “fresh identical disposable repos”: wrapped has git/init/context/manifests and direct has only scenario.json, though both receive the same prompt. This is acceptable for rough process overhead with explicit limits; it should not be called a controlled workflow-speed comparison. Model runtimes would swamp much of this fixture latency anyway.
- The revision field is hard-coded; it is not evidence of the runtime's dynamically recorded Git revision or dirty state. Retained transcripts exist, but disposable workspace deletion limits artifact replay from the saved result alone; rerunning the script reconstructs fixtures.

The prompt-growth probe similarly demonstrates deterministic characters, not a real context-window breach, model degradation or observed task distribution. Keep it as a boundary test and avoid turning 100 artificial runs into a claim about normal use.

## Market and strategy challenge

The competition note usefully refutes uniqueness on persistence, phones, background agents and cross-harness handoff. However, vendor documentation supplies a **competitive promise baseline**, not measured functional equivalence. No competitor was directly exercised here. This cuts both ways: it blocks unsupported superiority and unsupported “all competitors already do this equally well” conclusions.

Selected public issues and studies can establish mechanisms and credible pain, but not how many users need another product or will repeatedly choose it. There is no unfamiliar-user evidence, willing-to-pay evidence, retention evidence or task-frequency distribution. The founder may simply have an effective personal instrument. That is a valid outcome; commercialization is not implicit in coherent architecture.

A separate application may be unnecessary. A repository-local record exporter, existing-harness extension, or disciplined template inside the native tool could deliver much of the proposed intent/result/checks/uncertainty value without a new inbox or four surfaces. Those alternatives should be credible baseline conditions, not straw men. If native tools already produce a good account, 0x2F may add only duplicated state and adapter maintenance. If compact records demonstrably survive provider/session churn better, there may be a small useful product despite no broad market.

“More capable agents make accountability more important” is plausible, not inevitable. Better agents may generate better tests and concise receipts, lowering the review burden directly. Humans still set purpose and risk tolerance, but that enduring responsibility does not imply demand for 0x2F. The durable benefit, if any, is fidelity and cheap retrieval of consequential evidence; the moat is not having another status model.

## Ranked recommendations with reversal conditions

| Recommendation | Evidence strength | What would reverse or materially alter it |
|---|---|---|
| Restore full brief and written-result access in TUI before adding summaries | Direct source/projection correctness finding | A verified accessible TUI path already exposes both; or this surface is intentionally deprecated and removed rather than supported |
| Correct mobile current-run constraint claims | Direct code/behavior contradiction | A demonstrated delivery path actually updates the active provider session, with clear acknowledgement and failure semantics |
| Investigate incomplete remote permission scope as immediate fidelity work | Direct data loss; real user impact not yet established | All supported permission shapes are shown to supply complete consequential scope through retained fields; otherwise some local-only fallback may be necessary |
| Trial compact intent/result/checks/uncertainty account using existing artifacts, no new states or summarizer | Mechanistically motivated; benefit unmeasured | Equal/better accurate acceptance from existing result/diff or native workflow; summary hides caveats, duplicates work or adds reading time |
| Make executable detection and execution/auth failures understandable | Source boundary clear; prevalence/priority unmeasured | First-use users already understand and recover with negligible cost, or clearer labels add clutter with no reduction in errors |
| Freeze orchestration scope for the next mission | Absence of demand/evidence; adapter policy complexity | Repeated users demonstrably need isolated concurrent work or automatic recovery, and a narrow tested mechanism lowers total cost safely |
| Test separate-product necessity before expanding surfaces or monetizing | No adoption evidence; strong native alternatives | Unprompted second-task choice, lower total human effort and fewer mistaken acceptances across realistic delayed-return tasks |

## Next mission boundary

Ship nothing during this investigation. The next engineering mission should first repair confirmed fidelity defects, preserving lifecycle and provider behavior. Then use isolated alternative presentations with the same harness and acceptance criteria. Randomize or counterbalance tool order, include onboarding and unfamiliar users, hide the desired answer, and score correct identification of intent, unverified assumptions and next action. Record actual human activity separately from machine latency. Include a native-harness-plus-template condition and let participants choose their second task's tool unprompted.

Evidence that users return voluntarily because this costs less total effort would support a product promise. Without it, the strongest honest conclusion is “a coherent local task instrument with fixable fidelity gaps,” not “the missing human layer of agentic engineering.”
