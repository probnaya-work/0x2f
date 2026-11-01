## Result

Implemented the dependency-free duration formatter and executable CLI.

## Evidence

- [duration.mjs](duration.mjs) exports `formatDuration(seconds)`, validates safe integers, and formats unbounded hours as `H:MM:SS`.
- CLI tests verify canonical input, newline output, and invalid arguments producing stderr, nonzero exit, and no stdout.
- Maximum safe integer formats as `2501999792983:36:31`.

## Changes

Added executable `duration.mjs` (mode `755`) and [duration.test.mjs](duration.test.mjs). No dependencies, commits, or `.work` edits.

## Verification

`node --test duration.test.mjs` on Node.js v24.14.0: **56 passed, 0 failed, 0 skipped**. Includes boundary values, import behavior, and direct executable invocation.

## Needs human decision
REQUIRED: no