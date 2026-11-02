# Final platform qualification report — 2026-11-01

**CONDITIONAL GO for the tested local POSIX candidate**, source
`2941c028b00310f941ced0ed7d7ba5aa48f6d016`, in the exact macOS/Linux and
Node combinations below, with bounded live Gemini/DeepSeek evidence. This
does not qualify all provider accounts or a physical phone.

Proposed next release: **0.1.5**. Manifest remains0.1.4 pending the release
decision. No package publication, release, tag or push has occurred.

## Fresh runtime/platform matrix

Each row independently executed clean locked install, syntax check, actual
full npm test and a separately logged installed-package journey. Raw counts,
all step exits and source SHA256 were cross-checked by
[verify-matrix.py](evidence/verify-matrix.py);
[verified-matrix.json](evidence/verified-matrix.json) is the consolidated result.

| Platform | Node / npm | Full suite: total / pass / fail / skip | Pack → install → task → reopen → UI → uninstall/state |
| --- | --- | --- | --- |
| macOS26.6.2 arm64, Python3.9.6 |20.0.0 /9.6.4 |715 /705 /0 /10 |1/1 passed,0 skips |
| Same macOS |20.20.2 /10.8.2 |715 /705 /0 /10 |1/1 passed,0 skips |
| Same macOS |26.13.0 LTS /11.20.0 |715 /705 /0 /10 |1/1 passed,0 skips |
| Ubuntu26.04.1 LTS x86_64, kernel7.0.0-42, Python3.14.4 |20.0.0 /9.6.4 |715 /705 /0 /10 |1/1 passed,0 skips |
| Same Ubuntu |20.20.2 /10.8.2 |715 /705 /0 /10 |1/1 passed,0 skips |
| Same Ubuntu |26.13.0 LTS /11.20.0 |715 /705 /0 /10 |1/1 passed,0 skips |

Syntax and clean install passed in all six rows. All four real-PTY journeys
passed per row, including terminal restoration. Linux concurrency locks,
accepted notes, execution admission, orphan-child/process-group gates, dead
permission recovery, occurrence freshness, API/cache/WS authorization and
pairing were included; [VERIFICATION.md](VERIFICATION.md) maps guarantees to
the existing tests.

Linux LTS also passed39/39 focused relay/pairing regressions and a fresh
**online registry** installed distribution journey1/1,0 failed,0 skipped.
The six-cell matrix uses isolated offline exact-lockfile dependency manifests;
the online journey separately exercises untrimmed current registry resolution.

The ten full-suite skips are intentional: six native Codex and four native
Gemini tests see no vendor binaries on the isolated PATH and cannot inherit
credentials. No distribution or PTY check skipped. Three tests were added
relative to the historical712 total: two relay race regressions and one native
Codex saved-session regression. Earlier703/712 evidence was not reused as a
fresh outcome.

Sources and commands: [macOS results/provenance](evidence/macos/README.md),
[Linux final invocation](evidence/linux/run-qualified.sh),
[Linux final raw outputs](evidence/linux/qualified/).
All downloaded official runtime SHA256 checks passed; no global Node changed.

## Fresh harness evidence

Later targeted updates are recorded in the [compatibility matrix](../../../harness-compatibility.md).
The original rows below retain their historical scope, including the distinction
between a blocked live API credential path and a separately observed ChatGPT login.

| Harness | Observed version | What actually ran |
| --- | --- | --- |
| Codex |0.166.0 |Six distinct real-binary/mock cases have passing observations; same-session resume/context/sandbox confirmed. Live API credential path blocked |
| Gemini |0.60.0 |Four real-binary/mock cases plus saved-session probe pass; live native/ACP and cross-provider return pass, seven actual Google requests |
| Claude Code |2.1.296 |Isolated version/help inventory; usable credential unavailable for live branch |
| OpenCode |2.0.27 |Isolated version/help inventory, ACP command surface |
| DeepSeek Harness |0.1.1-rc.2 |Actual configured DeepSeek API run passes; same-task Gemini → DSH → Gemini continuity verified |
| Cursor — later targeted preflight |Agent CLI not found; editor 3.26.13 separately observed |**BLOCKED**: `agent acp` / `agent status` return ENOENT; installed corrected 0x2F refuses the task before creation. Live handoff, permissions and native resume **not run**. [Evidence](../cursor-followup/REPORT.md) |
| Cursor — subsequent live chain |Agent **2026.10.22-27dcf5f**, Codex **0.166.0**, installed **0x2f@0.1.4** |**PASS**: real Codex → Cursor → Codex on one task, plus a corrective Codex run; DONE and reopening verified. Permissions/native resume **NOT RUN**. [Evidence](../cursor-live/REPORT.md) |

Those are macOS native-binary observations. Lenovo had no native harness in
its noninteractive PATH. See [HARNESS-RESULTS.md](HARNESS-RESULTS.md) for exact
overlapping runs, mock request traces, initial sandbox failure and safe retest.
Ten distinct native/mock passing observations are not a single combined
ten-test run. Gemini live outcomes are a separate category below. Historical
capability maps were not rewritten from inference.

## New fixes and local commits

| Commit | Change |
| --- | --- |
| `14a5394` |Portable Node20 test discovery; throwaway Git fixture supplies its own author and checks setup success |
| `66651fb` |Codex0.166 resume argument ordering retains workspace-write; permanent real-binary saved-session regression |
| `ff724d5` |Atomic0600 relay config replacement prevents partial reads during pairing |
| `8882951` |CLI/Web explain that CLOSE does not cancel the provider |
| `2941c02` |Serialize config/key startup so an overlapping poll cannot connect with an unready key |

