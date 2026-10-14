# Local workflows in 0x2F

## What exists

Workflows are additive metadata on ordinary tasks. They use the same detached
worker, normalized events, task statuses, cancellation and per-run history as
CLI, TUI and Web. `.work/tasks/<slug>/task.json` and `events.jsonl` retain their
published paths and atomic state writes. No second task database or daemon was
introduced. A local workflow provider is registered only in configured
workspaces and is excluded from ordinary AUTO routing.

The workflow definition, version and digest, settings, and editorial materials
are snapshotted on the task. Each run also saves `workflow-definition.json`.
Changing workspace configuration affects new tasks; it does not silently change
an existing review. Completed source collection is a checkpoint. A rerun uses
that exact evidence instead of finding different material midway through review.
Results and artifacts are retained per run; the task-level artifacts are the
current package.

Core owns trigger keys, atomic reservations, a single active workflow run,
schedule state, shared decisions, and interrupted-run recovery. Two distinct
manual starts without a key are distinct intents. The same supplied key replays
the original task, including after process restart or failure. Retry that task
with `rerun` rather than using another trigger key. Ordinary tasks do not count
against the workflow slot. Review waits do not occupy the execution slot.

## Local installation and operation

Use the checkout CLI for these new commands; the globally installed npm release
has not been updated by this change. From `work-cli-v0`:

```sh
node src/cli.mjs init                       # only if .work does not already exist
node scripts/setup-editorial.mjs .          # refuses to overwrite existing settings
node src/cli.mjs workflow run probnaya-editorial my-trigger
node src/cli.mjs open 2                     # replace 2 with the returned id
node src/cli.mjs tui
node src/cli.mjs ui
```

Editorial produces up to three real topics. Commit selection reads only the
explicit files in configured repositories, within the lookback window. Feature
and fix commits can become conservative factual drafts; configured topic rules
supply more specific text and diagrams. Generic drafts quote the actual subject
and disclose that public release was not verified. No LLM inference or paid text
call is used in v1. Existing investigations are context unless an explicit rule
selects a new change. Explicit topic keys from the versioned publication history
are excluded alongside previously proposed task topics. Published Observations are eligible only within the
lookback window and their source content is preserved unchanged. Private drafts
and correspondence are excluded. This is deliberately conservative, not an
editor that can reason about any arbitrary change.

`previewFirstTopic` is disabled by default. New runs prepare topic drafts and
wait for an explicit user selection before preparing a visual/repost. Enabling
this optional setting creates a provisional visual/repost for the leading topic. This is labelled **proposed
preview**, not a user selection or approval. A complete package means the local
assets are present and structurally checked; it does not mean the typography,
text or publication has been approved.

## Review and decisions

All decisions use the existing shared `answerWork` action (CLI `answer`, Web
ANSWER, TUI SAVE ONLY or ANSWER & CONTINUE). Topic numbers refer to this task's
frozen evidence. Examples:

```sh
node src/cli.mjs answer 2 'select 2'
node src/cli.mjs rerun 2                     # creates topic 2 visual/repost
node src/cli.mjs answer 2 'changes 2 PROB–2026.10.14 ...full replacement post...'
node src/cli.mjs rerun 2
node src/cli.mjs answer 2 accept
node src/cli.mjs answer 2 'published https://www.linkedin.com/posts/...'
node src/cli.mjs close 2
```

`changes N` keeps the user's full replacement text verbatim; it does not ask a
model to reinterpret it. Free-text notes/corrections are saved as context, but
v1 does not interpret editing instructions such as “make it warmer”. Use the
explicit replacement form. A content change invalidates prior acceptance until
a new package is produced and accepted. User corrections need human fact review;
the tool cannot automatically establish whether a newly authored claim is true.

`accept` accepts the current complete package digest. `defer` and `reject`
record their decisions; close the task when it should leave active attention.
A later `answer <id> select N` reopens even a closed editorial review.
Publication confirmation can also be recorded after closing; its accepted digest
and link remain in the publication history.
Accepted/deferred/rejected tasks refuse execution until a new select/changes
decision is recorded. TUI and Web apply accept/defer/reject/published without starting another run;
select/changes can continue into package preparation. Acceptance and publication are separate
facts. `published <https URL>` records the user's confirmation and link after
acceptance; it neither contacts nor verifies LinkedIn. No external publication,
commit, push, PR, merge or deployment is authorized by a content decision.

