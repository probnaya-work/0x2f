# Finalization after independent review — 2026-11-02

This is a focused follow-up to REPORT.md, not a new audit. The current PR heads/bases
were checked against GitHub before edits; no newer work was overwritten.

## Canonical Linux AI gate

**BLOCKED at network access**, not newly assessed as quota failure. The existing
Thinkbox/Lenovo target bogart@192.168.1.80 did not answer bounded SSH/ICMP probes;
the owner reproduced `No route to host` from their Mac Terminal. The owner uses
this machine headlessly over SSH. The literal thinkbox alias and saved hostname
thinkcenter.local did not resolve. No host keys, firewall, network settings,
provider credentials or production service were changed.

The unmodified canonical tarball SHA-256 remains:
`4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626`.
All 83 packaged files in the existing Mac qualification prefix match it byte for
byte. Product src/package/README/LICENSE remain identical to implementation
839e980dd20db3ea058ef4abc707ceeb322a0e93. No registry replacement was installed.
Previous final Linux results in REPORT.md remain historical evidence: the first
real OpenCode run/check passed, continuation hit free quota. A fresh bounded
whole-loop retry is prepared from installed-live.mjs, with only a unique unit
name and isolated test port changed. It has not been sent or executed while the
host is unreachable. Its CLI remains ABS_PACKAGE ABS_NEW_PRIVATE_ROOT linux.

To close the gate, restore SSH to the same trusted Thinkbox (current reachable
IP/hostname), recheck installed package bytes and existing OpenCode auth, then
run that controller once. Do not replace success with the deterministic fixture,
transfer credentials, create accounts or enable a paid provider. If free quota
still refuses, report that exact outcome and stop repeated attempts.

## Mobile correction and qualification

Source correction checkpoint: 217403c06dad44d768a0791ae521d66e4b579a2f.
The diagnostic CoreImage/UIImageView/video-data path, per-frame conversion,
brightness samples and first-frame/presentation logging are removed. Ordinary
AVCaptureVideoPreviewLayer and RotationCoordinator/KVO handle preview/rotation.
The bounded preview-flow timeout observes isPreviewing; it does not claim that
frames contain useful imagery. Interruption/runtime-error handling, retry and
start-generation guards remain, including a generation check on permission callbacks.

Swift: 30 tests / 5 suites passed. Release generic physical-iOS build passed;
exact signed Debug build 17 passed and was installed as a normal update to the
existing development bundle. Signature verification passed. Production bundle
work.probnaya.057.display.mobile build14 and its app group were unchanged; no
uninstall, keychain reset, renderer pin change or version bump occurred.

Exact signed bundle: work.probnaya.057.display.mobile.dev, 1.0.0(17),
CodeDirectory hash 122474e38bbb55a73b87a666128bf1482339dd70.
Private bundle file manifest digest:
9cb91c1dc609f3a8bf43b61f48dea9daa85d0e39c4a5b761942fdeb5be0e692a.
Device: iPhone15, iOS27.0.1. Device Hub remained closed; no remote camera control
or debugger was attached during the owner's direct-on-phone acceptance.

The owner confirmed this exact new installation: existing trust CONNECTED,
live native preview, portrait/landscape rotation, scanner CANCEL/reopen,
fresh QR from the existing intended 057 Dev Core to FIELD/CONNECTED,
Home/foreground reconnect, honest Wi-Fi disconnect/reconnect, denied Camera
UI and settings permission recovery. The Core independently displayed DISPLAY
CONNECTED after the fresh bootstrap. These are owner-observed physical results,
not inferred from compilation or capture.isRunning.

Remaining fault-case observations and final verdict are recorded in the Mobile
review. The dated Device Hub diagnosis is retained as historical evidence.

## Subsequent integration and release order

1. 057 #1 may merge into its named engineering base with its reader opt-in;
   site #2 may merge factual unreleased documentation. Neither implies production rollout.
2. Keep 0x2F #5 on merge hold until the canonical Linux two-AI-run/check/restore gate
   completes. Then merge the verified branch without substituting registry0.2.0.
3. Merge Mobile only after its explicit remaining physical gates are closed.
   Keep the existing renderer pin and distinct Dev/Release identities.
4. Propose **0x2F0.3.0** for the subsequent delivery: this is an additive engineering
   expansion over published0.2.0, not a registry0.2.0 rebuild. Do not change the version
   in this finalization. A later release change must cut a new identified tarball,
   validate installed packaging and bind it to the reviewed product source/dependencies.

No PR merge, npm publish, release/tag, site deployment or production runtime
replacement is performed by this follow-up. Only runtimes created for this
follow-up may be stopped; the owner's existing Core/service/pairing is preserved.
Full final HEAD/base SHA and private artifacts remain in FINAL-STATE.json.
