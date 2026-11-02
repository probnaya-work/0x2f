# Limitation register — engineering expansion

Each row has an observable consequence, source, remedy/dependency and completion test.
Status is updated with implementation/verification; a prepared integration is not live qualification.

| ID | Consequence and confirmation | Source | Resolution/dependencies | Completion criterion / status |
| --- | --- | --- | --- | --- |
| E1 | CLOSE can leave an agent waiting forever; actions/worker preserve DONE | our code | attempt-owned cancellation and explicit UI | live permission + resistant descendant cancellation, partial result, retry; implementing |
| E2 | saved PID can refer to a different execution; local node signals PID | our code | nonce request consumed by owning worker; process generation | stale request cannot signal another process; implementing |
| E3 | dead worker looks WORKING until startup; recovery only in serve startup | our code | nonoverlapping periodic sweep, preserve uncertain side effects | worker death becomes failure without replay |
| E4 | descendants outlive worker and block retry; existing orphan regression | architecture/OS | own group stop; do not kill stale groups | group cleanup on cooperative cancel; escaped groups remain explicit external containment gap |
| I1 | concurrent tasks edit one checkout | architecture | isolated Git worktree default, explicit serialized shared mode | two tasks independent; no dirty baseline loss |
| I2 | same-status edits disappear; worktree.mjs compares status codes | our code | content snapshots and immutable per-run patch | modify dirty file twice, later edit never alters historical patch |
| I3 | no safe review/apply/cleanup | our code | checked patch transfer, retain checkout/archive | conflict refuses atomically, incomplete work retained |
| I4 | non-Git, binary, symlink/untracked semantics unclear | missing implementation | explicit fallback and Git-native tree snapshots | fixtures for every shape; no external symlink traversal |
| C1 | rerun input grows without bound, duplicates Verification, flattens notes | our code/project.mjs | deterministic budget, preserve binding input, refs/hash receipts | bounded history, multiline exact notes, no silent constraint truncation |
| C2 | changed rules absent from old task | our code | version/hash current rules per run, immutable original | visible context revision and exact delivered input |
| C3 | note persistence mistaken for live delivery | transport gap | next-run receipt; live steering only after delivery acknowledgment | no unsupported live claim; active transport qualification separate |
| H1 | executable detection implies readiness | our copy/default | honest discovery and deterministic available default | one available CLI selected, auth remains unknown |
| H2 | Cursor paths/commands missing on partial ACP updates | our normalization | merge by toolCallId, retain rawInput/locations/results | incremental raw ACP fixture survives through ledger |
| H3 | permissions/resume vary by harness/version | external CLI / verification | record negotiated capabilities, pinned live probes | separate discovery/auth/run/resume/permission/cancel matrix |
| H4 | REFINE narrow tool restriction only available on Claude | external CLI | enforce text-only supported mode, preserve source on errors | tool-free transport proof before expansion |
| M1 | service PATH/auth differs from shell | environment | explicit persistent prefixes/unit, host diagnostics | installed bounded task and restart on actual Linux |
| M2 | update/rollback/backup lacks executable procedure | missing tooling | quiescent private snapshot/restore, immutable prefixes | tasks/history survive restore without replay |
| M3 | node label cannot execute remotely | architecture | explicit SSH control connection to host-owned API | actual remote host identity/capabilities/workspace shown, no fake subprocess migration |
| M4 | migration has no files/credentials/dirty semantics | architecture | no active migration; explicit transfer protocol prerequisite | remains unavailable until full transfer qualified |
| P1 | phone cannot create/select next harness intuitively | UI | phone composer + available harness picker | remote create/rerun against selected host/workspace |
| P2 | re-pair evicts previous phone | protocol | independent registrations/revocation threat model | two keys independent; revoked device denied without disrupting other |
| P3 | FAILED quiet; closed browser has no push | our policy/platform | failure alert, supported external push needs verified TLS/subscription | foreground/background/closed matrix, do not label Notification push |
| P4 | LAN HTTP bootstrap exposed to active MITM | infrastructure | existing TLS relay/client deployment with operator domain | end-to-end external TLS control; no new paid resources |
| P5 | stale occurrence/replay/offline requests can authorize wrong work | security contract | retain occurrence IDs, persisted replay cache, freshness, no queue | regression including cancel and new controls |
| R1 | result/check claims lack execution receipts | provider observability | preserve command outputs/status/exit code when supplied; opt-in project checks | captured receipts distinct from provider prose and unknown values |
| R2 | ACCEPT indistinguishable from DROP/CLOSE | our history | disposition field/event, status unchanged | all clients persist explicit disposition |
| O1 | remote CPU does not identify task/run/process | absent evidence | real execution/session/process/machine identity claims; observer-owned collector | identity chain proven or unknown, no CPU inference |
| O2 | stale/source-offline conflated with idle | observation contract | source expiry and reboot identity fixtures on existing Core | loss/reconnect shows unobserved, stable machine |
| O3 | physical Display freshness/pixels/battery unqualified | verification/hardware | existing signed Display and pinned engine | physical observation separate from deterministic/GPU/perf results |
| U1 | long output/narrow layout/keyboards can hide actions | UI | preserve both themes, explicit controls/readers | narrow/desktop geometry and keyboard checks |
| D1 | docs still say publication pending after 0.2.0 | our docs | update stale notices, candidate scope separate | publication copy agrees with published version |

This register covers the requested directions, not an assertion that every
unknown defect has already been discovered. Release evidence, capability maps,
research and raw fixtures remain original dated evidence. Current source is the
basis for changes, and subsequent reports must identify every open row.
