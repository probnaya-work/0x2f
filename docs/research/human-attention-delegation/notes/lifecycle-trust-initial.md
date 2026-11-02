# Independent lifecycle, trust and attention review

Recorded 2026-11-01. Source inspection and synthetic local probes; no provider execution or human study. This is an independently reasoned input to the wider investigation, not a claim of measured developer benefit. Production files were not changed. Repository `AGENTS.md`, architecture and relevant capability maps were read.

## Finding in one sentence

0x2F already owns durable engineering intent and the execution record unusually coherently; it does **not** yet own a dependable answer to “is this result good enough, and what exactly am I accepting?” That gap can create the very attention debt the proposed promise says it removes.

## What exists and deserves preservation

The implemented hierarchy is Task → Run → disposable provider session. Task intent, notes and prior run outputs survive new sessions; a provider's session identifier is metadata, not the identity of the work (`src/core/runs.mjs:1`, `src/project.mjs:199`). Original and per-run prompts and results are auditable on disk. This is useful infrastructure rather than mere positioning.

Admission and ownership are substantive. Actions hold cross-process task locks; rerun rejects active work/live permission and surviving execution process groups (`src/core/actions.mjs:40`, `:54`, `:289`). Worker admission and outcome publication both check current run and PID ownership; late/superseded workers cannot replace current results or state (`src/worker.mjs:29`, `:222`). Notes/corrections made during execution survive the worker's later publication. These contracts are exercised by `test/task-ownership.test.mjs`, `test/runs.test.mjs` and `test/task-context.test.mjs`.

Recovery is honest about uncertainty. A startup sweep marks dead working/live-permission runs failed while retaining session and history; closed tasks remain closed. Completion time is anchored to the last persisted event when available, explicitly a lower bound (`src/recover.mjs:63`, `:131`). Surviving process groups block unsafe rerun and require inspection rather than silently being killed (`src/core/actions.mjs:40`). That costs human work but avoids concealing orphaned execution.

The strict decision protocol reduces one plausible class of false interruption: only `REQUIRED: yes` plus a readable question produces NEEDS YOU/decision (`src/core/lifecycle.mjs:88`). A bare heading or “None” does not. This is a deliberate precision/recall choice, not proof every needed question is detected.

## State is execution truth, not outcome assurance

| State | Implemented meaning | Responsibility still outside the state |
|---|---|---|
| WORKING | A run has been admitted and is executing/reserved | Whether it is doing useful work; stale execution is recovered at startup |
| NEEDS YOU / permission | A concrete normalized permission stop; interactive ACP can keep its process live | Whether permission scope and provider policy match user intent |
| NEEDS YOU / decision | Explicit positive model-authored protocol | Whether the question is necessary; answer alone does not start continuation |
| READY | Provider produced a successful normalized result without detected blocker/decision | Tests passing, acceptance criteria met, change correctness, completeness |
| FAILED | Provider/runtime failure or narrowly detected task-wide blocker | Whether useful partial changes remain and need review |
| DONE | Human closed the task from any status | Acceptance, cancellation and successful engineering outcome are not established |

`classifyResult` returns READY for everything not recognized as explicit decision or blocker (`src/core/lifecycle.mjs:149`). The research probe confirms READY for “3 tests failed; unresolved,” “Verification: Not run,” and a result with no verification section. It also confirms READY for alternative blocker wording “Implementation is impossible: write access denied” and an unstructured question under the decision heading. This is a synthetic demonstration of the contract's boundary; it does **not** measure how frequently real models produce such text. Expanding regexes or building a semantic judge is not automatically the right fix.

The default prompt asks for Result/Evidence/Changes/Verification but those fields are prose from the producing agent (`src/project.mjs:149`). No acceptance criteria object or independently attested check record is persisted by the core. Command events can support manual inspection, but the normalized vocabulary does not establish a complete test receipt. Therefore “trustworthy result ready” remains a hypothesis unless “trustworthy” is carefully scoped.

Closure is valuable as human agency but semantically expensive: `closeWork` applies from any status (`src/core/actions.mjs:575`). An active provider continues, a later result stays under the closed task, and a late live permission can remain attached to the run while the task remains DONE (`src/worker.mjs:168`, `:234`). README/CLI/Web wording has already been corrected to explain noncancellation. Do not relabel all DONE tasks as accepted or count them as successful delegation in benchmarks.

## Verification evidence already refutes a simplistic completion claim

