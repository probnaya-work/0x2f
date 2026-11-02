# Changelog

## 0.3.0 — 2026-11-02

- Add attempt-owned CANCEL with process-group drain and retained partial patches; recovery never signals a new process from an old PID.
- Isolate Git tasks in worktrees; retain immutable snapshots/patches for review/apply, archive and restore. Refuse cleanup that could lose ignored/index/reserved data.
- Run independent configured checks with frozen plans and retained receipts; passing checks never imply ACCEPT. Record ACCEPT, DROP and CLOSE separately.
- Retain exact per-attempt input, bounded continuation context, note/current-rules delivery and correlated command evidence. Fresh continuation and native resume remain distinct.
- Add explicit Linux host execution over strict SSH with machine identity rechecked on the actual execution connection. No task or credential migration.
- Add quiescent private workspace backup and integrity-checked new-root restore without restored credentials, hosts or execution authority.
- Improve Web/mobile task creation, correction, cancellation and reconnect; extend TUI input/run/check/patch review. No closed-client push.
- Preserve opt-in external057 observation of task/run state;057 and Mobile public apps are separate releases.

Upgrade/rollback and exact qualification linkage: [0.3.0 release notes](docs/releases/0.3.0.md). Historical0.2.0 and candidate reports keep their original artifacts and dates.

## 0.2.0 — 2026-11-02

- Harden task/run admission, locked publication, permission occurrence matching,
  stale remote scope rejection, retry recovery and process-group quiescence.
- Add full TUI request/result/Verification reader, run selection and exact saved
  input. Clarify that notes reach the next run, READY needs review, and CLOSE
  does not cancel the worker.
- Retain verified Task-context continuation across Codex, OpenCode, Cursor,
  Gemini and DeepSeek within their recorded version/account boundaries.
- Make installed verification portable across macOS/Linux with an explicit
  public cache, clean environment and byte-for-byte installed-source checks.
- Add Web/mobile/pairing Light / Dark / System preferences without changing
  the original light design or TUI selection. Resolve the theme before paint.
- Repair header/responsive result layouts, compact task typography, repeated
  CHANGES labels and measured-width activity traces.
- Document one user-systemd Linux execution host and existing 057 observation.
  Preserve detached workers on service restart and keep LAN pairing under
  supervisor ownership instead of starting a competing runtime.

Historical 0.1.4 qualification reports retain their original dates and versions;
they are not relabelled as final 0.2.0 checks. See docs/releases/0.1.4.md for the
previous release and docs/releases/0.2.0.md for current validation and limits.
