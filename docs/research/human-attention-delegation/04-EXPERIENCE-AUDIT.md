# 04 — Experience audit

The largest demonstrated gap is between persisted task evidence and the human surface: information is saved but not always available where action is offered. This audit distinguishes mechanical facts from human usability hypotheses.

## Method and measurement boundary

Observed: actual CLI subprocesses and detached workers in eight disposable repositories; actual TUI keystrokes on a PTY; the real browser client at **498×752**, including mobile list, decision and partial-result disclosure; pure projection/context/diff probes; existing tests and saved live evidence. The desktop Web layout was source-audited, not exercised at desktop width. The responsive browser was local mode, not a physical phone or encrypted pairing trial. Remote semantics were source/test/evidence audited. No new global installation, actual authentication or multi-hour human return was performed.

An architecture-informed investigator cannot become an unfamiliar first-time user. Journey A therefore records a cold command path and prospective friction, not a novice usability test. No model-generated user reactions are counted as evidence.

**Counting rules:** a CLI invocation is one scripted command; entering text and a key in TUI are separate input batches. CLI per-case counts below exclude initialization, provider-fixture setup, independent verification, filesystem recovery and disk polling; they include an extra final `open` for evidence capture. They are neither theoretical minimums nor total human interactions. Install/auth/config actions are listed separately. Machine submission latency is measured; all human time-to-delegate, active time, understanding and recovery-time fields remain **unmeasured**. “Unnecessary” below is an investigator hypothesis unless a control demonstrably has no effect.

## A — First contact

**Path.** Obtain Node ≥20 and a coding harness → install `0x2f` → authenticate the harness through its own workflow → enter project → `2f init` → `2f new "intent"` → use printed ID and `open` → inspect result → close or correct. Package/install integrity has historical installed-archive evidence; this research did not rerun an unfamiliar-user install. In an empty disposable directory, `status` refused with the `init` instruction and `--help` explained commands. The fixture init and task creation then succeeded through the real CLI.

**Actions/configuration.** Minimum after prerequisites and known shell location: `init`, `new`, `open`, then closure/correction. Project/rules editing is encouraged but not mechanically mandatory. The benchmark adds two fixture manifests and a routing file to avoid native authentication; that is test setup, not required user configuration. Real default is Claude Code unless routing/explicit selection changes it.

**Decisions and switches.** User must arrange provider installation/authentication outside 0x2F. A user with only Codex may reasonably expect it to be selected, while an absent routing file retains Claude as default. `init` lists detected binaries as “ready”; binary presence does not establish auth/model availability. Need for explicit selection is a plausible setup cost, not measured abandonment.

**Timing/interruptions/recovery.** Automated submission is tens of milliseconds in the final record, excluding typing and setup. No human timing. Missing-provider refusal happens before a CLI task is created; authentication may fail later. No new real auth run was justified. The cold path does not establish a zero-configuration experience.

**Ambiguity/information.** “Created” and exact reopen command are strong, concrete feedback. “Running in the background” means launched/admitted, not authenticated or advancing successfully. Separate task intent from credentials and policy diagnostics without adding an onboarding wizard by default.

## B — Daily delegation

**Path.** Submit a brief; leave execution; inspect NEEDS YOU/FAILED/READY when relevant; answer/correct/accept. CLI needs one `new` per task. TUI creation uses `n`, text, Enter; multiline input adds a newline gesture. Web has a composer and provider selection; narrow mobile is primarily an attention/control surface, not a demonstrated full first-delegation interface.

**Measured mechanical cost.** Small and multi-file fixture cases each used four post-setup CLI commands: `new`, first `open`, final capture `open`, `close`. This includes redundant research capture. One run and zero scripted decision requests each; independent assertions checked code and the multi-file documentation. This is not evidence those tasks require zero real review.

**Unnecessary decisions/configuration.** Ordinary submission need not expose run/session/node/model choices. AUTO already exists; adding an AI selector does not follow. Explicit provider policy can still matter because permissions and observable evidence differ. Multiple tasks share the checkout; per-task sequencing does not isolate changes across tasks.

**Context switches and attention.** Web quietly tracks progress and signals selected boundaries; TUI/CLI do not establish equivalent out-of-focus alerts. A user operating only TUI may need another receiving client or deliberate checking. TUI's omitted result makes evaluating no-change investigations require CLI/Web/files. These are observed availability gaps; actual switch frequency and active time remain unknown.

**Missing/excess information.** Trace is useful for diagnosis, but a tool history is not a conclusion. Provider/model/session details can stay accessible for troubleshooting rather than become required daily choices. Avoid adding a dashboard for parallel capacity before measuring shared-checkout review cost.

## C — Interrupted work

| Interruption | Existing required actions | Observed evidence | Burden/ambiguity |
|---|---|---|---|
| Live ACP permission | Inspect scope → ALLOW/REJECT; same run continues | Real fixture protocol and PTY captured permission; Enter continued run 1 | Mandatory judgment can be appropriate. Fixture permission is scripted; it does not establish that a real request was necessary |
| Human decision | Read question → answer and continue | CLI fixture: `answer` then `rerun`, two runs; TUI/Web/mobile already combine these | Do not recommend a combined button as missing product-wide. SAVE ONLY intentionally postpones execution |
| Execution failure | Understand remedy → repair dependency/auth externally → retry same task | Local-failure fixture retained intent, then succeeded after marker repair and rerun | Two scripted recovery actions (file repair + retry), not measured human effort |
| Provider loss | Select another provider and rerun after prior execution exits | Context supplied through normal persisted task path | No automatic failover; capability/permission changes need an honest account |
| Surviving process group | Inspect/stop the owned old execution before retry | Current Codex mock-auth retry reproduced admission refusal | Generic retry advice is insufficient when execution ownership persists; no product fix attempted |