The Codex → OpenCode → Codex qualification is stronger evidence than a marker round trip and should be preserved accurately. The first run reached READY with 56 passing self-authored tests, but independent CLI probes then found a real alias-path bug: exit 0 with no output. The second harness reproduced/fixed it and added `--sum`; the return to Codex verified without changing files. The artifact distinguishes 82 utility tests from **715 total / 705 pass / 0 fail / 10 skip** runtime regression tests. This is evidence of continuity and corrective workflow, and simultaneously direct evidence that READY plus passing tests was insufficient assurance (`docs/qualification/2026-11-01/harness-scenario-followup/REPORT.md`, `evidence/verified-receipt.json`).

Scope: Codex CLI 0.166.0, gpt-6.1-sol, existing ChatGPT authentication without API key, workspace-write/never; OpenCode 2.2.5 through ACP using its observed free Big Pickle model. All three native session IDs differ; this tested new sessions supplied task context, **not native session resume**. Three overlapping reruns were refused; 194 process samples observed no overlapping execution groups. There were **zero actual permission requests** in this chain. Claude Code was not tested. The 82 tests do not demonstrate general engineering correctness or independent users' trust.

The earlier Gemini → DeepSeek → Gemini live chain preserved answer/note/prior result on the same saved task. Gemini CLI 0.60.0 used gemini-3.5-flash-lite; DSH used deepseek-v4-flash. The DSH switch and return were bounded, no-tools marker/continuity tasks. A **separate** Gemini ACP live permission stop wrote exact approved bytes, used allow_once and resumed the same ACP session. Do not merge these observations into a claim that all providers support equivalent permission control. Earlier Codex live steps were blocked under that experiment's budget/auth constraints; the later ChatGPT-auth chain supersedes that access gap for its own scoped workflow (`platform-followup/HARNESS-RESULTS.md:130`).

## Provider neutrality has a real boundary

| Provider path | Human control actually exposed | Important limit |
|---|---|---|
| Codex native | workspace-write by default; no headless approval surface | Shell/edit behavior and sandbox policy differ from Gemini; internal sandbox is not a shared Work policy |
| Gemini native | auto_edit by default; other tool requests denied | No in-place human permission answering; deployment override can choose yolo/default |
| DeepSeek headless | One-shot tool execution without interactive approval | No surfaced session ID/resume, structured commands/file events or streaming |
| Generic ACP / built-in OpenCode | Interactive permission default; same live request can receive a bound answer | Actual request granularity/capabilities belong to the agent; deny/approve modes are manifest policy |
| Claude native | Permission-denial parsing; acceptEdits on allow/resume | Per-session file-edit scope is broader than one exact edit; live account qualification absent here |

Sources: `src/providers/{codex,gemini,deepseek-harness,claude-code,acp,opencode}.mjs`; observed claims in `docs/{codex,gemini}-capability-map.md`. Capability maps are historical version-pinned observations and were not updated. Some commentary is older than later implementation (e.g. Codex sandbox declaration wording); inspect invocation code for current defaults and keep live evidence scoped.

Automatic routing chooses availability/preference deterministically; it does not choose by validated adequacy, approval semantics, task risk or price (`src/core/router.mjs`). Thus provider choice may transfer policy understanding to the human. Making AUTO look intelligent would conceal that work rather than remove it.

## Attention debt identified from the code

1. **Return-to-work assurance:** Result, claims, actual changed files and tests need to be reconciled. A clean-looking READY row is not evidence this reconciliation happened.
2. **Two operations after a decision:** `answerWork` records answer/context and leaves NEEDS YOU; a separate rerun starts a new session (`src/core/actions.mjs:473`). One cannot assume an answer means “continue,” but the user must understand this distinction and choose again.
3. **Context preservation is not context governance:** Every new run appends all prior full results, then repeats each Verification section. No aggregate size/token budget, relevance projection or long-history test exists in the inspected builder (`src/project.mjs:243–314`). Synthetic 17,051-character result fixtures produce 17,574 characters after 1 prior run, 343,074 after 20 and 1,713,635 after 100; verification occurs twice per prior result. These are character counts, not token counts or measured failure thresholds. Inputs per brief/note have caps, but accumulated notes/results do not have a combined prompt budget (`src/core/limits.mjs`).
4. **Preserved context can preserve error:** Old agent claims are passed forward whole; stale hypotheses and verification may accumulate beside later corrections. Current project.md/rules/knowledge/decisions are not refreshed when rebuilding from the original prompt. A later agent can inspect current files, but the prompt itself contains the task-creation snapshot.
5. **Formatting loses some intent:** Task notes are stored verbatim but whitespace/newlines flatten when placed in the next prompt (`src/project.mjs:228`). This can damage code blocks or carefully structured constraints; the probe shows mechanical flattening, not an observed downstream failure.
6. **Changes are a live workspace view:** `getTaskDiff` gathers changed-file events across all runs and diffs their current contents against HEAD (`src/core/actions.mjs:557`, `src/core/diff.mjs:60`). The probe confirms later human edits alter displayed hunks with identical reported files and no new run. This is useful current review context, not an immutable artifact of one run. Git-status observation explicitly misses further edits to already-dirty files, transient files and non-git workspaces (`src/core/worktree.mjs:14`; pinned by `test/worktree.test.mjs`).
7. **Task-level sequentiality is not repository isolation:** Different tasks can still work in the same working tree. The code itself documents absence of isolated worktrees/sandboxes (`src/core/actions.mjs:284`). Attribution and verification become harder when edits interleave. A universal workspace mutex or mandatory worktrees would carry cost; first establish the real concurrent-use need.

