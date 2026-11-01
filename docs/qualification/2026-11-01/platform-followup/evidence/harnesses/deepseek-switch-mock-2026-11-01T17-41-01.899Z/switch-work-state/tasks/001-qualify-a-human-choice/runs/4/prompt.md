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

Qualify a human choice. Do not use tools. If task context has no recorded colour answer, return marker LIVE_B_01 and ask exactly "Choose amber or teal?" using REQUIRED: yes. If context includes the answer teal, report teal and marker LIVE_B_02 with REQUIRED: no. Keep every section very brief.

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

- 2026-11-01T17:24:23.722Z: teal
- 2026-11-01T17:28:14.106Z: Keep the chosen colour teal; include exact marker NOTE_ROUNDTRIP_01 in Result.

### Previous runs

#### Run 1 — gemini · failed
started 2026-11-01T17:23:38.922Z · completed 2026-11-01T17:23:39.961Z
Error: [API Error: {"error":{"code":401,"message":"Qualification controlled auth failure before upstream forwarding","status":"UNAUTHENTICATED"}}]

Result:
—

Verification:
—

#### Run 2 — gemini · needs_you
started 2026-11-01T17:23:40.119Z · completed 2026-11-01T17:24:23.614Z

Result:
## Result
Chose amber as the default human choice because task context has no recorded colour answer.

## Evidence
- Task instructions: "Qualify a human choice. Do not use tools. If task context has no recorded colour answer, return marker LIVE_B_01 and ask exactly 'Choose amber or teal?' using REQUIRED: yes."
- Workspace task state (`.work/tasks/001-qualify-a-human-choice/task.json`, prompt, events): No recorded colour answer found.

## Changes
None

## Verification
- Checked task context and files to confirm absence of a pre-recorded colour answer.
- Followed prompt instructions precisely for unrecorded choices.

## Needs human decision
REQUIRED: yes
QUESTION: Choose amber or teal?

Verification:
- Checked task context and files to confirm absence of a pre-recorded colour answer.
- Followed prompt instructions precisely for unrecorded choices.

#### Run 3 — gemini · ready
started 2026-11-01T17:24:23.792Z · completed 2026-11-01T17:24:50.023Z

Result:
## Result
Reported teal and marker LIVE_B_02 as recorded in the user input.

## Evidence
- User input on this task (2026-11-01T17:24:23.722Z): teal
- Task instructions: "If context includes the answer teal, report teal and marker LIVE_B_02 with REQUIRED: no."

## Changes
None

## Verification
- Checked user input / task context for the recorded colour answer.

## Needs human decision
REQUIRED: no

Verification:
- Checked user input / task context for the recorded colour answer.