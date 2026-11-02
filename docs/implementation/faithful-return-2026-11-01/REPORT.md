# Faithful task return — implementation and verification

2026-11-01. Local branch `fix/faithful-task-return`, separate checkout `/Users/bogart/Dev/PROBNAYA/work-cli-faithful-return`. Package version remains **0.1.4**. No push, tag, release, publication or deployment was performed.

The TUI now exposes the full saved request and written result, including investigations with no changed files. Notes describe their actual delivery boundary. Mobile permission approval requires sufficient displayed scope, enforced again by the host. Retry waits for short-lived descendants without admitting overlapping execution.

## Documents and provenance

- [Original investigation: complete document index](../../research/human-attention-delegation/README.md)
- [Product reality](../../research/human-attention-delegation/01-PRODUCT-REALITY.md), [experience audit](../../research/human-attention-delegation/04-EXPERIENCE-AUDIT.md), [human attention](../../research/human-attention-delegation/05-HUMAN-ATTENTION.md)
- [Friction opportunities](../../research/human-attention-delegation/07-FRICTION-OPPORTUNITIES.md), [delegation benchmark](../../research/human-attention-delegation/08-DELEGATION-BENCHMARK.md), [executive verdict](../../research/human-attention-delegation/10-EXECUTIVE-VERDICT.md)
- [Your real next-day trial](NEXT-DAY-TRIAL.md)
- [Final integrity receipt](evidence/final-integrity.json), [installed-package receipt](evidence/installed-verification.json)

Read repository instructions, architecture, development, remote-control and the research before changes. The audited commit was `e08e105a10955283b810f8e0793286d7a6eadf3a`. Local `origin/main` was `8c24170`; its tree is identical to the audited tree. The new worktree started there. The original qualification checkout remains at the audited commit. All **65 research files**, including historical logs, match it byte for byte. The research was preserved in local commit `00b9aca`; implementation and tests are in **`463e7f90101a9b57499c4b2835f1bc0355c03daa`**. This report and its evidence are committed separately after that code commit.

## Confirmed defects and changes

| Before, confirmed on the current baseline | Implemented behavior |
|---|---|
| TUI showed a compact output summary/changed paths and offered ACCEPT without a full written-result reader. | `r` opens the full original request and selected run's saved result. `[` / `]` select attempts, `i` reads exact saved input, `j/k` or arrows scroll, `g/G` jump, Esc returns. The reader stays bound to its task when ledger order changes. Enter in the reader cannot accidentally accept a historical attempt. |
| No-change investigations lost their substantive conclusion in TUI. | Written Evidence/Verification and long conclusions are readable without CLI/Web. Long unbroken tokens wrap; terminal control codes cannot repaint a result. The main screen remains compact and the five persisted states remain unchanged. |
| Web/mobile working-note copy implied influence on the rest of the current run. Core delivery only incorporated notes into later run inputs. | Forms and save confirmations explicitly say next run; the current worker continues with its original input. TUI confirms the same boundary. CLI note behavior already used future-run semantics. Permission continues its held run; decision answer/continue and correction/send-back still start the existing follow-up flow. SAVE ONLY remains distinct. |
| Generic permission wording claimed modification even for read/command requests. Bounded relay text could omit decisive command tails or parameters while still offering ALLOW. | Wording identifies operation/target without inventing a write. Bounded native/ACP forms are assessed for representation completeness. Incomplete scope is labeled and remote ALLOW is unavailable; REJECT remains. The host reassesses current full state under the grant lock before writing permission/resuming. |
| Phone snapshot projection removed raw inputs, but a successful note mutation acknowledgement could return the full local task. | Mutation acknowledgements use task projection before caching/encryption. Legacy cached full-task replies are projected on replay without rerunning the action. A failing encrypted sentinel test confirmed the defect before the fix. |
| Result completion and check success were easy to conflate; narrow layout hid Verification inside the result disclosure. | READY is explained as a result available for review. Attributed provider Verification and its limitations appear before mobile ACCEPT, outside the full-result disclosure. Observed command invocations are listed separately. Missing separately recorded successful check receipts say **not recorded**. Arbitrary prose and command-start events never imply successful checks. |
| CHANGES commentary described the working tree as the run's output. | CHANGES explicitly identifies the current working-tree comparison against HEAD at viewing time, including possible later edits. No immutable run patch or snapshot system is claimed. |
| Retry refused immediately when the worker disappeared but descendants in its process group remained. | Admission observes the entire group for up to two seconds, even after its leader exits. A surviving group still blocks a new run with an explicit wait/inspect explanation. No saved PID or process group is signaled. |

## Retry diagnosis

[Before-fix retry reproduction](evidence/retry-before.log) reproduced an intermittent native retry refusal. Individual diagnostic reruns sometimes passed, matching the research's timing dependence. Under the full workload, [process samples](evidence/full-diagnostic-before-retry-fix.log) captured orphaned Codex `git ls-remote`/remote helpers and Gemini `system_profiler` descendants after the worker exited. Their groups were empty at the next 300 ms sample. The old guard stopped waiting as soon as the worker PID vanished, so the nominal 250 ms interval did not cover this case.

The fix changes the admission wait, not cancellation or overlap protection. A deterministic fixture keeps a descendant alive for 650 ms after its leader exits and proves retry waits. Existing orphan-writing and permission-overlap tests still reject new work while execution survives. Native Codex/Gemini retry cases pass in the final full suite. These use actual installed harness binaries with controlled local API responses; they are not live model-quality or account qualification runs.

