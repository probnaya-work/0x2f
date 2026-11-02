# Cursor compatibility follow-up — 2026-11-01

Later update: official Agent bootstrap, user login and the
[real Codex → Cursor → Codex chain](../cursor-live/REPORT.md) have now been
observed. This report retains the original pre-installation negative evidence.

**Result: BLOCKED — Cursor Agent executable unavailable.** The conditional live
Codex → Cursor → Codex chain was not started. No fixture or same-model substitute
was used to claim a Cursor result. No model requests, new credentials, Cursor installer,
publication, release or push occurred. Version remains **0.1.4**.

## Actual installed software and access

[Inventory](evidence/inventory.json) records the observation time, PATH resolution,
standard installation candidates and exact version/status/ACP probe outcomes.

- `agent --version`, `agent status`, `agent --print --help`, `agent acp`: **spawn ENOENT**.
- `cursor-agent --version`, `cursor-agent status`, `cursor-agent --print --help`, `cursor-agent acp`: **spawn ENOENT**.
- Neither name resolves in PATH. The normal `~/.local/bin/agent` and
  `~/.local/bin/cursor-agent` files and the checked agent installation directories
  are absent. The app bundle contains the editor launcher, not a discovered Agent CLI.
- The absolute editor launcher successfully reports **3.26.13**, commit
  `3bfec373749d3d4a53a151283022d49743ab50b0`, arm64. Its help describes editor
  operations and an `agent` subcommand; that does not establish ACP readiness.
  The version command exits 0 despite a macOS Electron codesign diagnostic on stderr.
- Reading the launcher showed that `cursor agent` downloads a missing agent via
  the vendor installer and may update it. That command was intentionally not used
  as a read-only probe. The wrapper path/hash and routing are retained in inventory.
- Cursor CLI authentication is **unknown**, not failed: its `status` executable is
  unavailable. No `CURSOR_API_KEY` or `CURSOR_AUTH_TOKEN` environment variables are
  set. `~/.cursor/agent-cli-state.json` exists; its contents and the keychain were
  not read. File presence and editor login would not prove usable CLI authorization.
- Codex CLI **0.166.0** is executable; `codex login status` reports the existing
  **ChatGPT login**. No Codex inference was needed after Cursor's blocking preflight.

## Corrected installed-package test

The new package was built locally and installed into a separate prefix outside the
source checkout. Its **74 src files matched the checkout byte for byte**, including
the faithful-return, portability, Web-theme and trace fixes and the corrected
onboarding example. Pack/install ran offline with isolated npm HOME, empty npm
configs, no inherited credentials and install scripts disabled. The provider
availability check then used the ordinary installed CLI with the existing host
PATH/environment; no credential values were saved.

[Exact commands, outputs, tarball SHA-256 and source-file hashes](evidence/installed-preflight.json).
[Installed tarball](evidence/0x2f-0.1.4.tgz).

The executable is:
`/Users/bogart/Dev/PROBNAYA/cursor-compatibility-20261101/installed/bin/2f`.
The disposable workspace is:
`/Users/bogart/Dev/PROBNAYA/cursor-compatibility-20261101/workspace`.
The global installation's CLI hash was identical before and after this check.

1. Ran installed `2f --version`: **0.1.4**.
2. Ran installed `2f init`; verified its generated Cursor example matches the
   checked-in manifest, then copied that manifest to `.work/providers/cursor.json`.
3. Ran installed `2f providers`: **cursor / acp / no**.
4. Ran installed `2f new ... --provider cursor`: exit **1**, with:

   ```text
   Execution provider "cursor" is unavailable on this machine.
   Expected executable: agent
   Install or configure Cursor, then retry.
   ```

5. Independently inspected `.work/tasks`: **0 before, 0 after**. No task or run was
   created, no worker or model was launched, and no fallback provider was selected.

## Scenario matrix

| Requested scenario | Actual result |
| --- | --- |
| Cursor executable version | **BLOCKED**: no Agent CLI executable; editor version reported separately |
| Working headless/ACP startup | **BLOCKED**: `agent acp` cannot spawn |
| Existing Cursor authorization | **NOT VERIFIED**: `agent status` cannot spawn |
| First Codex engineering run | **NOT RUN** after the Cursor prerequisite failed |
| Saved additional constraint delivered to Cursor | **NOT RUN** |
| Cursor receives prior result and edits the same files | **NOT RUN** |
| Codex independent return | **NOT RUN** |
| Same ID/history/files/context after reopening | **NOT RUN** for this chain |
| Actual permission request + allow/reject | **NOT RUN** |
| Cursor native saved-session resume | **NOT RUN** |
| Real unavailable-provider admission through installed 0x2F | **PASS**, no task created |

## Confirmed product documentation defect

The checked-in `examples/providers/cursor.json` and README already used
`["agent", "acp"]`, but `2f init` still generated `["cursor", "--acp"]` and
`docs/development.md` repeated that stale example. Corrected those two places and
strengthened the existing onboarding regression to compare its complete manifest
with the authoritative example. The package admission test above checks the actual
installed result. This is a local onboarding correction, not an agent-performed
engineering run or evidence of Cursor compatibility.

The examples now distinguish vendor-documented commands from observed live
qualification. The [compatibility matrix](../../../harness-compatibility.md) and
older platform matrix link this new blocked observation without rewriting earlier
live or deterministic API observations.

## Vendor documentation versus observation

Cursor documents [ACP over stdio](https://cursor.com/docs/cli/acp),
[headless print mode](https://cursor.com/docs/cli/headless), and
[existing-login status](https://cursor.com/docs/cli/reference/authentication).
These references support the command choice only. Permissions and saved-session
interfaces described by the vendor were not exercised here and are not passing
cells in the matrix.

## Verification and reproduction

[Independent evidence checks](evidence/independent-verification.json) re-read all
eight failed Agent probes, the installed-package refusal, the empty task store,
the tarball digest, all 74 source/installed file hashes and the unchanged global CLI.

- [Syntax checks](evidence/check.txt): `npm run check` **passed**.
- [Full regression suite](evidence/npm-test.txt): `npm test` **763/763 passed**. These regression fixtures are not Cursor live evidence.
- `node docs/qualification/2026-11-01/cursor-followup/inventory.mjs` repeats the
  read-only probes. It does not call the editor's installing agent route.
- `node docs/qualification/2026-11-01/cursor-followup/installed-preflight.mjs`
  builds/installs this checkout and repeats the unavailable-provider gate. It
  refuses to continue that negative test if `agent` has become available.

The blocker is the missing manifest executable, not a demonstrated account or
subscription failure. Repeating the requested chain requires an actual available
Cursor Agent CLI and a successfully verified existing CLI login. This report does
not infer either from the installed editor.
