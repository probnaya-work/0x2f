# Installed Linux AI qualification controller

The controller imports product modules only from the explicitly installed package.
Its positional interface remains:

```
node installed-live.mjs ABS_PACKAGE ABS_NEW_PRIVATE_ROOT linux [options]
```

The private root must not exist. A pre-existing root is refused without replacing
its evidence. Choose a unique qualification-only systemd unit and unused port.
Never use the production unit. The original Mac route remains Cursor then Codex;
the Linux default remains OpenCode ACP.

Linux options:

- `--linux-provider opencode`: existing default ACP integration.
- `--linux-provider opencode-free --model opencode/glm-5.3-flash-free`:
  stock installed OpenCode command transport with explicit free model. The actual
  catalog must list that model; this name is a recorded candidate, not a promise
  of current availability or quota. Per-run `--auto` permits the bounded fixture's
  file/check operations without changing global permissions.
- `--linux-provider codex`: the installed native Codex integration, using ChatGPT
  login performed on that Linux host. Optional `--model` selects a model already
  available to that account. No API key is accepted by this qualification route.
- `--unit 0x2f-qualification-UNIQUE` (lowercase suffix), `--port PORT`.
- `--timeout-ms 300000`: each AI completion wait is bounded, maximum600000.
- `--tarball ABS_TGZ`: require canonical SHA256
  `4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626`
  and byte-for-byte equality of every archived package file with the installed
  package before creating a Task or starting a service.

Start the controller detached from SSH with its log in a private directory.
For Codex, remove OPENAI_API_KEY and CODEX_API_KEY from the controller's environment;
use ordinary workspace-write sandboxing and stock on-host ChatGPT authentication.
Never copy the Mac auth cache or put grants, auth artifacts, session logs or raw
receipts into Git.

Both Linux runs use the selected provider on the same Task. Run2 is a **fresh
session continuation**, not native resume. The controller still requires note
creation while run1 works, restart of its own runtime while preserving the live
worker, independent configured checks (11base assertions then7additional), exact
input hashing, delivery of note/current rules, and immutable first-run patch.
It stops its own unit before quiescent backup/restore, independently checks the
restored checkout, verifies no restored execution authority/replay and original
task bytes unchanged, and requires the production service to remain active.
Configured-check success does not create ACCEPT. Model understanding is not
inferred from delivery receipts. Failed provider output does not pass the gate.

An external quota/auth/network failure is retained as an exact failure. Do not
loop retries, add paid providers or lower the assertions to obtain a pass.

## Verified Codex setup on this Lenovo

Codex CLI0.166.0 was installed with the official Linux standalone installer and
authenticated directly on Lenovo through ChatGPT device login. No Mac auth cache
was copied and no API key was used. The first Codex attempt failed its independent
check because tools could not start under the bundled bwrap: loopback/uid-map
permission errors left words.mjs absent. That failed attempt is retained as such.

The host is Ubuntu26.04.1. Its AppArmor restriction stays enabled; the standard
bwrap profile already existed. The owner installed only the distribution
bubblewrap package (0.11.1 runtime) following the
[official Linux sandbox setup](https://learn.chatgpt.com/docs/sandboxing).
No global sysctl, AppArmor disable, legacy sandbox or full-access bypass was used.
A deterministic preflight proved writes within its disposable workspace,
refusal of a write to a sibling sentinel, and a separate network namespace.
The working command interface for this CLI is:

```
codex -c sandbox_mode=workspace-write sandbox -- /usr/bin/true
```

The subsequent full controller run uses the unchanged native adapter and ordinary
workspace-write policy, network_access=false. The setup repair changes the host
CLI dependency, not the canonical package or the independent assertions.
