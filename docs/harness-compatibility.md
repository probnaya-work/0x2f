# Harness compatibility — observed evidence

Executable availability, an authenticated CLI, task handoff, permissions and native
session resume are separate checks. A provider manifest or an installed editor is
not a passing observation. Versions below are pinned to their linked evidence;
historical rows are not claims about every current version or account.

## 0.2.0 support boundary — 2026-11-02

0.2.0 ships native Claude Code, Codex, DeepSeek Harness and Gemini adapters,
OpenCode through ACP, and per-project ACP/command manifests including Cursor.
The live runs below used the corrected **0.1.4 development builds** on November 1;
they are historical observations, not new model requests against the release
commit. Final 0.2.0 deterministic and installed-package checks are recorded in
[the release report](releases/0.2.0.md). No paid benchmark was repeated.

Task-context handoff creates a fresh provider session with saved task input.
Native resume reuses a provider session and is a separate capability; a successful
handoff does not qualify it. Permissions likewise require an actual provider
request and recorded decision. Cursor's live handoff passed, while its native
resume and interactive permissions remain **NOT RUN**. Local API/mock tests are
labelled separately in the historical matrix. Executable discovery proves only
that a command resolves; keep the selected harness authenticated on the execution
host. The Cursor app alone is insufficient: install/authenticate Agent CLI and
use `agent acp` ([manifest](../examples/providers/cursor.json)).

## Latest targeted check: Cursor, 2026-11-01

**Live same-task handoff PASS**, 23:38–23:52 UTC, after the user completed the
normal Agent login. The real chain **Codex → Cursor → Codex** completed on Task
**#001**, followed by one extra Codex corrective run for an independently found
stdin-import defect. Final **DONE**, four runs, real runtime/TUI reopening,
retained IDs, results, files, saved notes and exact per-run input. The executing
corrected installed package remained **0x2f@0.1.4**, with all 74 src files unchanged.

| Harness | Version / executable | Existing authorization observed | Same-task evidence | Permissions / native resume in this live check |
| --- | --- | --- | --- | --- |
| Codex | CLI **0.166.0**; native records show inherited **gpt-6-astra**, workspace-write | Existing ChatGPT login | Runs 1 → 3; independently reviewed Cursor changes, found/fixed two CLI defects. Run 4 fixed the controller-reproduced stdin-import defect | **NOT RUN / NOT RUN**; fresh native sessions |
| Cursor Agent CLI | **2026.10.22-27dcf5f**, `~/.local/bin/agent acp`, real official binary | `agent status` and actual ACP session/new pass after user login | Run 2 edited the same verifier/tests, received the saved constraint and full Codex result. Saved result/input read again after DONE. Configured Auto; backend model not independently observed | **NOT RUN / NOT RUN**; 0 permission requests, no session/load |
| Cursor editor CLI | **3.26.13**, `/opt/homebrew/bin/cursor` → app launcher | Editor login not used as CLI proof | Earlier ordinary `cursor agent --version` bootstrapped the separate Agent. Actual engineering run used Agent directly | **NOT RUN / NOT RUN** |

[Live report and exact evidence](qualification/2026-11-01/cursor-live/REPORT.md).
Actual ACP execution is passed; separate print-mode model execution remains
**NOT RUN**. No fixture or same-model substitute is counted as Cursor. No version
change, publication, release or push occurred.

## Earlier preflight: Cursor, 2026-11-01

Rechecked **2026-11-01 23:26–23:31 UTC** against source `803ba49` (including the
responsive trace / compact typography fixes), freshly packed and separately
installed as **0x2f@0.1.4**. The installed `cursor agent` route bootstrapped the
official Agent binary. **At that time the blocker was CLI authentication**;
the subsequent live check above supersedes this blocked state.

| Harness | Version / executable | Existing authorization observed now | Same-task handoff evidence | Permissions / native resume in this check |
| --- | --- | --- | --- | --- |
| Codex | CLI **0.166.0**, `codex` resolves | `codex login status`: existing ChatGPT login | Earlier real **Codex → OpenCode → Codex** passed; the new Cursor chain was not started | **NOT RUN / NOT RUN** |
| Cursor Agent CLI | **2026.10.22-27dcf5f**, `~/.local/bin/agent`, after official wrapper bootstrap | **Not logged in** from actual `agent status`; ACP `session/new` returns **Authentication required**. `initialize` passes; print/ACP help succeeds | **BLOCKED ON AUTH**. Installed corrected 0x2F discovers `cursor / acp / yes` with an absolute local manifest | **NOT RUN / NOT RUN**; `loadSession` is advertised only |
| Cursor editor CLI | **3.26.13**, `/opt/homebrew/bin/cursor` → app-bundle launcher | Editor authentication was not read or treated as CLI authentication | Actual `cursor agent --version` installed the missing Agent and reported its version; this is recorded separately from pre-existing editor CLI availability | **NOT RUN / NOT RUN** |
| OpenCode | Historical live chain: **2.2.5**; not re-probed here | Not re-probed here | Earlier real **Codex → OpenCode → Codex** passed; OpenCode was not substituted for Cursor | No real permission request occurred in that earlier chain; fresh ACP sessions do not prove native resume |

[Earlier Cursor recheck and raw probes](qualification/2026-11-01/cursor-recheck/REPORT.md).
[Original Cursor report](qualification/2026-11-01/cursor-followup/REPORT.md).
Before bootstrap, the installed-package preflight listed `cursor / acp / no` and
refused an explicit Cursor task with `Expected executable: agent`. After bootstrap,
discovery reports **yes**, but actual ACP session creation fails on authentication.
Task count remained **0 → 0**.
No task ID, saved-note delivery, Cursor result, file handoff, reopened history or
Codex return was passed by that preflight; those have separate live evidence above.

The initial PATH/standard-location negative observation is retained as history.
The later interactive-shell and installed-wrapper test supersedes it: the editor
CLI exists and the Agent now launches. **An official Agent installation occurred;
no login, credential extraction/migration or model request occurred.** Existing
editor login does not make the observed CLI/ACP authentication failure a pass.

## Earlier observations kept separate

- [Live Codex → OpenCode → Codex](qualification/2026-11-01/harness-scenario-followup/REPORT.md): one Task #001, three runs and real reopening. It explicitly records the absence of permission requests.
- [Platform and native-harness matrix](qualification/2026-11-01/platform-followup/FINAL-REPORT.md): older version/help, real-binary/mock and separately approved Gemini/DeepSeek live observations. A passing mock integration is not a live-provider result.
- [Codex capability map](codex-capability-map.md) and [Gemini capability map](gemini-capability-map.md): version-pinned observations; these maps were not rewritten from vendor documentation.

## Cursor setup reference, not a local capability claim

The checked-in [Cursor manifest](../examples/providers/cursor.json) uses
`["agent", "acp"]`. Cursor documents [ACP](https://cursor.com/docs/cli/acp),
[headless print mode](https://cursor.com/docs/cli/headless), and
[`agent status`](https://cursor.com/docs/cli/reference/authentication).
Those pages describe supported vendor interfaces, not successful execution here.