```sh
node src/cli.mjs cancel 2                   # stop the active run, preserve history
node src/cli.mjs rerun 2                    # continue from saved checkpoints
```

A missing worker is marked failed through the existing recovery sweep; a
workflow action performs that sweep before taking an execution slot. Recovery
does not secretly retry. An early cancel before the worker installs its signal
handler is finalized by the shared cancel action. SIGKILL/power loss can leave a
trusted local adapter process orphaned until it exits; after a host reboot it
cannot remain alive. A new invocation still does not repeat a paid image call.

## Files and permissions

Use `node src/cli.mjs workflow refresh <task-id>` to explicitly adopt revised
settings for an existing review, then rerun. This archives its prior definition,
keeps the original evidence and prior run artifacts, and invalidates acceptance.
Ordinary rerun never silently refreshes the definition.

Versioned defaults are in `examples/workflows/probnaya-editorial/`. Active local
settings are in `.work/workflows/probnaya-editorial/`:

- `workflow.json`: source list, explicit file allowlists/read permissions,
  project statuses, topic rules, visual fonts, adapters and run limits.
- `template.md`: the user-provided official-post structure. Its provenance is
  explicitly distinct from an exact historical approved template.
- `rules.md`: fixed editorial and publication rules, never modified by a run.
- `examples.md`: nine user-supplied past visual publications; exact LinkedIn caption texts remain absent.
- `history.json` and `references/`: original image bytes, hashes, figure dates,
  confirmed past-publication status and explicit topic coverage.
- `visual-reference.md`: observed frame, typography and layout requirements.

Increment the definition version when changing these materials. Local `.work`
settings are private/ignored; keep non-sensitive reusable defaults in the
versioned example directory. Never copy credentials into either configuration.

Artifacts under `tasks/<slug>/artifacts/editorial/` include `sources.json`
(file snapshots and commit evidence), `topic-N.txt`, `review.md`, `package.json`,
`visual-spec.json`, `visual.png`, its hash receipt and `personal-repost.txt`.
Each completed review run copies that package to `runs/<n>/artifacts/editorial/`.
Prior task decisions are included in subsequent packages for review. They are
not automatically promoted into policy or approved examples.

Read access is granted per source id; files are explicit and symlinks cannot
escape the configured repository. Local artifacts are a separate permission.
External changes are disabled. Diagram rendering uses Pillow with local Archivo
and Geist Mono fonts; the mark geometry comes from the approved Surface source.
No image-generation credentials are required for the local diagram path.

The current LinkedIn compositor reconstructs the 4:5 plate family from nine
user-supplied publication images: calibrated edges, laboratory header, datum
rule, figure, metadata rows and bottom title/date. Masters are 2160×2700;
1080×1350 is also supported. Original reference images are never modified.
Diagram content is labelled as implementation, not a measured specimen. New
figure numbers are unassigned; two different supplied publications use FIG 007.
Historical image dates are not inferred LinkedIn timestamps, and historical
platform availability is not used as evidence of present availability.
Observation author words and titles remain unchanged. The five original numbered
plates, HEARD, Chinotto and two Observations establish visual precedent; exact
caption texts are still needed for caption examples.

Optional image generator contract:

```json
{
  "permissions": { "imageGeneration": true },
  "maxAdapterCalls": 1,
  "adapters": {
    "image": {
      "argv": ["/absolute/trusted-image-cli", "--output", "{output}", "--prompt", "{prompt}"],
      "credentialEnv": ["IMAGE_PROVIDER_API_KEY"]
    }
  }
}
```

Configure a topic's `visual.kind` as `generated` and provide its prompt. The
trusted executable writes a PNG to `{output}`. The compositor then adds exact
fonts, date, mark and a synthetic-concept label. Real screenshots are explicit
`visual.kind:image` repository/file pairs. Missing adapter/credentials leaves
the review incomplete. The command interface is a trust boundary, not an OS
sandbox: installing a command authorizes running that executable; arbitrary
coding harnesses are not used as unattended editorial adapters.

