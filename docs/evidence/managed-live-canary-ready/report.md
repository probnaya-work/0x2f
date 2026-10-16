# GO — one real bounded managed foreground flow reached READY

On clean `feat/task-continuity` at
`a9d81716f41bb0e7846b81e3407a2a79f11a691e`, one real managed Responses attempt
completed Task → managed execution → scoped patch → deterministic verifier → READY.
No runtime code, provider, adapter, model, settings, retries or fallback were added.
This is GO for this exact foreground flow; unattended remains NO-GO. Work stops here.

## Task and immutable result

The retained disposable repository is
`/private/tmp/0x2f-managed-live-YKqcyw/repo`; its Task-owned worktree is
`.work/worktrees/001-reject-partial-decimal-task-ids`.
Task #1 fixes `parseTaskId` accepting partial strings such as `"14junk"`.
Only `src/task-id.mjs` was writable. The named export and return contract were
preserved; `"014"` returns 14, while invalid syntax, non-string input, zero and
unsafe integers return null. `test/task-id.test.mjs` was read-only and unchanged.

The model added an ASCII-digits/type guard and uses Number conversion after that
guard. Exactly one file changed. [patch.diff](patch.diff) has SHA-256
`1578faebb72f44891683a11ea8bff8069d6a65ee48fc6ab0b81a1d2d63ef1586`.
The frozen verified artifact content digest is
`3f1b248d57082fd5c7d4c2cf0af479e9bddefa807689dd9228bf97397dada72e`.

The existing durable Task API and managed-worktree API created the task/binding;
`runManagedForeground({store}, task, {foregroundCanary:true})` ran exactly once
with its native transport, existing registry and default hard envelope. The
one-off invocation/bootstrap scripts are retained alongside the repository for
audit; no harness or mocked provider was used. The repository has only its
fixture-initialization commit: parent and managed-worktree HEAD stayed at that
baseline. The result patch was not committed or delivered.

## Actual model, requests and cost

Requested and observed model: **gpt-5.4-mini-2026-03-17**.
Attempt: `4aee9858-5002-420c-87e7-12a5fa96e899`; managed duration: **8,078 ms**.

| Order | Request | Input | Cached | Output | Reasoning | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Model-availability GET | — | — | — | — | — |
| 2 | Exact input token-count POST | — | — | — | — | — |
| 3 | Inference: read_task_file | 528 | 0 | 21 | 0 | 549 |
| 4 | Exact input token-count POST | — | — | — | — | — |
| 5 | Inference: submit_patch | 633 | 0 | 181 | 0 | 814 |
| | Billable inference usage | **1,161** | **0** | **202** | **0** | **1,363** |

Five durable intents and five corresponding response receipts have distinct
request identities and one attempt identity. Both counts equal the subsequent
provider-reported input usage. [outcome.json](outcome.json) lists every request,
response ID and raw reported usage; the exact bodies, responses and pre-dispatch
reservations are preserved in [task-archive](task-archive/runs/1/managed/attempt.json).
Token-count results are control metadata, not billable inference usage.

Published inference maximum shown and saved before HTTP: **$0.024576**.
Control requests: **3 maximum, no separate published fee**. The preview preserves
model/task/limits, uncertainty notice and official sources with pricing evidence
timestamp `2026-10-16T15:54:35Z`.
[Official model rates](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
are USD per million tokens: input 0.75, cached input 0.075, output 4.50.

```text
Maximum inference: (8192 × 0.75 + 4096 × 4.50) / 1,000,000 = $0.024576
Actual calculated inference: (1161 × 0.75 + 202 × 4.50) / 1,000,000 = $0.00177975
```

Provider-reported billed amount and complete billed cost remain **unknown**.
No contractual zero-fee claim is made for controls. Cached/reasoning tokens overlap
input/output categories and are not added a second time.

## Verification, limits, projection and single-attempt audit

The original implementation failed the pinned local verifier as expected.
After the model patch, that same verifier passed **3/3 tests**, exit **0**,
sourceUnchanged **true**, owned verifier group closed **true**. The executable
identity, argv/cwd, complete output and exact artifact refs are preserved in
[verification receipt](task-archive/runs/2/verification.json). A separate read-only
acceptance/receipt audit reconfirmed frozen and current bytes; no post-canary verifier rerun
or second model sequence was performed. No full suite or managed-lane repair was performed.

[Independent verification](independent-verification.json) verifies one Task,
one managed invocation/attempt identity, five unique request IDs, the default
limits and usage math: 2 inference / 2 counts / 1 GET; 12,282 cumulative serialized
API-input bytes; 2 tool calls, 1 read, 1 patch and 370 serialized tool-result bytes.
The existing 12,288-token, 120-second, four-file/64-KiB source, 8-KiB packet,
32-KiB API-input, 24-KiB result and all other tool limits were unchanged.
Retries, continuations, replays, fallback and delivery effects were **zero**.

Final Task state is **READY**, next **ACCEPT**. CLI rendering, TUI snapshot and Web
row share the identical [final projection](projection.txt), including model,
counts, inference-only maximum/cost, unknown full billed cost and verified artifact.
No UI server or browser runtime was launched.

## Credential handling, preservation and cleanup

The authorized file metadata check found a current-user-owned regular non-symlink
file at mode 0600; it read no contents and required no chmod. Only the subsequently
authorized non-interactive subshell read the raw file, silently exported the value,
and immediately exec'd the canary process. No tracing, env file, command argument,
parent-process environment modification, trimming, prefix inspection, key print,
key hash or credential-store access occurred. The child presence check passed.
The downloaded file was not reopened by the canary or audit.

The lane's existing recursive credential guard ran throughout. A separate post-run
pass inspected **91 files** across the disposable repository, Task, Git state and
non-secret execution artifacts using in-memory matching; no secret was found.
The external receipt audit then verified all **38** copied Task files match those
scanned originals. [audit.json](audit.json) records the scan and identities.
The evidence commit contains only scanned copies and non-secret reports.

[Preservation](preservation.json): main/stable heads and tracked bytes/status,
protected package changes, Task #2/#3, LaunchAgent file/binding, editorial schedules,
scheduler installation, all production .work files and the historical delivery
receipt are unchanged. Historical commit `a9d8171` remains in history. No production
write, scheduler action, delivery, push, PR, merge, deploy, release or publication.

The foreground canary process exited normally with code 0. No fixture server,
provider subprocess or background worker was started; verifier group closure and
lock release completed. The disposable repository, managed worktree and non-secret
evidence are retained. [cleanup.json](cleanup.json) records resource disposition.
An evidence-only development commit preserves this result; its exact ID is returned
to the user and resolves with `git log -1 --format=%H --` this report. No amend.
No further canary, milestone or unattended rollout follows.
