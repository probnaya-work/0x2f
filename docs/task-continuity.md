# Continue a persisted Task

Use an authenticated, available harness. `2f new` starts its first run and
immediately prints the persisted Task ID and the exact reopen command:

```bash
2f init
2f new "Investigate a CLI bug" --provider codex
# Created #001: Investigate a CLI bug
# Open: 2f open 1
2f open 1
2f open 1 --run 1
# After the first run finishes:
2f rerun 1 --provider opencode
2f open 1 --run 2
```

Use the ID actually printed in your project. `open` works from a separate
CLI process. `rerun` creates another run on the same Task, preserving prior
results and rebuilding its input from the original intent, recorded notes,
prior outcomes, verification, and changed files. It does not require copying
a chat transcript. A bare `--run` without a number is rejected.

## Observed Codex → OpenCode continuation

On 2026-10-31, one Task in a disposable copy of 0x2F investigated a real bug:
`2f open <id> --run` silently showed the general Task view when the number
was missing. Codex (`gpt-5.6-sol`, existing ChatGPT login) reproduced it,
identified the parser/dispatch mismatch, and persisted its findings in Run 01.
It made no code changes, and its worker and harness process exited before
Run 02 began.

`2f rerun 1 --provider opencode` supplied those saved findings through the
normal per-run prompt. An independent OpenCode ACP session using
`opencode/glm-5.3-flash-free` implemented the dispatch correction and a CLI
regression. No summary or transcript was manually transferred, and no manual
patch repair was made. Both runs reached READY. Independent verification
passed 10 relevant tests, syntax checks, and real Task/run reopening. The
original Run 01 record and artifacts remained unchanged.

[Retained evidence summary](evidence/cross-harness-continuity.json) records
session IDs, artifact hashes, and the observed result. This demonstrates one
successful issue across two harnesses, not universal reliability or unattended
qualification. Codex's default was selected using `--ignore-user-config` in a
local launcher during that run; the supported `CODEX_IGNORE_USER_CONFIG=1`
opt-in now removes that launcher dependency without changing normal defaults.
