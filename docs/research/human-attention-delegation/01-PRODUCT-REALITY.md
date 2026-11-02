# 01 — Product reality

0x2F is a small, local task runtime over coding harnesses. Its substantive achievement is keeping a repository-owned engineering request coherent through several execution attempts. It does not currently establish that a finished attempt satisfies the request, or that its interface saves human attention.

## Audited baseline

Repository: `work-cli-qualification-20261101`, version 0.1.4, HEAD `e08e105`. This checkout contains the most recent matching qualification evidence; it was clean before this work. Sources: [architecture](../../architecture.md), [development](../../development.md), [README](../../../README.md), and actual `src/`/`test/` files. Paths in code below are repository relative. Historical managed execution is documented in [managed-execution.md](../../decisions/managed-execution.md): seven live managed tasks produced no verified live patch; that lane was deferred and is absent from this runtime. Do not resurrect it to support a product story.

## Task → Run → Session

| Object | Actual contract | Human implication |
|---|---|---|
| Task | Original brief/title, current status, notes/answers/corrections, ordered attempts in `.work/tasks/<slug>/` | Work survives an execution session; the user can correct the same intent |
| Run | Provider/node/model when known, times, outcome, input/result files and session metadata | Attempts remain inspectable; an earlier result is not replaced by rerun |
| Session | Harness-owned external ID when exposed; otherwise absent | A provider implementation detail, not the unit the user must recreate |

`src/core/actions.mjs`, `runs.mjs`, `store.mjs`, `project.mjs` implement this. `new` immediately creates a task and starts a detached worker. `rerun` creates another run on the same task; it is not a new task and not generally a native session resume. Per-run prompts combine the immutable original prompt with saved human input, prior outcomes/results/verification and observed changed-file paths. Context is retained as text, not checked for continuing truth. Current project-level files are captured in the original prompt at creation; later edits do not automatically replace that original context. A synthetic growth probe found no aggregate history budget and duplicated Verification text; this is a stress fixture, not a measured real model failure.

Notes are for **future runs**. Adding a note does not inject instructions into the active worker. `answer` records a decision but leaves NEEDS YOU until rerun. TUI/Web/mobile already compose answer plus rerun into ANSWER & CONTINUE; the CLI exposes them separately.

## What the five statuses substantiate

| State | Supported conclusion | Unsupported conclusion |
|---|---|---|
| WORKING | An execution attempt is active/admitted | Useful progress, guaranteed eventual completion |
| NEEDS YOU | A recognized permission or explicit decision protocol needs input | Every unrecognized prose question will be detected |
| READY | Provider finished with an outcome classified as ready | Checks passed, independent verification, original intent satisfied |
| FAILED | A normalized failure/blocker was recognized | All useful work is lost, or retry is immediately safe |
| DONE | User closed the task out of active attention | Accepted correct code, committed/merged/deployed work, or cancelled execution |

`src/core/lifecycle.mjs` recognizes a strict `REQUIRED: yes` plus readable question convention. This avoids false interruptions from “No decision required,” but malformed questions may instead look READY. Some task-level blocker phrases become FAILED; this is not semantic proof that all blockers are recognized. The research probe preserves both successes and counterexamples.

`closeWork` can close READY, FAILED, NEEDS YOU or WORKING and does not cancel a provider. Some surfaces label the READY close action ACCEPT. That is a useful human intention but the durable DONE state also covers dropping failed work. It is not a separate acceptance receipt. Closing an active permission-holding task can leave execution waiting. The documented distinction matters more than adding another status.

## Providers, policy and execution

Built-ins are Claude Code, Codex, DeepSeek Harness, Gemini and OpenCode (ACP); project manifests add ACP or command executables. Native, ACP and command paths share outcomes but have materially different approval, streaming, file-observation and resume capabilities. Command providers know exit status and text, not tool permissions. A common ALLOW label does not equal a common sandbox.

Codex uses workspace-write sandboxing and ordinary existing authentication by default. Gemini's default approval mode permits edits. ACP manifests can explicitly select interactive, deny or approve. Native maps remain version-pinned observed evidence; this investigation does not update them from vendor docs. See [Codex map](../../codex-capability-map.md) and [Gemini map](../../gemini-capability-map.md).

