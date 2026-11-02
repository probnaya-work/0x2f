# Independent initial findings — human factors and interaction usability

Investigation date: **2026-11-01, Europe/Lisbon**. This perspective was written before synthesis with the other investigations. No interviews or human usability sessions were conducted. No production files were changed, real providers invoked, or existing cross-harness qualifications repeated.

## Position before synthesis

The founder's proposed reduction in supervision is plausible, but it is not sufficient as the product promise. A person can supervise less because a system gives them better information, or because it makes important information hard to see. Those outcomes must be distinguished. My strongest hypothesis is **cheap, informed return to persistent engineering intent**, rather than maximum disengagement or maximum agent throughput.

The code already persists much of what a returning person needs. The largest observed gap is between that persisted record and the information/actions each surface presents. In particular, the TUI invites acceptance without exposing the written result or verification section. This is an information-availability finding; reduced comprehension or unsafe acceptance is a hypothesis for a subsequent human study.

## Evidence discipline

- **Observed local:** source behavior, existing test contracts, and the deterministic probe described below.
- **Reported external:** findings claimed by identified primary studies or issue authors, with scope and limitations retained.
- **Inference:** a proposed implication for 0x2F, never an empirical finding about its users.
- **Unknown:** prevalence, actual human active time, comprehension, trust, satisfaction, adoption, and willingness to switch from a direct harness.

Read: repository `AGENTS.md`, `docs/development.md`, `docs/architecture.md`; task lifecycle/actions/store/prompt composition; TUI model/view/controller/keymap; Web result/decision/correction/mobile paths; relay projection; notification policy; relevant TUI/Web/policy tests. All local paths below are relative to this checkout.

## Local findings

### HF1 — The TUI preserves machine continuity while withholding essential human return context

**Observed.** `src/tui/model.mjs:projectTask` carries the original `brief`, event-derived notes, runs, trace, halt, failure, and files. It does not load or expose the task's written result. `src/tui/view.mjs:buildRight` renders the title, task age, run metadata/history, trace, notes, and status block. It does not render the full original brief. READY's status block renders working-tree copy and changed-file paths. `src/tui/state.mjs:primaryAction` immediately offers **ACCEPT**.

The research-only script `notes/human-factors-probe.mjs` created a task in a disposable temporary workspace with an inert execution node. The brief contained a unique investigation-only constraint; the result contained a unique conclusion and a partial-verification warning. `actions.getWork` returned the written result correctly. The full, **unclipped** output of `buildRight` contained none of these three sentinels, while its primary action was ACCEPT. Thus scrolling or a larger terminal does not resolve the missing information in that pane. The model still contains the full brief; the loss is presentation, not persistence.

Artifacts: `notes/human-factors-probe.json`, `notes/human-factors-tui-ready.txt`. This used zero model/provider calls. Its one execution-start request was intercepted by the inert fixture node.

**Inference.** A person evaluating an investigation, a no-change result, or a result with verification limitations must leave the TUI for Web/CLI/files. A real diff is valuable for implementation review but cannot substitute for the conclusion of an investigative task or its omitted checks. Search matching a brief that the detail pane does not display also deserves an unfamiliar-user test.

**What would change the conclusion?** A reachable TUI view exposing the full brief and written result that this audit missed, or human evidence that users intentionally use the TUI only for dispatch and reliably review elsewhere at negligible cost.

### HF2 — READY is an execution outcome; the presentation can imply a stronger conclusion

**Observed.** `src/core/lifecycle.mjs:classifyResult` distinguishes explicit human-decision protocol, narrow task-level blockers, and READY for the remaining successful completion path. It does not validate tests or original intent. The probe confirms that both “No checks were run” and “fix complete; integration tests could not run because network blocked” classify READY. This can be appropriate: partial verification does not imply no useful work was performed.

`src/project.mjs` asks the provider to emit Result, Evidence, Changes, and Verification sections. These are provider-authored statements, not independently executed checks. `src/web/app.js:renderResult` displays the written result and ACCEPT/SEND BACK/CLOSE actions. `src/web/ledger.mjs:projectRow` gives READY the phase label COMPLETE; TUI uses “complete · awaiting you.” `src/tui/view.mjs` also says “nothing committed,” although 0x2F itself not committing does not establish that the underlying agent never committed.

**Inference.** Preserve the five-state lifecycle while clarifying the evidence beneath READY. Distinguish reported checks, tool-observed commands, reproducible outputs, independent verification, and human acceptance in the result content. A green or affirmative completion cue alone cannot substantiate correctness. Avoid a new status taxonomy until a test shows the existing state plus factual evidence cannot communicate the distinction.

