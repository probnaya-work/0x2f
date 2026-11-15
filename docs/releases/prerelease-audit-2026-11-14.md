# 0x2F prerelease audit 2026-11-14

> This records rc.1. The [rc.2 follow-up](public-release-qualification-2026-11-14.md)
> contains later deployment fixes, the current artifact and fresh matrix results.

**First-use evaluation — GO**, for the supplied **0.3.1-rc.1** package on the
checked macOS/Linux hosts with Node.js ≥20 and an authenticated supported
harness. Installation, useful work, reopening, Codex → OpenCode handoff,
independent checks, explicit apply, cancellation and state recovery passed.

**Public release — NO-GO for the full advertised surface area.** The physical
phone browser journey has not been qualified: a paired iPhone 15 was detected,
but the available screen-control interface could not open iPhone Mirroring.
Portrait responsive testing and encrypted LAN control passed in the desktop
in-app browser; those do not establish Safari/iOS background, keyboard or
network-interruption behavior. A real operated HTTPS client/relay deployment
also remains untested. Complete the device/deployment runs below, or explicitly
narrow the release support statement. The public 0.3.0 package additionally
lacks the security and mobile corrections made here.

## Candidate identity and scope

| Item | Checked value |
| --- | --- |
| Starting source | `15a7b1f4ff88eb5c2c1c098976e9a1d00c641f42`, package version 0.3.0 |
| Starting checkout | `work-cli-v0`, clean; left unchanged |
| Audit checkout | `0x2f-prerelease-20261114`, branch `audit/prerelease-20261114`; local uncommitted corrections |
| Final package | `0x2f-0.3.1-rc.1.tgz`, unpublished |
| Final SHA256 | `d0ecef174828e7bf27953525854fcb49d60eb471d69350facdc805a4d4f95962` |
| Product source digest | `faa802fe6299ee9eee3aacb22dff829b52464f1b651ae6d83bdd65d8cadcf148`; [82-file manifest](0.3.1-rc.1-evidence/source-manifest.json) |
| Public entry point | [0x2f.space](https://0x2f.space/) offered `npm install -g 0x2f@0.3.0` on 2026-11-14 |
| Registry baseline | 0.3.0, SHA256 `7cf66322908f446fcd777c62664b425e000a9a752e50d8cbc3e5e84f4285c1be` |
| Package contents | 85 files: 82 under `src/`, README, license, package manifest; no workspace state or harness credentials |

The public package and current main checkout were already different before this
audit. The TUI input/editor work on main was not assumed to be present in npm.
The [artifact comparison](0.3.1-rc.1-evidence/artifact-comparison.json) records
the actual difference, including the previously unpublished editor. Both package
version and ACP client metadata now identify the local candidate as 0.3.1-rc.1.
No release, tag, push, external message or production configuration change was made.

## Forwardable first-use instructions

Use a small trusted Git repository with a clean committed baseline. Install
Node.js ≥20 with a writable npm global prefix, Git and one coding harness.
The following path was checked with Codex CLI 0.166.0 and existing ChatGPT login.
Authentication/model access belong to Codex and must already work on this host.
The `.tgz` must be supplied with these instructions; this candidate is not on npm.

```sh
npm install -g /absolute/path/0x2f-0.3.1-rc.1.tgz
2f version                         # 0.3.1-rc.1
codex login status                 # run codex login if sign-in is needed
cd /path/to/a/small/trusted/repository
2f init
2f providers                       # executable discovery, not an auth check
2f new "Read README.md and summarize this repository without editing files" --provider codex
2f open 1                          # replace 1 with the ID printed by new
2f tui                             # r: full result; q: detach
2f ui                              # local browser; use another port if occupied
```

READY means a saved result is available for review. Read it before ACCEPT.
For a code edit in an isolated checkout, inspect `2f changes <id> --run <n>`
and use `2f apply <id>` to transfer it to the original checkout. Existing dirty
files require an explicit workspace-mode choice; a refusal preserves those files.

For task-context handoff, install/configure OpenCode, then after the run ends:

```sh
2f note 1 "Preserve the existing public API"
2f rerun 1 --provider opencode
2f open 1 --run 2
```

For a trusted same-LAN companion browser: `2f pair --port 4648`, open the printed
URL on that network and enter its one-time code. Use `2f pair --off` to revoke it.
HTTP LAN pairing trusts that network against active page replacement; use your
own HTTPS client/relay for other networks. The runtime host continues executing
the work; the phone is a browser control surface, not a native app or execution host.

**Observed timing:** the first registry-installed read-only task returned useful
output in 12.2 s after `new`. On the final exact package, a fresh read/check task
took [11.5 s on macOS](0.3.1-rc.1-evidence/final-read-macos.json) and
[9.5 s on Linux](0.3.1-rc.1-evidence/final-read-linux.json). The engineering
fixture's first fix took about 24 s on both hosts; its second OpenCode run
retained the first result, note and edit. These times exclude a human reading
the README, installing a harness and signing in. The real model runs reused
existing harness authentication; the separate isolated verifier used an empty
HOME without inherited credentials.

## Platform, interface and access matrix

LIVE means an actual binary/UI/network run in this session. CONTRACT means
deterministic execution, including real workers and PTYs with synthetic agents.
REVIEW means code/configuration inspection. Historical evidence is not a new run.

| Combination | Result and evidence | Limit |
| --- | --- | --- |
| macOS arm64, CLI, Node 26.11.1 | LIVE install and engineering journey; CONTRACT full suite, 856 passed / 1 Linux-only skip | One host; other macOS versions/Intel not run. Node 24 full suite is configured in CI but not run here |
| macOS arm64, Node 20.20.2 | CONTRACT full 851-test checkpoint plus targeted final CLI/remote/mobile/verifier regressions | Not relabelled as a full 855-test run |
| Ubuntu/Linux x86_64, Node 26.13.0 | LIVE installed package, Codex/OpenCode engineering loop, check/apply, cancellation, backup/restore; 853 passed / 4 skip | Explicit runtime/service PATH needed; other Linux distributions/ARM not run |
| CLI/TUI reopening and result history | LIVE final installed PTY; CONTRACT full lifecycle/paste/permission/decision/retry/resize/restore journeys | Terminal below 60×18 is intentionally noninteractive |
| Desktop Web, loopback | LIVE actual UI: result, permission inspect/allow, auth failure, keyboard Escape/j/Enter, DONE reopening | In-app browser; separate desktop Safari/Chrome qualification not claimed |
| Mobile web, 390×844 portrait | LIVE LAN pairing and E2E control: overview, decision, answer/continue, create with selected provider, READY/DONE, active cancellation, offline/reconnect | Desktop browser at phone dimensions; no real touch keyboard, radio or OS backgrounding |
| LAN remote control | LIVE pairing, matching task state/result, mobile acceptance/cancel, runtime stop/reconnect, revoke; CONTRACT peer/Host/Origin/auth/replay/scope | Trusted private IPv4 LAN; no public plain-HTTP deployment |
| Self-hosted HTTPS client + relay | LIVE local TLS fixture: pairing, encrypted commands/events/snapshot, rotation/revoke | Local test CA/two origins; not an operated public deployment or physical device |
| Pinned SSH execution | REVIEW + CONTRACT host identity, quoting and boundary tests; real Linux host reached directly for the audit | No fresh complete `2f on <host>` production transport/rollback drill |
| Physical iOS/Android | NOT QUALIFIED | iPhone paired but no controllable screen; Android unavailable |
| Windows execution | OUT OF SCOPE | README already excludes qualification |
| Native mobile application / push / operated hosting service | NOT SHIPPED | Companion mobile web only; no closed-client push or offline mutation queue |

The four Linux skips are native Gemini integration cases: that executable was absent
from the controlled Linux PATH. The credential-free verifier has ten explicit
native-CLI skips plus its Linux-only liveness case. See the full logs for the exact skipped cases; neither set
is counted as live model coverage. The new CI matrix covers macOS/Linux with
Node 20/24/26 using pinned actions, `contents: read`, no persisted checkout
credentials and no publication step. It has not run on GitHub because nothing
was pushed.

| Harness / integration | This session | Qualification boundary |
| --- | --- | --- |
| Codex 0.166.0, native | LIVE on Mac and Linux; final exact package task/check passed; same-task handoff; real binary/local API contracts also passed | Fresh user authentication and arbitrary model entitlements not inferred |
| OpenCode 2.2.5, ACP | LIVE second engineering run on Mac/Linux; preserved task, result and note | This session's live chain used fresh sessions; synthetic ACP tests cover permissions/resume separately |
| Claude Code 2.1.296, native | Executable/version checked on Mac; adapter CONTRACT/REVIEW | No fresh live model run here; historical capability evidence retained |
| Gemini 0.60.0, native | Mac real-binary/local-mock contracts; version checked | No fresh live provider model request; Linux native integration skipped |
| DeepSeek Harness 0.1.1-rc.2, native | Version checked, adapter CONTRACT/REVIEW | No fresh authenticated model request; no native permission/resume claim |
| Cursor Agent 2026.10.22-27dcf5f, configured ACP | Version checked; generic ACP CONTRACT/REVIEW | Historical handoff exists; no fresh Cursor login/model/resume qualification |
| Generic command / ACP manifests | CONTRACT through real workers, permissions, decision, failure, retry/cancel and browser actions | Synthetic agents are labelled in screenshots; not a substitute for vendor parity |

## Findings and fixes

All findings below were corrected locally. Confidence is high unless stated.
The product fixes are in the final package; verifier/CI/report files remain
repository development material.

| ID / priority | Surface, precondition and impact | Evidence / code / correction |
| --- | --- | --- |
| F01 P1 | Encrypted remote runtime: an untrusted relay can duplicate an already valid frame while it waits in the command queue. Two executions were observed. Delayed acknowledgement persistence also left a process-crash replay window. | [Failing reproduction](0.3.1-rc.1-evidence/replay-reproduction.txt); `src/relay/agent.mjs:467`. Replay and current pairing authority are now rechecked inside serial execution. An atomic uncertainty receipt precedes effects; final ack precedes reply. Unknown outcome is a 409 requiring inspection. Admission-receipt write failure prevents execution; a failed final write retains uncertainty. Corrupt receipts fail closed. Fresh records are not evicted. `src/serve.mjs:122` awaits agent shutdown. Real encrypted regressions cover duplicate, write refusal, uncertain/corrupt restart and queued revocation. |
| F02 P1 | Browser remote transport: ordinary Fetch JSON bodies remained strings inside encrypted commands. New task creation and answer/note/cancel parameters were missing at the host; the visible answer produced “An answer is required.” | [Actual browser transport reproduction](0.3.1-rc.1-evidence/browser-body-reproduction.txt); `src/web/remote.mjs:178`. Decode and validate the JSON object before encryption. The regression imports the production browser client, then uses the real relay/agent/actions for create, answer and note; malformed bodies start nothing. Actual mobile create, answer/continue and occurrence-bound cancel passed afterward. |
| F03 P1 | CLI/TUI text boundary: repository/provider-authored results and errors could carry terminal controls, including OSC clipboard operations and cursor controls. Impact is terminal/clipboard manipulation; arbitrary code execution was not established. | [CLI reproduction](0.3.1-rc.1-evidence/reproduced-defects.txt); `src/core/terminal.mjs:5`, `src/cli.mjs:8`, `src/tui/view.mjs:51`. Strip VT sequences and neutralize remaining control bytes at display boundaries; preserve saved evidence. Provider-manifest warnings and SSH host headings use the same safe display helper. Tests include OSC, CSI/C1, result/title/error and unchanged saved bytes. |
| F04 P2 | Multiple Web workspaces in one browser: cookies ignore port, so the second runtime overwrote the first runtime's credential. This caused lost authorization/reloads, not cross-workspace authority. | `src/server.mjs:314,524,611,968`; two real runtimes in a shared cookie jar reproduced it. Cookie names now include the bound port. Both APIs remain usable together; the other runtime's cookie alone is refused. Host/Origin/Fetch Metadata gates remain in front of auth. |
| F05 P2 | Mobile task detail while host offline: its absolute layer covered the global offline banner and left action buttons enabled-looking. Draft edits could also re-enable answer controls. Host actions still failed safely. | `src/web/app.js:3266,3424,3507`; [fixed offline screenshot](0.3.1-rc.1-evidence/mobile-offline-fixed.png). Put the banner inside the detail's stacking context and disable bar/answer/correction actions while frozen. Three renderer regressions plus runtime stop/reconnect verified visible warning, disabled ACCEPT/CORRECT, retained reading and resumed control. |
| F06 P2 | CLI option typo: an unknown `--providre` was treated as task text and could select the default harness. Inspection confirmed the parser path; no unnecessary live run was launched to demonstrate it. | `src/cli.mjs:120`, `test/cli-flags.test.mjs`. Unknown options now exit 1 before side effects; `--` introduces literal text. `2f new --help` prints help without creating work. Tests assert no task, pairing config or runtime log is created. |
| F07 P2 | Public guidance contradicted reality: pending npm publication, missing cancellation, and deletion of `.work/` without warning about unapplied isolated work. Users could choose the wrong package or lose local changes. | Corrected README, quickstart, architecture, usage and remote-control docs. The candidate README identifies the unpublished tarball and distinguishes public 0.3.0. No public site deployment was changed. |
| F08 P2 | TLS verifier derived a key from the displayed hyphenated code instead of the raw code, causing a false timeout. Its default provider could also spend a model request, and its success text overstated physical-device coverage. | `scripts/verify-phone.mjs`, `test/verify-phone.test.mjs`. Normalize code exactly as the browser does; use an explicit synthetic command provider and label local TLS/physical coverage correctly. The corrected full local TLS protocol loop passed. |
| F09 P2 | Linux recovery/retry could treat an unreaped zombie or an all-zombie process group as active indefinitely. A deterministic fixture confirmed the OS existence probe succeeds for such a group even though it cannot execute work. | `src/recover.mjs`, `test/linux-process-liveness.test.mjs`; [Real zombie-group regression](0.3.1-rc.1-evidence/zombie-reproduction.txt) fails before the correction. Linux liveness now checks process states; any live group member or unreadable process-table observation still blocks admission. The live orphan-writer refusal tests remain passing. No saved PID acquires signaling authority. |

The earlier Linux Codex integration failures were safe process-group admission
refusals: terminal task state does not prove the CLI's helper processes have
exited. The test now waits for that documented prerequisite and retains process
state diagnostics on failure. A separate controlled all-zombie group reproduced
F09 and verifies the corrected dead-process classification. Live process-group
overlap refusal remains enforced.

## Defensive security review

| Boundary | Data / initiator | Enforcement and observed result |
| --- | --- | --- |
| Browser → loopback runtime | Task/control requests, result/events; local browser or same-user script | Loopback peer plus Host allowlist, exact Origin and Fetch Metadata, per-runtime token, body cap; positive authenticated requests and negative Host/origin/token/preflight tests passed. Static shell bootstrap is deliberately local and unauthenticated. |
| LAN peer → runtime | Static client and encrypted relay frames; paired phone | Explicit pairing enables a bounded private-LAN surface. Forging a loopback Host from a LAN peer does not expose local cookies/API. Off/re-pair revokes access; tests cover those boundaries. |
| Hosted relay → execution host | Opaque frames; relay can observe metadata, drop, duplicate and reorder | Pair-code-derived AES-256-GCM, authenticated routing metadata, confirmed phone/generation, freshness, serialized and persisted mutation admission. Modified/forged envelopes and old keys do not execute. Local TLS exercises real WS/SSE and distinct origins. |
| Surface → task actions | IDs, answer/note, provider selection, permission and cancellation occurrence | CLI, TUI, HTTP and remote agent call shared actions. Locks serialize mutations. Permission decision ID and CANCEL execution ID are checked at execution; shortened/incomplete remote permission scope cannot be overridden by a client flag. |
| Runtime → harness/children | Prompt, cwd, model/session settings and inherited harness environment | Native/ACP/command providers spawn argv arrays. Configured commands and checks are operator-trusted executable authority. SSH targets use strict known-host checking, quoting and a machine pin rechecked on the execution connection. No claim of OS containment or universal escaped-descendant cancellation. |
| Runtime → workspace/state | Task JSON, prompts, results, events, worktrees and patches | Atomic JSON replacement, task locks, bounded inputs, private files/task dirs, safe path/archive contracts, isolation/check/apply/recover tests. `.work/tasks/<slug>/task.json` and `events.jsonl` remain the external reader contract. |
| Untrusted text → terminal/DOM | Model output, paths, task/repository text | Terminal sanitization added; Web uses text nodes/limited formatting rather than executable HTML. CSP, no external scripts and bounded static asset routes remain. No click on an untrusted result link or execution from Markdown was introduced. |
| State → backup/phone/browser storage | Private source/results/configuration and projected task text | Backup/restore owner-only behavior and integrity/refusal tests passed; restores disable relay/host/execution authority and replay nothing. Projected text is not a universal secret scrubber. Local evidence/backups are plaintext; remote localStorage holds session/key/cache. These limits are now explicit in remote docs. |
| Source → npm/client/CI | Product files and dependencies; local pack/install | Real tarball inspected and separately installed; all 82 source files match. npm audit reported 0 vulnerabilities for three direct dependencies. Public registry integrity/signatures exist; no build attestation was observed. Dependencies still use semver ranges: registry signatures do not make future transitive resolution immutable. New CI is pinned/read-only and does not publish. |

Remote receipt limits are explicit: 1,000 retained mutations per 24 hours may
temporarily refuse additional mutations with 503; reading remains available.
Atomic process-crash receipts do not establish power-loss durability, damaged
disk recovery or execution authority against a malicious same-OS-user attacker.
LAN HTTP does not authenticate the page against an active network attacker.
These are documented trust boundaries, not claims that this audit proved those
stronger properties.

## Verification and release path

| Check | Final observation |
| --- | --- |
| `npm run check` | PASS on macOS and Linux |
| Full source regression, macOS Node 26.11.1 | 856 passed, 0 failed, 1 Linux-only skip; 857 total |
| Full source regression, Linux Node 26.13.0 | 853 passed, 0 failed, 4 native integration skips; 857 total |
| Node 20.20.2 | Full earlier 851-test checkpoint passed; final 24 CLI/mobile/remote contracts, verifier regression and 3 acknowledgement-failure contracts passed separately |
| Empty HOME / no inherited credentials | 857 tests: 846 passed, 10 native-CLI skips and 1 Linux-only skip; syntax/pack/offline install/version/source match all passed |
| Installed TUI | Real PTY result/history/input review, 1 passed; additional installed live 100×30 and 60×24 frames saved |
| Final installed source match | 82/82 product files, identical final tarball hash on both hosts |
| Real model work | Codex fix → OpenCode verification, same task/results/note; independent arithmetic check passed; saved run-1 patch applied explicitly on both hosts |
| Upgrade | Registry 0.3.0 state retained; 32 saved task files unchanged and both runs reopened; final candidate reinstallation and preserved state rechecked |
| Backup/restore | Mac and Linux private backup/restore passed; restored task readable, remote credentials disabled, execution not replayed |
| Cancellation/recovery | Real worker cancellation from mobile, Linux CLI cancellation, runtime restart/reconnect and source interruption/ownership contracts passed |
| Static client + dependencies | Build passed; dependency audit 0 findings; module graph/crypto fallback tested |
| Hosted-path protocol | Corrected local TLS test passed with synthetic execution, encrypted events and revocation |
| CI / production publication | Workflow prepared, not remotely executed; no release, tag or push |

The isolated verifier repacked the final product, installed it offline without
inherited credentials and matched all installed source files. Platform-specific
and optional native-CLI skips are named in its log; none is a live model pass.
[Installed verification receipt](0.3.1-rc.1-evidence/installed-verification.json),
[macOS log](0.3.1-rc.1-evidence/macos-tests.txt),
[Linux log](0.3.1-rc.1-evidence/linux-tests.txt),
[TLS transcript](0.3.1-rc.1-evidence/phone-local-tls.txt),
[final terminal frame](0.3.1-rc.1-evidence/tui-final.txt),
[narrow terminal](0.3.1-rc.1-evidence/tui-narrow.txt).

## Remaining work before the broad public GO

1. **Physical phone, P1 gate, mobile users.** On the final SHA above, pair a
   real iPhone/Safari and at least one supported Android browser (or explicitly
   limit mobile support). Create/read a task, answer a decision, inspect a
   permission, cancel an active run, accept a result; verify CLI/Web agreement.
   Exercise the actual keyboard, long scroll, 320–430 px portrait widths,
   screen lock/background/return, Wi-Fi loss/reconnect and `pair --off`. Save
   the OS/browser versions, screenshots, persisted task IDs and results.
2. **Operated remote access, P1 gate if advertised as ready.** Deploy the final
   static client and relay to operator-owned HTTPS origins with valid public
   certificates; repeat pairing, cross-origin WS/SSE, host outage/restart,
   no offline replay, rotation and revoke from an actual phone on another
   network. The local test CA run does not satisfy this. Otherwise label that
   path an operator integration rather than an operated service.
3. **Support wording, P2, users of other harnesses/platforms.** Preserve the
   version-pinned compatibility table; do not imply universal permission,
   resume/cancel or model/account parity. Either run fresh vendor scenarios
   for additional promised combinations or keep the current observed limits.
   Windows, native mobile, closed-client push, concurrent runs of one task,
   automatic failover and hosted execution service remain outside the promise.
4. **Release engineering, P2.** Run the prepared CI matrix after the separately
   authorized push; review the public docs/install version together with the
   matching npm artifact. A cold reboot/production rollback and signed build
   provenance are not established by the local package tests. Publishing the
   local candidate is a separate user action.

Screenshots distinguish synthetic state fixtures from the live arithmetic task:
[live desktop result](0.3.1-rc.1-evidence/web-final-result.png),
[live mobile result](0.3.1-rc.1-evidence/mobile-candidate-result.png),
[mobile attention](0.3.1-rc.1-evidence/mobile-attention.png),
[decision continued](0.3.1-rc.1-evidence/mobile-answer-continued.png),
[active run](0.3.1-rc.1-evidence/mobile-working.png),
[cancel receipt](0.3.1-rc.1-evidence/mobile-cancelled.png),
[offline controls](0.3.1-rc.1-evidence/mobile-offline-fixed.png).
