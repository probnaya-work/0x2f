# 0x2F public release qualification — 2026-11-14

## Current prepared package: 1.0.0 — 2026-11-15

**First-use evaluation — GO** for checked local CLI/TUI/desktop scope.
**Public release — NO-GO until the actual GitHub CI run passes.**
The exact local core archive is prepared and its local checks pass.
Phone companion and operator self-hosting stay experimental; supported-phone
and operated-service claims remain NO-GO pending physical/HTTPS checks.

The unpublished stable archive has SHA256
`cb0e32d079df52107f27fcd897790e3fd001060520a6a50e6fe800d3be58447f`.
All six complete macOS/Linux Node 20/24/26 suites pass with zero failures,
as do separate-prefix and empty-HOME/offline installation, installed PTY,
37 terminal captures and upgrade from 0.3.0 with unchanged task bytes.
[Exact stable qualification](1.0.0-qualification.md).

The owner reports the phone unavailable: exact-final physical tests are
NOT RUN. The website and docs are prepared separately for the same release.
Actual GitHub CI, registry publication and site rollout remain outstanding;
no commit, push, tag or production deployment has occurred.

## Previous candidate: 1.0.0-rc.1 — 2026-11-15

**First-use evaluation — GO** for the checked local CLI/TUI/desktop scope.
**Public release — NO-GO for supported phone or operated-hosting claims.**
The core candidate is prepared; stable packaging and actual GitHub CI remain
publication gates. [1.0.0 release scope](1.0.0.md),
[exact qualification](1.0.0-rc.1-qualification.md),
[publication handoff](1.0.0-handoff.md).

The unpublished `0x2f-1.0.0-rc.1.tgz` has SHA256
`01e69a26dedf35c06daa11b992c488d817598374421bad3eca404296039cfdad`.
All six full macOS/Linux Node 20/24/26 runs pass, as do empty-HOME/offline
installation, installed PTY reading, 37 terminal captures and upgrade from
0.3.0 with unchanged task bytes. Both platform installations match all 84
source files. Relative to approved rc.8, shipped source differs only in ACP
version metadata; README, installation instructions and release documents
are aligned to the new candidate.

The retained phone fixture now serves 1.0.0-rc.1. Owner-operated interruption
observations on this candidate are **NOT RUN**: the owner reported the phone
unavailable on 2026-11-15. Earlier phone observations
retain their original attribution below. All work remains local/uncommitted,
with original main unchanged.

## Previous candidate: 0.3.1-rc.8 — TUI follow-up, 2026-11-15

**First-use evaluation — GO** within the checked local scope and harness prerequisites below. **Public release — NO-GO for broad phone and operated-hosting claims** until the remaining physical/HTTPS gates are completed or excluded from support claims.

Both terminal themes now have a quieter task rail, more result width, a clear primary action and a padded editing surface. The color direction is preserved. The exact unpublished artifact is `0x2f-0.3.1-rc.8.tgz`, SHA256 `c3bc75e58b8785f8688507b3dca97a9376f80a72fd111a564e7c7bc599b4947a`; all 84 source files match separate macOS/Linux installations. Fresh complete suites pass on macOS Node 26.11.1 (880 pass, 1 skip) and Linux Node 20.20.2 (877 pass, 4 skips), with real loopback Caddy integration. All 37 installed-package PTY captures pass structural checks; representative frames were visually inspected. [Detailed follow-up and evidence](tui-design-qualification-2026-11-15.md).

The rc.7 matrix, live model attribution and physical phone observations below remain historical evidence for their named artifacts. The phone preview remains rc.7 because this follow-up changes only TUI presentation and ACP version metadata. All work is local and uncommitted; original main is unchanged.

## Previous candidate: 0.3.1-rc.7


**First-use evaluation — GO** for local CLI, TUI and desktop Web on the checked
macOS/Linux hosts, with an installed and authenticated supported harness.
**Public release — NO-GO for broad phone or operated-hosting claims.** The
remaining physical and HTTPS gates below must be completed or explicitly
excluded from the published support statement. The candidate is unpublished;
there are no commits, tags, push, registry changes or production deployment.

