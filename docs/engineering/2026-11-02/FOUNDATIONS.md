# Execution, isolation and context contracts

These are development-branch features after published 0.2.0, not a new package release.

## Stop and recovery

`2f cancel ID` / `2f stop ID`, local API and encrypted phone commands request
cancellation of one attempt. An attempt UUID is reserved before worker launch;
only that owning worker consumes its request. No client signals an old saved PID.
The worker rejects outstanding ACP permissions, terminates its own still-owned
POSIX group, saves partial observed text and Git changes, then escalates its own
group after a short grace period. The outcome is FAILED / cancelled, retaining
reason and attempt identity. Retry is explicit and gets a new attempt identity.
No rollback of external actions is promised. A lost worker is recovered without
replay; a process-generation mismatch does not count as a living execution.
Recovery runs at startup and periodically while the supervised runtime serves.

CLOSE only closes attention; disconnecting a client or stopping the runtime does
not cancel execution. ACCEPT, DROP and CLOSE now persist different dispositions
while retaining the five-state lifecycle. Legacy workers without an attempt UUID
cannot be cancelled through this channel. Deliberately escaped process groups,
kernel-level containment and uninterruptible processes remain outside this model.
Saved numeric groups are probed conservatively before retry, never killed.

## Workspace ownership

New Git-root tasks with committed, clean source default to a detached task-owned
worktree. Subsequent runs of that task reuse it, including unfinished changes.
An automatic launch against dirty source refuses with a choice:
`--workspace-mode isolated` starts at committed HEAD and explicitly excludes
existing dirty/untracked files; `--workspace-mode shared` executes in the source
checkout. Non-Git, unborn and nested Git projects use serialized shared mode.
This is edit isolation, not a security sandbox against a malicious harness.

Shared admission uses a cross-process workspace lock and refuses another active
shared task. Original dirty files remain on their original checkout. Snapshot
capture uses a private index and private object database under `.work/evidence`;
it never stages the user's index or adds snapshot refs to the public repository.
Git-visible binary/untracked files and symlinks are retained; symlink targets
are not traversed. Ignored files and intermediate create/delete operations are
not an attributed patch. Shared observations may include concurrent human edits.

`2f changes ID --run N` reads a hashed saved patch; later workspace edits do not
change it. Per-attempt copies preserve native-resume evidence. `2f apply ID`
transfers the saved cumulative task result only after Git's conflict checks;
any conflicting path refuses the transfer. A no-change run has explicit empty
change evidence. `2f cleanup ID` first writes a private archive, then removes
only the owned, inactive checkout; ignored/unarchivable content refuses cleanup.
`2f restore ID` reconstructs the checkout before continuation. The original
checkout and task history remain. Archives are local private evidence, never
public source artifacts. This does not migrate tasks between machines.

## Input budget

Original `prompt.md` and each fresh-session input remain preserved. A deterministic
128,000-character default budget applies; `.work/context.json` can explicitly
set `maxChars` from 16,000 to 1,000,000. This is not a model-token estimate.
Original intent, formatted user notes/answers/corrections, current project context,
recorded errors, decision blocks and explicit unverified/remaining requirements
are protected. If these exceed the budget, launch refuses intact. Old result
prose receives the remaining budget, newest first, with explicit excerpts or
reference-only delivery and a hashed index of full artifacts. Unstructured prose
is not a formally verified requirements model; full evidence remains inspectable.
Verification prose is no longer separately duplicated after the full result.

Every continued run saves the current project files and their revision hash,
a context delivery manifest and exact input SHA/length. Current project rules
supersede historical project context, without rewriting the original request.
User constraints remain binding. UI/run inspection exposes the revision and
shortening count. Notes are explicitly next-run input, never live-delivery proof.
Native session resume uses its provider's resume message; it does not rebuild
fresh-session input or claim that newly saved notes reached the old session.

## Upgrade and rollback

Quiesce older workers before replacing the runtime: legacy writers do not honor
these new ownership/admission contracts. Install into a new immutable prefix and
keep the 0.2.0 prefix and private state backup. New state fields are additive;
never switch an older runtime onto tasks actively using isolated worktrees or
cancellation. To roll back, stop new execution, retain/archive isolated source,
and restore the corresponding whole private state backup together with its
release prefix. Do not delete `.work` or silently replay interrupted tasks.

## Independent review corrections

Interactive CANCEL carries the displayed attempt nonce; a stale gesture refuses
rather than stopping a later run. Bare CLI cancel addresses the current attempt.
Legacy tasks without checkout metadata share the original workspace and obey
shared admission. New attempt reservation discards the previous process identity.

Immutable patch hashing/transfer preserves raw bytes, including non-UTF-8 text.
Snapshot enumeration includes staged deletions and explicitly staged ignored
files without changing the user's index. TUI patch display decodes text; the
saved artifact and apply preserve its bytes. Cleanup still refuses data not
represented by its archive, including normalized CRLF and gitlinks.

Fresh and native-resume input receipts are attempt-specific. Native-resume
receipts name the exact provider message, rather than reusing the original fresh
prompt or claiming delivery of newly recorded notes/rules. Older receipts cannot
be upgraded retroactively. Tool receipt correlation is bound to run and attempt.
