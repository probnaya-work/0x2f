# Managed Responses small-task lane — offline implementation complete

Development base: `9a674180270c35764b9e612e569a680b97efc89c` on
`feat/task-continuity`. Implementation commit: 5cf2b3a567c1fb14a8cb3b673b6a3c49da1825d5.
Verification and preservation results are recorded in [verification.json](verification.json)
and [preservation.json](preservation.json). No live model/provider call or delivery
was performed. This slice stops after saving the implementation and evidence.

## Implemented user path

A new foreground small engineering Task automatically enters the managed lane
before native harness authentication/preflight. 0x2F owns every Responses request,
selected context, tool validation and filesystem effect. It reuses the existing
Task, managed Git worktree, atomic storage, locks, frozen inputs/artifacts,
usage ledger, deterministic verification, acceptance and shared projections.
There is one versioned model candidate; no user model/lane choice, API gateway,
workflow language, new execution profile or automatic opaque fallback was added.

Only `read_task_file(file_id)`, `submit_patch(edits)` and
`request_context_expansion(reason)` are registered. Logical IDs map to the approved
manifest. The entire returned batch is validated before any effect. Unknown items
or tools, malformed arguments, repeated call IDs, excess reads or duplicate patches
stop without a subsequent request or generated error payload. One scoped,
exact-match replacement patch is applied by 0x2F; the loop ends immediately after
submission. Insufficient context becomes `NEEDS YOU · context_expansion_required`.
The pinned verifier runs separately with no model-controlled command dispatch.
Failed verification produces NEEDS YOU, with full bounded output saved locally;
there is no second implementation attempt or automatic fix call in this lane.

Codex exec and OpenCode remain compatible opaque harnesses. Both declare opaque
agent loops, unavailable hard interaction/model-call/token ceilings, foreground-only
eligibility and no cost-bounded small-task eligibility. Existing engineering AUTO
filters remain in force, and managed errors do not dispatch either harness. Their
ordinary legacy paths were retained. No additional native hardening was attempted.

## Enforced envelope

| Boundary | Maximum / enforcement |
| --- | --- |
| Attempts | One durable attempt identity; no automatic retry, continuation or replay. |
| Initial packet | 8,192 serialized bytes, including current brief/constraints, approved scope/check, required AGENTS instructions and file manifest. Oversized required context stops. |
| Source | Four approved logical IDs/files, 65,536 aggregate source bytes; no .env/.git/.work/.codex/.aws/credentials paths, symlinks or arbitrary paths. |
| Reads and results | Four reads; 4,096 UTF-8 content bytes per read, cut at complete codepoints; 24,576 cumulative serialized function-result bytes including wrapping, before model input. |
| Tools / patch | Six accepted calls at most; one submit_patch. Every edited file must be writable in the manifest, have the recorded hash and exactly one old_text match. |
| Requests | Two inference POSTs and two exact-count POSTs: at most four Responses API HTTP requests. One separate model-availability GET makes five provider HTTP requests total. No SDK retries or redirects. |
| Serialized API input | 32,768 cumulative bytes across count and inference request bodies; both next bodies are reserved before counting. |
| Inference input | 4,096 tokens per request, 8,192 cumulative, checked against the provider count before inference; no character/token estimate. |
| Inference output | max_output_tokens ≤2,048 per response, ≤4,096 reserved across the attempt, including reasoning output under the documented API contract. |
| Total inference | ≤12,288 cumulative input + output tokens, conditional on the exact counter and max_output_tokens contracts; repeated conversation/instructions/schemas/results are counted anew. |
| Deadline | Abortable managed attempt deadline ≤120s, also constrained by existing task wall-clock budget. No new request/effect starts after observed expiry; verifier owns and kills its process group. Durable stop/lock cleanup may finish afterwards. |
| Cost | $0.25 ceiling; complete worst-case proof required before native HTTP. Unknown cost blocks live execution. Existing configured task ceilings must also fit the reservation; prior runs, ledgers, nonzero confirmed usage and outstanding/uncertain reservations block a fresh attempt. |

The production endpoint is fixed to `https://api.openai.com/v1/`, `store:false`,
`service_tier:default`, no hosted tools, previous_response_id, server conversation,
streaming continuation, provider endpoint overrides or credential-bearing workspace
configuration. Each inference retransmits only the selected task packet and this
attempt's prior calls/results. Model responses are bounded to 256 KiB locally.
These are local enforcement and documented API-contract limits, not a proven
provider-side billing cap or qualification of arbitrary tasks.

## Model and cost evidence