Tarball `0x2f-0.3.1-rc.7.tgz`, SHA256:
`cb7acc6c1c2bea9ac59c4da16a190bf8f5a21da86427075fbb748ca0b6ce53bd`.
It contains 87 files; all 84 shipped source files match the separately
installed macOS and Linux prefixes. The empty-HOME offline verifier independently
packed the same hash, installed it without inherited model credentials and
passed the installed PTY report-reading journey.
[Artifact](0.3.1-rc.7-evidence/artifact.json),
[source manifest](0.3.1-rc.7-evidence/source-manifest.json),
[Linux match](0.3.1-rc.7-evidence/linux-installed-match.json),
[isolated receipt](0.3.1-rc.7-evidence/installed-verification.json).

Base commit remains `15a7b1f4ff88eb5c2c1c098976e9a1d00c641f42` in the
uncommitted `audit/prerelease-20261114` worktree. Original main is untouched.
The earlier real Codex 0.166.0 / OpenCode 2.2.5 engineering, handoff, cancellation,
restart and recovery receipts retain their rc.1 attribution. All 29 current
execution files except ACP are byte-identical to that baseline; ACP differs
only in client version metadata. Current native-CLI/local-API and installed
synthetic runs are separate evidence, not new live model claims.
[Continuity](0.3.1-rc.7-evidence/execution-continuity.json).

### Design and interaction findings closed

| Finding | Resulting behavior and evidence |
|---|---|
| F14 P2 — Web reading hierarchy | Human prose uses sans; facts and commands use mono. Result body is 14px/1.6, section headings 17px/600, with explicit spacing and different text tones. Commands receive terminal green. Both themes and current/earlier runs were checked. Mobile check receipts now follow the written result. |
| F15 P2 — desktop layout | Checkout notices no longer touch the task heading. Metadata, questions, answers and actions have separate spacing. The composer gives text its own full-width row. Long desktop results use the main scroll surface, reaching the end sentinel without a nested reader trap. |
| F16 P2 — async reads and editing | Pending and failed loads no longer masquerade as an empty task list or absent result. Retry is explicit. Connected composers, selection, focus and inner scroll survive live updates; task rows support keyboard activation. Browser evidence held a composer draft for 142 seconds and a decision draft for 24 seconds. |
| F17 P2 — Safari scroll feedback | The compact identity strip used animated height while its own visibility depended on title geometry. It now overlays without changing flow. Height-only Safari resize events do not rebuild the reader; live updates keep its scroller/strip connected and one passive scroll listener. The owner confirmed that flicker disappeared on the physical iPhone. |
| F18 P2 — TUI text geometry and reading | Clipping/wrapping uses terminal cell widths and whole graphemes. CJK, combining marks, flags and emoji preserve row alignment. Code indentation, blank lines and quoted spaces survive rendering; commands are green. Conclusions precede files; the full result precedes original context. Narrow help explanations wrap fully. Final output strips untrusted terminal controls. |
| F19 — qualification fixtures | The PTY reader now scrolls through all result, intent, checks and end-sentinel evidence after the reading-order change. A cold Codex profile's unrelated background plugin-catalog git fetch caused safe rerun refusals on Linux; catalog loading is disabled only in disposable local-API test profiles. Production admission and execution sandbox settings are unchanged. |

Desktop flows covered creation → READY, decision answer → next run,
permission inspection/rejection, live cancellation, persisted note, acceptance
→ DONE, old-run reading and long-result scrolling. Mobile responsive checks
covered 320/390px, stacked selects at 320px, both palettes and no horizontal
overflow. These are synthetic UI flows. [UI receipt](0.3.1-rc.7-evidence/ui-qualification.json).

