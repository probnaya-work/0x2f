# Changes and rationale

All changes are isolated from user work on branch `qualification/2026-11-01`,
based on `809e3ab`. Version remains 0.1.4: this is a local candidate, not a
published release. No package publication, remote push, deployment or real
credential change occurred.
Implementation snapshot: `ac1e7af3bed1ad28fc655e5b58a346ebad400399`.

1. Added an allocation mutex and per-task cross-process mutex. A candidate
   directory contains its unique PID owner marker before atomic publication.
   Dead-owner cleanup only unlinks that marker and nonrecursively removes the
   directory, so it cannot remove a newly published nonempty owner's lock.
   State files still use owner-only temporary files plus atomic rename; their
   published layout and legacy interpretation remain compatible.
2. Moved task admission and human mutations inside those locks. Reserved
   resumes before spawn, rejected overlap with live pauses, preserved launch-gap
   notes/closure, recorded spawn/preparation failures, and validated text input.
   Local POSIX admission also records/probes the worker's process group before
   rerun or non-live resume, so a provider surviving SIGKILL cannot be overlapped.
   It refuses uncertain termination instead of killing a potentially reused PID.
   Final PTY integration exposed an existing ACP teardown timer retaining a
   completed worker; child-close now clears teardown and pending RPC timers.
3. Reworked worker publication around fresh state and run+PID ownership.
   Notes, corrections and DONE survive success/error paths; stale workers cannot
   overwrite results, permission channels, sessions or terminal history. Session
   IDs now persist when first surfaced. Recovery revalidates candidates under
   the same lock and includes dead live pauses and closed in-flight runs.
4. Hardened HTTP/LAN/cache/WS boundaries and ACP permission occurrences. Initial
   fixes were independently challenged and corrected for cross-route cache
   replay, repeated RPC IDs, asynchronous launch errors and a non-live-resume
   process-group bypass. Current clients bind
   live permission gestures to the occurrence they displayed.
5. Fixed canonical workspace reuse, URL-to-path conversion, parent log FD
   closure and asynchronous spawn error handling. Repaired incomplete CLI
   selector handling, generated provider onboarding, syntax-check status and
   dependency descriptions.
6. Added actual cross-process, detached-worker, package-path, negative syntax,
   security, permission and recovery regressions. Corrected inert API/TUI test
   fixtures that depended on a developer's installed Claude binary or used a
   nonexistent PID for a supposedly live permission.

Why not merely merge notes at worker completion? It would leave duplicate
admission, resume races, permission state, closure and stale result writes
unprotected. In-process promise queues cannot coordinate independent CLI,
server and detached worker processes. The mutex is needed at that existing
filesystem boundary; a new database, scheduler, provider abstraction or storage
layout was not introduced.

Tradeoffs: operations on one task serialize; live locks time out conservatively
after 30 seconds rather than being stolen on wall-clock assumptions. A reused
PID can require retry/manual diagnosis. Existing active workers from an older
installed version do not participate in the new lock protocol: finish them
before upgrading a workspace. Multi-file artifacts are not a transactional
database, and no fsync/power-loss guarantee was added.