Image attempts are persisted **before** invocation. Completed calls reuse their
asset; a failed, missing or uncertain result is never called again automatically.
This favors preventing duplicate charges over automatic recovery. A replacement
call requires explicit operator repair/new intent. One invocation can still
incur unknown provider charges: command adapters cannot enforce a dollar budget.
The adapter is refused when `maxCostUsd` is set; use a provider-side hard limit
and remove that field deliberately before enabling paid generation. Credentials
remain environment variables, never plist arguments or saved tool output. The
LaunchAgent intentionally does not embed or provision image credentials.

`maxDurationMs` bounds each workflow run (including review preparation, excluding
human waiting). Adapter subprocess groups are killed on abort, their output is
bounded, and errors do not expose stderr. Default diagrams have zero API cost.
New workflow workers use launch tokens and birth identity. Legacy live PIDs are
not silently adopted; see the explicit recovery policy.

## Scheduling on this Mac

Enable only after a real manual package and checks:

```sh
node src/cli.mjs workflow schedule probnaya-editorial enable
node src/cli.mjs workflow agent install
node src/cli.mjs workflow agent status
node src/cli.mjs workflow schedule probnaya-editorial status
node src/cli.mjs workflow schedule probnaya-editorial pause
node src/cli.mjs workflow schedule probnaya-editorial resume
node src/cli.mjs workflow tick               # explicit due-date check
```

State lives in `.work/schedules/probnaya-editorial.json`; default cadence is
once per two **Lisbon calendar days**, at 10:00 Europe/Lisbon, first due two days
after enabling. It is not an elapsed 48-hour timer across DST. Edit `time` only
while paused. Resume preserves cadence and coalesces missed slots to one latest
due date. An active workflow delays the slot; a started task consumes it even if
its adapter later fails. Check `lastError`, `lastSlot`, `lastTaskId`, and
`.work/scheduler.log`. Explicit rerun is the recovery operation.

LaunchAgent `work.probnaya.0x2f.workflow.<workspace-uuid>` invokes `workflow tick` at minutes
00/15/30/45 and at login/load. Date calculation uses Intl's Europe/Lisbon timezone,
independent of the Mac's timezone. The tick never wakes or powers on the Mac.
After sleep, launchd coalesces missed calendar ticks; after shutdown/log-out the
next login invokes a tick. Persisted schedule logic coalesces overdue workflow
slots to one task, without a backlog. Execution is usually within 15 minutes of
the due time while logged in and awake; this is not a precise alarm.

The choice of calendar ticks, rather than relying on StartInterval wake behavior,
follows Apple's [Scheduling Timed Jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html).

Pause suppresses new scheduled tasks; it does not cancel a run already started.
To remove the trigger entirely:

```sh
node src/cli.mjs workflow agent uninstall
```

Uninstall verifies that the workspace's UUID agent stopped before removing its
files. A failed or unverifiable stop leaves the installation available for
inspection. If the checkout or Node moves, verify it and use `workflow agent repair`.

## Adding a workflow; engineering boundary

An additional editorial workflow needs another versioned directory with a unique
id, its source permissions, template and rules; copy it under `.work/workflows`
and call `workflow run <id>`. It reuses all core reservations, schedules and the
same task lifecycle. It has no new engine graph or separate task state.

A new kind needs a handler in `src/workflows/provider.mjs` and corresponding
kind/definition validation in core. The handler consumes the task snapshot,
store, AbortSignal and normalized progress callback, writes artifacts/checkpoints,
and returns the existing ready/needs_you/failed outcome. Keep external-effect
receipts separate from content decisions. Do not add arbitrary dynamic imports
or execute workflow code from untrusted source material.

`examples/workflows/engineering/workflow.json` is an **inactive proposal**.
The engineering executor is deliberately refused, not simulated. Its first
implementation should reserve one workflow slot, create a Git worktree from an
explicit repository/ref, investigate and implement using selected harnesses,
run targeted checks, obtain an independent reviewer, then park on the user's
decision. Every commit/push/PR/merge/deploy requires its own scoped permission and
durable effect receipt. ACP permission decisions already exist, but they are
not sufficient to infer authorization for these later actions. Worktree
ownership, cleanup, independent-review provenance and external-effect semantics
are larger public-contract changes that need a separate implementation review.

