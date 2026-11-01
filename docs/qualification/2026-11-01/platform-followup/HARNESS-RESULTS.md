# Local macOS harness follow-up — 2026-11-01

All ten distinct Codex/Gemini real-binary integration cases now have a passing
observation across the runs below. This is **real harness binary + deterministic
local mock API** evidence, separate from both fixture-only and live-provider
qualification. The separately approved live series below also passed, including a real
permission, retry, decision, answer, saved-session resume, explicit additional
note and **Gemini → DeepSeek Harness → Gemini on the same saved task**. The
eight model requests cost an estimated **$0.0202138** at conservative published
token rates. No real credential change or physical phone run occurred.
Codex/Claude live authentication remains unqualified for the specific
credential reasons below.

The new saved-session probe found a real Codex 0.166.0 compatibility defect and
led to the narrow production correction in local commit **`66651fb`**.

## Installed binaries

Commands were only `--version` / `--help`, with empty temporary homes/config
directories and an environment constructed from scratch. Every version/help
command exited 0. Exact outputs, resolved paths and environment key names are
in [inventory.json](evidence/harnesses/inventory.json); the reproduction script
is [inventory.mjs](evidence/harnesses/inventory.mjs).

| Binary | Observed version | Executable |
| --- | --- | --- |
| Node | v26.11.1 | `/opt/homebrew/bin/node` |
| Codex | codex-cli 0.166.0 | `/Users/bogart/.n/bin/codex` |
| Gemini | 0.60.0 | `/Users/bogart/.n/bin/gemini` |
| Claude Code | 2.1.296 | `/Users/bogart/.n/bin/claude` |
| OpenCode | v2.0.27 | `/opt/homebrew/bin/opencode` |
| DeepSeek Harness | 0.1.1-rc.2 | `/Users/bogart/.n/bin/dsh` |

OpenCode help lists `acp`; Gemini help lists `--acp` and the deprecated alias
`--experimental-acp`. Those help observations establish command availability,
not working authentication or end-to-end model/tool behavior. Claude and
OpenCode were not run against a model in this follow-up. DSH 0.1.1-rc.2 ran
against a mock API first and then the approved real DeepSeek API. The historical
Codex/Gemini capability maps remain version-pinned historical observations.

## Exact runs and outcomes

| Procedure | Outcome | Evidence |
| --- | --- | --- |
| Original five Codex + four Gemini integration assertions, temporary safe copy | **9 executed: 8 passed, 1 failed, 0 skipped**, 17.8 s | [Original output](evidence/harnesses/run-2026-11-01T14-03-53.274Z/tests.tap), [request trace](evidence/harnesses/run-2026-11-01T14-03-53.274Z/mock-requests.jsonl), [safe-copy metadata](evidence/harnesses/run-2026-11-01T14-03-53.274Z/runner.json) |
| Codex fixed local command, normal workspace-write sandbox without added outer seatbelt | **1 passed, 0 failed, 0 skipped**, 0.98 s; added exact `note.txt == "x"` assertion | [Output](evidence/harnesses/run-2026-11-01T14-07-28.303Z/tests.tap), [request trace](evidence/harnesses/run-2026-11-01T14-07-28.303Z/mock-requests.jsonl), [metadata](evidence/harnesses/run-2026-11-01T14-07-28.303Z/runner.json) |
| Additional native start → saved-session resume probes, before correction | Codex failed; Gemini passed with same session ID and prior assistant context | [First failing reproduction](evidence/harnesses/resume-2026-11-01T14-09-14.933Z/result.json) |
| Same probes with exact failed normalized outcome retained | Codex failed before a second model request: `unexpected argument '-s' found`; Gemini passed | [Exact outcome](evidence/harnesses/resume-2026-11-01T14-11-51.390Z/result.json), [Codex mock requests](evidence/harnesses/resume-2026-11-01T14-11-51.390Z/codex-requests.json) |
| Same probes after argument-order correction | **Codex and Gemini both passed**; each resumed the same ID and carried the prior assistant marker | [Results](evidence/harnesses/resume-2026-11-01T14-14-06.634Z/result.json), [Codex requests](evidence/harnesses/resume-2026-11-01T14-14-06.634Z/codex-requests.json), [Gemini requests](evidence/harnesses/resume-2026-11-01T14-14-06.634Z/gemini-requests.json) |
| New permanent real-binary Codex saved-session regression | **1 passed, 0 failed, 0 skipped**, 0.29 s | [Output](evidence/harnesses/run-2026-11-01T14-15-14.382Z/tests.tap), [requests](evidence/harnesses/run-2026-11-01T14-15-14.382Z/mock-requests.jsonl) |
| Codex fixture/provider unit suite after correction | **21 passed, 0 failed, 0 skipped** | `node --test test/codex-provider.test.mjs`, recorded in the task tool output; broader final checks belong to the platform matrix report |

