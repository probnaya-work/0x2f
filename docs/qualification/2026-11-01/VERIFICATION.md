# Verification

Run from the isolated qualification checkout. Baseline revision is
`809e3ab158a7304c9e07e9c6d95ce30542987460`. Never run these experiments in a real
project's `.work` directory. Regressions create their own scratch workspaces.
The final implementation is `ac1e7af3bed1ad28fc655e5b58a346ebad400399`.
Its full audited npm test run passed **703 / 712 tests, zero failed, nine
explicit real-binary skips**, in 34.3 seconds:
[full-fixture-qualified.txt](evidence/full-fixture-qualified.txt).

```sh
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run check
node docs/qualification/2026-11-01/evidence/run-fixture-suite.mjs
node --test docs/qualification/2026-11-01/evidence/product/qualification-challenge.test.mjs
node docs/qualification/2026-11-01/evidence/security/lock-challenge.mjs
git diff --check
```

The broad runner invokes the **actual npm test script**, including packaging,
installation/uninstallation and PTY journeys. It omits inherited credentials,
removes vendor CLIs from PATH, and uses an isolated offline npm cache populated
only with the three lockfile dependencies. Cached package metadata is restricted
to the locked versions: this qualifies those exact dependencies, not the latest
versions that the published caret ranges might resolve in the future. Dependency
tarball bytes are copied unchanged. A cold machine needs those public packages
cached first; the runner never downloads them or credentials.

Loopback listeners require local-socket permission in the Codex sandbox. The
first sandbox-restricted baseline test attempt failed at listen and stalled;
the exact identified test processes were stopped, and that incomplete output
is retained as [baseline-test.txt](evidence/baseline-test.txt). It is not counted
as a product failure or a completed baseline suite.

The first completed broad fixture run had **675 passed, 10 failed, 9 skipped**;
its [unaltered output](evidence/full-fixture-suite.txt) exposed inert fixtures
that relied on an installed native binary and an uncached newer caret-compatible
dependency. Fixtures now pin availability and real live-worker identity, and
offline installation resolves the measured lockfile versions. The next completed
run passed **692 tests, zero failures, nine explicit skips** in 27 seconds:
[full-fixture-second.txt](evidence/full-fixture-second.txt). Additional independent
corrections are covered by the final run referenced in FINAL-REPORT.

The next broad run passed 699 tests but failed two PTY continuation/retry
journeys (nine skips); [full-fixture-final.txt](evidence/full-fixture-final.txt)
retains this failed intermediate result. A 2-second ACP teardown timer kept
the completed worker alive, so the new group guard refused it. Two subprocess
resource regressions fail against baseline and pass after child-close cleanup:
[baseline](evidence/baseline-acp-teardown.txt), [fixed](evidence/fixed-acp-teardown.txt).
All four PTY journeys then passed [in isolation](evidence/pty-after-teardown.txt).
The group admission protection was retained.
Raw captured `.txt` evidence retains terminal padding and diagnostic whitespace;
the directory's `.gitattributes` excludes those captures from whitespace lint.
Source and authored Markdown still receive normal `git diff --check` validation.

Targeted and independent evidence:

| Procedure | Observed evidence |
| --- | --- |
| Baseline new concurrency regression | [Fails before allocation correction](evidence/baseline-store-concurrency.txt) |
| Real 20-process CLI creation, both brief types | [Baseline collisions/loss](evidence/product/baseline-product.jsonl); [candidate 20/20 retained](evidence/product/fixed-product.jsonl) |
| Detached worker notes, close, stale ownership, duplicate resume, paused death | [Baseline](evidence/state/baseline-reproductions.txt); [fixed 30-test selection](evidence/fixed-state.txt); `test/task-ownership.test.mjs` |
| Real private TCP source forging local Host | [200/200/201 → 403/403/403, no action](evidence/security/lan-host-repro.txt) |
| Auth/cache/WS/crypto/pairing regression and current permission clients | [288/288 selected tests](evidence/security/final-security-client-tests.txt) |
| Independent cache, async launch and reused-ID counterexamples | [Second-review failures](evidence/state/challenge/observed-before-second-corrections.txt), retained scripts beside it; fixed regressions in security/ACP/launcher suites |
| Cross-process lock safety | [Ten processes, 500 sections](evidence/security/lock-challenge.txt); `test/lock.test.mjs` additionally tests killed owner, replacement generation, live timeout and empty-release recovery |
| Independent launch-gap note/close, duplicate live grant, recovery-vs-launch | [Five passing independent tests](evidence/product/qualification-challenge-output.txt) |
| Package path and wrong-workspace onboarding | [Baseline](evidence/product/baseline-onboarding.txt); [corrected](evidence/product/fixed-onboarding.txt) |
| Log descriptors / asynchronous EAGAIN | [64 → 0 open parent FDs](evidence/product/fixed-product.jsonl); [four spawn regressions](evidence/product/fixed-async-spawn.txt) |
| Invalid JS/Python verification | `test/check.test.mjs`: actual npm script on scratch source fixtures |
| Valid JSON with invalid persisted shape | [Baseline TypeError](evidence/baseline-state-shape.txt); `store-concurrency.test.mjs` preserves malformed folders and their reserved IDs |
| Performance | [Original warm-fixture measurements](evidence/product/baseline-bench.jsonl); [candidate measurements](evidence/product/fixed-bench.jsonl) |
| Worker death with surviving command/native descendants | [Baseline overlap](evidence/product/qualification-orphan-command-output.jsonl); [three passing real-process admission regressions](evidence/product/fixed-orphan-process-test.txt) protect rerun, session resume and normal terminal drain |

The fixture suite covers native adapter parsing with local fake executables,
real detached workers, command↔ACP/provider handoff, task notes/answers/results,
restart recovery, CLI reopen, terminal PTY permission/decision/retry/accept flows,
LAN/relay encrypted command/replay/rotation, packaging and a temporary global
installation/uninstallation. This is **fixture continuity qualification**.

Nine real-binary tests are intentionally skipped: five Codex and four Gemini
integration tests, whose binaries are absent from the safe PATH. No claim is
made about new live model behavior, vendor authentication, physical phones,
remote hosted operation, Node20, Linux, Windows, network filesystems or power
loss. Historical observed capability maps were preserved without alteration.

Independent review was not a formality: agents who did not author the fixes
found the cache route escape, asynchronous spawn crash and repeated RPC-ID
grant replay after initially passing targeted tests. Those objections received
failing repros, implementation corrections and further tests. The final command
provider crash probe likewise led to process-group admission protection.