No Engineering Loop contract was found in the inspected PROBNAYA working
materials; no corporate context or credentials were imported.

Editorial can already consume an explicit `type:engineering-record` source file.
Its `files` allowlist must include `record`. The record needs completed status,
passed checks, passed independent review, accepted user decision, publicEligible
true and a public evidence URL; otherwise it is excluded. The example
`public-record.json` deliberately has publicEligible false. Never set eligibility
from merely closing a task. Validate the project's public status and cite the
actual published change.

## Observed improvements and next proposals

The real first run exposed an early cancellation race; the common cancel action
now detects startup death. Cross-process trigger reservations and task-id
allocation prevent duplicate tasks when CLI and scheduler arrive together.
Frozen evidence plus per-run artifact copies keep review stable across reruns.
Missing generation access is explicit rather than a false complete package.
These are useful for any recurring report, investigation or engineering loop.

The first three-topic package also showed where small v1 stops: structured
workflow choices are typed into the existing decision surface. A dedicated
choice projection (select/accept/defer/reject, with artifact previews) would
remove the SAVE ONLY/CONTINUE distinction without redesigning the TUI. Propose
that separately before changing the decision contract. A restricted text-model
adapter with validated claim-to-evidence mapping would improve generic draft
quality; it should not inherit an unrestricted project's tools/MCP or pretend
that provider prompts enforce permissions. Engineering worktree/effect management
is the next substantial extension, not part of the current editorial executor.

## Verification

`test/workflow.test.mjs` drives the real CLI and detached worker with isolated
Git repositories and deterministic adapter fixtures. It covers concurrent
identical triggers across processes, decision waiting, exact corrections,
acceptance/publication separation, no-material results, cancellation, adapter
failure, duration limits, worker crash/restart and saved evidence, paid-call
receipts, DST/coalesced missed slots and pause/resume. These supplement the
repository's required `npm run check` and full `npm test`, including its existing
TUI PTY tests. The actual PROBNAYA manual package uses the real Pillow compositor,
local approved fonts and real Git changes, and is visually inspected separately.
Physical sleep/power-off behavior is documented from Apple; clock/DST/coalescing
logic and actual LaunchAgent execution are checked without putting the Mac to
sleep or turning it off.


## Hardening and extension contract

Operational commands, exact guarantees, schema compatibility, dependencies and
recovery are documented in [workflow-recovery.md](workflow-recovery.md). The
prioritized failure audit is [workflow-hardening-audit.md](workflow-hardening-audit.md).

To add a workflow kind, register trusted code in `src/workflows/registry.mjs`.
Definitions do not name module paths and cannot load arbitrary code. A descriptor
supplies:

* `materialFiles` and optional material filenames;
* `validateDefinition(definition)` and `validateSnapshot(snapshot)`;
* `freezeSnapshot({ store, definition, materials })` for kind-specific bindings;
* `start({ task, store, signal, onEvent })` returning the standard provider outcome;
* `decide(task, answer)`, `validateDecisionRecord(record)`, and optional
  `verifyDecisionArtifacts(answer)`.

Use the shared schema primitives, root/executable bindings and durable artifact
helpers. A start handler returns `workflowPatch` alongside ready/needs_you/failed;
it never writes task.json. The worker verifies required manifests, writes results,
journals the outcome, and commits through the same lifecycle as every surface.
The common review metadata/decision input contract remains bounded and explicit;
new fields/enums require a reviewed schema extension, not arbitrary extras.

Editorial owns topic collection, caption rules, visual preparation, public-record
validation and its decision grammar. Core owns staging/ID reservations, locks,
launch gates, journals, schedules, health, and recovery. Engineering remains an
inactive contract/example; this hardening does not add a second scenario or DAG.

For schema-1 definitions explicitly declare `permissions.commandAdapters` and
`permissions.network:false`. Run `workflow bindings <id> python3` after installing
Python/Pillow on another machine, inspect sources/fonts, then refresh chosen tasks.
Do not copy a frozen absolute snapshot as a new-machine definition.
