# Threat model

Scope: local runtime, installed artifact, TCP/HTTP/WebSocket server, pairing
transport and agent, provider admission and ACP permission channel. Baseline
`809e3ab`; all exploitation used synthetic data and local fixtures. No public
relay, real credential, pairing secret, or paid model workload was used.

| Actor / asset | Boundary | Evidence / disposition |
| --- | --- | --- |
| Unpaired LAN client → private task data and execution actions | All-interface listener → purported local Host → shell cookie | **CONFIRMED:** a private TCP source forged loopback Host, received cookie, read a sentinel and invoked a stub action. Fixed using actual peer address. [Probe](evidence/security/lan-host-repro.txt) |
| Caller knowing a prior request ID → cached private response | Idempotency lookup → authentication / route | **CONFIRMED:** initial replay bypassed auth; independent challenge also recovered responses through POST health/static/root paths. Cache now follows boundary/auth checks and is scoped to authenticated API route+method+key. [Intermediate failure](evidence/security/intermediate-cache-route-failure.txt) |
| Remote client after pairing disabled → relay connection surface | HTTP policy → WebSocket upgrade | **CONFIRMED:** disallowed Host upgraded after pairing disabled. Shared peer/Host/browser and active-LAN gates now precede upgrade. Device authentication and E2E were still required before the fix. |
| Concurrent ACP requests → a human's one-operation authorization | Persisted decision → JSON-RPC permission response | **CONFIRMED:** one grant approved two requests in five trials. Queue one request, validate typed RPC ID and fresh occurrence nonce, consume before publishing the next request. Missing-channel allow-only requests cancel. [Baseline](evidence/security/baseline-acp-concurrency.txt) |
| Reused ACP RPC ID → old grant | Correlation ID → permission occurrence | **CONFIRMED by independent challenge:** replayed prior decision could approve a later operation with the same RPC ID. Occurrence nonces prevent this. Current UI/remote gestures carry displayed nonce as a shared-action precondition. |
| Another CLI/server/worker → task context and history | Filesystem read/modify/write | **CONFIRMED:** collisions, lost notes, stale outcomes and duplicate execution. Global allocation lock, per-task cross-process lock and run+PID worker ownership now cover publication. |
| Other local OS user → prompts, results, logs, credentials | POSIX permissions | Existing owner-only task directory/files and relay configuration tests retained. New locks publish initialized owner-only directories. No guarantee against another process running as the same user. |
| Repository/provider content → filesystem/processes/model prompts | User's trust in workspace and configured harness | Manifests spawn fixed argv, not shell strings, and validate placeholders. 0x2F does not supply OS isolation; harness permissions and repository trust remain necessary. Prompt injection resistance was not established. |
| Relay operator / passive network observer → content and commands | E2E envelope, origin policy, credential isolation | Existing crypto/tamper/replay/rotation/projection tests passed in local fixtures. This is regression evidence, not an independent cryptographic proof or live hosted-relay audit. |

Pairing bootstrap on plain HTTP LAN remains vulnerable to an **active network
attacker** serving modified client code; this is already documented in
[remote-control.md](../../remote-control.md). Trusted Wi-Fi is a prerequisite.
HTTPS hosted delivery is a separate operational boundary and was not deployed
or attacked here. A malicious same-user repository/provider can read process
credentials and state; file modes and E2E do not defend that boundary.

New lock safety was independently challenged with ten processes and 500
critical sections plus dead-owner/replacement races. It depends on local
filesystem atomic rename and process liveness, not on wall-clock leases.
PID reuse may cause conservative busy timeouts. Network filesystem semantics
and cross-host shared state are unqualified.
