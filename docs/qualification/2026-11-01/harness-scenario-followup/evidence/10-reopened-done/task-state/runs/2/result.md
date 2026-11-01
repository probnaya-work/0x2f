## Result
Extended the existing duration formatter with `--sum` and fixed the non-canonical path-alias entry-point bug. I inspected and preserved the prior run's [duration.mjs](duration.mjs) and [duration.test.mjs](duration.test.mjs) rather than replacing them, per constraint marker **SUM_CONTRACT_01**.

## Evidence
- Prior implementation read: `duration.mjs` exported `formatDuration`, validated non-negative safe integers, and used `import.meta.url === pathToFileURL(process.argv[1]).href` for entry detection.
- Prior tests read: `duration.test.mjs` contained 56 passing tests covering formatting boundaries, invalid one-argument CLI inputs, silent import via `-e`, executable mode/shebang, and direct invocation.
- Reproduced the reported alias bug: invoking `/var/folders/.../duration.mjs 0` exited 0 with empty stdout, while `./duration.mjs 0` printed `0:00:00`.
- Reproduced the same failure through a symlink alias, confirming it was non-canonical path comparison rather than macOS-specific only.
- Entry detection now compares `realpathSync(process.argv[1])` with `realpathSync(fileURLToPath(import.meta.url))`; import detection still returns false when `argv[1]` is absent or different.
- `--sum` accumulates with `BigInt`, rejects any non-canonical or unsafe operand, and checks the total against `Number.MAX_SAFE_INTEGER` before writing stdout.

## Changes
- [duration.mjs](duration.mjs): added canonical operand parsing, `--sum` support, exact BigInt accumulation with overflow rejection, and realpath-based entry-point detection. Existing `formatDuration` and single-argument CLI behavior are unchanged; file remains executable (`755`).
- [duration.test.mjs](duration.test.mjs): added `--sum` boundary/zero/multi-operand tests, missing/malformed operand tests (`1e2`, `01`, `1.0`, whitespace, etc.), exact max-safe-sum success, overflow rejection, symlink alias execution, macOS `/var` alias execution, and silent import from a separate script.
- No dependencies, network access, commits, or `.work` modifications.

## Verification
- `node --test duration.test.mjs` on Node.js v26.11.1: **82 passed, 0 failed, 0 skipped, 0 cancelled** (about 3.06s).
- `./duration.mjs --sum 0 59 1` → `0:01:00`, exit 0.
- `./duration.mjs --sum 9007199254740991 1` → exit 1, empty stdout, usage/overflow message on stderr.
- `/var/folders/.../duration.mjs 0` (the `/private` alias) → `0:00:00`, exit 0.
- Existing single-argument invocation `./duration.mjs 0` still prints `0:00:00`.

## Needs human decision
REQUIRED: no