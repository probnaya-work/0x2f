# Harness follow-up, 2026-11-01

The human approved the existing-credential series with **«Да, разрешаю до $5»**.
The Gemini branch, explicit-note check and user-directed DeepSeek → Gemini
switch completed: **eight turns, eight model requests, estimated $0.0202138**,
with $0.1866244 conservatively reserved before forwarding. See
[HARNESS-RESULTS.md](HARNESS-RESULTS.md). No new keys, credits or credential
changes were made. Codex/Claude live branches remain blocked by the concrete
credential conditions in that report; cross-harness switching passed with DSH.

## Approved bounds: eight small live turns across the approved harnesses

Authorization covered **at most eight user turns**, sequentially, through the installed Codex,
Gemini and Claude Code CLIs in a new scratch workspace. Use only existing
approved provider credentials; do not create/rotate credentials or purchase
credits. If an approved account/model is unavailable, stop that branch without
substitution. Later explicit user steering added DeepSeek Harness with its
existing terminal credential to this same shared budget. OpenCode did not
execute a live model request in this qualification.

Original intended sequence (Codex/Claude branches later blocked before model calls):

1. Codex 0.166.0 / `gpt-5.3-codex`: start task A, return marker `LIVE_A_01` and
   the required 0x2F result sections; request no tools and no human decision.
2. Resume that exact Codex session: return `LIVE_A_01` from prior context and
   marker `LIVE_A_02`. Verify the same external session ID.
3. Gemini 0.60.0 / `gemini-3.5-flash-lite`: start task B, return marker
   `LIVE_B_01` and `REQUIRED: yes` / `QUESTION: Choose amber or teal?`.
4. Record answer `teal` in 0x2F and rerun B through Gemini. Require `teal` and
   `REQUIRED: no`; verify run history and persisted answer.
5. Resume that exact Gemini session: require its prior marker/answer and
   `LIVE_B_02`; verify the same external session ID.
6. Add note `Keep the chosen colour teal` and rerun B through Claude Code
   2.1.296 / `claude-haiku-5-5`; require `teal`, brief result, no decision.
7. Rerun B through Codex / `gpt-5.3-codex`; require retained answer/note and
   prior-provider result context, then close B and reopen it from another CLI.
8. Use a separate Gemini **ACP** manifest, `gemini --acp --approval-mode
   default`, in the scratch workspace. Request only the local write
   `permission-roundtrip.txt` with content `APPROVED_ONCE\n`. Inspect its actual
   live permission in 0x2F, allow the displayed occurrence once, and verify the
   file bytes, same live run/session, final result and permission event log.
   Keep interactive permissions; do not switch to auto-edit or YOLO. If no
   actual permission is surfaced, record the gap rather than fabricating one.

Steps 2/5 exercise the native provider `resume()` boundary; ordinary rerun is
a fresh provider session, so it does not prove saved-session continuation.
The native Gemini headless adapter declares no live permission surface; step 8
therefore uses its separate ACP transport, whose availability is shown by the
installed binary's help. The actual live permission subsequently passed.
These are short connectivity, decision, continuity and permission checks.

Proposed limits: **90 seconds per turn, no concurrent turns, no automatic
operator retries, maximum 2 model requests per turn including Gemini's routing
classifier (16 requests total)**. Before forwarding each request, an audited
local budget gateway must reject an unexpected model/endpoint, input body over
64 KiB, or a request exceeding its turn/total request allowance, and enforce
at most **1,024 output tokens including reasoning** using the provider's
supported request field. Use an explicit Gemini model to avoid unbounded
automatic routing; any additional classifier consumes the same allowance.
Disable server-side search/grounding, remote tools,
MCP and account/workspace customizations in the disposable configuration.
An incomplete response at that cap is a recorded failure; do not raise limits
or switch models silently. Claude also supports `--max-budget-usd` in installed
help; set it to $0.25 as a second guard for its one turn.

The provider-neutral [offline gate](evidence/harnesses/local-budget-gateway.mjs)
and its [seven forwarding tests](evidence/harnesses/local-budget-gateway.tap)
remain separate from the implemented [Gemini-specific live gate](evidence/harnesses/gemini-budget-gateway.mjs).
Its [eight mocked tests](evidence/harnesses/gemini-budget-gateway.tap) and a full
real-binary/mock rehearsal passed before paid forwarding. The live gate uses
the exact approved Google endpoint, persistent shared limits, plaintext-only
input, enforced combined output cap, response/usage validation and the one-file
permission whitelist. Codex's OAuth-only mode and Claude's empty inference
token slots did not provide the approved compatible billing/authentication
paths; those branches stopped without substitution or credential mutation.