AUTO filters executable availability, then applies optional preference order and registry order. It does not choose a model, infer task suitability, validate credentials or fail over. No routing file means the built-in default is Claude Code, not AUTO. CLI preflights a missing default before creation; the shared action intentionally preserves different behavior for an unspecified default. `init` says detected providers are “ready,” although detection only resolves an executable. Authentication can still fail on execution. A truthful diagnostic is a more defensible direction than credential-file heuristics or speculative paid probes.

Only the local execution node exists. Several tasks can operate in one checkout; sequential admission is per task, not workspace isolation. Overlap protection rejects concurrent attempts on the same task and surviving process groups. It is a real correctness strength and can also produce a difficult recovery message. The new full suite reproduced such a retry refusal after mock auth failure; [08](08-DELEGATION-BENCHMARK.md) retains that result.

## Result and evidence ownership

Providers are prompted for Result, Evidence, Changes, Verification and explicit decision sections. These are authored claims. Structured command events can show that a tool was invoked; a claimed `npm test` in result prose is not a captured successful test result. There is no independent evaluator, winner scoring or task acceptance oracle.

Worker Git observation supplements provider file reports. It compares path/status snapshots, so a file dirty before the run and further edited with the same Git status may be missed. The CHANGES view is the current HEAD-relative diff for selected paths, not an immutable patch caused by one run. Our disposable Git probe changed the displayed hunk with a later human edit while retaining the same reported path. Multiple tasks and manual edits amplify attribution uncertainty; no new concurrency feature is justified by that observation.

## Surfaces and attention

CLI, TUI, Web and phone call shared actions and read the same event/state files. This is a valuable foundation for consistent semantics, not proof their presentation is consistent.

- CLI exposes full written results/run detail but blocked-task `open` prioritizes the question rather than a full reorientation account.
- TUI has a compact ledger, state-specific primary action, real diff and trace. It currently omits the full brief and persisted written result/verification even while offering ACCEPT. Both source projection and real PTY captures confirm the limitation.
- Desktop Web source exposes brief, written results, run history, corrections and combined decision continuation. Its broad layout was not manually exercised in this environment.
- Responsive mobile was inspected at 498×752 in the real browser client. Full results are available by disclosure, but the verification caveat in our partial fixture was hidden behind that disclosure while ACCEPT remained visible. This is availability/interaction evidence, not proof people overlook it.
- Mobile remote projection intentionally minimizes data; full raw permission inputs are removed and a planned-change snippet is capped at 200 characters. A synthetic consequential suffix vanished while ALLOW remained available. Whether retained descriptions suffice for representative real requests remains unqualified.

Web attention policy already suppresses ordinary progress noise, batches and deduplicates boundaries, and prioritizes NEEDS YOU. Opt-in browser notifications target NEEDS YOU; READY uses sound/pulse and FAILED is not signaled. An active receiving browser is required; no background push or equivalent TUI alert path is established. Local LAN pairing is real, with encrypted envelopes, revocation and offline controls; remote-away-from-LAN use requires a configured relay and an awake host. This is remote control, not remote execution.

## Preserved live evidence

| Evidence | What it supports | What it does not support |
|---|---|---|
| [Gemini → DeepSeek → Gemini](../../qualification/2026-11-01/platform-followup/HARNESS-RESULTS.md) | Same saved task, original instructions/notes/results survive distinct harnesses; real permission and decision paths in the larger series | Universal portability, every provider/account, arbitrary engineering quality |
| [Codex → OpenCode → Codex](../../qualification/2026-11-01/harness-scenario-followup/REPORT.md) | Normal ChatGPT authentication, fresh native sessions, note/context continuity, implementation then original-harness verification, overlap refusal | Native session resume (not exercised in this chain), permission behavior (zero requests in chain), unattended reliability |
| Saved receipt rechecked here | Original artifacts unchanged; 82 generated-utility tests, 2,010 independent API cases, 18 independent CLI cases; 3 overlap refusals | 82 tests proving the runtime; 705 tests proving user value |

The historical runtime checkpoint is **715 total, 705 passed, 10 skipped**. The new current-environment run is **715 total, 713 passed, 2 failed**; do not collapse them. Most instructively, the first utility attempt reached READY with 56 passing tests yet had an alias bug later independently found and repaired. The continuity evidence is strong precisely because it preserves correction, rather than pretending READY was already correct.
