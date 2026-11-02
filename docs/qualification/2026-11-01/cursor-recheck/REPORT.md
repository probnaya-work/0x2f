# Cursor compatibility recheck — 2026-11-01

Historical pre-login observation. After the user completed Agent login, the
[subsequent real chain](../cursor-live/REPORT.md) passed; that later evidence
supersedes this report's authentication-blocked state without changing its probes.

**Current result: BLOCKED ON CLI AUTHENTICATION. Cursor CLI is installed; ACP
startup is confirmed.** The initial missing-Agent result below was superseded
by a direct test through the installed `cursor agent` entry point. The distinction
matters: editor CLI availability and Agent CLI authentication are separate checks.
The conditional Codex → Cursor → Codex chain has not run.

## What was found and what changed

The existing [Cursor manifest](../../../../examples/providers/cursor.json) uses
`["agent", "acp"]`. At **23:26 UTC**, `agent` / `cursor-agent` were absent from
PATH and checked standard locations: all eight version/status/headless-help/ACP
spawns returned ENOENT. The fresh installed 0x2F package refused Cursor before task
creation. This phase remains in [inventory](evidence/inventory.json) and
[installed preflight](evidence/installed-preflight.json); it is historical evidence,
not the final machine state.

After the user requested a broader check, an interactive `zsh -lic` resolved
`cursor` to `/opt/homebrew/bin/cursor`. Its symlink points to
`/Applications/Cursor.app/Contents/Resources/app/bin/cursor`. Actual version/help
reports editor CLI **3.26.13**, commit
`3bfec373749d3d4a53a151283022d49743ab50b0`, arm64, including the `agent` subcommand.
The earlier conclusion did not sufficiently distinguish this installed CLI from
the missing executable required by the manifest.

At approximately **23:28 UTC**, the ordinary command
`/opt/homebrew/bin/cursor agent --version` printed:

```text
cursor-agent not found, installing via https://cursor.com/install ...
2026.10.22-27dcf5f
```

**The wrapper performed an official Agent installation.** This was not a
pre-existing Agent binary, and it is not described as one. It created `agent` and
`cursor-agent` symlinks under `~/.local/bin`, pointing to
`~/.local/share/cursor-agent/versions/2026.10.22-27dcf5f/cursor-agent`.
The Agent version was then directly verified again. Neither login nor credential
extraction/migration was performed. No model or separately billable request was made.
The globally installed **0x2F** executable was not replaced.

[Post-bootstrap verification](evidence/post-bootstrap-verification.json) records
the wrapper route, exact executable path/hash, version, normal installed-package
provider discovery, and current auth/ACP result. The read-only inventory helper
now checks discovered standard executable paths explicitly, so missing PATH
configuration alone cannot be mistaken for an absent Agent binary.
[Interactive-shell resolution and symlink metadata](evidence/extended-discovery.json)
are saved separately. The editor CLI symlink's recorded mtime is 23:26:41 UTC;
the original inventory preceded it at 23:26:17 UTC. This records an environment
change rather than retroactively claiming that the original PATH probe saw it.

## Actual headless, ACP and authorization results

- [Agent version](evidence/post-bootstrap-version.json): **2026.10.22-27dcf5f**, exit 0.
- [Agent help](evidence/post-bootstrap-help.json): local `--print`, output formats,
  force/sandbox and resume options are present. A successful model request in
  print mode was **NOT RUN**.
- [ACP help](evidence/post-bootstrap-acp-help.json): actual `agent acp --help` succeeds.
- [Existing CLI auth status](evidence/post-bootstrap-status.json): exit 0 but text
  **`Not logged in`**. Exit 0 alone is not an authentication pass.
- [Real ACP protocol exchange](evidence/post-bootstrap-acp-preflight.json):
  `initialize` succeeds with protocol version 1 and `cursor_login` auth method.
  Actual `session/new` fails with **-32000 / Authentication required** and says:
  `Please run 'agent login' first, then call authenticate() with methodId 'cursor_login'.`
  No `session/prompt` was sent; **0 inference requests**.
- The post-bootstrap inventory's bare `agent acp` probes had no JSON-RPC input
  and were stopped at their timeout while waiting. Those timeouts are not used
  as startup failures; the explicit protocol exchange above establishes startup.
- `loadSession: true` was advertised, but `session/load` was **NOT EXECUTED**.
  Native resume therefore remains **NOT RUN**. No real permission scenario occurred.
