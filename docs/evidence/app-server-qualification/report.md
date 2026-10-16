# NO-GO — app-server также не предоставляет необходимую boundary

The installed **codex-cli 0.149.1 app-server** passes the registered-client-tool
primitives, but fails the required all-call interaction boundary. An unregistered
tool is rejected internally and its output reaches the next model request without
client consent. No production adapter was registered and **no real provider
canary ran**. This is not a hard-token-ceiling requirement.

Based on clean `feat/task-continuity` at
`ccef3dc585716d6c9fc23bd29ea74a655313604e`. The opaque classification, narrow AUTO
exclusion, qualification tests and evidence are one logical development commit.
Its exact ID resolves with `git log -1 --format=%H --` this report and is returned
to the user. No amend or external action.

## Source and execution boundary

The [official app-server protocol](https://learn.chatgpt.com/docs/app-server)
documents newline-delimited stdio requests, initialization, turn lifecycle and
experimental dynamic tools. We generated the installed binary's stable and
experimental JSON Schemas. [schema-summary.json](schema-summary.json) records
source locations, hashes and exact field lists. The stable schema omits
`thread/start.dynamicTools`; an actual stable connection rejects it with
`thread/start.dynamicTools requires experimentalApi capability`. Presence of
`item/tool/call` types elsewhere in generated schemas does not make registration
stable. Experimental opt-in was used **only for qualification fixtures**.

The process peer is confined to
`test/fixtures/codex-app-server-qualification.mjs`; it is not imported by runtime
code, added to the provider registry, or a new general agent framework. Tests use
the existing loopback Responses mock, disposable CODEX_HOME, shell/other side-tool
feature switches disabled, read-only thread sandbox and approval policy `never`.
No exec hooks were added or used. Tests do not extract/copy/print existing tokens,
configure API billing, or start an OAuth flow. No provider gateway or Responses
execution adapter was built.

## Qualification findings

| Requirement | Actual evidence and practical limit |
| --- | --- |
| initialize → thread/start → turn/start → turn/completed | PASS on stable stdio; final status completed. |
| Client-owned calls before effect | PARTIAL: registered experimental `read_task_file`, `submit_patch`, `request_context_expansion` produce `item/tool/call` and wait for client response. Other/unknown paths are not covered. |
| Unknown tool/item fail-closed | FAIL: unknown function did not reach the client; automatic rejection and another model request followed. An exhaustive unknown-item gate is not qualified either. |
| Result truncation before model | PASS for the registered path: client kept 4,096 of 64,000 source bytes before replying; inspected model input contains the short result and excludes the full content. Serialized wire output includes protocol wrapping. |
| Denial before side effect | PASS for the registered path: denied submit_patch had no filesystem effect; duplicate client reply did not replay a tool or turn. |
| Pre-result call counter | PASS for registered requests only: six replies; seventh request interrupted without a result or effect. This does not bound invisible rejected calls. |
| Deadline/owned process group | Primitive verified on a short 50ms fixture deadline: turn/interrupt → interrupted completion → owned process-group kill/closure. A production 120s end-to-end adapter is not implemented or qualified. |
| Late results/writes | Pending registered patch interrupted; a late RPC result caused no further model request or file write. No broad asynchronous-producer safety guarantee is claimed. |
| Usage semantics | Synthetic response totals 10 and 20 yield thread cumulative total 30, last response 20. These overlapping fields must not be summed. Real usage/money remains unmeasured/unknown. |
| Crash/restart | Kill while a client effect is unresolved; initialize new process and resume thread without turn/start. No new model request, tool replay or file write occurs. No unattended recovery claim follows. |

The decisive counterexample selects `gpt-5.6-sol` but serves its output entirely
from the local mock. The model emits an unregistered function name of 26,008 bytes.
App-server returns a **26,026-byte error** to the model, already exceeding 24 KiB.
It emits no `item/tool/call` or dynamic-tool item for that function, starts a second
mock model request, then reports the turn completed. A live model was not used;
this is a counterexample to enforcement, not a claim about typical model behavior
or an economical model-tier qualification.

See the recorded ordered protocol summary:
[unknown tool rejection](app-server-unknown-tools-bypass-client-request-and-exceed-result-budget-invisibly.json).
The other JSON files in this directory preserve the positive controls and scoped
interrupt/restart/usage observations. Exact scripted model output, argv and peer
behavior are reproducible from the two test source files. Binary/source/log hashes
and test counts are in [verification.json](verification.json).

## Exact missing primitive

The adapter needs a mandatory gate for **every** tool dispatch and rejection,
including unsupported names, before an output enters model context or another
internal model request starts. It must be able to deny/interrupt and account for
the serialized result bytes before returning them. A native fail-closed policy
for unsupported tools before constructing an error result would also close the
specific demonstrated bypass, but would still require complete qualification.

Registered dynamic-tool callbacks give real control over those client tools.
They do not intercept the native router's unsupported-call path. Streamed/raw
observations, if added, would not constitute a pause/acknowledgement gate. The
stable protocol also lacks the tested registration surface. The requested
qualification therefore fails; broadening tooling, adding heuristics or wrapping
exec with more hooks would not be a justified next step in this slice.

## Product change and compatibility

The existing `codex exec` provider is retained with additive capability facts:
`opaqueAgentLoop: true`, hard interaction/model-call/token ceilings unavailable,
`costBoundedSmallTasks: false`, and `opaqueForegroundOnly: true`. This is an
eligibility restriction, not an authorization grant or new opaque-mode launcher.

Both existing engineering drivers now reject opaque candidates **before calling
their qualifier or executor** for bounded small-task AUTO. Decisions save
`opaque_agent_loop` and rejected candidates; the existing shared CLI/TUI/Web
projection exposes the stop reason. A qualified non-opaque alternative still
completes the deterministic fixture automatically. The dispatch/ranking guards
also reject opaque proof even when supplied a zero-token maximum. Ordinary
legacy provider start/resume paths and disk layout remain compatible. Native
engineering unattended execution remains unqualified; no new opaque permission,
capacity retry or background run is enabled.

No app-server production adapter, complete four-file/read/patch budget enforcement,
managed-worktree integration, production deadline/reconciliation, or new envelope
UI is claimed. Those would be false progress after the qualification failure.

## Authentication, verification, preservation and rollback

The documented managed ChatGPT mode lets Codex own auth and refresh. We did not
exercise the user's existing authentication store: qualification already failed,
so no credential access or integration decision was needed. There is no token
transfer through workspace config and no external-token mode. A future approved
adapter would still need to qualify safe managed-auth inheritance before canary.

Targeted process-level qualification: **9/9**. Compatibility/opaque routing:
**62/62**, then final routing set **26/26** after adding the qualified-alternative
scenario; these overlap and are not additive. One full suite and exit-checked
syntax results are in [verification.json](verification.json). No test against a
mock is counted as real canary or cost evidence.

[preservation.json](preservation.json) compares fresh read-only inventories of
production/stable checkouts, Task #2/#3, protected packages, LaunchAgent binding,
scheduler/editorial definitions and the existing delivery receipt. No migration,
provider delivery, publication or production runtime change occurred.

Rollback: separately revert this development commit; retain all task history,
receipts and diagnostic evidence. No production rollback is required. Practical
verdict stays **NO-GO — app-server также не предоставляет необходимую boundary**
for the tested installed version and exposed surfaces. Provider attempts: **0**;
real canary usage/duration/verifier and comparison with 241,512 tokens: **not
measured**. No retry or further platform hardening follows this report.
