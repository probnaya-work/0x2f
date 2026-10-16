# Engineering continuity — offline candidate

This opt-in slice keeps one task across implementation, deterministic verification
and at most one fix. Its persisted task/run files and shared actions remain the
existing interface. Ordinary tasks and editorial are unchanged.

Run `node scripts/demo-engineering.mjs` for a disposable **offline fixture**.
It writes real source files, runs real Node tests and retains task/run artifacts.
One task uses only its primary executor. Another transfers to the secondary only
after an observed `unavailable` outcome. These deterministic functions do not
exercise Codex, OpenCode or a paid model. No live qualification is claimed.

The real worker deliberately stops at NEEDS YOU / EXECUTION_UNQUALIFIED. Existing
adapters do not prove every required monetary/token/model-call/provider-call hard
ceiling. Usage reporting and process timeouts cannot replace those guarantees.
Qualification is a trusted in-process test seam, never an assertion accepted from
workspace JSON. Do not add an optimistic live qualification callback.

In a disposable workspace, `.work/engineering.json` uses schemaVersion 1,
`enabled: true`, `currency: "USD"`, ordered `providers`, explicit relative `files`
and `writePaths`, an absolute executable argv `check`, and integer `limits`:
`moneyMicros`, `tokens`, `modelCalls`, `providerCalls`, `wallClockMs` (1–120000),
`implementationAttempts` (1–2). The demo supplies a complete example. Missing or
disabled configuration preserves legacy behavior. No production config is added.

Each run stores its purpose, exact input, source/artifact manifest and result.
Verification records command/cwd/executable identity, exit/output and artifact
identity. Changed source/archive/check receipts invalidate acceptance. Unknown
usage retains its reservation and prevents another executor call. A task lock
claims one driver; repeated delivery does not allocate another sequence.

Fix handoffs include intent/scope/constraints and the failed check/artifact, not
all prior agent results. Unavailability handoffs reference the specific failure.
The original prompt and previous run artifacts remain available for audit.

Purpose-specific investigation/implementation/verification/review handoffs bind
task intent, run identity, human decisions and immutable evidence. Their measured
byte size is compared with saved audit history. Changed inputs or references
cannot be dispatched through an old handoff.

Limits: this is not managed worktree ownership, a sandbox, unattended supervision,
independent review, delivery authorization or crash-safe external replay. Ambiguous
effects/launches are never retried. A blocked engineering task cannot bypass its
policy with ordinary rerun or permission resume. Answers can be saved; changing
scope and requalifying a real executor are later work.

Rollback: disable this workspace's opt-in configuration for new tasks; retain
existing task artifacts and reservations. Never repair the stable scheduler onto
this experimental runtime. No real `.work` migration is needed or performed.
