# Commands and troubleshooting — 1.1.0

> **1.1.0**: [release scope and upgrade/rollback](releases/1.1.0.md) and
> [execution/isolation/context contracts](engineering/2026-11-02/FOUNDATIONS.md).

`2f --help` is the command reference. Run commands in the Task's workspace.

Open `2f tui`, press `n`, type or paste the task, choose a provider with
Tab / Shift+Tab, then press Enter to start one task. Paste and its line breaks
never submit. The selected provider shows executable discovery, not sign-in
or model authorization; those belong to the harness.

Use arrows, Home/End and Delete to edit; Ctrl+N inserts a newline (Shift+Enter
also works where the terminal distinguishes it). PgUp/PgDn reviews a long
draft while START remains visible. Esc keeps a new-task draft in the current
TUI session; an unsent draft is not persisted across exiting the TUI.

F1 (or Ctrl+G) opens scrollable help from any text field without losing the draft. For
notes and answers it also shows the complete draft, and failed actions retain
their full error there. Esc returns to the previous view. `r` reads saved
results, `d` shows changes, `s` requests cancellation, and `q` detaches while
runs continue. The minimum interactive size is 60×18; 80×24 and larger are
the main review sizes. Below the minimum, task actions are disabled until
resize; q / Ctrl+C still exit.

The task pane puts the reported conclusion, changed files and reported checks
together. These checks are the provider's claims; `r` opens the complete saved
report and recorded command evidence. Long command output follows the written
result. Highlighted keys and neutral action labels use the same styling across
the composer, task actions, help, search and review screens.

| Action | Command / meaning |
| --- | --- |
| Create | `2f new "brief" --provider <id>`; prints the persisted ID and reopen command |
| Inspect | `2f open <id> [--run <n>]`; TUI `r` reads, `i` shows exact saved input |
| Preview | `2f preview <id> [--provider <id>]`; inspect the next input and use its printed guarded start command |
| Continue | `2f rerun <id> [--provider <id>] [--preview <preview-id>]`; direct CLI rerun remains available |
| Save a constraint | `2f note <id> "text"`; next run only, starts nothing |
| Permission | `2f allow <id>` / `2f reject <id>`; bound to the actual recorded occurrence, where the harness supports it |
| Decision | `2f answer <id> "answer"`; saves context, then rerun to continue |
| Close | `2f close <id>`; DONE, never starts or resumes execution |
| Cancel | `2f cancel <id>`; stop the current execution and retain partial work; wait for its receipt |
| Browser | `2f ui [port] [--no-browser]`; launch/reuse workspace runtime |
| Service | `2f serve [port]`; foreground runtime, useful under systemd/launchd |
| Phone | `2f pair [--port <n>]`; trusted same-LAN control; `2f pair --off` revokes it |

Local Web and TUI continuation opens a preview before starting. Enter in a
correction or answer editor reviews the draft; another Enter in the preview
starts the guarded run. Escape returns to the draft, `u` refreshes in TUI.
A stale review refuses without starting. [Full preview behavior](continuation-preview.md).

CLOSE is not cancellation. An active worker may finish or remain blocked on a
permission after its Task is closed. Stopping/restarting the runtime also leaves
detached workers running; `KillMode=process` is required under systemd. Do not
use CLOSE as an emergency stop. Use `2f cancel <id>` to request cancellation,
then inspect the recorded outcome. Overlap protection refuses a new run while the previous execution
group still exists, including surviving descendants of a crashed worker.

READY is provider completion with a written result. Provider-reported checks,
observed command invocations, independent successful receipts and human
acceptance are separate evidence. The TUI changes view uses saved run change
evidence where available; legacy tasks without a saved patch may fall back to
the current working-tree diff, which can include later edits. The view labels
that source. `2f changes <id> [--run <n>]` reads the saved immutable run patch;
`2f apply <id>` explicitly transfers isolated changes.

| Symptom | Action |
| --- | --- |
| Provider says unavailable | Check PATH in the execution user's service environment, not just your interactive Mac shell |
| Binary exists but run fails on auth/model | Use that harness's supported login/configuration on the execution host; do not copy another machine's credential files |
| Cursor app works but ACP fails | Check `agent --version`, `agent status`, and `agent acp`; see compatibility evidence |
| Codex forces an inaccessible user-config model | Optionally use `CODEX_IGNORE_USER_CONFIG=1`; authentication remains in Codex's own store |
| Rerun refuses previous execution group | Inspect its processes; do not delete locks or run state to force another execution |
| New note does not change the current worker | Expected: it is saved for the next run; inspect that run's `runs/<n>/prompt.md` |
| Phone ALLOW disabled | Recorded remote operation scope is incomplete; inspect locally or reject; scope is not inferred from a shortened label |
| Browser fails after runtime restart | Reload the same origin to receive its current local authentication cookie |
| Supervised pairing waits or fails | Inspect the service logs; supervisor must restart it. Pairing must not spawn a competing detached runtime |
| Offline verifier reports ENOTCACHED | Supply an explicit public cache populated with all public dependencies. Never supply a credential-bearing HOME/config copy |

[The portable verifier](implementation/faithful-return-2026-11-01/README.md) runs
without inherited credentials, checks the installed version against the checkout,
compares source bytes and drives the installed TUI on a real PTY. Native-CLI
integration cases can skip on its isolated PATH; those skips are not live-provider
qualification.