The research's credential-free `ENOTCACHED` was an empty offline npm-cache setup failure. The reproducible installer copies an existing public package cache into a temporary cache and installs offline with fresh HOME/PATH and no inherited credentials. This does not require a runtime product change.

## What actually passed

| Check | Result and evidence |
|---|---|
| Syntax and repository checks | `npm run check` passed; [log](evidence/final-check.log). |
| Final full regression, native binaries available | **727 tests passed, 0 failed, 0 skipped**; [log](evidence/final-regression.log). |
| Isolated offline regression | **717 passed, 0 failed, 10 skipped** because native harness executables are absent from the isolated PATH; [log](evidence/isolated-regression.log). No tests were disabled to obtain the native full-suite result. |
| Real PTY, source and installed package | No-change investigation, partial Verification before acceptance, full brief/result, historical run, exact saved input, long result scrolling and 80×24 resize. A gated active worker proves the saved note is absent from that run and present in the next. [Source scenario log](evidence/return-and-live-note.log), [installed PTY log](evidence/installed-pty.log), [installed screen captures](evidence/installed-tui/). |
| Scope and action boundary | Short complete native commands/edits and bounded ACP descriptions can suffice, including ACP without raw input. Long/truncated requests, important tails, external paths, two same-basename targets, hidden edit/command parameters and absent details require local review. A fresh occurrence plus a forged bypass option cannot grant incomplete scope through encrypted relay. Pairing, freshness, replay, occurrence and overlap regressions remain in the full suite. |
| Acknowledgement privacy | Raw sentinel fails before the projection fix and is absent after it; note persists once, replay remains idempotent. [Before](evidence/mutation-ack-before.log), [focused after](evidence/ack-and-restart-after.log). |
| Browser desktop | Actual **1309×909 CSS** viewport; request, saved written result and attributed evidence inspected. [Screenshot](evidence/desktop-result.jpg), [accessibility text](evidence/desktop-result.ax.txt). |
| Browser narrow layout | Actual **354×767 CSS** viewport; partial Verification discoverable before ACCEPT; sufficient permission enables ALLOW, incomplete scope disables it while retaining REJECT. Note saved through actual HTTP and confirmed in persisted state. [Viewport record](evidence/browser-viewports.json), [note persistence](evidence/web-note-persistence.json). |
| Installed tarball | Offline temporary installation, `--version` = **0.1.4**, all **72 source files** byte-match the final source, installed real PTY passed. [Receipt](evidence/installed-verification.json), [archive](evidence/0x2f-0.1.4.tgz). SHA-256: `317c0e1ee05eee50d5d06d75b4155f90c27141b3a3bcc3a970940b9ed5b6bd1e`. |

The browser fixture is inert: it serves safe representative tasks and does not execute a permission or call a model. Actual remote enforcement is covered by the encrypted host/relay tests, separately from button appearance. Browser dimensions above are measured values; requested overrides were 1440×1000 and 390×844, scaled by the in-app browser. The temporary tab was closed, viewport override reset and fixture server stopped.

### Browser evidence

![Partial Verification before mobile acceptance](evidence/narrow-partial-result.jpg)

![Incomplete permission with ALLOW disabled](evidence/narrow-incomplete-permission.jpg)

![Saved note confirmation states next-run delivery](evidence/narrow-note-confirmation.jpg)

## Earlier failures retained

Development logs remain alongside final evidence. They include fixture/test mistakes and intermediate assertions; they are not all successful validation runs. An initial isolated run exposed a new test's accidental dependency on installed Claude; the test now uses its own deterministic provider, with no skip. A relay restart test intermittently read the previous socket's stale `online` state before the restarted relay had registered the replacement connection. The test now waits for both agent state and phone-observed relay state. Production reconnect behavior was not changed. [Intermediate full run](evidence/regression-before-restart-wait.log) and [focused after](evidence/ack-and-restart-after.log) retain that history. `pre-ack-*` files describe a superseded package; the final archive and receipt above are authoritative.

## Reproduce and limitations

From the implementation checkout:

```sh
npm run check
npm test
node docs/implementation/faithful-return-2026-11-01/verify-installed.mjs
node docs/implementation/faithful-return-2026-11-01/ui-fixture.mjs
```

The installer script documents its public-cache prerequisite and writes evidence in this directory; the UI fixture prints its temporary localhost URL. Stop it after inspection. The fixture and process-diagnostic scripts are evidence helpers, not shipped runtime behavior.

No physical phone was tested. There was no unfamiliar-user study and no new live-model benchmark. Viewport checks and controlled PTY/harness tests do not establish those outcomes. Scope assessment detects missing representation; it does not prove an operation safe or resolve filesystem symlinks. Some requests therefore require computer review. The process-group grace interval is bounded; genuinely persistent descendants still require inspection. Legacy runs without saved input use the available original prompt fallback. Successful check receipts cannot be reconstructed from data that was never recorded.

Task storage filenames, atomic writes, provider capability maps, lifecycle states and existing decision semantics are preserved. ThinkCentre hosting, 057 observation, fleet UI, failover, verifier agents and redesign remain later work. Use the [next-day trial](NEXT-DAY-TRIAL.md) to collect your own actual return experience; its diary is intentionally blank.
