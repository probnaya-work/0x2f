# Quickstart — prepared 0.2.0

Publication is pending npm authorization (401). The version below is the
prepared target; stable npm latest remains0.1.4 until release.

Use macOS or Linux/POSIX, Node.js ≥20, npm, and an installed coding harness.
The harness owns its authentication and model access; 0x2F has no account.

```sh
npm install -g 0x2f@0.2.0
2f version
cd /path/to/your/repository
2f init
2f providers
2f new "Investigate the retry boundary; preserve the public API" --provider codex
2f open 1                    # use the actual ID printed above
2f tui                       # existing dark default; --light selects light
2f ui                        # local browser, loopback only
```

Select a harness actually installed and authenticated on this machine. Codex is
an example, not a prerequisite. OpenCode is built in through `opencode acp`.
Cursor needs its separate Agent CLI, login and the
[project manifest](../examples/providers/cursor.json): copy it into
`.work/providers/cursor.json`, then check `2f providers`. The Cursor editor app
alone does not establish CLI access.

A Task persists intent; a Run is one execution; a Session is the harness's own
execution record. READY means a result is available for review. It does not mean
independent tests passed. Read the saved result and Verification; inspect the
actual files. The TUI reader (`r`, then `i` for exact saved input) handles long
requests/results and previous runs (`[` / `]`).

```sh
2f note 1 "Preserve the command-line interface"
2f rerun 1 --provider opencode
2f open 1 --run 2
2f close 1
```

Notes are included in the next run's input, including notes saved while another
run is working. They do not reach that already-running worker. Rerun keeps the
Task ID/history and creates a fresh provider session. This is task-context
handoff, not native session resume. Runs of a Task cannot overlap.

Web, phone and pairing screens offer Light / Dark / System in SETTINGS. System
is the initial default; the preference is saved on that browser origin. Theme
initialization runs before styles to avoid a wrong-theme first paint. TUI theme
selection is unchanged.

See [commands and troubleshooting](usage.md), [host setup](host-setup.md),
[remote control](remote-control.md), [compatibility](harness-compatibility.md),
and [remaining work](roadmap.md).
