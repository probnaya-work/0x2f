# Realistic retry-client delegation pack

This nonshipping pack prepares eight ordinary engineering scenarios in disposable Node ESM repository trees. It complements mechanical CLI checks. **Executed here: generator, known baseline checks, and evaluator-authored oracle controls in separate temporary copies. Not executed: agent task completions, interface comparison, human study, delayed-return trial or usability measurement.** No network, account, model call, credential, dependency install or production endpoint is required.

Files: `generate.mjs` creates a fresh fixture tree; `check.mjs` is an evaluator-owned independent acceptance oracle; `TASK-CARDS.md` contains prompts and report rubrics. The checked-in baseline receipt lives at `../../evidence/realistic-pack-baseline.json` relative to this directory. Node >=20 is required. The tested runtime/version appears in the receipt. Baseline checks intentionally exit nonzero where requirements are not implemented.

## Setup

From this checkout's root, use an absent child inside a temporary directory. The generator refuses an existing destination. It writes only beneath the specified destination and does not initialize task-runtime state or edit this checkout.

```sh
PACK="$PWD/docs/research/human-attention-delegation/benchmark/realistic"
SCRATCH="$(mktemp -d /tmp/0x2f-realistic.XXXXXX)"
node "$PACK/generate.mjs" "$SCRATCH/fixtures" all
node "$PACK/check.mjs" "$SCRATCH/fixtures/task-01" headers
node "$PACK/check.mjs" "$SCRATCH/fixtures/task-03" retry
node "$PACK/check.mjs" "$SCRATCH/fixtures/task-05" recovery
node "$PACK/check.mjs" "$SCRATCH/fixtures/task-06" handoff
```

Select `01` through `08` instead of `all` to generate one case. Each child has its own package.json, source, smoke tests, explicit constraints and seeded history. Run `npm test --prefix "$SCRATCH/fixtures/task-08"` to see the deliberately narrow passing tests. No `npm install` is needed. Each independent command's nonzero baseline exit is expected; do not chain them with `&&` and accidentally skip later checks.

For worktree-aware interfaces, initialize each selected disposable child before making two matched copies:

```sh
git -C "$SCRATCH/fixtures/task-03" init
git -C "$SCRATCH/fixtures/task-03" add .
git -C "$SCRATCH/fixtures/task-03" -c user.name='Research Fixture' -c user.email='fixture@example.invalid' commit -m 'Prepared retry-client baseline'
```

These local commits are fixture setup only; do not push. Make a copy for each condition before starting. Use identical environment/settings, harness/model, prompt and baseline files. Counterbalance condition/task order across participants. Keep task-local `.work` state confined to the condition that uses 0x2F. Remove temporary fixtures only after preserving authorized study artifacts; no cleanup command is embedded here.

## Baseline expectations

| Case/check selection | Expected baseline | Meaning |
|---|---|---|
| 01 / headers | 2 pass, 1 fail | Caller accept produces a duplicate/default override |
| 03 / retry | 4 pass, 4 fail | Request integration missing despite existing helper |
| 05 / recovery | 0 pass, 1 fail | Import names nonexistent local module |
| 06 / handoff | 5 pass, 3 fail | Status retry seed violates write constraint and misses Retry-After/network behavior |
| 08 / retry | 4 pass, 4 fail | Same missing integration, framed as evidence review |
| smoke tests in 01–04, 06–08 | pass | Narrow tests are deliberately insufficient |
| smoke tests in 05 | fail | Seeded missing-import interruption |

Acceptance is task-specific. Passing `recovery` means the local import and single successful call work, not that retries were implemented. Passing retry checks covers listed cases, not all HTTP/date parsing/streaming/replay behavior. Numeric Retry-After only is specified; HTTP-date handling is outside this task. No independent check should mutate fixture source. The acceptance oracle records names and failure details as JSON and exits 1 when any check fails.

The baseline receipt also records a temporary evaluator-written positive implementation passing all ten acceptance checks, a recovered import passing both recovery checks, and refusal to overwrite an existing generator destination. These validate the oracle/setup behavior; they are not agent performance results. The positive implementation source and recovery patch are preserved in that receipt for reproducibility.

## Evaluation record (future work)

For each actual condition record participant pseudonym/experience, task ID, interface and versions, harness/model/configuration, setup burden, baseline hash, prompt, actual wall-clock timestamps, user actions, interventions with necessity classification, active human time, error/recovery attempts, final check receipts, and evidence-backed completion conclusion. Keep machine waiting separate from active human time. Participant timing/comprehension require people; automated steps cannot fill those fields. Count avoidable configuration decisions and manual context copying separately from necessary business decisions.

Card 06 is a seeded correction task, not proof that a previous agent wrote the seed. To study an actual handoff, use the exact same seeded starting state in both conditions and capture the delivered task context. Card 07 requires an actual prespecified delay for any memory/reorientation claim. Cards 02/04/07/08 use the report rubric rather than forcing an implementation answer. Record missing required human intervention as an error; fewer prompts alone is not success.

Recommended comparisons: current direct-agent resume/review/notifications versus 0x2F, and where available a contemporary cross-agent handoff. Do not handicap the baseline by forcing an empty new session when native resume exists. If a competitor cannot be exercised, label that comparison unexecuted. Stop before production changes; this pack supplies reproducible task definitions and baseline failures, not performance evidence.
