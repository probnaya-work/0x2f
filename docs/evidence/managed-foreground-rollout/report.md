# Minimal foreground rollout

**GO — bounded foreground managed small tasks on this Mac.**
**NO-GO — unattended managed provider execution.** Opaque execution remains
outside the bounded guarantee.

Implementation: `351c74c1966a9b391173f3efb6db45725b95ad19`. Historical
`a9d8171` and accepted live-canary `bcd18e6` remain ancestors, without amend.
This rollout made **zero additional live provider requests**.

## User flow

The durable runtime is `/Users/bogart/Dev/PROBNAYA/work-cli-foreground`.
`/Users/bogart/.n/bin/2f-next` pins its foreground entry and the local Node
executable. Existing `2f` was not replaced. In a small committed repository,
approve file/write/check constraints using the existing engineering policy
(`2f-next init --files … --write … --check '<JSON argv>'`), then:

```sh
2f-next new "<task>"
2f-next open 1
```

No model, harness, provider or routing selection is required. The existing
small-task policy routes to the single qualified managed Responses model
`gpt-5.4-mini-2026-03-17`; ineligible scope stops at NEEDS YOU. CLI/TUI/Web
share route, requested/observed model, limits, usage, checks and outcome.
No fallback, automatic retry, continuation, replay or delivery was added.

## Credential

Dedicated macOS Keychain service: `space.0x2f.managed-openai.foreground`;
account: `openai-api-key`. Status: **configured**. Raw source
`~/Downloads/openai-api-key.txt` was removed only after native storage and
exact retrieval verification. Safe status is `2f-next auth status`.

The source must be regular, non-symlink, current-user-owned and private.
A different pre-existing Keychain value is not overwritten. No credential
value is carried in argv, environment files, task state, logs or reports.
Only authorized foreground dispatch retrieves it after eligibility, ownership,
budget and price checks. Background managed creation stops before dispatch;
workers, recovery and schedules have no managed credential call path.
Independent retrieval and secret scanning are recorded in `credential-audit.json`.

## Evidence and checks

- One full suite: **982 tests, 863 pass, 119 native skips, 0 failures**;
  native LaunchAgent tests disabled. No full-suite repeat.
- Final targeted checks: 6 policy/credential/source regressions and 7 CLI,
  credential and legacy-CLI checks pass. `npm run check` exits 0; strict checks
  separately verify exit codes for 213 JavaScript and 9 Python files.
- One durable-command rehearsal: one Task, managed model selected, task-owned
  worktree created, NEEDS YOU / `managed_api_key_missing`; **0 availability,
  0 token-count, 0 inference requests**, no patch or delivery. An isolated mock
  reports a missing Keychain entry and forbids fetch. CLI/TUI/Web projections
  match. Retained repository: `/private/tmp/0x2f-foreground-rollout-rehearsal-6vojoahm/repo`.
- Initial setup refused a symlink verifier before Task creation. Using the
  resolved executable satisfied the existing policy. Only the documentation
  example changed after the final suite; runtime code did not change.
- Real live proof remains the accepted `bcd18e6` canary: READY, one attempt,
  1 availability + 2 counts + 2 inference requests, 1,161 input / 0 cached /
  202 output / 0 reasoning / 1,363 total tokens; calculated inference $0.00177975.
  No additional live canary was started by this phase.

The unchanged envelope is one attempt, 2 inference + 2 counts + 1 availability,
12,288 inference tokens, 120 seconds, 4 inputs, at most 2 writable files,
64 KiB source, 8 KiB packet, 6 tools, 4 reads, 1 patch, 4 KiB/read,
24 KiB results and 32 KiB serialized API input. Deterministic verification
runs outside the model loop with its existing timeout/output limits.

Published billable inference maximum: **$0.024576**.
Control requests: **3 maximum, no separate published fee**.
Complete billed amount and contractual zero control fees remain unproven.
Existing 24-hour pricing freshness, small-inventory and ownership checks still
fail closed. Unsupported scope does not receive an opaque fallback.

## Preservation and rollback

Production/stable tracked bytes, protected package modifications, all production
Tasks (including #2 and #3), prior evidence/receipts, LaunchAgent configuration,
schedule and runtime bindings are preserved. The existing scheduler naturally
woke once (run counter 136 → 137), updating only `scheduler.log` and
`scheduler/health.json`; no tick/repair/recovery/kickstart was invoked here.
Read-only health remains healthy. See `preservation.json`.

Remove only `/Users/bogart/.n/bin/2f-next` to disable the candidate; history,
artifacts and the original installation remain. Revert implementation with a
new `git revert 351c74c1966a9b391173f3efb6db45725b95ad19` commit if desired.
No OAuth, extra provider, generic credential framework, architecture expansion,
automatic delivery, scheduler rollout or publication was implemented.

Next product step: one user-authored small Task through the installed terminal
flow, under a separate explicit foreground invocation. It was not started.
