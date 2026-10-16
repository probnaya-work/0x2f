# Bounded source search correction

Implementation: `9dac99872b2c4d2d9ba46617d66995c95eaefb86` on
`fix/managed-source-search`, in the existing durable foreground checkout.
No provider/model/route, credential, pricing or budget change.

The real Task #001 remains NEEDS YOU / MANAGED_INPUT_LIMIT: one attempt,
one inference, two reads, zero patches, 1,085 tokens and 7,786 result bytes.
All 454 files of the initialized `.work`, including its receipts, inputs,
configuration, sequence and task-owned worktree, match the before manifest.
It was not rerun, closed, altered or deleted. Task #002 was not created.

## Change and exact bounds

`search_task_file` searches a literal substring in one explicitly approved
logical file ID. Search itself uses only in-process string/file operations;
no shell, grep/rg, network, plugin, MCP or model-controlled executable.

- Query: nonempty, single line, **at most 128 UTF-8 bytes**.
- At most **6 matching lines**, in ascending 1-based line order (one hit per
  line), **160 UTF-8 bytes per excerpt**, **one context line on each side**.
- Complete serialized function-call result, including framing: **at most
  4,096 bytes**. Further matches/results are truncated rather than enlarged.
- Targeted `read_task_file`: 1-based start and **1–32 selected lines**,
  retaining the existing **4,096-byte content cap**. Legacy broad reads remain
  accepted. Nullable range fields keep the strict tool schema explicit.
- Both operations use the same contained, non-symlink, regular-file descriptor
  checks, bounded reads, immutable device/inode identity and content digest.
  Preflight excludes ignored/untracked inputs using tracked workspace paths;
  source tools spawn no executable. Private paths are excluded as before.

Search consumes the existing six-tool and 24 KiB returned-result budgets.
Search count/bytes appear in existing tool receipts, usage source-evidence
references and the shared CLI/TUI/Web projection; no second ledger was added.
No source content is persisted outside the existing bounded attempt artifacts.
API intents, patch fencing, atomic writes, immutable receipts, no-replay and
reconciliation are preserved.

The 8 KiB packet, 64 KiB approved source, four-file/two-write scope,
four-read/one-patch/six-tool, 2 inference/2 token-count/1 availability,
32 KiB serialized API input, 12,288 inference-token, 120-second and published
$0.024576 inference maximum limits are unchanged. Controls retain their prior
unpriced policy. No fallback, continuation, retry, delivery or extra attempt.

## Verification

**73 focused tests pass; npm run check exits 0**. All five changed JavaScript
files also pass individual syntax checks. **One full suite: 993 tests,
874 pass, 119 native skips, zero failures**, exit 0, 264,540.915292 ms.
No successful suite was repeated; full suite ran after focused checks passed.
Native LaunchAgent tests were disabled.

Coverage includes rejected non-manifest IDs, symlinks, replaced file identity,
changed bytes, ignored inputs, invalid/oversized queries and ranges, literal
metacharacters, excerpt/context/serialized-output caps, shared result/tool
ceilings, default 24 KiB exhaustion, ledger/projection, duplicate no-replay,
and foreground-only credential/tool dispatch. All Responses fixtures are fake
loopback transports with a fake in-memory key; real provider requests and
Keychain accesses/modifications: **zero**.

The Task #001-shaped fixture uses **31,003-byte and 3,046-byte** approved files,
with the relevant source at **line 301**, beyond an economical broad prefix:
search → targeted read → patch → deterministic verifier → **READY**.
It records **one attempt, two fake inference requests, two counts, one
availability, three tools (one search, one read, one patch)**. Packet:
**2,992 bytes**; returned results: **733 bytes**; serialized API input:
**22,832 bytes**; synthetic usage: **2,102 tokens**. The verifier exits 0;
no delivery exists and repeating the driver produces no new request.
See `offline-fixture.json`, `verification.json` and the logs.

## Preservation, verdict and limitation

Production/stable tracked bytes and package modifications, all production
Tasks (#2: 105 files; #3: 24), LaunchAgent configuration, editorial schedule,
runtime binding, existing `2f`, installed `2f-next` launcher and prior receipts
are preserved. The existing scheduler naturally advanced 154 → 155, changing
only its log/health files. No scheduler control was invoked; health is healthy.
See `preservation.json`.

**Ready for one separately user-authored foreground retry as Task #002**;
it was not started. Unattended execution remains NO-GO.
The two-response cap is intentional: search supplies evidence in response 1;
the targeted read executes before patch application in response 2, but cannot
feed a third model turn. The patch must already be justified by the search
excerpts and pass exact source/old-text checks. If more investigation is needed,
the existing limits still stop at NEEDS YOU. This correction has offline proof;
no new live model behavior is claimed.

Rollback: revert implementation `9dac99872b2c4d2d9ba46617d66995c95eaefb86`
with a new commit; preserve `.work` and all historical receipts. No further
milestone, Task, provider call or delivery was begun.
