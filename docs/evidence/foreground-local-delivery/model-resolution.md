# Foreground model resolution

Read-only inspection of installed `codex-cli 0.149.1` found the incompatible
`gpt-6.1-sol` in the existing user `config.toml`, top-level `model`, line 2. It did
not come from an engineering task flag. No credentials or configuration changed.

Commands: `codex --version`, `codex --help`, `codex exec --help`,
`codex app-server --help`, read-only extraction of model assignment scope, and
`codex login status`. All inspection commands were local; no inference request
was made during diagnosis. Login confirmed existing ChatGPT authentication.

The installed exec help explicitly supports `--ignore-user-config`: skip user
config while auth still uses the existing CODEX_HOME. Exec exposes no reliable
account entitlement list in its help. App-server catalog presence alone would
not prove account entitlement. Resolution therefore delegates model choice to
the installed CLI's default; no alternative model string is guessed, no product
name is translated and no registry/optimizer is added.

Foreground now requires the installed help to support that option, pins the
resolved executable and passes no `-m`. Explicit ChatGPT authentication,
workspace-write sandbox, no additional writable roots and disabled shell network
access remain. Ordinary adapter behavior and detached worker qualification are
unchanged. Managed/admin policies and exec rules are not disabled.

Targeted verification: 25/25 adapter/foreground fixture tests, exit 0. These are
not the real smoke. Installed default compatibility remains a live verification
question, and no unattended GO follows from this resolution.

Configuration reference: https://learn.chatgpt.com/docs/config-file/config-basic
The actual option claim comes from the pinned installed binary's help; capability
maps have not been rewritten from documentation/help inference.

Rollback: revert the model-boundary commit. Existing task evidence and user auth
remain untouched.