Decision fixture used six post-setup CLI commands, one scripted answer and one explicit rerun. Failure fixture used five plus filesystem recovery. TUI captured permission, correction, decision and continuation through actual keys. Human necessity, interruption detection latency and recovery time are all unmeasured.

`close` is a drop/closure path, not cancellation. The cancellation contract seam exists underneath, but no CLI/API cancellation surface is exposed. This is a boundary to explain, not authorization to build cancellation during research. Automatically retrying another provider could duplicate side effects and obscure what actually happened.

## D — Returning later

**Path.** Reopen list → select task → recover original intent, latest outcome, prior decisions, missing checks and next action. Historical live qualification tested runtime restart and fresh CLI reopening. Our return fixture used fresh processes immediately; it did **not** simulate human forgetting or a genuine hours-long delay.

**Measured actions.** Six post-setup CLI commands in the return case, including extra `status`/`open` and final capture. Saved intent/results persisted. Read volume is available as output character count, not time to understanding. Human active/understanding time remains null in JSON.

**Surface audit.** CLI prints current result/run history; blocked `open` prioritizes the current question and omits the full result account. TUI has run/events/notes but no written conclusion or full brief. Pure, unclipped projection proves scrolling cannot retrieve them. Web source offers the brief and result. On narrow Web, the partial fixture's Verification section required opening a full-result disclosure; ACCEPT was already available. Run history is accessible, but is an inventory rather than a synthesized change-since-last-visit account.

**Possible unnecessary work.** Reading a whole trace to recover a conclusion or switching surfaces to find already-persisted evidence is avoidable in principle. How often it happens is unknown. A concise view should retrieve facts; a model recap could add another claim to verify. The mobile “oldest ask” policy uses task ID as a proxy rather than actual blocked-since time, so a newly blocked old task can outrank a longer-waiting newer one; no urgency inference is warranted from that order.

## E — Correcting work

**Path.** Compare result with intent → state mismatch on the same task → continue. CLI: `note` then `rerun`. TUI SEND BACK and mobile CORRECT compose correction plus rerun; SAVE ONLY retains a correction without spending a run. These are useful existing simplifications.

**Measured outcome.** The partial fixture returned READY with an upper-bound-only implementation; an independent negative-input assertion failed. After a saved correction, run 2 received the correction and passed independent assertions. Six post-setup CLI commands; one scripted correction; recovery count two for note+rerun. The original intent and earlier result stayed present. This demonstrates correction mechanics, not the ability of a real user or model to discover arbitrary defects.

**Missing/misleading information.** Mobile WORKING offers a constraint “for the rest of this run” and says it applies “from here.” The path only persists a note for the next run. This is a direct semantic contradiction; correcting wording does not require inventing live steering. Saved context is valuable only if the human knows when it takes effect.

**Context/verification cost.** Correction does not reconstruct a new task. But copied prior outcomes can be stale or wrong, and long history repeats information. A successful rerun is still not evidence that the mismatch is resolved until the relevant acceptance check is applied.

## F — Cross-harness continuity

**Path.** End current execution → record a correction if needed → choose alternate provider → rerun same task → review result/capability differences. CLI one explicit `rerun --provider`; TUI adds `p` selection plus retry/send-back. Native provider configuration remains outside 0x2F.

**What was measured here.** A new, narrow mechanical question: does a saved correction marker and previous result reach a different configured execution descriptor while run 1 stays unchanged? Yes. Six post-setup CLI commands; two runs; both descriptors invoke the same deterministic executable. This is explicitly **not** a new real cross-harness qualification or reliability score. Existing live chains are preserved in [01](01-PRODUCT-REALITY.md).

**Human cost/risks.** No transcript copying is required. User still chooses when switching is justified, handles provider model/auth configuration, and evaluates new evidence. A common surface can hide differences in permission/resume support unless they are shown. Frequency, reconstruction time saved and repeated preference are unknown. Competitors now document handoff; it must be a fair baseline.

## G — Mobile attention

**Observed browser path.** Open work list → tap decision → read full brief/question and continuation note; return to list → tap READY partial result → open “full result · 7 more paragraphs.” Captures and AX trees are in `evidence/web-mobile-*`. One tap from list to result and one disclosure to the negative-input caveat in this fixture. No answer/accept mutation was needed to establish information availability. Physical touch, push, Wi-Fi pairing and out-of-home reliability were not measured.

**Configuration and interruptions.** LAN: keep Mac running, same Wi-Fi, run `pair`, open URL, enter one-time code. Away from LAN requires configured infrastructure. Existing security tests cover encrypted/idempotent protocol behavior; they do not establish physical-device delivery. With client closed/suspended, no background push is proven. Offline is visibly stale and actions disabled; no queued commands is a useful honest limit.

**Decision quality.** A bounded product question may fit. Permission data may not: full tool input is removed, external paths can reduce to basename, and plannedChange is clipped. The synthetic projection probe lost consequential scope but retained ALLOW. A truthful “review on computer” boundary may be necessary for some shapes; blanket dumping of sensitive tool inputs or more confirmations is not justified.

**Unnecessary decisions/time/recovery.** Actual human timing and correctness remain unknown. Opening a phone should not force acceptance just to clear work, or imply the missing context is safe. Defer complex result acceptance until evidence is available; do not make mobile into a remote IDE based on this audit.

## Audit judgment

Keep the task composer, durable correction, shared actions, quiet progress and evidence-bearing run history. Prioritize making existing evidence/actions truthful and reachable. Then measure whether users reconstruct less while recognizing incompleteness at least as well. More actions are sometimes necessary engineering judgment; fewer actions alone is not the optimization target.
