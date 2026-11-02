# Scope and remaining work

Published npm **0.2.0** remains the baseline. No tag/package version was changed.
The integration candidate now adds attempt-owned cancellation and recovery,
isolated Git task checkouts and saved patches, bounded context receipts, richer
ACP/native check evidence, opt-in project checks, private backup/restore, explicit
pinned SSH host control and mobile authoring/next-run controls.

See the [engineering report](engineering/2026-11-02/REPORT.md),
[limitation register](engineering/2026-11-02/LIMITATIONS.md),
[contracts](engineering/2026-11-02/FOUNDATIONS.md) and
[operations](engineering/2026-11-02/OPERATIONS.md) for implementation, evidence,
access blockers and migration boundaries. These features require the integration
source and are not advertised as a new registry release.

The next release should consolidate this execution/isolation/context foundation
and the already tested host/mobile controls after review and final installed-
package/device gates. Keep READY a review boundary and independent checks opt-in.
Retain the compact lifecycle and explicit human ACCEPT/DROP/CLOSE history.

Still open: OS containment for deliberately escaped processes; universal live
harness parity and safe tool-free REFINE beyond Claude; acknowledged live
steering; task/files/history/credential migration; independent multi-device
revocation; operated HTTPS/push infrastructure and closed-client delivery;
physical cold reboot and long-run power/thermal/freshness qualification.

057's remote metadata reader and generation claims are a separate observer
candidate. Its Core/storage/Landscape remain independent of 0x2F. Actual SSH,
persistence, rendering and battery acceptance have separate gates. The parallel
FIELD material/motion work retains its own source and acceptance process.
