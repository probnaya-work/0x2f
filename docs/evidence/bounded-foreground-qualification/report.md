# Bounded foreground loop — interaction boundary blocker

Verdict: **NO-GO for the requested real foreground canary.** The blocker is an
uncontrolled internal interaction/output path, not a demand for a hard token
ceiling. No real provider attempt was spent. No runtime dispatch policy changed.

Based on clean `feat/task-continuity` at
`4e7f85f750e28d3037f35caea182bfd2c8385ed4`. Negative qualification tests,
capability-map observation and this evidence form one separate local commit.
Its exact ID resolves with `git log -1 --format=%H --` this report and is returned
to the user. Rollback: separately revert that commit; there are no task effects
or production migrations to reverse.

## Minimal existing boundaries tested

The installed `codex-cli 0.149.1` supports feature switches and `PreToolUse` hooks.
The [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
describes `features.shell_tool`; the
[official hooks documentation](https://learn.chatgpt.com/docs/hooks#tool-coverage)
also explicitly warns that hooks are not a complete enforcement boundary.
Documentation selected the probes; only actual CLI observations qualify the
findings below. Binary identity and source/test/log hashes are in
[verification.json](verification.json).

Four deterministic probes use the **real installed CLI**, a credential-free,
disposable CODEX_HOME and the repository's existing loopback Responses mock.
They execute no real inference and do not use user auth. Hosted/local side tools
are disabled with existing feature switches, shell is disabled, sandbox is
read-only, user config is ignored, and the only enabled hook is a disposable
deny-all test hook. `--dangerously-bypass-hook-trust` is used exclusively to trust
that owned mock-test hook; it is not a proposed production flag or permission
change. The test source contains exact argv/environment and scripted responses.

| Probe | Observed result |
| --- | --- |
| Model shell command rejected | Disabled `exec_command` did not create its sentinel. Its rejection still became a tool output followed by a second model request. |
| Positive hook control | Registered `update_plan` invoked `PreToolUse`; its deny decision took effect. The hook configuration is functional. This control uses fallback fixture model metadata and claims no model qualification. |
| Six-action budget counterexample | Seven unsupported calls bypassed the hook, generated eight model requests and seven tool outputs. `exec --json` emitted no action items for those calls. |
| 24 KiB payload counterexample | One unsupported function name produced a 26,026-byte tool error. The second model request already contained that error; the hook never saw the call. |

The last two probes select the previously observed `gpt-5.6-sol` model name but
serve its output entirely from the deterministic mock. This is not an account
entitlement, capability-tier, typical-model-behavior or real-token measurement.
The large-name case is a counterexample to hard enforcement, not a claim that
real models routinely generate names of that size. Disabled `exec_command`
demonstrates the same bypass path with an ordinary tool name.

Raw measured summaries (payload size/hash/prefix, hook names, model-request count,
JSONL event types, disabled flags):

- [disabled command](bounded-qualification-disabled-shell-rejects-model-test-command-before-execution.json)
- [working hook control](bounded-qualification-positive-control-hook-denies-a-registered-tool.json)
- [seven invisible turns](bounded-qualification-seven-unsupported-tool-turns-bypass-hook-and-JSONL-action-accounting.json)
- [oversized returned payload](bounded-qualification-unsupported-tool-output-exceeds-24-KiB-before-controller-can-intercept.json)

## Missing boundary and stop decision

0x2F needs control **before every internal tool dispatch/rejection and before its
result enters model context or another internal model request starts**. The gate
must include unsupported calls, failures, and any tool paths that opt out of
ordinary hooks. It must reserve/check the action and result-byte budgets and
terminate the attempt when exhausted. Alternatively, a qualified single-response,
tool-free mode must prevent the harness from starting further internal turns.

The tested CLI JSONL stream and hooks do not provide that complete gate. Killing
a process group when a late event arrives cannot undo payload already returned
to the model. A small packet, `shell_tool=false`, a deny-all hook and prompt
instructions together do not establish the required six-action/24 KiB envelope.
An OS process-group deadline can bound duration; it cannot repair this accounting
gap. No blanket assertion about every possible future harness integration follows.

Per the user's explicit condition to stop if substantial interaction limits
cannot be controlled before completion, no actual canary was launched. The
previous economics policy remains in place; no unsupported foreground eligibility
was added and its token gate was not renamed to imply a newly proven envelope.

Not implemented/claimed: complete packet/patch execution adapter, four-file/64 KiB
runtime enforcement, per-tool/read/edit ceilings, process-group reconciliation,
new envelope projections, or a new Task/verifier run. Those require an executable
adapter qualified at the missing boundary. No generic sandbox, protocol migration,
new provider abstraction or further hardening programme was started.

## Comparison and verification

| Measurement | Previous real successful canary | This slice |
| --- | --- | --- |
| Initial controller input | 3,041 bytes | No real Task packet dispatched |
| Model tools/reads/payload | Broad/repeated reads and verbose test output; see prior diagnosis | Mock qualification only; native interaction envelope disproven |
| Input / cached / output / reasoning | 239,563 / 214,016 / 1,949 / 479 | No real inference; not measured |
| Cumulative total | 241,512 | No real inference; not measured |
| Duration / targeted task verification | Historical completed Task | No canary, patch or task verifier |

The mock's synthetic zero usage is not evidence of cheap execution. Its eight
requests are deterministic test interactions, not paid/provider attempts. Prior
[economics diagnosis](../engineering-economics/report.md), original Task and
delivery receipt remain intact.

The four new targeted qualification tests pass. One full ordinary suite and
syntax checks are recorded in [verification.json](verification.json), separately
from real-model qualification. Legacy/ordinary runtime behavior was not edited.
[preservation.json](preservation.json) compares fresh before/after inventories:
main/stable checkouts, Task #2/#3, protected packages, LaunchAgent binding,
scheduler/editorial definitions and existing canary receipt remain preserved.

Practical answer: **0x2F has not yet proved the requested bounded real Codex loop
or an observed spend below 40,000 tokens.** The measured reason to stop is precise:
internal rejected-call turns and payload can bypass both the hook and action-event
accounting. Foreground envelope and real economic GO remain NO-GO; no provider
retry, delivery, publication or unattended activation occurred.