These are plausible sources of cognitive effort grounded in mechanics. No human minutes, comprehension, anxiety or preference were measured.

## Independent skeptical position

The founder's attention thesis is plausible, but the strongest alternative is that developers mainly need better agent quality, strong tests and a familiar diff/review loop. An additional router/ledger might add reconciliation and another place to check. More capable native harnesses can absorb durable tasks, approval queues, background work, handoffs and summaries; a common local schema is not a durable moat by itself.

Cross-harness choice may matter most to enthusiasts and researchers. Most users may prefer one dependable authenticated harness; switching brings different policies, models and contexts, so continuity benefit must exceed translation/review cost. The qualification's successful correction required human-added constraints and independent probing. It proves a useful mechanism exists, not that the mechanism reduces attention compared with continuing directly in Codex or OpenCode.

“Less attention” can perversely reduce useful review, discovery and ownership. The right objective is lower **unnecessary** attention while making uncertainty and consequential decisions legible. A mandatory heavyweight verification system would overshoot the minimal instrument and punish small investigative tasks. Fancy confidence scores would risk laundering model prose into apparent assurance.

The largest strategic risk is a small audience for a product that sits between capable native agents and established code review. Product identity and coherent architecture cannot substitute for repeated use by unfamiliar developers on tasks painful enough to delegate.

## Provisional priorities and disconfirming evidence

| Investigation recommendation | Why it merits attention | Evidence that would change this view |
|---|---|---|
| Test a concise return/acceptance receipt separating run claims, observed changes and verification limitations | Direct READY/verification gap; real first-run utility defect | Unfamiliar users already reach accurate acceptance quickly from existing result/diff, or receipts cause misplaced confidence |
| Test decision → answer → continuation as one deliberate interaction with a clear execution consequence | Current answer leaves a persisted interruption plus another action | Users value recording answers without running and reliably understand the present flow with negligible errors |
| Establish honest context and artifact boundaries before expanding routing | Mechanical unbounded growth, mutable diff, policy differences | Real task histories remain short and these limits almost never affect decisions; users prefer manual notes and current workspace diffs |

Do not yet build an AI judge, broad orchestration engine, universal permission policy, mandatory worktree manager or project-management workflow. The focused next mission should investigate trustworthy return to one bounded task using existing lifecycle and evidence, with a direct-native-harness baseline and unfamiliar humans. Define task-specific acceptance before execution, measure action counts mechanically, then separately observe human reconstruction/decision time without inventing it.

## Reproduction and validation scope

Run `node docs/research/human-attention-delegation/evidence/lifecycle-trust-probe.mjs`; saved output is `evidence/lifecycle-trust-probe.json`. It imports production pure functions and uses one disposable git repository which it deletes. Assertions cover classification boundary, duplication, mutable diff and closure. No model, provider binary, credential, network, production mutation or repeated qualification was involved. The parent investigation owns full repository checks.

## Subsequent independent-review correction

The low-level two-action decision contract above is accurate, but its product implication needs narrowing: TUI `ANSWER & CONTINUE` already composes `answerWork` then `rerunWork` (`src/tui/app.mjs:115`), and Web/mobile does the same (`src/web/app.js:2493`). The CLI benchmark's separate answer/rerun commands are surface-specific, not evidence that a combined interaction is missing throughout the product. This initial note intentionally preserves the original inference and this correction so synthesis does not repeat it.