TUI verification includes four real-PTY lifecycle/navigation scenarios and
17 structurally checked capture frames, with visual inspection of dark/light,
narrow/wide, composer, ready, permission, decision, failure, diff and help
states. Width tests cover 60/80/132 columns and no-color/256/truecolor output.
Native Terminal GUI/font rendering was not inspected: Computer Use explicitly
excludes terminal apps; a chat permission cannot enable it.
[Ready frame](0.3.1-rc.7-evidence/tui-ready-120x36.svg),
[light composer](0.3.1-rc.7-evidence/tui-composer-long-light-80x24.svg),
[permission](0.3.1-rc.7-evidence/tui-needs-you-permission-120x36.svg),
[narrow help end](0.3.1-rc.7-evidence/tui-help-end-80x24.svg).

### Final verification

All six complete runs include real Caddy 2.10.2 loopback integration. Native
vendor binaries use local API fixtures, preserving the workspace-write sandbox.

| Host | Node | Complete suite | Evidence |
|---|---|---|---|
| macOS arm64 | 20.20.2 | 878 total · 877 pass · 0 fail · 1 skip | [Log](0.3.1-rc.7-evidence/macos-node20.txt) |
| macOS arm64 | 24.22.3 | 878 total · 877 pass · 0 fail · 1 skip | [Log](0.3.1-rc.7-evidence/macos-node24.txt) |
| macOS arm64 | 26.13.1 | 878 total · 877 pass · 0 fail · 1 skip | [Log](0.3.1-rc.7-evidence/macos-node26.txt) |
| Linux x86_64 | 20.20.2 | 878 total · 874 pass · 0 fail · 4 skip | [Log](0.3.1-rc.7-evidence/linux-node20.txt) |
| Linux x86_64 | 24.22.3 | 878 total · 874 pass · 0 fail · 4 skip | [Log](0.3.1-rc.7-evidence/linux-node24.txt) |
| Linux x86_64 | 26.13.1 | 878 total · 874 pass · 0 fail · 4 skip | [Log](0.3.1-rc.7-evidence/linux-node26.txt) |
| Empty HOME, offline macOS | 26.11.1 | 878 total · 866 pass · 0 fail · 12 skip; installed PTY pass | [Log](0.3.1-rc.7-evidence/isolated-regression.txt), [PTY](0.3.1-rc.7-evidence/installed-pty.txt) |

The macOS skip is Linux-only process liveness. Linux lacks four Gemini native
cases. Isolation excludes native harnesses and the external Caddy binary;
those checks have separate host receipts. Syntax checks and the 30-file static
client build pass. Root and relay lockfile audits report zero vulnerabilities.
The final candidate's new terminal-width dependency is pinned at
`string-width@8.3.0` and exercised on Node 20, 24 and 26.
[Check](0.3.1-rc.7-evidence/check.txt),
[client manifest](0.3.1-rc.7-evidence/client-manifest.json),
[root audit](0.3.1-rc.7-evidence/dependency-audit.json),
[relay audit](0.3.1-rc.7-evidence/relay-audit.json).

A fresh task created by the exact public 0.3.0 tarball survived an upgrade to
this exact rc.7 tarball: all 14 task files and the visible CLI result remained
byte-identical after worker quiescence. [Upgrade](0.3.1-rc.7-evidence/upgrade.json).
CI is prepared but has not run on GitHub because no push was made.

### Physical evidence and remaining release gates

The physical device was an iPhone 15 on iOS 27.0.1 in Safari; its exact browser
version was not captured. iPhone Mirroring was unavailable in the region;
QuickTime supplied USB screen observation and the owner operated Safari.
Synthetic task creation/result reading and acceptance were observed in saved
state. The owner confirmed improved insets/selects/type, green command code,
and then the disappearance of scroll-header flicker on rc.6. Compact rc.7
result typography is installed at the retained private LAN fixture and was
checked in the matching Web assets. No broad physical qualification is inferred.

