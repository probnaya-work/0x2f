# Engineering continuity — local candidate

Engineering is opt-in per disposable workspace through `.work/engineering.json`.
Ordinary tasks and the stable editorial runtime keep their existing behavior.
The published task.json/events.jsonl layout and atomic persistence stay intact.

Use `2f new "Fix the parser"` with enabled engineering configuration. Routing
selects the executor automatically. Detached workers fail closed without proven
unattended qualification. `2f new "Fix the parser" --foreground` runs in the
calling process using an already configured Codex ChatGPT subscription, with a
workspace-write sandbox and no API-key fallback. `2f open <id>`, `--run <n>`, TUI
and Web share the purpose/reason/artifact/review projection and CHANGES API.
Engineering CHANGES reads immutable snapshots, not later live edits.

Policy schemaVersion 1 requires `enabled: true`, `currency: "USD"`, ordered
`providers`, explicit relative `files` and `writePaths`, an absolute executable
argv `check`, and integer `limits`: `moneyMicros`, `tokens`, `modelCalls`,
`providerCalls`, `wallClockMs` (1–600000), `implementationAttempts` (1–2, or 1–3
with the playbook). Disabled/missing policy preserves legacy task creation.

The minimal mode performs implement → verify, with at most one focused fix.
`playbook: true` adds investigate → implement → verify → review → decide. Optional
`investigationAttempts` (max 2), `reviewCycles` (max 2), and `agentRuns` (max 10)
limit this fixed default. Unsupported diagnosis reinvestigates within its bound;
no-change diagnosis verifies without implementation. A saved purpose boundary
can resume the same task with `2f rerun <id> [--foreground]`; ambiguous dispatch,
exhausted limits and changed source require a user decision, never blind replay.

A foreground playbook with `agentRuns: 1` starts implementation directly: the
executor investigates within its one patch attempt, then local verification and
the existing review policy decide readiness. Sensitive paths still require the
independent review boundary; a one-call budget cannot bypass that requirement.

After a completed foreground capacity failure with unchanged source, an explicit
user authorization can use `2f rerun <id> --foreground --retry-run <failed-run>`.
This narrow continuation verifies the original handoff/outcome/artifact and live
workspace, records the user decision, retains failed history and unknown usage,
and adds exactly one provider/implementation attempt. It refuses uncertain,
changed, mismatched or already-consumed runs. This is not an automatic retry or a
delivery grant; ordinary rerun still cannot bypass exhausted limits.

Sensitive paths or `requireReview: true` trigger a fresh-context reviewer. Optional
`reviewProviders` is workspace policy, not a per-task model picker. Review receives
the approved scope, immutable before/after snapshots and check receipts, without
implementer conversation. Findings carry severity and exact file/artifact hashes.
Only a pinned, preapproved `reviewChecks: { id: [absoluteExecutable, ...args] }`
reproduction exiting 1 can authorize correction. Unconfirmed findings stop at
NEEDS YOU. Acceptance rechecks artifact, verification and clear review receipts.
Acceptance performs no Git commit or other delivery action.

An optional `workspace: { repository: "/absolute/repository", ref: "HEAD" }`
creates a task-owned detached Git worktree at the resolved commit. Original dirty
files are not copied or changed. A durable preparation receipt recovers the same
checkout. Cleanup uses Git without force and refuses uncommitted results.
Worktree ownership is not a security sandbox.

Each run saves exact handoff inputs, output, artifact provenance/digests and
verification command/cwd/executable/exit/output evidence. Handoffs select relevant
references and retain constraints/human decisions; full history stays for audit.
Their bytes are measured against audit history, without promising every small
handoff is smaller. Changed task intent, inputs or references prevent dispatch.

Foreground and unattended execution are separate trust classes. Foreground
subscription calls retain unknown usage reservations and partial reported usage;
unknown money/provider-call counts are never converted to zero. Confirmed limit
overruns stop further execution. Completed calls with incomplete usage can
continue within attempt/run/time bounds; calls with uncertain effects cannot be
replayed. These are not provider monetary or per-turn hard guarantees. The native
adapter preserves reported usage without claiming internal provider-call counts.
Unattended provider execution remains NO-GO pending spending/account boundaries
and supervision qualification. No runtime activation is included here.

`node scripts/demo-engineering-playbook.mjs` retains six disposable playbook
scenarios and their inputs/results/diffs for inspection. It makes no model calls.
`node scripts/demo-engineering.mjs` demonstrates real files and Node checks using
strictly offline fixture executors. Engineering tests additionally cover the full
playbook, actual-trigger transfer, fix/review bounds and fresh-runtime resume.
Fixtures do not establish real harness integration; record a live smoke separately.