[Official model documentation](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
records Responses, function calling, coding capability, reasoning effort `none`
and snapshot `gpt-5.4-mini-2026-03-17`. The one-entry registry pins this snapshot;
price evidence observed at `2026-10-16T15:03:51Z` is USD per million tokens:
input 0.75, cached input 0.075, output 4.50. Live evidence older than 24h blocks.
Account availability and real patch quality were not tested. No alternative model
was added solely to make a larger registry.

Worst-case **inference-only** reservation, assuming no cache discount:

```text
(8,192 × max(0.75, 0.075) + 4,096 × 4.50) / 1,000,000
= USD 0.024576
```

The [official token-counting guide](https://developers.openai.com/api/docs/guides/token-counting)
documents exact model input counting, including tools/schemas, conversation and
instructions. The adapter counts the same prompt fields before inference;
store/output/reasoning controls are not used as a token estimate. Response usage
must match the counter and output allowance, with the selected model identity.
Missing, inconsistent or duplicate usage stops rather than becoming zero.

[Official pricing](https://developers.openai.com/api/docs/pricing) states the APIs
are billed using the selected model's token rates, with separately priced hosted
tools. We did not establish an explicit fee contract for the token-count operation.
Its cost remains unknown; the inference figure above is not presented as a proven
whole-attempt charge. The native registry therefore has `totalUpperUsd:null` and
blocks with `managed_cost_unproven` before any HTTP even if a key is supplied.
Mock qualification explicitly substitutes a zero counter fee, without changing
that native gate. This is a disclosed missing pricing proof, not a claim that
OpenAI necessarily charges a separate counter fee.

Actual per-response provider usage, cached and overlapping reasoning categories,
calculated inference-only USD, provider-reported charge and unknown counter fees
remain separate. The [normal-flow evidence](normal-flow.json) is entirely synthetic:
240 fixture tokens and USD 0.0003165 calculated inference cost are **not live usage
or a bill**. Provider-reported cost and unreported reasoning usage remain unknown.

## Durable boundaries and credentials

Before every HTTP operation an immutable intent stores task/run/attempt/request
IDs, pinned model, exact body digest and credential-free body, allowed tools,
remaining budgets and reservation. A response receipt and response-delta usage
are durable before the next request. Tool intents precede writes; receipts bind
before/after bytes. Workspace, scope, source, patch and final intent are fenced.
CHANGES reads the immutable baseline/artifact in both existing engineering styles.

One kernel-backed managed driver lock prevents concurrent duplicate dispatch.
SIGKILL before inference, during an unanswered request and after response receipt
leaves the durable attempt unresolved; a new driver/startup recovery marks it
`UNCERTAIN / NEEDS YOU` and never replays HTTP or a patch. There is no exactly-once
provider claim, status lookup, reconciliation engine or automatic crash recovery.
An explicit new foreground decision/reconciliation remains necessary; this slice
does not implement an unsafe resume shortcut.

Only process-environment OPENAI_API_KEY is used. No Codex OAuth/session file was
read for the managed path. Recursive guards reject credential-bearing requests,
responses, Buffer/serialized/nested values, source, patch, manifest filenames,
verifier output and artifacts before persistence. HTTP error bodies are discarded;
errors use fixed safe codes. Lock, Git/worktree/diff helpers and the verifier do
not inherit OPENAI_API_KEY. No credential was extracted, copied, printed or saved.

## User projection, verification, limits and verdict

CLI, TUI and Web use the existing shared projection: selected managed lane/model,
no opaque fallback, envelope, request/tool/read/patch counters, token bound,
calculated versus provider cost, stop reason, exact artifact/check/review refs.
READY requires deterministic verification and current bytes/intent; accepting
still performs the existing artifact checks and grants no delivery permission.
Without a key the visible outcome is NEEDS YOU, `managed_api_key_missing`, zero
inference/HTTP dispatch and unknown unmeasured usage. No new UI concept was added.

Mock tests cover normal read → patch → real local verifier, all denied outputs,
truncation, request/input/output/cost ceilings, no fallback, unknown usage,
duplicate drivers, real process crashes, late responses, verifier descendants,
credential-bearing data, scope/source/patch/intent drift, immutable CHANGES,
acceptance and common projections. Targeted checks, syntax and the single full
suite are detailed in verification.json; native LaunchAgent tests are disabled.
The full suite passed 973 tests (854 pass, 119 native skips, zero failures). A final
two-line preflight guard refusing previously spent/uncertain Task budgets, plus its
regression, was added afterwards and checked with targeted normal, duplicate,
key-missing and process-crash cases. The full suite was not repeated over that
narrow final delta. Final syntax covers the saved source.
Historical native evidence is not counted as a managed live canary.

Offline managed-lane implementation/qualification: **GO**. Live bounded foreground
qualification: **NO-GO / not exercised**: OPENAI_API_KEY is absent and the complete
price proof is missing. Live attempts: **0**; actual canary tokens/cost: **not
measured**. Opaque cost-bounded AUTO and unattended execution remain **NO-GO**.
Provider-side monthly/project spending enforcement, arbitrary command execution,
new providers/models, delivery, production activation and general agent hardening
were deliberately excluded.

To configure a future foreground shell, enter the key privately in that shell:

```zsh
read -rs 'OPENAI_API_KEY?OpenAI API key: ' && export OPENAI_API_KEY
```

This sets the standard environment variable without putting its value in shell
history, chat or repository. It does not resolve the pricing gate or itself run a
canary. No provider-side/authentication change was made on the user's behalf.

Rollback: separately revert 5cf2b3a567c1fb14a8cb3b673b6a3c49da1825d5, preserving all Task history,
request/tool intents, artifacts, usage and previous receipts. The evidence commit
can remain for audit. No production rollback, migration or scheduler action is
required. Preservation was rechecked after verification; no protected production
state or existing receipt was changed.
