# Foreground engineering candidate

`2f-next` runs the candidate installed under
`/Users/bogart/Dev/PROBNAYA/work-cli-foreground`. The existing `2f` command and
scheduled editorial installation are separate. No background provider execution
is qualified by this candidate.

In a small, committed local Git repository, approve the input files, writable
scope and deterministic check once. For example:

```sh
2f-next init --files src/task-id.mjs,test/task-id.test.mjs \
  --write src/task-id.mjs \
  --check '["/opt/homebrew/Cellar/node/26.11.1/bin/node","--test","test/task-id.test.mjs"]'
2f-next new 'Reject partially numeric task IDs while preserving the API.'
2f-next open 1
2f-next tui
2f-next ui
```

Use the resolved absolute verifier executable and real file names for your
repository. `node -p process.execPath` prints the installed Node binary path;
the existing verifier policy refuses symlink executables.
Existing `.work/engineering.json` is never overwritten by init. Constraints are
saved there through the existing engineering policy; no provider/model choice is
needed. The task gets its own worktree from the configured ref (`HEAD` for new
setups); uncommitted caller edits are not carried into it. The repository must
meet the existing small-inventory limits. Larger or sensitive scope stops at
NEEDS YOU, without opaque fallback.

`new` authorizes one foreground attempt. 0x2F selects the existing qualified
`gpt-5.4-mini-2026-03-17` Responses lane. It permits at most two inference
requests, two token counts, one availability GET, six tool calls, four reads,
one patch, four input files, two writable files, 64 KiB source, 8 KiB packet,
4 KiB/read, 24 KiB total tool results, 32 KiB serialized API input, 12,288
inference tokens and 120 seconds. The external verifier has its existing five
second/output cap. No agent-owned shell, verifier, network tool or Git action.

Published billable inference maximum: **$0.024576**. Control requests: **3
maximum, no separate published fee**. Complete billed cost remains unknown.
Existing fresh-price/model/ownership/budget checks still apply; stale pricing
stops execution rather than assuming yesterday's price. No pricing refresh or
additional live call was added in this rollout.

The Task, request intents/receipts, exact artifacts, checks and usage are durable
under `.work/tasks/<slug>/`; CLI/TUI/Web use the same projection. READY means a
verified patch in the task-owned worktree. It does not accept, commit, deliver or
publish it. A stopped attempt cannot be replayed or resumed automatically.

## Credential

```sh
2f-next auth status
2f-next auth import
```

Status prints only `configured` or `missing`. Import reads only the fixed
`~/Downloads/openai-api-key.txt`, rejecting symlinks, nonregular files, other
owners or any group/world permissions. It adds the raw bytes to the local macOS
Keychain service `space.0x2f.managed-openai.foreground`, account `openai-api-key`.
It refuses to replace a different existing value. Only exact retrieval
verification permits unlinking the plaintext source. Secret bytes are never
passed in argv, shell commands, environment files, tasks or diagnostics. The
foreground executor retrieves only after eligibility, budget and authorization
checks; background creation stops before worktree/worker dispatch and retrieval.
The ordinary managed route uses Keychain, not Codex login or an environment key.

## Installation and rollback

The dedicated installer refuses an existing `~/.n/bin/2f-next`. It pins the local
Node executable and durable entry path. Remove **only** `~/.n/bin/2f-next` to
disable this candidate; task history, worktrees, existing `2f` and editorial
runtime stay in place. Keep the Keychain entry unless separately revoking it.
An implementation rollback uses a new revert commit; historical receipts stay
intact. No npm publication or LaunchAgent changes are involved.
