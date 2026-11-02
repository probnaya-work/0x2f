# Independent risk inventory — before regression or accepting author claims

Baseline main ecf547c; candidate e2355a3 (implementation checkpoint 3842993).

- A cancellation request arriving after a retry may retarget the new attempt unless clients send an execution precondition and the shared action checks it under lock. Persisted old nonce alone only protects an already-written request.
- Worker death/PID reuse must not produce signal authority. Live permission decisions, recovery, admission and stop must agree on generation and occurrence.
- Snapshot canonicalization (CRLF, attributes, filters), gitlinks, ignored data and missing directory entries can invalidate byte-preservation claims. Cleanup must refuse unsupported shapes; restore must preserve commit HEAD and unfinished bytes.
- Git restore can alter the real index and misclassify untracked data; repeated apply after later runs may reapply a cumulative patch to a previously applied baseline.
- Backup must validate all structural paths before any task/metadata writes. Symlinked .work/tasks/.git metadata and special files must never lead writes into original/external paths. A receipt is integrity, not authority. A restored configuration must not restore execution capabilities implicitly.
- Immutable run receipts can accidentally refer to a previous native-resume attempt. Stored prompt is not necessarily actual native-resume input. First-run context may bypass continuation budgets.
- Cancellation/timeout can publish a snapshot while descendants still write. Configured checks must not grant READY/ACCEPT to failed partial work. Unknown exits must stay unknown.
- Separate SSH probe/command connections create a machine-pin race; all arguments and remote paths must be shell-quoted, with explicit provider/environment readiness.
- Observer identity needs start-generation + boot/machine and time windows; stale poll/reconnect must not infer idleness or preserve a false live relation.
- Client controls may retarget stale task/run state, discard drafts after errors, hide permission scope or conflate cancellation, closing and acceptance.
- Installed package must include every runtime dependency and use explicit host PATH. Prior reports are historical evidence, not final-package qualification.

Qualification will retain each confirmed reproduction and distinguish deterministic fixtures, real harness runs, real host restart/restore, rendered UI inspection and physical-device gates.