Still required for a full phone claim: time a fresh pairing with the worker
KDF; record exact Safari version; complete notes/decisions/permissions,
cancel/retry, background/lock, Wi-Fi loss with disabled mutations/no queue,
runtime restart and session rotation/revocation on the exact final artifact.
Repeat on Android before claiming Android support. The
[physical checklist](mobile-qualification.md) names the required steps.
For operated remote hosting, qualify two operator-owned HTTPS origins with
valid public certificates and a phone on another network. The loopback Caddy
and local-CA tests do not establish that service. Self-hosting remains an
experimental operator integration.

Review [changes, support and rollback](0.3.1.md). A stable version bump changes
package bytes and ACP metadata; pack/install that exact stable artifact before
publication and align site/npm/install instructions. Keep the private LAN
fixture/pairing material out of public evidence and revoke its authority when
physical review is finished.

## Earlier rc.2 snapshot — historical attribution

**First-use evaluation — GO** for the supplied `0.3.1-rc.2` on the checked
macOS/Linux hosts with an installed, authenticated supported harness.

**Public release — qualification in progress.** Physical iPhone testing is
being performed with the owner in Safari. iPhone Mirroring reports a regional
restriction; QuickTime provides USB screen observation. No physical pass is
inferred from responsive desktop captures. Operated public HTTPS qualification
is still pending if that service is offered. Self-hosting is explicitly an
experimental operator integration, with no supplied hosting service.

## Exact candidate

Version `0.3.1-rc.2`, tarball `0x2f-0.3.1-rc.2.tgz`, SHA256:
`e9f2ba531995fd9b2712d8c84ef23284f1f1a34a3f9cd3808109bf9fc9848115`.
Base commit `15a7b1f4ff88eb5c2c1c098976e9a1d00c641f42`, with uncommitted
fixes in `audit/prerelease-20261114`. Original main remains untouched.

All 82 shipped source files match installed macOS/Linux prefixes; the package
has 85 files. A clean offline verifier independently packed the same SHA and
installed it with an empty HOME and no inherited model credentials. Its
installed PTY scenario passed. [Artifact](0.3.1-rc.2-evidence/artifact.json),
[source manifest](0.3.1-rc.2-evidence/source-manifest.json),
[isolated receipt](0.3.1-rc.2-evidence/installed-verification.json),
[Linux installed match](0.3.1-rc.2-evidence/linux-installed-match.json).

This succeeds the [rc.1 audit](prerelease-audit-2026-11-14.md). Packaged changes
since rc.1 are package/ACP metadata, README, CLI help and hosted pairing files.
Execution engine and Web/mobile UI bytes match rc.1; its live Codex/OpenCode
engineering work and screenshots retain their original attribution.

## Additional findings closed

| Finding | Reproduction and effect | Fix and verification |
|---|---|---|
| F10 P1 — hosted pairing page | The supplied Caddy template returned 404 for `/pair?…`, while the local TLS fixture's custom router masked it. Netlify header paths were incorrectly indented. | Rewrite `/pair` to `pair.html`, preserving query; generate Netlify route/MIME hints. Real Caddy 2.10.2 serves all browser assets with matching bytes/MIME and proxies encrypted pairing/commands/SSE into persisted synthetic task state. This loopback HTTP test does not qualify an operated TLS service. |
| F11 P1 — deployment instructions | Installing dependencies inside `relay/` succeeded but a cold standalone start failed `ERR_MODULE_NOT_FOUND: ws`. Shell `export 0X2F_RELAY_URL=…` failed `not an identifier`. | Install from the complete repository root; show explicit flags and valid `env` syntax. A cold offline root install started the standalone relay and answered a pairing probe. [Receipt](0.3.1-rc.2-evidence/cold-relay-install.json). |
| F12 P1 — hosted trust configuration | The old entry point accepted a public HTTP client, the relay origin as client, and an omitted client that selected an unoperated example domain. Such configuration can expose the code or let a compromised relay replace its page. Reproduction used synthetic state and stubbed network calls; no interception is claimed. | Require configured origins, client HTTPS except loopback, and separate hosted origins. Reject credentials/path/query/fragment before changing config or contacting runtime/network. Flags override env, env overrides saved hosted config; saved LAN config is not a hosted fallback. Refusal/state-preservation and allowed-path regressions pass, as does full local TLS CLI pairing/rotation/revocation. [Before](0.3.1-rc.2-evidence/origin-before.json), [installed refusal](0.3.1-rc.2-evidence/installed-origin-refusal.json). |
| F13 P2 — Node 20 fixture cleanup | An initial matrix run hit `ENOTEMPTY`: the fixture removed a task directory after READY but before the worker's final writes/exit. | Wait for the fixture's process group to drain before resume/rerun/cleanup. Fresh complete Node 20/24/26 runs pass; no assertion was removed or production timeout loosened. |

