# Confirmed findings and fixes

Independent review of PR #5, starting at e2355a3 (implementation 3842993).
Minimal reproductions live in `test/independent-review.test.mjs`, with the
native worker regression in `test/claude-resume.test.mjs`. Original failures
were retained in the private qualification logs; no provider prose was used as
proof of correctness.

| Severity | Defect / reproduction | Fix |
| --- | --- | --- |
| P1 | Send CANCEL with an old attempt nonce after retry/native resume: the option was ignored and the current run received cancellation. Persisted nonce checks only protected an already-written request. | Locked action checks displayed executionId; HTTP/encrypted relay require it, Web and TUI capture it at render/key intent. Bare CLI explicitly targets current execution. No numeric PID signaling added. |
| P1 | A valid backup can contain `.work/tasks` symlink to original task storage. Restore traversed it and rewrote original task execution fields. Symlinked Git metadata could similarly redirect repair writes. | Validate control paths before backup locks, before restoring and after copying; reject control symlinks while retaining ordinary checkout data symlinks. Regression constructs an old-format matching receipt and verifies refusal/original byte identity. |
| P1 | Rerun a 0.2.0 task without `checkout` while a new shared task owns the root. Legacy task bypassed admission because missing mode was treated as non-shared. | Missing checkout participates in shared admission. Isolated mode alone is exempt. |
| P1 | Resume creates a worker PID but retains previous worker generation until startup. A recovery sweep in that interval can finalize a living new attempt as crashed. | Reserve a new nonce and remove previous process identity; worker publishes its actual generation under task lock. |
| P1 | Restore of a valid archived working copy reapplied Git smudge/EOL conversion and silently changed unfinished bytes; the old real index also referenced private snapshot objects. A nonidentity smudge fixture reproduced `SMUDGED:unfinished bytes`. | Restore into a no-checkout worktree, materialize raw blobs/links with validated paths, and initialize the real index from saved HEAD. The regression verifies exact bytes, untracked classification and normal Git diff. |
| P2 | A file with Latin-1 bytes and no NUL is emitted by Git as text. UTF-8 decoding corrupted the immutable patch; apply then failed or could target replacement bytes. | Preserve raw diff buffers, hash/store/apply those bytes. Text decoding is confined to display. |
| P2 | `git rm` removes a path from the real index; capture seeded its private index from HEAD but enumerated only the real index. The deletion vanished from evidence. Staged ignored additions and executable changes with `core.fileMode=false` were also missed. | Union private and real tracked paths with eligible untracked paths; force-add only enumerated paths, observe executable mode, preserve original index byte-for-byte. |
| P2 | Native resume inherited `input.json` claiming the original fresh prompt; TUI labelled that as exact input for the resumed attempt. | Adapters report the actual resume message before invocation. Save per-attempt input/hash/transport; latest run reader uses it and explicitly states that new notes/rules were not delivered to the native session. Unsupported hooks and failures before resume launch report input unknown; the previous fresh receipt is retired before worker launch. |
| P2 | Reused toolCallId across attempts, or a later start in the same event list, could supply another command to a prior completion receipt. | Worker stamps events with executionId; evidence pairs by run/attempt/id in chronological order; ledger keeps separate attempts. The encrypted projection retains the same public nonce for remote correlation. Old unbound events remain historical, not upgraded to bound evidence. |
| P1 | SSH pin was checked on one connection while the CLI executed on a second connection with no repeated identity check. | The actual execution connection checks machine-id immediately before chdir/importing installed CLI, in one quoted Node invocation. Earlier probe remains diagnostic only. |

Additional preserved boundaries: cleanup refuses ignored data, CRLF-normalized
bytes and gitlinks; cancellation keeps FAILED/partial evidence; configured checks
never create acceptance; recover never replays execution. Process groups can be
observed from saved numbers but are only signaled by the live owning worker.

## Related 057 PR #1

P2: active identity windows were re-parsed but not persisted because SQLite
correctly deduplicated the unchanged begin-event id (claims are outside its
identity). A later process observation could fail to correlate after reopen.
Additionally, a live permission's `completedAt` pause timestamp prematurely
closed its process claim. Reproductions failed against f40cf49 in
`test/work-execution.test.ts`.

The adapter now emits separately identified, interval-scoped identity
declarations, without progress/counter events or changing the source-neutral
store/ontology. Windowed readers retain overlapping identity declarations even
when execution birth is older than their poll window. Live permission claims
remain open only to the observation instant. SQLite reopen verifies persistence;
the fold regression verifies that re-reading never advances last activity.