Before/after reproductions, minimal corrections and regression evidence are in
[CHANGES.md](CHANGES.md). The intermediate8882951 passed macOS but failed Linux
pairing; its failing output and hung-test cleanup proof were retained. A
deterministic held-key test then reproduced the remaining startup race on
macOS too. Final green results above belong only to2941c02.

The CLOSE lifecycle is unchanged. A real desktop browser check confirmed its
help/accessible label and visible successful-close notice plus DONE state:
[AX evidence](evidence/ui-close-result.txt), [screenshot](evidence/ui-close-result.png).
A late permission on a closed active task can still leave a provider waiting.

## Live/provider approval and remaining work

The user approved the bounded existing-credential live series with a **$5
maximum** after the offline checks. That approval does not authorize new keys,
credits, unlimited requests, model substitution or disabled budget controls.
The eight-turn/16-request plan, including Gemini ACP permission on one harmless
scratch write, is in [HARNESS-PLAN.md](HARNESS-PLAN.md).

**Gemini live series passed** against actual Google, fixed
`gemini-3.5-flash-lite`, with the existing key only in gateway memory:

- Controlled local auth failure forwarded nothing; manual RETRY received a
  real model response and reached the decision.
- Answer `teal` persisted and reached the next run; native saved-session
  resume retained its ID and prior answer.
- Actual Gemini ACP requested one exact scratch write. The displayed live
  occurrence was allowed once; exact file bytes, one `permission.resolved`,
  same ACP session and single-run READY were verified.
- Separate `2f note` recorded `NOTE_ROUNDTRIP_01` without starting a run.
  Explicit rerun retained task1's ID/slug, advanced run3 to4, and returned
  both `teal` and the marker. Close/reopen preserved DONE/history.

The user then explicitly requested DeepSeek, which extended this same ledger
with the two remaining turns. **Same task1 switched Gemini → DSH → Gemini**,
advancing runs4 →5 →6 while preserving its ID/slug, answer `teal`, note marker
and prior-provider results. Both responses contained their requested switch
markers, and close/reopen preserved DONE and history. DSH uses a fresh native
session; continuity is supplied by the task context, not an invented native
resume capability. [Switch results](evidence/harnesses/live-approved-20261101/deepseek-switch-results.json).

DSH retained its configured `deepseek-v4-flash` alias and high thinking. The
response identified `deepseek-flash`, matching DeepSeek's
[documented alias routing](https://api-docs.deepseek.com/quick_start/pricing/).
Its one response used2416 input and250 combined output tokens, including163
reasoning tokens. Peak published-rate estimate: $0.0010248. The DSH-specific
reservation was $0.0083694 against a $0.10 sublimit. No search/fetch/tool call
was allowed. A read-only balance request for the existing DSH key returned
**USD0.93 available** before the model run; the supplied browser usage URL
redirected to sign-in, so browser-account identity/balance was not verified.
[Balance receipt](evidence/harnesses/live-approved-20261101/deepseek-balance-before.json).

**Final combined total: eight turns, eight actual model requests** (seven
Google, one DeepSeek). Conservative usage estimate: **$0.0202138**; cumulative
pre-request reservation: **$0.1866244**, within the same approved $5. This is
not an account invoice. All requests retained1024 combined output tokens,
90-second turn bounds and exact model/endpoint allowlists. No further paid
calls were made. [Original Gemini results](evidence/harnesses/live-approved-20261101/results.json),
[note extension](evidence/harnesses/live-approved-20261101/note-results.json),
[shared budget](evidence/harnesses/live-approved-20261101/budget.json).

The provider-neutral limiter's seven mock tests and combined Gemini/DSH gates'
18 mock tests are separate tooling validation. The gates reject remote or
multimedia input, unapproved tool targets, repeated writes, model/route drift,
redirects and limit violations. It validates full responses before executable
tool calls reach the CLI. Gemini itself could contact loopback only; the
gateways' only live upstreams were the exact approved Google/DeepSeek routes.
Credentials were not logged or changed.

**Codex/Claude live remain blocked.** Codex uses
ChatGPT OAuth with no API key for the approved bounded API path. The inspected
active Claude credential entry has empty access/refresh token strings and no
API key. No new key, login mutation, subscription fallback or model
substitution was attempted. Mock/fixture results do not establish their live
account behavior. Usable credentials are the concrete prerequisite for those
remaining live branches.

Physical phone: **not executed**. A real desktop browser fixture check ran;
mobile browser emulation did not run. The [manual phone flow](HARNESS-PLAN.md)
covers LAN pairing, task progress, occurrence-bound permission, decision,
reconnect/background and revocation. It remains an open device check.

Windows, Linux arm64 and Node22/24 are untested. Node20 is EOL; do not infer
support for every version admitted by engines `>=20`. Original risks remain:
startup-only crash recovery, no filesystem fsync/multifile transaction,
same-user workspace/provider trust, deliberately detached/legacy groups,
LAN HTTP active-attacker tradeoffs and noncancelling CLOSE.

## Release decision

Accept0.1.5 only with the scoped POSIX claim above and explicit live/device
limitations. A claim of complete multi-provider/device qualification remains
**NO-GO until the blocked live branches and physical-phone checks execute**.
[RELEASE-DECISION.md](RELEASE-DECISION.md) proposes the Node support policy and
contains the short release checklist.

The Lenovo scratch root remains
`/home/bogart/0x2f-qualification-20261101` with exact source history and
evidence. Its final checkout is clean at2941c02 and no qualification process
was left running when checked. Pre-existing modifications to package.json and
package-lock.json in `work-cli-v0` were preserved; the release checkout stayed
clean. Old reports/evidence remain intact.