- Codex CLI **0.166.0** still reports the existing **ChatGPT login**. The first
  Codex engineering run was not started after Cursor's auth prerequisite failed.

The existence of the Cursor application and its account session does not establish
usable Agent CLI auth: the actual CLI status and ACP response show that this
Agent process cannot use an existing CLI login. No credential file contents or
keychain values were read. The next prerequisite is the normal `agent login`
flow under the user's existing account, followed by another actual auth/session
check; this test did not silently start a new login.

The vendor documents [ACP](https://cursor.com/docs/cli/acp),
[headless mode](https://cursor.com/docs/cli/headless), and
[CLI authentication](https://cursor.com/docs/cli/reference/authentication).
The observed status/protocol outcomes above take precedence over capability
claims inferred from documentation.

## Corrected installed 0x2F package

A fresh **0x2f@0.1.4** package was packed from source
`803ba49d00463d2f9e5355c684514ade790a40ff`, including faithful-return, portability,
corrected Cursor onboarding and the latest responsive trace/typography fixes.
All **74 src files** matched source and installation byte for byte and were then
independently rehashed.

[Tarball](evidence/0x2f-0.1.4.tgz), SHA-256:
`f903f7f966efb336f916c386ea457d3ee079e1813e606cfd06b733f8b4796747`.

Installed CLI:
`/Users/bogart/Dev/PROBNAYA/cursor-compatibility-recheck-20261101/installed/bin/2f`.
Scratch workspace:
`/Users/bogart/Dev/PROBNAYA/cursor-compatibility-recheck-20261101/workspace`.

Pack/install used offline npm, isolated npm HOME, empty configs, no inherited
credentials and disabled install scripts. Installed `2f init` generated a Cursor
example identical to the checked-in manifest. Before bootstrap, `2f providers`
reported unavailable and `2f new ... --provider cursor` refused before creating a
task. **After bootstrap**, the scratch manifest was configured with the discovered
absolute Agent path, without changing user shell settings. The same installed
`2f providers` now reports **cursor / acp / yes**. This means executable
availability; the independent ACP auth check still fails. Task count remains **0**.

## Scenario matrix

| Check | Current observed result |
| --- | --- |
| Cursor editor CLI | **PASS**, 3.26.13 via actual symlink |
| Cursor Agent binary version | **PASS**, 2026.10.22-27dcf5f after official wrapper bootstrap |
| Headless interface discovery | **PASS** for actual help; model execution **NOT RUN** |
| ACP initialize | **PASS**, actual JSON-RPC exchange |
| Existing Agent CLI authorization | **FAIL / Not logged in** |
| ACP session creation | **BLOCKED / Authentication required** |
| Installed 0x2F Cursor executable discovery | **PASS**, cursor / acp / yes with absolute local manifest |
| First Codex engineering run | **NOT RUN** after Cursor auth check failed |
| Saved constraint received by Cursor | **NOT RUN** |
| Previous result / same-file handoff to Cursor | **NOT RUN** |
| Codex independent return | **NOT RUN** |
| Same ID, history, files and context after reopening | **NOT RUN** for this chain |
| Real permission request and resolution | **NOT RUN** |
| Cursor native saved-session resume | **NOT RUN**, advertised support is not execution |

No fixture or other harness is counted as a Cursor result. The earlier real
Codex → OpenCode → Codex result remains separate in the
[compatibility matrix](../../../harness-compatibility.md).

## Verification and reproduction

- [Initial independent package checks](evidence/independent-verification.json).
- [Post-bootstrap verification](evidence/post-bootstrap-verification.json).
- [Syntax checks](evidence/check.txt): passed.
- [Regression suite](evidence/npm-test.txt): **765 / 765 passed**. These are not
  Cursor inference, permissions or native-resume evidence.

Run the inventory helper with `CURSOR_PROBE_PREFIX=post-bootstrap- node
 docs/qualification/2026-11-01/cursor-recheck/inventory.mjs`. It does not install,
login or send inference requests. `probe-acp.mjs` repeats only initialize and
session/new. The earlier `installed-preflight.mjs` is a negative-test snapshot
from before Agent bootstrap and must not be mistaken for the final auth result.

Version remains **0.1.4**. No publication, release or push. The final blocker is
**Agent CLI authentication**, not absence of the installed Cursor application/CLI.
