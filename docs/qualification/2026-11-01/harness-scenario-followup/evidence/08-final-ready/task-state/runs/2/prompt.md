You are working on one bounded engineering task inside an existing repository.

PROJECT CONTEXT

# Project

Describe the project once.

Examples:
- stack / repository layout
- important architectural boundaries
- important product context
- relevant ownership

WORKING RULES

# Working rules

- Investigate before making broad changes.
- Prefer existing patterns.
- Keep changes scoped to the task.
- Avoid unrelated refactors.
- Run relevant tests/checks.
- Cite concrete files and evidence in the final result.

KNOWN PROJECT KNOWLEDGE

# Knowledge

PAST DECISIONS

# Decisions

TASK

Implement a small dependency-free Node.js duration formatter in this temporary repository. Create executable duration.mjs (with a shebang and executable permission) exporting formatDuration(seconds), and duration.test.mjs using node:test. formatDuration accepts non-negative safe integer seconds and returns H:MM:SS with unbounded hours and two-digit minutes/seconds. The CLI accepts exactly one canonical non-negative decimal integer argument (0 or a nonzero digit followed by digits), prints the formatted duration plus newline, and exits nonzero with stderr and no stdout for invalid input/argument count. Cover actual behavior and boundaries in meaningful tests including CLI execution, not only file existence. Run node --test duration.test.mjs and record concrete results. Keep scope to this tiny tool, no dependencies, network, commits or changes outside this workspace. Do not modify .work task state. Before implementation inspect current files. If prior runs already implemented it, preserve and inspect them; the latest recorded user notes control continuation. Complete only this bounded stage and report what was implemented and tested.

INSTRUCTIONS

Work independently and stay tightly scoped to the task.

Before proposing or making broad changes:
1. inspect the relevant implementation;
2. gather concrete evidence;
3. identify the likely root cause or design constraint;
4. prefer the narrowest correct solution.

You may inspect and edit the repository using the tools available to your execution environment.

When finished, return exactly these markdown sections:

## Result
A concise conclusion.

## Evidence
Concrete files, behavior, tests, or other evidence supporting the conclusion.

## Changes
What you changed. Write "None" if this was investigation/review only.

## Verification
Tests/checks performed and their result.

## Needs human decision

This section is a machine-read protocol, not prose. A bare heading, the words
"None", "No decision required", or any other prose is NOT a valid signal and
will be treated as no decision.

Include it only when the task genuinely cannot proceed without a human —
a product, architecture, security, ownership, or scope decision you are not
authorized to make alone.

No human decision is required — write exactly:

  ## Needs human decision
  REQUIRED: no

A genuine human decision is required — write exactly:

  ## Needs human decision
  REQUIRED: yes
  QUESTION: <the concrete question a human must answer>

Use the REQUIRED: yes form only when you truly cannot responsibly finish
without the human's answer.

---

## Task state for this run

You are continuing an existing task. The original task prompt is above; the Task state that has accumulated since it was written follows.

### User input on this task

The statements below are the user's constraints and corrections. Treat them as binding on this run, alongside the original task.

- 2026-11-01T18:26:45.356Z: USER CONSTRAINT SUM_CONTRACT_01: Continue the existing duration formatter rather than replacing its files/tests. Add CLI --sum followed by one or more canonical non-negative decimal integer seconds; add them exactly, reject any invalid token or a total exceeding Number.MAX_SAFE_INTEGER before producing stdout. Example: ./duration.mjs --sum 0 59 1 must print 0:01:00\n. Preserve existing one-argument CLI and exported formatDuration behavior. Add tests exercising sums across minute/hour boundaries, zero, missing operands, a malformed operand (e.g. 1e2), and safe-integer overflow. Independent qualification also found a real entry-point bug: executing the absolute duration.mjs path via macOS /var/folders/... (an alias of /private/var/folders/...) exits 0 with empty stdout even for 0, because import.meta.url is canonical but argv[1] is not. Reproduce, minimally fix this path-alias invocation, and add a regression without weakening silent-import behavior. Run the complete existing and new test suite. No dependency installation, network or commits. In your result explicitly identify prior implementation/tests you read and this constraint marker.

### Previous runs

#### Run 1 — codex · ready
started 2026-11-01T18:23:56.996Z · completed 2026-11-01T18:25:06.237Z

Result:
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

Verification:
`node --test duration.test.mjs` on Node.js v24.14.0: **56 passed, 0 failed, 0 skipped**. Includes boundary values, import behavior, and direct executable invocation.

Files changed:
- duration.mjs
- duration.test.mjs