**Original expected cost: roughly $0.05–$0.50 total; approved ceiling: $5.**
The executed series, including the final DSH/Gemini switch, used a conservative
estimated $0.0202138. The first six turns used $0.0163001; the last two
continued that same persistent ledger rather than resetting the allowance.
This expectation assumes small responses and ordinary harness prompt overhead.
It is not a claim that the CLIs alone enforce a hard $5 account limit. The
request/output gates above must exist before execution; account billing and
tokenization can differ, so preserve provider usage, reserve in-flight headroom,
and stop before starting a request whose conservative reservation would exceed
$5. Stop immediately on unexpected paid tools, authentication failure,
unsupported budget controls or endpoint/model drift. A timeout alone is not a
token/spend cap and does not undo an already accepted request.

Current official list prices, read on 2026-11-01 (USD per million input/output
tokens; no cache discount assumed):

| Model | Input | Output | Source |
| --- | ---: | ---: | --- |
| `gpt-5.3-codex` | $1.75 | $14.00 | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 including thinking | [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| DSH configured `deepseek-v4-flash` → provider Flash alias, peak cache-miss | $0.30 | $1.20 including reasoning | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/) |
| `claude-haiku-5-5`, prompt <=100k tokens | $0.10 | $0.50 | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) |

The old deterministic mock model name `gpt-5.1-codex` is a fixture identifier.
Its [official model page](https://developers.openai.com/api/docs/models/gpt-5.1-codex)
now says shut down; it is not proposed for live requests. New model availability
and credentials on these accounts remain unproven. Subscription quota and API
dollars are different; the operator must identify the approved billing path
before live execution, without printing secrets.

## User-directed final two turns: DeepSeek and return to Gemini

After six completed turns, the user explicitly identified their DeepSeek
terminal account/funds. Read-only inspection found a usable existing
`DEEPSEEK_API_KEY` reference in DSH's configured credential store and the
selection `deepseek-official` / `deepseek-v4-flash` / `high`. The official
balance endpoint reported USD 0.93 available for that key's account; no browser
account identity was inferred. No key or credential value was copied to evidence.

7. Add the explicit DSH marker instruction to saved task #1 and rerun it through
   installed DSH 0.1.1-rc.2, preserving model and reasoning effort. Require teal,
   NOTE_ROUNDTRIP_01 and DSH_SWITCH_01, exact task identity and prior history.
8. Rerun the same task through Gemini 0.60.0 / gemini-3.5-flash-lite. Require the
   prior DSH marker/result context plus GEMINI_BACK_01; close and reopen DONE.

Both passed, runs 4→5→6, with one actual model request each. The shared ledger
finished at eight turns/eight requests. DSH's conservative reservation was
$0.0083694 within its additional **$0.10 cumulative sub-limit** and the original
shared **$5** cap. The gateway retained 64 KiB plaintext, 1024 combined output,
90-second absolute deadline and two-request per-turn limits, stripped all
DeepSeek tools/search/fetch, disabled auxiliary title generation, rejected
redirects and validated full SSE/usage/response model before CLI delivery.
The exact configured legacy alias was not changed; the provider returned the
documented canonical `deepseek-flash`. A new real-DSH/mock rehearsal and
[18 mocked guard checks](evidence/harnesses/deepseek-budget-gateway.tap) passed
before forwarding. No further paid calls are authorized by this completed
8-turn series.

## Installed local binaries and fresh mock results

See [HARNESS-RESULTS.md](HARNESS-RESULTS.md) and the exact captures under
[`evidence/harnesses/`](evidence/harnesses/). No historical capability map has
been rewritten from vendor documentation. Source correction is in local
commit `66651fb`; spending approval was received and the supported Gemini branch
and DeepSeek/Gemini switch completed. The unsupported live branches are recorded explicitly in the report.

## Physical phone flow still to execute

No physical phone has been connected or tested. Use a new fixture workspace and
a deterministic command/ACP provider; use no live model for the phone check.

1. Put phone and Mac on the same trusted Wi-Fi. Start the candidate UI/runtime
   from the fixture workspace and run `2f pair --lan` there.
2. Open the displayed URL on the physical phone; enter its fresh code. Record
   phone model, OS/browser versions, delivery origin and viewport.
3. Create a fixture task on phone; observe WORKING, live progress and READY.
   Reopen the same task from a separate Mac CLI and compare identity/history.
4. Trigger one fixture ACP permission, inspect it on phone, allow exactly the
   displayed occurrence and confirm it runs once. Trigger a decision, answer
   on phone, continue, inspect preserved answer and result, then accept/close.
5. Background/foreground browser, refresh and switch Wi-Fi off/on. Confirm
   reconnect preserves task state and does not repeat an accepted operation.
6. Run `2f pair --off` on Mac; confirm the physical phone loses access. Save
   screenshots with codes/tokens redacted and the matching fixture event log.

This establishes physical browser/LAN behavior only after execution. Public
relay/tunnel deployment is separate. Do not run `scripts/verify-phone.mjs`
without reviewing its mode: its default can launch/download a tunnel and use
public HTTPS, while `--local-tls` is a protocol/localhost check with a
self-signed certificate, not physical-phone evidence.
