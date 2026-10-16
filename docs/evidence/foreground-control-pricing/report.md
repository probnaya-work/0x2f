# Foreground pricing policy — unpriced control requests

Base: clean `feat/task-continuity` at `2fc8ce8ce661f98690eb347a14f1e42117a78773`
(after implementation `5cf2b3a567c1fb14a8cb3b673b6a3c49da1825d5`). This is one
local policy/evidence commit; its exact ID is returned to the user and resolves
with `git log -1 --format=%H -- docs/evidence/foreground-control-pricing/report.md`.
The earlier evidence and existing receipts are historical and unchanged.

The old all-HTTP pricing gate was too restrictive for the expressly authorized
foreground canary. Token-count POSTs and the fixed model-availability GET are now
`unpriced_control_request`: no separate published fee, no contractual zero-fee
claim, no inclusion in the published inference maximum. Complete billed amount
and provider-reported charge remain unknown. No request/token/tool/file/deadline
limit, retry boundary, provider, model or architecture was expanded.

The one existing model remains `gpt-5.4-mini-2026-03-17`. The
[official model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
publishes USD per million tokens: input 0.75, cached input 0.075, output 4.50.
Pricing evidence was refreshed at `2026-10-16T15:54:35Z`. The unchanged inference
budget is 8,192 cumulative input and 4,096 cumulative output tokens, so:

```text
published billable inference maximum:
(8,192 × max(0.75, 0.075) + 4,096 × 4.50) / 1,000,000 = $0.024576
control requests: 3 maximum, no separate published fee
```

The [token-count reference](https://developers.openai.com/api/reference/python/resources/responses/subresources/input_tokens/methods/count)
defines POST /responses/input_tokens as returning input token counts. The
[counting guide](https://developers.openai.com/api/docs/guides/token-counting)
documents accurate counting of the request, including instructions and tools.
[Official pricing](https://developers.openai.com/api/docs/pricing) states that
Responses API is not priced separately from model tokens and priced tools. The
foreground acceptance of the absence of a separate published control fee is the
user's explicit policy decision; it is not converted into a stronger fee contract.

Only a trusted caller's explicit foreground-canary decision permits this policy.
API-key presence and workspace configuration cannot grant it. The decision and
limits are saved in the immutable attempt. `foreground-preview.json` and the
presentation callback/stdout run before any HTTP: task, model, hard limits,
inference maximum, control count, sources, evidence timestamp and uncertainty
notice. The native gate still checks fresh pricing and configured Task ceilings.
An inference maximum above $0.024576 stops before HTTP. Unattended policy always
refuses this exception; no unattended dispatcher is enabled.

Each intent and receipt separately labels published-billable inference versus
unpriced control request. Two inference POSTs, two token-count POSTs and one
availability GET remain the maximum, with no automatic retry or opaque fallback.
Control payloads still consume the existing serialized-input budget; their token
counts do not inflate reported billable inference usage. Actual response usage,
calculated inference cost and unknown complete billed charge remain separate.
The shared CLI/TUI/Web projection now shows the two quantities above, actual
control dispatch count and TOTAL UNKNOWN. Legacy receipts are read unchanged.

Regression tests exercise the native pricing branch through a loopback mock,
explicit-versus-missing foreground authorization, unattended refusal, the tighter
inference ceiling, pre-HTTP durable/display preview, per-request classification,
separate control ceilings, all common projections, key absence and no replay,
retry or fallback. The zero-counter-fee override was removed from fixtures.
The native-branch test supplies a clock-only freshness fixture, not new official
price evidence. [verification.json](verification.json) records targeted tests,
syntax and exactly one full suite over the final saved code: **977 tests, 858 pass, 119 native skips, zero failures**. No code changes were
made after that full-suite candidate. [normal-flow.json](normal-flow.json) is
synthetic mock evidence, not a live canary or a provider bill.

OPENAI_API_KEY was absent in the existing foreground process environment (only
presence was inspected). **No live canary ran; live requests: 0.** Actual live
model/tokens/cost/verifier/final Task: not measured/not created. No Codex credential
store, shell history or local credential store was read, and no real key was
printed, saved, hashed or passed to another process. Exporting a key in a different
terminal does not alter the already-running agent's environment. Key creation or
billing changes were not performed on the user's behalf.

| Execution lane | Current verdict |
| --- | --- |
| Offline managed execution | GO; accepted implementation and changed policy verified with mocks. |
| Bounded foreground managed execution | Pricing policy GO for one explicit canary; live qualification pending an available foreground credential. No live success claimed. |
| Opaque foreground execution | Existing explicit foreground eligibility unchanged; no hard token/call/cost guarantees and no bounded AUTO/fallback eligibility. |
| Unattended execution | NO-GO; the unpriced-control exception does not apply. Provider-side spending enforcement or stronger fee evidence remains outside this slice. |

[Preservation](preservation.json) compares fresh read-only before/after inventories
of production/main/stable, protected packages, Task #2/#3, LaunchAgent binding,
editorial schedule and the existing delivery receipt. Only natural scheduler
log/health changes are allowed. There was no live delivery, commit delivery, push,
PR, merge, deploy or production activation.

For a future foreground shell, use exactly:

```zsh
read -rs 'OPENAI_API_KEY?OpenAI API key: ' && export OPENAI_API_KEY
```

This affects only child processes launched from that shell. It does not start a
canary or authorize a retry. Rollback is a separate revert of this policy commit;
preserve Task history and all previous intents, artifacts and receipts. No
production rollback or migration is required. Work stops after this slice.