**Important counterpoint.** Review effort is real engineering work, not automatically product friction to eliminate. Less review can mean less waste or worse judgment. Measure detection of incomplete or incorrect results alongside active time.

### HF3 — Mobile currently overstates the effect of an in-flight constraint

**Observed.** `src/web/app.js:renderMobileActionBar` offers ADD A CONSTRAINT for WORKING. `renderMobileCorrectionSheet` uses “a constraint for the rest of this run…” and “Recorded on the Task — applies from here without stopping this run.” Its submit path persists the note; `src/core/actions.mjs:noteWork` explicitly says the **next** run includes it and never starts or resumes execution. `src/worker.mjs` has no note-driven live steering path. The TUI controller's confirmation correctly says every later run carries a note, as does CLI help.

**Inference.** This is more consequential than another click: a user could believe a newly stated boundary governs an already-running worker. The narrow hypothesis is to make the timing truthful; there is no need to invent a live steering feature merely to match the current copy.

**What would change the conclusion?** An actual provider-independent live delivery/acknowledgment path, or evidence that the worker consumes task notes dynamically. Neither was found.

### HF4 — Mobile transport is an intentional reduction in evidence, not a complete review surface

**Observed.** `src/relay/project.mjs` strips complete tool input and `blockedOn.raw`. Permissions retain tool, a relative path, description, options, and a planned-change snippet capped at 200 characters. Out-of-workspace paths reduce to a basename. The probe confirms a permission with a consequential suffix beyond that limit loses the suffix, while ALLOW/REJECT capability flags remain available. This is a deliberately constructed edge case, not evidence that real providers commonly hide harmful suffixes.

`renderMobileResult` initially displays three rich-text blocks with an explicit disclosure/count for the rest. The action bar keeps ACCEPT visible while result content scrolls. The relay result cap is 100,000 characters; decision text is bounded at 4,000; the original brief is carried up to the same limit as storage. Mobile disables mutating controls while offline and does not queue commands. These are useful, honest boundaries.

**Inference.** A phone is appropriate for a bounded answer or genuinely decision-ready permission. It may be insufficient to authorize an action whose full target/command is unavailable. Do not compensate with a reassuring generated summary. Test whether people can identify when to defer to the computer, especially for external paths, long commands, and partial verification. Avoid blanket confirmation gates for every action; those would recreate the interruption problem.

### HF5 — Existing attention policy is restrained, but its reach is narrower than an unattended promise

**Observed.** `src/web/sound-policy.mjs` makes normal progress silent; batches transitions over 600 ms; deduplicates replay/reconnect; lets NEEDS YOU outrank READY. `src/web/app.js` uses page focus to suppress sound while watched. Browser notifications are opt-in and only for NEEDS YOU, while READY has sound/pulse. FAILED is tracked but is not signaled by this policy (`test/sound-policy.test.mjs` explicitly tests that behavior). The TUI source contains no comparable notification/bell pathway. The Web policy depends on the browser client receiving events; no service worker/push path was found.

**Inference.** “Return when attention is needed” needs an availability qualification. A closed/suspended client, missed failure, or silent TUI cannot be assumed to summon the person. Before building another notification channel, test the smaller default: clearly communicate which clients must remain active and which stops generate alerts. Distinguish an urgent blocked decision from a finished result that can wait.

### HF6 — Persisted human input is a strong foundation; most task history remains an inventory

**Observed.** `src/tui/model.mjs:notesOf` distinguishes notes, answers, corrections and their run, using normalized events. Task runs retain provider/outcome/timing, and Web run panels expose prior written results. `src/project.mjs:buildRunPrompt` rebuilds a fresh run from the original request plus human notes and previous run outcomes. These reduce manual machine-context reconstruction. Nothing in those facts establishes instant human understanding after a day.

**Inference.** A useful return aid should answer “What did I want? What changed? What still lacks evidence? What do I decide now?” with existing persisted facts and direct paths to full evidence. A compressed event timeline alone answers “What executed?” It can remain secondary. A generated recap adds another statement to verify and should not silently become authoritative task truth.

## External evidence, checked 2026-11-01

These sources support research questions, not a claim that 0x2F solves them. Study-level limitations are part of the evidence.