Do not sum these overlapping runs as distinct test coverage. The original nine
cases were five Codex/four Gemini. The permanent saved-session regression adds
the sixth Codex case: **six Codex + four Gemini = ten distinct cases**. The
additional direct Gemini resume probe is separate boundary evidence.

The initial command test failure was an environment restriction. Its captured
next mock request contains `function_call_output` with exit 71 and
`sandbox-exec: sandbox_apply: Operation not permitted`; consequently no
`tool.started` event was produced. An added outer macOS loopback-only sandbox
prevented Codex from applying its own seatbelt sandbox. A separate
[fixed printf sandbox probe](evidence/harnesses/sandbox-probe.json) succeeded
with Codex's sandbox outside that extra wrapper. The targeted command test then
passed while retaining normal `workspace-write`, and verified actual file bytes.
No sandbox bypass or danger-full-access mode was executed.

The saved-session failure was a product compatibility defect, independent of
the nested sandbox. The adapter appended `-s workspace-write` after `exec
resume`, where the current resume parser rejects it. The correction moves
sandbox arguments onto `exec` before `resume`. The permanent regression starts
a real session, resumes its returned ID, verifies the same ID and prior result
in the next model request, and checks that the resumed request still declares
workspace-write. Integration fixtures now retain workspace-write by default.

## Isolation and reviewable evidence

[run-real-mock.mjs](evidence/harnesses/run-real-mock.mjs) constructs an explicit
environment with no inherited provider credentials, proxy settings, hooks or
user configuration. It supplies absolute binary paths, temporary HOME/XDG and
provider config directories, and only the literal dummy Gemini key `test-key`.
The Codex custom provider points to `http://127.0.0.1:<port>/v1`; Gemini's
gateway configuration points to `http://127.0.0.1:<port>`. Both mock servers
bind to literal loopback, return scripted messages/errors and log requests.
No endpoint substitution or real authentication was required.

The initial suite, saved-session probes and new permanent regression ran under
[loopback-only.sb](evidence/harnesses/loopback-only.sb), which denies network
access except loopback. For the single fixed-command retest, that added wrapper
was omitted to permit Codex's own workspace-write seatbelt. Its clean home and
explicit loopback mock provider were preserved; no real key was supplied.

The qualification copy preserves existing assertions, substitutes
workspace-write for the historical test bypass seam, logs mock requests, and
copies scratch state before original cleanup. The fixed-command run adds a
stronger exact marker assertion. Exact executed test/fixture copies are stored
beside each run. Temporary `.work` folders were renamed `work-state` in the
review evidence to avoid the repository's `.work` ignore rule. Historical
failing output has not been overwritten.

Generated SQLite/WAL/SHM databases and bundled system skills were moved out of
the review tree with their bytes preserved at
`/private/tmp/0x2f-harness-generated-state-00zpg99j`.
[retained-generated-state.json](evidence/harnesses/retained-generated-state.json)
records 670 original paths, byte counts and SHA-256 hashes, plus renamed state
folders. Essential temporary configs, prompts/results, normalized task state,
session rollout text, mock request bodies, failure details and test copies
remain in the repository evidence. During that mock-only phase, these disposable
homes contained no real authentication and no account credential store was
read or copied. The later approved live phase read existing Gemini and DeepSeek keys into
gateway memory only; neither was copied to a home, source file, log or report.
Four generated apply-patch runtime symlinks were likewise moved as links,
without following their installed-binary targets; see
[retained-runtime-links.json](evidence/harnesses/retained-runtime-links.json).

Reproduce the protected suite/probes from this checkout with local loopback
socket permission:

