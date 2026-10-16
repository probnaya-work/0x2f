# Accepted Engineering Loop candidate — 0122425

Slices 2A–2E are accepted as an **offline candidate**. Task remains the durable
unit across purpose-specific handoffs, managed disposable worktrees, bounded
investigation/implementation/fix/check/review and safe checkpoint resume. Existing
CLI/TUI/Web projections show purpose, routing reason, next action and archived
artifacts/reviews. Legacy task layout and atomic writes remain unchanged.

[Scenario summary](scenarios.json) preserves the six completed scenarios without
private workspace paths or provider sessions. [Commands and exact results](verification.json)
record commit identities, test outcomes, the failed first foreground smoke and
scoped verdicts. The original private reports are not the only evidence copy.

The six scenarios use deterministic fixture executors with actual source files,
Node checks and persisted Task/Run artifacts. They cover one primary, observable
unavailability transfer, focused fix, risk-triggered fresh review, bounded stop
and resume from a newly constructed runtime. Fixtures do not prove native model
integration. Reproduce with `node scripts/demo-engineering-playbook.mjs`.

Independent review found three P2 issues at `47aa35f`: unchecked review integrity
at acceptance, missing hashes accepted through undefined equality and dispatch
past deadline during slow qualification. All were corrected at `0122425` with
regression tests. Full suite passed 845/845 at concurrency 4. The preceding default
parallel run had two timing failures; isolated diagnosis passed 14/14. No product
limit or assertion was relaxed. See the machine-readable verification record.

The first native smoke used installed Codex 0.149.1 and existing ChatGPT login.
It received HTTP 400 for the configured `gpt-6.1-sol` model. No verified native
patch resulted, credentials stayed unchanged, and unknown usage was retained.
Successful native foreground completion is **unproven**, unattended provider
execution is **NO-GO**, and production was never activated.

Known limits: hard monetary/provider/account ceilings, internal call counts,
arbitrary-command isolation and supervision recovery are not established by
these fixtures. A managed Git worktree is ownership, not a security sandbox.
Delivery was outside this candidate. Changed bytes invalidate acceptance; calls
with uncertain effects cannot be replayed automatically. Small handoffs may be
larger than tiny histories; actual byte comparisons are recorded honestly.

Production preservation was checked read-only: Task #2's seven runs / 105 files
matched their hashes; protected packages, original/stable tracked bytes,
LaunchAgent and runtime/schedule bindings remained unchanged. Natural editorial
slot created Task #3 and stopped for topic selection, without publication.

Rollback: disable engineering opt-in for new tasks and retain task history,
artifacts and dirty worktrees. Revert development commits in reverse order:
`0122425`, `47aa35f`, `4c42fa2`, `93078ac`, `9dcd282`. Do not reset the production
checkout or migrate its `.work`. No push, PR, merge, deployment or publication
forms part of this evidence.
