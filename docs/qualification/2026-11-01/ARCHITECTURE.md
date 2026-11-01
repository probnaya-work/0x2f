# Architecture and critical risk map

Reconstructed at `809e3ab` from runtime, store, actions, worker, provider and
server source. Repository architecture documentation supplies intent; the
findings distinguish that intent from actual behavior.

CLI, TUI and HTTP call `createRuntime` → shared actions → filesystem store and
execution node. The local node spawns a detached worker per run. Each worker
loads the workspace's provider registry and invokes a native, ACP or command
adapter. Provider sessions are disposable; task.json, original prompt.md,
per-run prompts/results and events.jsonl carry task continuity.

All execution is local. Remote pairing controls local actions through an
encrypted projection and command channel; it is not remote execution. In LAN
mode the HTTP listener binds all interfaces, making peer identity and routing
guards security boundaries. A separate hosted relay forwards opaque envelopes.

| Critical invariant | Boundary / risk | Qualification focus |
| --- | --- | --- |
| Task IDs are unique; acknowledged work is retained | list/max/write allocation spans processes | Simultaneous real CLI creates, identical and distinct briefs |
| One task has one live execution | create/rerun/resume reservation → worker | Duplicate resumes, live permission rerun, stale workers |
| Human context and closure outlive provider sessions | action and worker read/modify/write | Notes and close while provider is running |
| task.json is always a complete document | published on-disk reader contract | Preserve temp+rename, add concurrency serialization |
| Previous results and exact input survive provider changes | project prompt assembly → run artifacts | Fake command/ACP handoff with notes/results |
| Dead execution is visible and recoverable | process → startup recovery | Kill working and live-paused workers |
| Local API remains local during LAN pairing | TCP peer/Host → cookie/auth/action | Forged loopback Host, cache replay, upgrade gates |
| Every permission authorizes its intended operation | request ID → decision file → ACP response | Duplicate/concurrent requests and stale grants |
| UI controls the requested repository | health probe → runtime reuse | Two workspaces on the same port |
| Installation location does not alter execution | file URL → process argv | Paths with spaces; npm pack/install |
| Verification failure is observable | subprocess exit → npm script | Deliberately invalid JavaScript |

Provider and repository code execute with the user's local permissions;
workspace-write enforcement is delegated to capable harnesses, not supplied by
0x2F as an OS sandbox. Project prompts, manifests and provider stdout are trust
inputs. Owner-only files mitigate other local users, not malicious same-user
processes. Whole-file atomic rename provides visibility atomicity, not fsync
power-loss durability or a multi-file database transaction.
