# Managed foreground B — offline candidate

2026-10-29. Implementation: `d9b065c993971691f3ce6f87617096a9d2f133b9`.
Base: `401c36f`. Policy: `managed-foreground-b-v1`; same AUTO lane and `gpt-5.4-mini-2026-03-17`.

B applies to new Tasks: one attempt; 6 inference + 6 count + 1 GET (13 HTTP,
7 unpriced controls); 16,384 input + 4,096 output = 20,480 tokens cumulatively;
published inference maximum **$0.030720**. Each count/inference body ≤16 KiB,
their actual serialized UTF-8 bodies ≤192 KiB cumulatively, both checked before
count dispatch. Input/output per inference remain 4096/2048. No price refresh;
control fees and total billing remain unknown, no contractual zero-fee claim.

10 tools, 4 reads (1–32 lines/4 KiB), one patch with a reserved tool slot. Source 64 KiB, packet
8 KiB, results 24 KiB, four approved files/two writable files and 120s deadline
remain bounded. Search gains query-free outline (`query:null,start_line:1`),
≤24 anchors/2048 serialized bytes, ≤160-byte excerpts, monotonic next_line;
literal search uses start_line:null. Both share source fences and result ledgers.
Outline is a fixed declaration/branch heuristic, not a parser or reliability proof.

Offline: 125/125 focused; syntax/check exit 0; serve 4/4; final full **901 pass,
119 skip, 0 fail (1020 total)**. The first full had one ENOTEMPTY cleanup race:
READY precedes the fixture worker's final event append. A three-line test-only
wait for that worker's exit fixed it; runtime unchanged. Final full ran only
after that concrete failure, targeted proof and check; no successful full repeated.

Reused two-file fixture: 3 misses → 2 outlines → 2 literal locators → 2 reads →
one multi-file patch → external verifier 0 → READY. Six inference/count pairs,
10 tools, 6306 synthetic tokens, 2833 result bytes, 77804 input bytes;
max body 7995 bytes. Separate tests reach the full token ceiling, reject the
next reservation before inference, and retain unknown-usage reservations.
Duplicate/restart, ownership, deadline, negative verifier and shared projections pass.

Zero provider calls/Keychain reads; no Task 006. All 2413 candidate .work files
apart from engineering.json are byte/mode identical, including Tasks 001–005,
worktrees, receipts and allocator. Only four approved candidate config limits
changed to 30720 micros / 20480 tokens / 6 inference / 13 HTTP. Production/stable
code, packages, configuration, LaunchAgent and bindings match baseline. Existing
scheduler independently updated health/log at 02:00Z (success, empty results);
these two observed changes are recorded, not restored. Other 311 production
.work files match. Legacy task projections match exactly.

Verdict: **offline PASS/candidate**; historical simple live canary unchanged.
Ordinary live B remains unqualified; unattended NO-GO. No live, delivery, new
provider, profile or framework. Live requires separate authorization/evidence.
Rollback: revert implementation commit and restore the four prior project limits
from audit.json.gz; retain Task history. audit.json.gz records comparison roots, config
values and log hashes; flow.json.gz contains bounded synthetic native evidence.