| Source and publication date | Reported finding | Limit and product implication |
| --- | --- | --- |
| [ParallelPilot](https://arxiv.org/html/2609.33113v1), submitted **2026-09-27** | Formative N=14; within-subject evaluation N=16. Reported 63% greater ticket throughput, lower tracking effort/context switching, and no significant improvement in perceived control or redirection success. | Short 20-minute blocks, six tickets, three-screen setup; systematic code review and merging were not required. Integrated planning/logging/dashboard package, not isolated UI effects. Supports studying coordination separately from control; does not establish trustworthy end-to-end completion or a result-review improvement. Durable logs and fast return to implementation evidence matter; throughput alone is insufficient. |
| [Professional Software Developers Don't Vibe, They Control](https://arxiv.org/html/2512.14012v2), first **2025-12-16**, revised **2026-08-18**; data Aug–Oct 2025 | Observations N=13 plus qualitative survey N=99. Experienced developers used expertise to constrain agents; nine observed developers reviewed every agent change. Agents often supported collaboration rather than complete delegation. | Selected experienced users, older tools, no causal estimate of productivity. Challenges the assumption that reducing all human engagement is desired. Preserve an easy path to understanding and intervention. |
| [When Help Hurts](https://doi.org/10.1145/3772318.3791176), **2026-04-13**, CHI 2026 | N=60 comparing inline/chat/structured assistance with a fixed backend and no-AI control. Reports that interaction mode, expertise, and task complexity change workload/correctness outcomes; operationalizes verification burden using behavioral indicators. | Search-indexed primary ACM article was readable; direct DOI fetch returned 403. GPT-4o, no tool/web access, three Python tasks; not long-running agents. Useful method: control backend and measure verification burden and correctness together. No general recommendation to copy a particular interface. |
| [I'm Not Reading All of That](https://arxiv.org/html/2603.14225v1), submitted **2026-03-15**, April workshop contribution | Four engineers performing one Cline task showed declining engagement and attention to correct visible output over implementation/process. | Very small formative study with self-report and observation. It suggests an overload/happy-path failure mode; cannot estimate its prevalence or justify compulsory engagement for every task. |
| [METR productivity study update](https://metr.org/blog/2026-02-24-uplift-update/), **2026-02-24** | Explains why its newer productivity estimates are weak: selection away from no-AI work, task selection, and unreliable per-task timing when agents run concurrently. | Do not reuse the early-2025 19% slowdown as a statement about current agents. For 0x2F, count human active time separately from overlapping elapsed execution and control task selection. |
| [Anthropic: How AI agents shape experts' judgment calls](https://www.anthropic.com/research/agents-judgment-calls), **2026-10-27** | Fifty analysts using Claude Code followed randomly assigned agent leans on ambiguous analytical choices 86% of the time. The study warns that human sign-off can coexist with deference. | One causal-analysis task outside coding; strengthened agent preferences; no equivalent randomized no-AI productivity comparison. Raises a responsibility question: decision-ready should include meaningful alternatives and consequences, not just a recommended button. It does not imply every software decision requires a forcing function. |
| [Anthropic: Claude Code auto mode](https://www.anthropic.com/research/claude-code-auto-mode), **2026-03-25** | Vendor reports 93% of permission prompts accepted and describes classifier-based approval plus injection defenses. | Telemetry claim without a representative population or a clean causal usability experiment. Supports investigating approval fatigue and shows permission reduction is already being absorbed by harnesses. Not evidence that all accepted prompts were unnecessary, or that 0x2F should duplicate this security mechanism. |
| [Claude Code issue #30519](https://github.com/anthropics/claude-code/issues/30519), opened **2026-03-03** | Reporter describes repeated prompts despite many configured allow rules and workarounds that increase configuration burden. | Firsthand public report, not reproduced here; issue title's broad claims are the reporter's. Evidence of a failure mode, not prevalence or proof of current behavior across versions. |
| [Codex issue #14813](https://github.com/openai/codex/issues/14813), opened **2026-03-16**, observed closed at retrieval | Reporter describes completion notifications working while missed approval prompts strand background work. | An IDE-extension workflow and historical report; closed status prevents treating it as a current unresolved universal gap. Establishes why completion and intervention notifications are different needs. |
| [Lee et al., GenAI and critical thinking](https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/), **April 2025**, CHI | Survey of 319 knowledge workers, 936 examples; reports associations between confidence and self-reported critical-thinking effort, with work shifting toward verification/integration/stewardship. | Broad knowledge work, self-report and association, not measured degradation or causal effect in coding. A useful caution against equating low effort with effective responsibility. |

## Proposed hypotheses for the main report

| Hypothesis | Real evidence and existing behavior | Proposed behavioral improvement | Human benefit / philosophy | Risks; reason not to implement | Validation / expected effect / falsifier |
| --- | --- | --- | --- | --- | --- |
| H1: Finish the task return surface before adding orchestration | Probe HF1; TUI lacks existing result/brief while offering ACCEPT | Make the persisted intent and written result available near acceptance, with a short factual indication of checks and limitations; trace secondary | Less cross-surface reconstruction; fits restrained instrument identity | More text can hide action; may be redundant for intentional dispatch-only users | Same model/result, counterbalanced TUI current vs research variant; time to correct explanation, missed limitations, cross-surface switches, active time. Reject if users already find the facts equally quickly and accurately. |
| H2: Truthful timing of human input is more valuable than another steering control | HF3 code contract vs mobile copy | Say exactly when a saved constraint takes effect; show future-run scope | Preserves agency without anthropomorphic interaction | Less apparent power; live steering might later be worth implementing separately | Ask unfamiliar users when a saved constraint reaches the worker, then inspect next-run prompt. Expect fewer false beliefs; reject if equivalent live delivery is demonstrated. |
| H3: Mobile should optimize decisions that fit its evidence boundary | HF4 projection and disclosure | Show available evidence and explicit missing detail before consequential permission; permit deliberate deferral to desktop | Less pressure to approve from an incomplete glimpse | Extra text/actions could annoy bounded low-risk cases; mobile may be unnecessary altogether | Seed long/outside-workspace permissions and bounded clarification tasks; count correctly approved/rejected/deferred cases, false confidence, desktop switches, active time. Reject if full evidence is already sufficient across representative real provider requests. |
| H4: Alert reach should be understandable before adding alert channels | HF5 policy and existing primary discussions | Test truthful expectations for READY/NEEDS YOU/FAILED and active-client requirements | Makes waiting predictable with fewer checks; retains minimal policy | Broadening alerts can increase interruption; users may prefer polling | Browser active/background/closed, TUI-only, offline/reconnect matrix; measure delivery mechanically, then human detection latency/interruptions. Reject new channel work if current setup meets the target users' observed habits. |

These are investigation priorities, not approved production changes.

## Human benchmark additions

Use equal models, prompts, task artifacts, allowed tools and verification oracles in direct-harness and 0x2F conditions. Cross over interface order and task variants. Keep founder and unfamiliar-developer results separate. Do not treat a founder's practiced shortcut count as novice usability.

1. **Delayed return:** delegate a task, do unrelated work, return after a genuine multi-hour or next-day delay. Ask for original intent, actual changes, outstanding uncertainty, prior human decisions, and next action. Score against an answer key. Automating a clock jump is not a substitute for this human delay.
2. **Partial verification:** present comparable results with all checks passing, one relevant check skipped, and a misleading provider conclusion. Measure correctly detected limitations and evidence sought, not confidence alone.
3. **Investigation without edits:** conclusion is the artifact; no diff exists. Observe whether the user can evaluate and accept it in the chosen surface.
4. **In-flight boundary:** save “do not modify schema” during WORKING. Ask when it takes effect. Record belief separately from system behavior.
5. **Permission distinction:** routine bounded write, external target, irreversible remote operation, genuine product choice. Count necessary intervention, redundant requests, and correct deferral when insufficient evidence is present. Do not enable destructive execution in fixtures.
6. **Three concurrent tasks:** one working, one failed with recoverable authentication, one READY with unrun integration tests. Measure triage accuracy and active time. Faster switching is not automatically better if participants miss a consequential stop.

Record timestamps for user activity, machine waiting, checking, and switching; events for submission, requests, answers, evidence opening, corrections, acceptance, and return. Keep raw components instead of compressing them into an unvalidated “attention score.” Completion quality and missed defects are necessary guardrails. Satisfaction and trust require actual participant responses. No target improvement percentage can yet be justified.

## Verification performed

- Deterministic probe: PASS; result/classification/projection assertions succeeded, scratch workspace removed.
- `node --check docs/research/human-attention-delegation/notes/human-factors-probe.mjs`: PASS.
- `node --test test/tui.test.mjs test/web-ledger.test.mjs test/sound-policy.test.mjs`: **155 passed, 0 failed**. Existing tests passing does not disprove the observed gaps; the relevant contracts do not assert result availability in the TUI.
- No measured human timings or comprehension values, no adoption forecasts, and no claim of independent correctness verification from provider prose.

## Skeptical conclusion

The record supports a narrow opportunity: 0x2F can preserve a person's task and the evidence needed to resume responsibility after execution. It does **not** yet show that developers need a separate application for this, that they want to leave their direct harness, or that the current instrument reduces net human effort. Existing harnesses are already improving approvals and background work. If returning users still need their IDE, harness transcript, terminal, and 0x2F to decide whether work is useful, this extra layer could increase attention debt.

The proposed primary success criterion is **less avoidable reconstruction with equal or better judgment**. It is intentionally harder than fewer interruptions or more completed runs.