```sh
node docs/qualification/2026-11-01/platform-followup/evidence/harnesses/inventory.mjs
sandbox-exec -f docs/qualification/2026-11-01/platform-followup/evidence/harnesses/loopback-only.sb node docs/qualification/2026-11-01/platform-followup/evidence/harnesses/run-real-mock.mjs
sandbox-exec -f docs/qualification/2026-11-01/platform-followup/evidence/harnesses/loopback-only.sb node docs/qualification/2026-11-01/platform-followup/evidence/harnesses/probe-resume.mjs
```

The full protected suite intentionally retains the known nested-seatbelt
command restriction. Run only `run-real-mock.mjs --codex-command-only` from a
context permitting Codex's own sandbox for the fixed-command retest; this does
not remove or weaken Codex's sandbox.

## Approved live Gemini and DeepSeek results

Human authorization was **«Да, разрешаю до $5»**, for the existing-credential
series only: at most eight turns, sixteen model requests, no new keys or
credits. The run used the unchanged installed Gemini CLI **0.60.0**, explicit
model **`gemini-3.5-flash-lite`**, real 0x2F CLI/worker processes and a new
scratch workspace. The later one-turn additional-note check reused the same
task and durable budget ledger. The user then explicitly identified existing
DeepSeek terminal credentials/funds; the final two turns reused that same
ledger for DSH and the return to Gemini. This was one shared $5 authorization,
not a separate $5 budget per provider.

**Completed: eight turns, eight upstream model requests, 58,771 input tokens,
1,163 generated tokens including 163 reported DeepSeek reasoning tokens.**
Conservative published-rate estimate: **$0.0202138 (about 2.02 US cents)**.
The amount reserved before forwarding was **$0.1866244**, below the approved
$5 ceiling; DeepSeek's own cumulative reservation was **$0.0083694**, below
its additional $0.10 sub-limit. This is a token usage estimate, not an invoice
or a claim about subscription quota. DeepSeek uses peak cache-miss prices even
though the provider may apply cheaper off-peak rates. No further paid request
was initiated after the Gemini return completed.

| Approved step / actual execution | Result | Upstream requests |
| --- | --- | ---: |
| Added controlled auth failure before the first retry | Local gateway returned 401, 0x2F stored FAILED / auth, task/history retained | 0 |
| Plan step 3, plus actual manual RETRY of the same task | Gemini returned the real amber/teal question; NEEDS YOU / decision | 1 |
| Plan step 4: answer `teal`, rerun | Same task retained answer, reached READY and preserved three run records including the controlled failure | 1 |
| Plan step 5: targeted native session resume | Same external session ID, prior `teal` context in the resumed result | 1 |
| Plan step 8: actual Gemini ACP permission | Live write permission displayed, exact path/content inspected, one `allow_once`; same ACP session and single run reached READY, exact `APPROVED_ONCE\n` file bytes, exactly one `permission.resolved` event | 2 |
| Additional note explicitly requested by the user | `2f note` preserved DONE without starting work; explicit rerun of the same task advanced runs 3→4, carried the exact note in its persisted prompt and returned `teal` + `NOTE_ROUNDTRIP_01`; closed/reopened DONE again | 1 |
| Additional user steering: switch same task to DeepSeek Harness | **PASS**, run 4→5, retained teal + NOTE_ROUNDTRIP_01, returned DSH_SWITCH_01; exact configured model/high reasoning, no tools | 1 |
| Return same task from DeepSeek to Gemini | **PASS**, run 5→6, retained note and DeepSeek marker/result, returned GEMINI_BACK_01; closed/reopened DONE | 1 |
| Plan steps 1/2/7: Codex live start/resume/switch-back | **BLOCKED**: active default Codex store is ChatGPT OAuth with no API key; no unrestricted subscription or substituted billing path used | 0 |
| Plan step 6: Claude live switch | **BLOCKED**: configured default credential entry exists but `claudeAiOauth.accessToken` and `refreshToken` are empty strings; no API key or helper configured | 0 |

The retry failure was deliberately local and cost nothing; the following retry
used the real provider. It does not establish a real provider outage or a
vendor-side invalid-key failure. The permission was a real CLI/ACP tool stop,
not a scripted permission fixture. Cross-harness switching is now proven live for **Gemini → DSH → Gemini**,
with the same task ID/slug, persisted notes and six-run history. DSH starts a
fresh native session per rerun; no DSH native resume is claimed. The planned
live Codex/Claude switches remain blocked. Native Gemini → Gemini ACP is not
reported as cross-harness coverage.

