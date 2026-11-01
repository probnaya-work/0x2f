# macOS runtime qualification follow-up

This directory contains fresh macOS arm64 runtime observations from 2026-11-01.
The earlier qualification evidence outside `platform-followup/` is unchanged.
The official runtimes were unpacked under `/private/tmp/0x2f-node-matrix-downloads/`;
the global Node installation was never replaced.

Official runtime selection and checksums are recorded in
[runtime-provenance.json](runtime-provenance.json), the original
[Node release index](node-dist-index.json), and the three `SHASUMS256.txt` files.
Sources are [Node's distribution index](https://nodejs.org/dist/index.json) and
[release status](https://nodejs.org/en/about/previous-releases). As observed on
this date, latest LTS is **26.13.0 (Lithium)**; latest Node20 is **20.20.2 (Iron)**,
and Node20 is EOL. **20.0.0** additionally tests the actual `>=20` lower bound.
Each downloaded macOS arm64 archive's SHA256 matched its official checksum.

## Final committed candidate

Verified source: `2941c028b00310f941ced0ed7d7ba5aa48f6d016`.
Host: **macOS 26.6.2 (25G83), arm64, Darwin 25.6.0, Python 3.9.6**;
[exact host capture](host.txt). Runs were sequential and used fresh disposable
checkouts and caches. Each clean locked install and `npm run check` exited 0.

| Node / bundled npm | Actual `npm test` | Full command duration | Separate packed installed journey | Raw evidence |
| --- | --- | --- | --- | --- |
| 20.0.0 / 9.6.4 | 715 tests: **705 passed, 0 failed, 10 skipped** | 112.260 s | **1/1 passed, no skip** | [suite](final-v20.0.0/actual-npm-test.txt), [installation](final-v20.0.0/installed-distribution-journey.txt), [summary](final-v20.0.0/summary.json) |
| 20.20.2 / 10.8.2 | 715 tests: **705 passed, 0 failed, 10 skipped** | 26.928 s | **1/1 passed, no skip** | [suite](final-v20.20.2/actual-npm-test.txt), [installation](final-v20.20.2/installed-distribution-journey.txt), [summary](final-v20.20.2/summary.json) |
| 26.13.0 / 11.20.0 | 715 tests: **705 passed, 0 failed, 10 skipped** | 26.011 s | **1/1 passed, no skip** | [suite](final-v26.13.0/actual-npm-test.txt), [installation](final-v26.13.0/installed-distribution-journey.txt), [summary](final-v26.13.0/summary.json) |

All four real-PTY journeys pass on all three runtimes: the permission/decision/
correction/accept golden path, failure/retry with provider switching,
navigation/resize, and terminal restoration. The
[aggregate result](final-matrix-summary.json) derives counts and skip reasons
from these fresh logs and verifies the recorded key source hashes against the
committed files. The global runtime remains **Node 26.11.1 / npm 11.20.0**.

The [isolated matrix runner](run-isolated-matrix.mjs) uses the selected Node's
bundled npm, a clean copied checkout, empty HOME and npm configuration, and a
PATH containing only that Node/npm plus macOS system utilities. It does not
inherit credentials or vendor CLI locations. It performs clean locked `npm ci`,
`npm run check`, the actual `npm test`, and a separately logged packed-package
first-install journey. That existing journey installs into a temporary prefix,
initializes a fresh project, executes a deterministic command provider through
a real worker, reopens persisted results from separate CLI processes, checks
installed authenticated UI/API startup, uninstalls, and verifies project state
survives. The full suite also includes the four real-PTY journeys.

The runner uses an offline disposable cache containing only the three locked
dependency tarballs and their public manifests. Manifest versions and dist-tags
are restricted to the lockfile versions; tarball bytes are unchanged. Equivalent
URL encodings and full-JSON/install-v1 Accept variants are seeded so older npm's
cache matching rules cannot conceal product installation behavior. The final
summaries include exact source hashes, runtime versions, commands, test counts,
skip reasons, durations, and any retained scratch directory.

## Confirmed failures and preserved diagnostics

- The original quoted `node --test "test/*.test.mjs"` script discovers no tests
  on both Node20 versions. See [strict20](v20.0.0/actual-npm-test.txt) and
  [latest20](v20.20.2/actual-npm-test.txt). `scripts/test.mjs` now enumerates the
  same files explicitly, invokes that Node's test runner, forwards additional
  npm test options, and propagates its exit status.
- Initial strict20 installation failures were qualification-cache misses,
  reported honestly as failed runs. npm9 requires both matching URL spelling and
  Accept media types, unlike the original npm11-seeded cache. The unsuccessful
  [URL-only attempt](v20.0.0-cache-alias-corrected/installed-distribution-journey.txt)
  and [full-metadata option control](npm9-full-metadata-control.txt) remain.
  The same preserved checkout and a copied cache pass the installed journey
  after both request variants are seeded:
  [controlled result](npm9-accept-variants-control.txt). No product change was
  made to bypass package installation.
- The next latest20 actual suite exposed a real pairing race:
  [unaltered failure](v20.20.2-verified/actual-npm-test.txt). The agent wrote
  `relay.json` directly while polling it; a poll during truncation treated the
  incomplete JSON as a disabled configuration and refused the valid pairing.
  A deterministic test widens that real truncate-before-write window:
  [before correction](relay-atomic-before.txt). The agent now uses the existing
  atomic JSON writer (same-directory temporary file and rename, mode 0600).
  Relay config, pairing security and relay integration then pass **38/38**:
  [after correction](relay-atomic-after.txt). A passing intermediate rerun does
  not negate the confirmed race.
- A subsequent Linux full suite still exposed a separate startup race after
  the atomic-write correction:
  [Linux counterexample](../linux/remote-runs/v26.13.0-final/actual-npm-test.txt).
  One configuration poll awaited key derivation while a later poll connected;
  the first poll then closed that prematurely opened socket when it resumed.
  Holding the initial PBKDF2 operation makes the wrong early connection
  deterministic on macOS too:
  [before serialized polling](relay-startup-before.txt). Polling now serializes
  the complete read/derive/transition and checks whether the agent stopped
  across asynchronous boundaries. The startup, config-write, relay and pairing
  security selection passes **39/39**:
  [after correction](relay-startup-after.txt). The earlier all-green macOS
  results for `8882951` are retained in
  [their original aggregate](matrix-8882951-summary.json); they did not qualify
  the Linux failure away.

Intermediate directories are retained in addition to the final candidate
results. Their source revisions and outcomes are identified in their own
`summary.json`; they must not be substituted for the final source's runs.
The earlier `8882951` directories are now named `intermediate-8882951-v*`;
[the relocation record](evidence-relocations.json) verifies every file's bytes
were unchanged and explains the original paths in their retained metadata.

No remote host, physical phone, paid provider, global runtime replacement,
package publication, tag, push, real secret, or real project state was used by
this macOS matrix. **Ten** real-binary tests are deliberately skipped in each
final full safe fixture run: six Codex and four Gemini tests, because those
binaries are absent from the sanitized PATH. Earlier runs had nine skips;
the final source adds the real saved-session Codex regression. Version-pinned
real-harness/mock-API work is recorded separately by the harness qualification
owner.
