# Offline qualification clock correction — PASS

Implementation: `2d0c1003b782a15c961efa71d5455bf698fd4f72` on `fix/managed-source-search`, base `ff93a9a`.
Only `test/engineering-managed.test.mjs` changed. Runtime, adapters, routing,
pricing registry, project configuration and all execution limits are unchanged.
No provider call, Keychain read, Task #004, delivery or external action.

## Diagnosis: retained fact versus reproduction

The historical full suite recorded NEEDS YOU for the one-response regression,
with **33,916.1915 ms whole-test duration** and a **30,000 ms fixture deadline**.
Its assertion retained neither blockedOn nor receipts; teardown removed the
scratch Task and the old temporary logs are no longer available. The exact
historical blockedOn **cannot be recovered**. Whole-test duration includes setup
and does not prove which runtime boundary fired. The earlier report is retained
unchanged; this report does not relabel that historical outcome.

The confirmed qualification defect is that the request-cardinality happy-path
asserted READY while using the host's real clock and deadline timers. Host load
or suspension could exhaust that independent time budget and invalidate the
functional assertion. A controlled reproduction now reaches the same NEEDS YOU
shape after one response/patch, advancing the clock to the unchanged **30,000 ms**
boundary while the verifier returns a late success. Its exact retained code is
**`blockedOn.code = managed_deadline`**. There is no pending provider call at this
point. READY and a successful verification receipt are not published, and a
duplicate driver entry cannot dispatch again. `one-response-deadline.json`
preserves this result. This proves the controlled deadline cause, not the lost
historical trace's exact cause.

## Minimal correction

The one-response happy-path uses Node's existing per-test mock Date/setTimeout
clock, restored in `finally` before fixture teardown. It still executes the real
managed loop, local mock HTTP transport, durable patch, artifact checks and the
real credential-free pinned verifier. It asserts **READY, one attempt, one
inference + one count + one GET**, verifier exit 0 and closed process group.
Its assertion now includes bounded blockedOn/managed/verification diagnostics,
and the existing optional evidence export retains the complete result.

A separate controlled-clock regression tests the exact unchanged deadline and
rejection of a late successful verifier. Only this negative test substitutes a
controlled late verifier result; physical process timeout behavior remains in
its existing real-clock tests. The real deadline/late-response, owned descendant
termination and SIGKILL/no-replay regressions all remain unchanged and pass in
both focused and full runs. No clock injection was added to production code.

No deadline, request, token, cost, tool, file, patch, byte or attempt allowance
was raised. The happy-path fixture remains **30 seconds** and production policy
remains **120 seconds maximum**. Existing bounds remain **one attempt; four
inference + four counts + one GET; 12,288 cumulative inference tokens; $0.024576
published inference maximum; six tools; four reads; one patch**. Unpriced control
requests and unknown total provider billing policy are unchanged. This slice
does not refresh pricing evidence or authorize a live run.

## Verification

- Initial controlled diagnostics: **2/2 pass**, exit 0.
- Focused managed/economics/projection/foreground: **115/115 pass**, exit 0.
- `npm run check` and explicit edited-file `node --check`: **exit 0** each.
- Exactly **one full suite**: **1,010 tests, 891 pass, 119 skipped, 0 failures**,
  exit **0**, **179,456.5625 ms**. No full rerun; normal concurrency unchanged.
- Both one-response cases and the existing Task #002/#003-shaped offline READY
  fixtures pass in that full run. The exported happy-path verifier returns exit 0.

`verification.json` records commands, log SHA-256, test counts and the historical
uncertainty. The two proof JSON files come from the full run, without a second
provider sequence. Native LaunchAgent tests remain explicitly disabled; no new
native/unattended qualification is claimed. Fixture teardown closed the mock
servers, restored clocks and removed their disposable workspaces; the real
positive verifier reports its owned group closed.

## Preservation, verdict and rollback

All **1,389 existing candidate .work files** are byte/mode identical: Tasks
#001/#002/#003 and their worktrees, immutable artifacts, receipts, sequence and
policy are preserved. Task #004 was not created. Production/stable tracked bytes,
pre-existing package changes, LaunchAgent, schedule, runtime binding and existing
2f/2f-next launchers are preserved. Production's normal healthy scheduler changed
only its log/health files; no scheduler control was invoked. Prior tracked
evidence is unchanged. See `preservation.json`.

Verdict: **offline qualification PASS** with a clean current full suite. The
historical missing blockedOn remains explicitly unknown. Ordinary two-file live
foreground and unattended remain **NO-GO**; accepted historical simple live canary
GO is unchanged. No new live test, rollout or next milestone was started.

Rollback: create a new revert of `2d0c1003b782a15c961efa71d5455bf698fd4f72`, preserving this evidence and every
existing Task. No runtime or project-state migration/rollback is required.