Evidence:

- [Initial live results and exact permission](evidence/harnesses/live-approved-20261101/results.json)
  and [CLI transcript](evidence/harnesses/live-approved-20261101/cli.jsonl).
- [Separate additional-note result](evidence/harnesses/live-approved-20261101/note-results.json)
  and [note/close/reopen CLI transcript](evidence/harnesses/live-approved-20261101/note-cli.jsonl).
- [DSH and return-to-Gemini results](evidence/harnesses/live-approved-20261101/deepseek-switch-results.json),
  [switch CLI transcript](evidence/harnesses/live-approved-20261101/switch-cli.jsonl)
  and [`switch-work-state/`](evidence/harnesses/live-approved-20261101/switch-work-state/).
- [Single persistent budget ledger](evidence/harnesses/live-approved-20261101/budget.json)
  and [eight request/usage audit records](evidence/harnesses/live-approved-20261101/audit.jsonl).
- [Exact created marker file](evidence/harnesses/live-approved-20261101/approved-write-marker.txt)
  and its [byte count/hash receipt](evidence/harnesses/live-approved-20261101/approved-write-receipt.json).
- Initial task/event/prompt/result snapshots are in
  [`work-state/`](evidence/harnesses/live-approved-20261101/work-state/);
  the note extension preserves them and records its separate
  [`note-work-state/`](evidence/harnesses/live-approved-20261101/note-work-state/).
- [Exact existing credential mode metadata](evidence/harnesses/credential-modes.json)
  and [Claude inference token-field presence only](evidence/harnesses/claude-credential-fields.json).
  No secret, authentication header or account identity is included. Checks of
  `CODEX_HOME`, `GEMINI_CLI_HOME` and `CLAUDE_CONFIG_DIR` found no original
  environment overrides, so these were the configured default stores.
- [Final owned-worker/evidence safety check](evidence/harnesses/live-safety-summary.json):
  both live scratch tasks are DONE, their recorded worker PIDs and process groups
  have exited, and the review tree contains no runtime symlinks, generated
  databases or credential-value files. Scratch homes remain outside the repo.

The live runner is [run-live-gemini.mjs](evidence/harnesses/run-live-gemini.mjs);
the bounded note extension is [run-live-note.mjs](evidence/harnesses/run-live-note.mjs);
the cross-harness extension is [run-live-deepseek-switch.mjs](evidence/harnesses/run-live-deepseek-switch.mjs).
These are evidence scripts, not package/product changes. Do not replay the
series as though it were a free regression test. The completed-run guard and
durable turn IDs refuse an accidental restart of the already attempted series.


