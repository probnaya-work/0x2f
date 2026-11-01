# Verification method and evidence index

Final source under test: `2941c028b00310f941ced0ed7d7ba5aa48f6d016`.
Final counts and matrix cells are checked from raw output and JSON summaries
in [FINAL-REPORT.md](FINAL-REPORT.md), not inferred from wrapper exit codes.
Historical703/712 evidence outside this continuation remains historical.

## Environments and isolation

macOS arm64 uses official20.0.0,20.20.2,26.13.0 archives in private temporary
runtime directories. Lenovo Ubuntu26.04.1 x86_64 uses the same official Node
versions under `/home/bogart/0x2f-qualification-20261101/runtimes/`. The
SHA256 archives match Node's version-specific official SHASUMS256 manifests.

Lenovo was reached only at the user-named192.168.1.80 using existing SSH keys,
BatchMode and strict known-host verification. The new qualification directory
holds bundle imports, checkout, runtimes, caches and evidence. Complete Git
history and exact candidate ancestry were preserved through bundles/fetch HEAD;
there was no push. No server-wide runtime or active existing workspace changed.

The shared [isolated runner](evidence/macos/run-isolated-matrix.mjs) copies
repository files into a disposable checkout. It constructs an environment
without inherited credentials, vendor binary locations or npm user settings;
HOME/config/cache are isolated for its subprocesses. Only the three locked
dependencies are preseeded. Both npm9/11 cache request variants are retained.
Lifecycle scripts are disabled; public registry metadata/tarballs were seeded
separately. No provider endpoint is contacted by fixture tests.

Each cell executes actual clean `npm ci`, `npm run check`, `npm test`,
then a separately logged `node --test test/distribution.test.mjs`. The latter
packs the real artifact, installs into a temp prefix, checks init/provider
refusal, executes a deterministic local command provider, reopens the task in
separate CLI processes, starts the installed authenticated UI/API, uninstalls
and verifies workspace state survives. The full suite also contains this path;
the separate run makes distribution non-skipping explicit.

The matrix uses exact locked dependency versions offline. The final Linux
LTS additionally runs this distribution journey with a fresh untrimmed online
registry cache. A network skip is not counted as a successful online check.

## Important Linux guarantees exercised by the full suite

| Guarantee | Existing meaningful fixture coverage |
| --- | --- |
| Concurrent task allocation / file locks | `store-concurrency.test.mjs`, `lock.test.mjs` |
| User notes retained through running/paused/failed completion | `task-ownership.test.mjs`, `action-concurrency.test.mjs` |
| Retry/rerun/resume admission does not overlap | `action-concurrency.test.mjs`, `task-ownership.test.mjs` |
| Worker crash leaves a writing descendant; new run/resume waits for recorded group exit | `orphan-process.test.mjs`: actual heartbeat continues, new execution refused, then admitted after owned fixture exit |
| Dead live permission recovery | `task-ownership.test.mjs`, `recover.test.mjs` |
| Occurrence-bound grants / stale responses refused | `permission-regression.test.mjs`, ACP tests, `api.test.mjs`, `relay.test.mjs` |
| Local/remote API, cache auth, pairing and WS peer boundaries | `security.test.mjs`, `e2e-security.test.mjs`, `lan-mode.test.mjs`, `pairing-security.test.mjs`, `relay.test.mjs` |
| Pairing config atomicity / startup serialization | `relay-config-race.test.mjs`: delayed-write and held-key regressions |
| Real PTY journeys / terminal restoration | All four `tui-pty-e2e.test.mjs` cases use real Python PTYs and assert screen + disk + restoration sequences |

Crash tests signal their own newly launched controlled fixtures; no old user
workspace's stored PID/group was used to terminate anything. The one hung
intermediate Linux test was stopped only after current /proc argv and exact
unique cwd checks; the command/proof are retained in Linux evidence. Temporary
desktop UI cleanup likewise verified current exact command/cwd.

## Evidence map

- [macOS provenance, method and final results](evidence/macos/README.md)
- Linux setup/transfer/download/install commands and outputs:
  [evidence/linux/](evidence/linux/); [final invocation](evidence/linux/run-qualified.sh).
- Final Linux raw runs: `evidence/linux/qualified/<version>/`;
  earlier failed runs remain in `evidence/linux/remote-runs/`.
- [New findings and commits](CHANGES.md), including cache/environment
  failures, source regressions and retained intermediate counterexamples.
- [Harness inventory/results](HARNESS-RESULTS.md): real binaries and mock
  requests; intentionally distinct from fixture-only and live-provider evidence.
- [Live proposal and physical-phone manual flow](HARNESS-PLAN.md).

A desktop in-app browser check also opened the READY fixture task, inspected
the CLOSE accessible label/help, clicked CLOSE, and observed DONE plus the
visible noncancellation notice. [AX output](evidence/ui-close-result.txt) and
[screenshot](evidence/ui-close-result.png) are retained. It is a real desktop
browser against a fixture task, without mobile emulation or physical phone.
The temporary UI server/workspace were removed after verification.

## Interpretation

The full safe suite intentionally omits installed vendor CLI paths: its native
cases skip instead of reading real user configuration/credentials. Exactly six
Codex and four Gemini skips are expected after adding the saved-session
regression. Their reasons are recorded per cell. Independent native/mock
observations cover those ten distinct cases; they do not turn skips into
passes in the fixture totals.

Gemini native/ACP actual account/model/permission behavior and same-task live
Gemini → DSH → Gemini switching now have separate bounded evidence in
HARNESS-RESULTS and FINAL-REPORT. Other provider accounts and physical devices
remain unqualified. Conservative usage estimates are distinct from invoices.
