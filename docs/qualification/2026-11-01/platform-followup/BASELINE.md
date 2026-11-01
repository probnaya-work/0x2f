# Platform and harness follow-up — 2026-11-01

Fresh continuation requested by the user. Starting checkout is clean on
`qualification/2026-11-01`, HEAD
`2e11f53b95c11ecc70eb4acef6127713f71ba168` (prior evidence), implementation
`ac1e7af3bed1ad28fc655e5b58a346ebad400399`, baseline 0.1.4
`809e3ab158a7304c9e07e9c6d95ce30542987460`. No subsequent changes were present.
The earlier 703/712 result is historical and will not count as a fresh check.
All eight original qualification reports and AGENTS.md were read; original
reports and evidence remain intact.

The explicitly authorized Lenovo endpoint is `192.168.1.80:22`, effective SSH
user `bogart`. Existing key/config authentication with BatchMode and strict
known-host verification succeeded. No credential guessing or network scan.
The first sandbox attempt was denied locally; elevated SSH reached the host.
Initial server inventory: Ubuntu 26.04.1 LTS, Linux x86_64; Python/git present;
Node/npm absent from the noninteractive PATH. Further inventory is retained
with Linux evidence. Qualification uses a new private directory, never an
existing workspace or its workers.

A verified local Git bundle at starting HEAD contains complete project history;
it will transfer the exact candidate without pushing. A Git housekeeping warning
about a preexisting internal worktree refs directory was observed; it was not
cleaned or treated as a product issue.

Official release inputs (queried 2026-11-01):

- https://github.com/nodejs/Release/blob/main/schedule.json — Node20 EOL
  2026-04-30; Node26 Active LTS begins 2026-10-28.
- https://nodejs.org/dist/index.json — latest stable LTS observed v26.13.0,
  Lithium, released 2026-10-28. Downloads must be isolated and checksum-checked.

Scope ownership: root performs Lenovo/Linux qualification and integrates fixes;
independent agents perform macOS/runtime and real-binary/mock-API investigations.
Live-provider calls require a separately approved bounded series if they incur
cost. No release/tag/push/publish operation is authorized.
