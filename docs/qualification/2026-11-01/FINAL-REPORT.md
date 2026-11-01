# Independent engineering qualification — 0x2F

**Release recommendation: CONDITIONAL GO for the local candidate on the tested
macOS/POSIX environment. General release is conditional on the untested runtime,
platform and live-harness matrix below. Do not promote the unpatched baseline.**

Baseline: `809e3ab158a7304c9e07e9c6d95ce30542987460` (0.1.4).
Verified implementation: `ac1e7af3bed1ad28fc655e5b58a346ebad400399`.
Branch: `qualification/2026-11-01`.
Checkout: `/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101`.
Package version remains 0.1.4; these are local commits, not a published release.

The baseline's task-continuity promise failed under ordinary concurrency and
crashes: task creations collided, workers discarded accepted human input,
paused or repeated commands overlapped execution, and dead live permissions
escaped recovery. LAN clients could also bypass the claimed local API boundary.
Seventeen confirmed findings were corrected with regressions, including gaps
found independently after initial fixes passed their targeted tests.

The candidate now serializes task allocation and mutations across processes,
reserves execution before spawning, preserves user context and closure, rejects
stale worker publication, and recovers dead live pauses. On local POSIX systems,
rerun and session resume refuse a still-live recorded process group, including
provider children surviving worker death. The runtime never kills a process
based only on an old numeric identity.

Security corrections cover actual TCP peer identity, cache authentication and
route isolation, WebSocket pairing gates, one-operation ACP grants, fresh
permission occurrence nonces and displayed-request preconditions in Web,
remote and TUI clients. Installation/workflow corrections cover workspace-aware
UI reuse, paths containing spaces, file descriptors, asynchronous spawn failure,
ACP timer cleanup, incomplete CLI flags and generated provider instructions.

Final results on macOS arm64, Node **26.11.1**, npm **11.20.0**, Python **3.9.6**:

- Offline locked dependency installation succeeded; no build step is required.
- Corrected `npm run check` passed, including negative tests proving syntax
  errors now produce nonzero status. `git diff --check` passed.
- The actual npm test suite in the audited local-only environment completed
  **712 tests: 703 passed, 0 failed, 9 explicitly skipped**, in 34.3 seconds.
  [Exact full output](evidence/full-fixture-qualified.txt).
- Actual npm packing, clean temporary global installation, first task, separate
  CLI reopen, installed UI startup and uninstall/state preservation passed.
- All four real-PTY journeys passed, including permission, correction,
  decision/answer, provider switch, retry, accept and terminal restoration.
- Independent lock challenge: **500 critical sections across 10 processes,
  zero overlaps**. Independent launch-gap/recovery/grant tests passed 5/5.
- Worker-death/continuation tests prove an orphan command or fake native
  descendant cannot overlap a later rerun or saved-session resume; continuation
  becomes available after the old recorded group exits.

Acceptance criteria met in the exercised environment: unique acknowledged task
identity, retained user constraints/history, one admitted recorded execution,
observable tested failure recovery, authenticated local/remote action boundary,
one reviewed permission occurrence per grant, and usable installed CLI/TUI/UI.
Provider switching is proven through real workers with deterministic local
command/native-output/ACP fixtures; this is not a new live-provider capability
attestation.

Conditions before a broad new release:

1. Execute the same clean installation and fixture suite on the **claimed
   minimum Node20** and the actual supported Linux/other OS matrix. Only Node26
   on macOS arm64 was available; Windows process-group behavior is not covered.
2. Run appropriately authorized, version-pinned real harness/mock-API and
   physical-phone workflows. Five Codex and four Gemini real-binary integration
   tests were intentionally skipped; no paid model runs were initiated.
3. Finish existing old-version workers before upgrading a workspace. They do
   not participate in the new locks/nonces. Choose a new release version and
   perform normal publishing/operator review separately.
4. Keep the current limits explicit: closing an active task does not cancel it;
   a later permission can leave that provider waiting. Recorded POSIX groups
   are probed, not automatically killed; intentionally detached descendants,
   legacy records without group metadata, arbitrary repository/provider code,
   network filesystems and power-loss transactions remain outside the guarantee.

Investigation stopped after these bounded reproduction/fix/challenge cycles
because the remaining work requires additional environments, live-provider
authorization or an explicit cancellation/containment design. More mock-only
testing would not establish those claims. No public infrastructure was attacked,
package published, branch pushed, production system changed, money spent or
real authentication credential changed. Original worktrees and historical
reports were preserved.

Navigation: [baseline](BASELINE.md), [architecture](ARCHITECTURE.md),
[threat model](THREAT-MODEL.md), [findings](FINDINGS.md),
[changes](CHANGES.md), [reproduction and verification](VERIFICATION.md),
[remaining risks and continuation](REMAINING-RISKS.md).
