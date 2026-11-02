# Finalization after independent review — 2026-11-02

This is a focused follow-up to REPORT.md, not a new audit. The current PR heads/bases
were checked against GitHub before edits; no newer work was overwritten.

## Canonical Linux AI gate

**PASS — PR #5 GO for integration.** The full real Linux AI/check/backup/restore
loop completed using Codex CLI0.166.0 through direct on-host ChatGPT login,
provider openai/model gpt-6.1-sol. The canonical tarball remains
`4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626`;
all83 files matched in a new offline qualification prefix. Product source stays
839e980dd20db3ea058ef4abc707ceeb322a0e93; no registry package substituted.

Both runs on one Task passed independent configured checks (11base, then7more).
The note and current rules are in run2's exact input; launcher disconnect and
runtime restart preserved the worker. Quiescent backup, new-directory restore,
independent restored assertions, all57 unchanged original state files and no
restored execution/replay passed. No ACCEPT was inferred from checks.

The additional free OpenCode glm-5.3-flash-free attempt failed quota; the first
Codex attempt failed its checks because bundled bwrap could not start commands.
Both failures remain evidence. After the owner installed the official distro
bubblewrap dependency, standard workspace-write/network isolation worked and the
whole loop passed in a fresh root. No API key, Mac credential copy, paid API,
global security disable, bypass, production service or pairing change was used.
All qualification units are inactive and production active.

[Full receipts, hashes, failed-attempt scope and exact execution](LINUX-AI-GATE.md).
[Controller options and setup](LINUX-AI-CONTROLLER.md).

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

### Follow-up rejected-code correction

The expiry test exposed a stop/start loop when local trust validation rejected a
barcode. Mobile5f8435edb598ef6e73702f1a905bf6c659dc83e4 keeps native preview active,
suppresses repeated rejected frames, stops capture only on accepted delivery and
shows explicit CODE EXPIRED/CODE NOT VALID. Trust checks are unchanged. A red
callback-count regression failed30vs1; all32Swift tests/6suites then passed, as did
Release and signed physical-iOS builds. The new exact signed Dev17 is installed,
CodeDirectory98250452b55fbd35dc54bffd1d447dfa686e59bc, bundle manifest digest
f1714b8e18a4679f08efcf51f666fb23ded08d1b750ea04ac9cbc79bfeb9329f.
On this exact revised artifact, the owner confirmed CODE EXPIRED, stable
preview and CANCEL → CONNECTED. The approved selective Dev revocation produced
Pairing no longer accepted — scan a new QR on the phone. A fresh QR from the
same Core restored the same Dev device identity; the Core trust API verified
the old certificate revoked and one newer active certificate. Other devices
were unchanged, Revoke All was not used, and the production app was untouched.
The owner's general works confirmation after re-pairing is not expanded into
separate revised-build rotation/Home/Wi-Fi assertions. The earlier217403c
normal-path/permission results keep their original scope. Physical in-session
interruption/runtime-error recovery remains UNVERIFIED and is transferred, with
explicit owner acceptance, to a separate Mobile follow-up task. No manual Siri
check continues here. This condition still governs Mobile promotion, but no
longer holds 0x2F finalization; see the Mobile report.

## Subsequent integration and release order

1. 057 #1 may merge into its named engineering base with its reader opt-in;
   site #2 may merge factual unreleased documentation. Neither implies production rollout.
2. 0x2F #5 is now GO: the canonical Linux two-AI-run/check/restore gate is closed.
   Merge the verified branch when authorized, without substituting registry0.2.0.
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
