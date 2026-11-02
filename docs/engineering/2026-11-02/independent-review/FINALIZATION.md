# Finalization after independent review — 2026-11-02

This is a focused follow-up to REPORT.md, not a new audit. The current PR heads/bases
were checked against GitHub before edits; no newer work was overwritten.

## Canonical Linux AI gate

**BLOCKED by external free quota** after ThinkCentre returned to the network.
The initial network failure is resolved: hostname thinkcenter, Linux, production
0x2f-host.service active. The stored tarball SHA256 was rechecked and all83 files
in the installed Lenovo qualification package matched it byte for byte:
`4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626`.
The existing Mac prefix also matches. No registry0.2.0 replacement was installed;
product bytes remain implementation839e980dd20db3ea058ef4abc707ceeb322a0e93.
A pack after report-only updates remained identical.

Two bounded, distinct real attempts were retained, with no further retries:

1. Existing OpenCode2.2.5 ACP/default model, requested opencode/big-pickle
   (read from this exact session's model metadata); session/execution IDs stay
   in private evidence.
   First AI run failed with `Free usage limit reached`.
2. The already available catalog exposed explicitly named free models. One
   alternative used the stock installed command provider and per-run
   `opencode run --model opencode/deepseek-v4.1-flash-free --auto`, with a private
   provider manifest. This also failed on the first run with the same free-quota
   error. Its execution ID stays in private evidence. The command transport
   did not provide an external OpenCode session receipt; it remains unknown.
   The argv records the requested model, not a model acknowledgement.

Both used existing unauthenticated free access (`No authenticated integrations`),
Node26.13.0, the unchanged installed tarball, new private workspaces and unique
transient units/loopback ports. No account, credential transfer, paid provider
or global model setting was added. No other supported harness binary was found
on the explicit qualification PATH.

Both runs saved the real input receipt/hash and remained FAILED with zero
configured checks; no acceptance or successful AI continuation is claimed.
The input SHA was b1a41e0ec795d5beea01dad8a20a40c4c026a52b3522d795a29bfcccc7cc94d8.
Note-during-work and disconnected-launcher/runtime-restart worker preservation
passed before the provider failures. The controllers then stopped their own
units, leaving production active. The prior deterministic restore success stays
historical and does not replace this missing full AI loop.

To close the gate, restore available free quota or provide an existing permitted
Linux harness, then rerun the complete two-AI-run/check/backup/restore controller
on the same hash. A paid route still requires separate permission. Do not repeat
calls against the same quota failure. Private logs, inputs and receipts were
retained outside Git; the controllers are based on installed-live.mjs and keep
its ABS_PACKAGE ABS_NEW_PRIVATE_ROOT linux interface.

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
The earlier signed217403c artifact's physical observations remain historical;
revised refusal/preview/fresh-code acceptance and approved selective revocation
are not claimed complete until observed. See the updated Mobile report.

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