The rewrite follows [Caddy's query-preservation behavior](https://caddyserver.com/docs/caddyfile/directives/rewrite).
Netlify hints use its [internal 200 rewrite format](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/);
Netlify itself was not deployed in this session.

## Fresh verification

All six source runs include the real Caddy integration. Native vendor binaries
are tested against local API fixtures; these are not live model/account passes.

| Host | Node | Complete suite | Evidence |
|---|---|---|---|
| macOS 26.6.2 arm64 | 20.20.2 | 860 total, 859 pass, 0 fail, 1 skip | [Log](0.3.1-rc.2-evidence/macos-node20.txt) |
| macOS 26.6.2 arm64 | 24.22.3 | 860 total, 859 pass, 0 fail, 1 skip | [Log](0.3.1-rc.2-evidence/macos-node24.txt) |
| macOS 26.6.2 arm64 | 26.11.1 | 860 total, 859 pass, 0 fail, 1 skip | [Log](0.3.1-rc.2-evidence/macos-node26.txt) |
| Ubuntu/Linux x86_64 | 20.20.2 | 860 total, 856 pass, 0 fail, 4 skip | [Log](0.3.1-rc.2-evidence/linux-node20.txt) |
| Ubuntu/Linux x86_64 | 24.22.3 | 860 total, 856 pass, 0 fail, 4 skip | [Log](0.3.1-rc.2-evidence/linux-node24.txt) |
| Ubuntu/Linux x86_64 | 26.13.0 | 860 total, 856 pass, 0 fail, 4 skip | [Log](0.3.1-rc.2-evidence/linux-node26.txt) |
| Empty HOME/offline macOS | 26.11.1 | 860 total, 848 pass, 0 fail, 12 skip; exact install/PTY pass | [Log](0.3.1-rc.2-evidence/isolated-regression.txt) |

The macOS skip is Linux-only zombie liveness. Linux skips four native Gemini
cases because that executable is absent. The isolated run skips ten native-CLI
cases, one Linux-only case and Caddy, whose external binary is intentionally
absent from its PATH. Caddy passed separately on both hosts.

Syntax checks, static client build and dependency audit pass. No vulnerable
dependencies were reported in root or private relay lockfiles. The client
build has 29 files including host hints; [manifest](0.3.1-rc.2-evidence/client-manifest.json).
The exact public 0.3.0 tarball created a synthetic READY task, then upgraded to
this exact candidate. All 14 task files and the visible CLI result stayed
unchanged. [Upgrade receipt](0.3.1-rc.2-evidence/upgrade.json).

The prepared CI matrix adds a dedicated Caddy job with a pinned version and
SHA512-verified official binary. Jobs use pinned actions, `contents: read`, no
persisted Git credentials and no publishing step. CI has not run on GitHub;
no push was made.

## Release handoff

Complete the [physical checklist](mobile-qualification.md) on this SHA, recording
actual OS/browser, task IDs, cleaned images and outcomes. Qualify Android
separately before claiming it. If public remote access is offered, qualify two
operator-owned TLS origins from a phone on another network. Local CA and
loopback Caddy tests remain separate evidence.

Review [changes, support, install and rollback](0.3.1.md), then authorize push
and run CI. A stable version bump changes package bytes and ACP metadata;
repack/install those exact final bytes before publication, and align the public
site, npm and install instructions. No commits, tags, push, publication,
production deployment or external messages were made in this session.
