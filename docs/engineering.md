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