Rollback: disable opt-in for new tasks, revert the relevant development commits,
and retain durable history/artifacts/reservations. Do not bind the stable scheduler
to this candidate. No real `.work` migration is needed or performed.

## Local commit permission (disposable worktrees only)

After verification, use `2f commit <id> "fix: ..."` for a preview containing the
repository/worktree/parent identity, exact diff digest, proposed message, author,
hooks and task/artifact scope. The command prints the exact patch and a scoped
`2f allow <id> --digest <scope>` command. ALLOW grants and consumes this separate
local capability; patch ACCEPT alone never grants it. REJECT with the same digest
preserves the verified patch. Local TUI/Web permissions use the same shared
boundary and carry the preview digest. Remote relay delivery is not enabled.

Commits require a self-contained disposable repository under the system temporary
roots and the task's owned detached Git worktree. Source checkout edits and
foreign staged bytes are preserved. A private Git index builds the verified tree;
an owned index lock and compare-and-swap detached HEAD update publish only that
tree. Native `commit-tree`/`update-ref` plumbing avoids an implicit hook changing
the approved artifact during commit. Repository-local pre-commit,
prepare-commit-msg and commit-msg hooks run explicitly with bounded output/time
and saved receipts. Bytes, tree, message, hooks and index are checked again before
effect. Custom hooksPath and other active hooks are refused. User/global Git
configuration, signing and credential helpers are not invoked by this narrow
fixture capability; the disposable repository needs its own local author identity.
This is trusted local hook execution, not an arbitrary-command sandbox.

Permission binds the exact task/intent/artifact/verification/scope/tree/diff,
message, author, hooks and repository identity. Changed inputs invalidate the
permission; restoring old bytes does not revive it. A replacement proposal has a
new identity. Grant/revoke/consumption, intent, hook/failure evidence and resulting
commit receipt remain under the durable task. Duplicate execution returns the
same receipt. A lost outcome after object/ref effect is uncertain and never
replayed automatically. Manual reconciliation of uncertain delivery is a later
slice. No push, PR, merge or deployment is performed.

### Read-only local commit reconciliation

`2f reconcile <id>` inspects one attempted `git.localCommit` under the task lock.
CLI, TUI and Web render the same saved reconciliation projection. It never
retries delivery, invokes hooks, fetches, updates refs/index, repairs a worktree,
or removes a stale Git lock. Only task evidence and receipts are written.

Before delivery, a version 2 intent binds task/run, proposal operation UUID,
managed repository/worktree physical identity, parent, tree, diff, message,
grant and Git configuration. Exact UTF-8 commit bytes include an
`0x2f-operation` header; their Git object ID is computed and saved before effect
startup. The approved message stays exact. Hooks still run once, with the prior
post-hook scope checks. The object writer stores those exact bytes, then uses
the existing parent-checked HEAD update. No generic delivery ledger is added.

- `APPLIED`: that exact object and approved diff exist. A receipt records the
  resulting object identity. Reachability from the observed HEAD is separate;
  an object written before a crash may be unreachable. This does not claim that
  HEAD was advanced, the index was installed, or the worktree is ready for
  further execution. Existing workspace/acceptance fences continue to apply.
- `NOT_APPLIED`: the dispatcher has stopped (dead PID or completed pre-effect
  failure), the effect-start marker is absent, the exact object is absent and
  the detached HEAD, bounded local refs and HEAD reflog match the pre-dispatch
  snapshot. A new attempt requires a new preview UUID and grant; the consumed
  grant never becomes executable again. Stale Git locks require separate human
  handling; reconciliation does not remove them.
- `UNCERTAIN`: every other case, including absent objects after the start marker,
  rewritten/similar commits without exact operation identity, binding/config
  drift, missing legacy intent, truncated absence evidence, and read failures.
  The task needs the user; no success receipt or automatic retry is produced.

The result is an immutable observation with a timestamp, relevant local refs
and HEAD reflog, and a digest-bound evidence reference. Repeated/concurrent
reconciliation returns that saved observation, including reachability **at its
recorded time**; it is not a live repository monitor. Missing old intent is not
silently upgraded. Self-contained disposable repositories remain the only
supported delivery boundary; includes, partial clones and alternate object
stores are refused. External mutation of Git storage during observation can
force `UNCERTAIN`; this capability is not a filesystem sandbox or a general
history-rewrite detector. Uncertain workspace cleanup is explicitly refused.