The existing DSH settings selected provider `deepseek-official`, wire model
`deepseek-v4-flash`, reasoning effort `high`. The temporary home copied only
that selection and imposed the caps; it disabled auxiliary title generation.
[Credential presence and configured selection](evidence/harnesses/deepseek-credential-mode.json)
are retained without values. No provider/model was silently substituted. The
real response identified
`deepseek-flash`, matching the documented legacy alias mapping to
DeepSeek-V4.1-Flash-1017 on the current
[official pricing page](https://api-docs.deepseek.com/quick_start/pricing/).
The DSH request used 2,416 input and 250 completion tokens, including 163
reasoning tokens; its conservative peak estimate was **$0.0010248**.

The authorized read-only [official balance API](https://api-docs.deepseek.com/api/get-user-balance/)
reported **USD 0.93 available** for the account of the existing DSH key at
17:39:14 UTC, before the model request. This does not identify or establish the
balance of a browser account; the usage URL redirected to sign-in. Only
currency/amount/availability are retained in the
[balance receipt](evidence/harnesses/live-approved-20261101/deepseek-balance-before.json).
No account login, credit purchase, key creation or credential mutation occurred.

## Budget controls and independent mock verification

The provider-neutral [offline gate](evidence/harnesses/local-budget-gateway.mjs)
has **seven passing fake-upstream tests**, separate from product/harness tests:
[full output](evidence/harnesses/local-budget-gateway.tap). They prove admission
checks before forwarding for loopback-only upstreams, local authentication,
active-turn/model/body bounds, output-cap replacement, per-turn/total request
limits, budget reservation, concurrent forwarding/turn changes, timeout stops,
no retry/refund, and redirect refusal. That generic offline core has no live URL
or credential access and is distinct from the Gemini-specific gateway below.

[gemini-budget-gateway.mjs](evidence/harnesses/gemini-budget-gateway.mjs) adds the
provider-specific guards; its [eight mocked tests passed](evidence/harnesses/gemini-budget-gateway.tap).
They include persistent allowance across restart, exact endpoint/model, 64 KiB
body limit, plaintext-only input (no URI/file/inline assets or code), output cap,
usage accounting, control failure with zero forwarding, no leaked local auth,
tool target/content checks, repeated-write rejection across separate responses,
redirect/auth-stop behavior and rejection of missing/over-limit usage.

Before any paid request, the complete runner was exercised with the real
Gemini binary, real workers, native session resume and real ACP permission
against a fake upstream. The [successful rehearsal](evidence/harnesses/live-runner-mock-2026-11-01T17-22-24.823Z/results.json)
covered all six checkpoints. The [first rehearsal failure](evidence/harnesses/live-runner-mock-2026-11-01T17-21-11.103Z/results.json)
was a runner-only `/tmp` versus `/private/tmp` assertion; normalizing the scratch
path corrected it. That known failed fixture worker was verified by its unique
scratch path/entry point/group and stopped; no unrelated process was killed.

The DeepSeek extension's [combined 18 mocked checks passed](evidence/harnesses/deepseek-budget-gateway.tap):
ten DeepSeek checks plus the same eight Gemini checks. They additionally prove
cumulative $0.10 DeepSeek reservation, shared counters across DSH/Gemini restart,
canonical combined output cap, no tools/assets, response-model drift rejection
with charged usage retained, and complete-stream validation before CLI delivery.
The real-DSH/mock [two-way switch rehearsal passed](evidence/harnesses/deepseek-switch-mock-2026-11-01T17-41-41.017Z/deepseek-switch-results.json)
before live forwarding. The [first rehearsal](evidence/harnesses/deepseek-switch-mock-2026-11-01T17-41-01.899Z/deepseek-switch-results.json)
completed its DSH mock request but exposed a runner assertion against the wrong
provider-field location (`task.provider` instead of `task.execution.provider`);
the assertion was corrected, with that failure preserved. Product code was
unchanged.

Live enforcement was reviewed before forwarding:

- Literal exact Google HTTPS route for `gemini-3.5-flash-lite`; exact DeepSeek
  `POST https://api.deepseek.com/chat/completions` and configured
  `deepseek-v4-flash`/high reasoning. No redirects, alternative models, batch
  routes, cached assets or automatic operator retry. DeepSeek response models
  are restricted to the documented Flash alias/canonical/revision allowlist.
- CLI processes had fresh HOME/XDG/config state, dummy gateway credentials and
  a loopback-only macOS sandbox. Only the gateway held the existing real key in
  memory and forwarded it only to its exact vendor route as the required header.
- Persistent atomic budget reservations, one gateway lock, at most eight turns,
  sixteen requests, two requests per turn, a 90-second absolute turn deadline,
  and at most 64 KiB of validated plaintext request data.
- Every request forced `maxOutputTokens: 1024`, one candidate and minimal
  thinking. Google's [thinking documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking.md)
  defines the output cap to include thinking. DeepSeek used canonical
  `max_tokens: 1024`; [Chat Completions usage](https://api-docs.deepseek.com/api/create-chat-completion/)
  includes reasoning within completion tokens. Reported usage stayed within
  these caps. DeepSeek text-only messages had no tools and `tool_choice: none`;
  title generation was disabled, leaving exactly one request.
- No server search/grounding/MCP/remote tools. Text turns had no tools; the
  permission turn exposed only `write_file` with the one exact scratch path and
  content. Complete upstream SSE was validated before a tool call reached the
  CLI; a second write in the same turn would have been refused.
- Audit records contain limits, body byte count/hash, allowed tool names,
  reservations and provider usage. They contain no key or authentication header.

[HARNESS-PLAN.md](HARNESS-PLAN.md) retains the original approved sequence and
the [physical-phone manual flow](HARNESS-PLAN.md#physical-phone-flow-still-to-execute).
No physical phone was available or used. Live Codex/Claude authentication,
physical device delivery, and hosted relay operations remain specific release
conditions; more mock runs do not establish them.
