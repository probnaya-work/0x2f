# New findings and changes — platform follow-up

Source candidate: `2941c028b00310f941ced0ed7d7ba5aa48f6d016`, descended from
`ac1e7af` and prior evidence commit `2e11f53`. Original findings/evidence are
preserved. These are new observations, not a restatement of the historical
703/712 result.

| Finding | Reproduction | Fix / commit | Validation |
| --- | --- | --- | --- |
| Node20 default test command discovers no tests | Actual `npm test` with official20.0.0 and20.20.2 treats quoted `test/*.test.mjs` as a literal path and exits1 | `scripts/test.mjs` enumerates the same top-level test files, forwards Node test options and propagates failure; `14a5394` | Before logs in macOS runtime folders; final actual npm test on each matrix cell |
| Codex0.166 saved-session resume rejects sandbox argument | Two real-binary/mock-API probes fail before model request: `unexpected argument '-s' found` | Put sandbox args on `exec` before `resume`; `66651fb` | Native start/resume retains same session ID, prior assistant marker and workspace-write prompt; fixture argv regression. Integration tests now retain workspace-write instead of historical bypass |
| Pairing config can be read while truncated | Full latest20 suite loses pairing ACK; deterministic delayed-write test reproduces the same failure | Reuse atomic JSON temp+rename writer with0600 mode; `ff724d5` | Delayed write before/after and38 relay/pairing tests; final full matrix |
| Overlapping startup polls connect before the key is ready | Linux full LTS suite still loses pairing after atomic-write correction; holding first key derivation reproduces premature connection deterministically on macOS too | Serialize the complete config read/key derivation/transport transition, with stop checks after awaits; `2941c02` | Held-derivation before/after regression and39 relay/pairing tests; final full matrix |
| CLOSE wording implies execution stops | CLI help says “stop working”; Web action has no cancellation explanation | CLI help/output plus Web title/accessible label and successful-close notice explain noncancellation; `8882951` | Syntax/full suites; existing running-task close invariants retained. README already describes active-provider and late-permission behavior |

## Qualification fixture/environment corrections

Linux's first full fixture suite executed712 tests:701 passed,2 failed,9
native-binary cases skipped. The two failures were real fixture setup errors:
the throwaway Git repository silently failed to commit without an ambient
author identity. `14a5394` supplies identity only for that fixture's commit
and asserts init/add/commit success. No Lenovo/global Git configuration changed.
The product's worktree observation code was not changed.

Repeated initial Linux suites also recorded remote pairing timeouts. The
intermediate8882951 LTS run had714 tests,703 passed,1 failed,10 skipped;
its fallback hung in the relay-config test. That owned fixture process was
terminated only after checking its current exact command and unique cwd via
/proc, never from a saved task PID or group ID. The startup poll regression
then reproduced the remaining race and led to2941c02. Earlier failures and
termination evidence are retained; passing focused reruns do not erase them.

Offline npm9 and npm11 use different escaped public registry URLs and Accept
headers. The new isolated matrix runner seeds equivalent aliases/media variants
from the exact lockfile package versions, preserving tarball integrity.
Initial ENOTCACHED failures are retained as test-environment failures, not
product install defects. Final isolated installs need no registry/network.

A protected Codex mock command run failed because an extra outer macOS
seatbelt prevented Codex applying its own sandbox. The same fixed local
command passed with Codex's normal workspace-write sandbox and an explicit
loopback mock endpoint, clean HOME and dummy credentials. No sandbox bypass or
live-provider call was used.

The first SSH attempts intermittently timed out after successful authentication.
A strict-known-host persistent connection subsequently worked. A bundle made
with only a HEAD ref could not be cloned using a nonexistent named branch;
fetching HEAD into an initialized isolated checkout preserved exact history.
Both failed command outputs remain evidence. No network scan, credential
guessing, global runtime install, existing-workspace update or publication
was performed.

## CLOSE remains a product limitation

Closing marks a task DONE and removes it from active attention. It does not
cancel an active provider, answer a permission or resume a session. A late
permission after close can leave the provider waiting. The copy correction
does not resolve that lifecycle limitation; changing it needs a product
decision. Existing tests verify late successful/failed run completion does
not reopen the closed task.
