# Commands and troubleshooting — 0.2.0

`2f --help` is the command reference. Run commands in the Task's workspace.

| Action | Command / meaning |
| --- | --- |
| Create | `2f new "brief" --provider <id>`; prints the persisted ID and reopen command |
| Inspect | `2f open <id> [--run <n>]`; TUI `r` reads, `i` shows exact saved input |
| Continue | `2f rerun <id> --provider <id>`; prior results, decisions and notes become fresh input |
| Save a constraint | `2f note <id> "text"`; next run only, starts nothing |
| Permission | `2f allow <id>` / `2f reject <id>`; bound to the actual recorded occurrence, where the harness supports it |
| Decision | `2f answer <id> "answer"`; saves context, then rerun to continue |
| Close | `2f close <id>`; DONE, never starts or resumes execution |
| Browser | `2f ui [port] [--no-browser]`; launch/reuse workspace runtime |
| Service | `2f serve [port]`; foreground runtime, useful under systemd/launchd |
| Phone | `2f pair [--port <n>]`; trusted same-LAN control; `2f pair --off` revokes it |

CLOSE is not cancellation. An active worker may finish or remain blocked on a
permission after its Task is closed. Stopping/restarting the runtime also leaves
detached workers running; `KillMode=process` is required under systemd. Do not
use CLOSE as an emergency stop. No new general cancel command is advertised in
this release. Overlap protection refuses a new run while the previous execution
group still exists, including surviving descendants of a crashed worker.

READY is provider completion with a written result. Provider-reported checks,
observed command invocations, independent successful receipts and human
acceptance are separate evidence. A working-tree diff reflects the files at
viewing time, including later edits; it is not an immutable per-run patch.

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
