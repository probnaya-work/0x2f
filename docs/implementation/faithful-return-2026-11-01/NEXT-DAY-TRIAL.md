# A real next-day trial

Use this personally; no participant results have been filled in. Suggested dates: November 1–2, 2026, Europe/Lisbon, or any later consecutive days.

## Day 1 — delegate one actual bounded task

1. Choose a small task in a disposable copy of your own project. Prefer an investigation with a useful written conclusion, or a small change with an explicit acceptance check. Avoid production credentials/deployment.
2. From that project directory run the local branch without installing or publishing it:

   ```sh
   node /Users/bogart/Dev/PROBNAYA/work-cli-faithful-return/src/cli.mjs init
   node /Users/bogart/Dev/PROBNAYA/work-cli-faithful-return/src/cli.mjs providers
   ```

3. Submit the task with an available, already authenticated provider, using its normal model/account configuration. Write the required outcome and one constraint in your own words. This is your real model usage, not an automatic research replay. Example shape:

   ```sh
   node /Users/bogart/Dev/PROBNAYA/work-cli-faithful-return/src/cli.mjs new "Investigate the retry boundary. Preserve the public API. Explain the root cause, evidence and checks you could not perform. Do not change files." --provider codex
   node /Users/bogart/Dev/PROBNAYA/work-cli-faithful-return/src/cli.mjs tui
   ```

4. If you save a note with `c` while it is working, first say when you believe it will take effect. Read the confirmation. It is for the next run; it does not steer this worker.
5. Leave the task using `q`. Keep the execution host available if work is still running. Do your normal work. Do not study the transcript to prepare for tomorrow. Do not accept the result just to clear the list.

## Day 2 — return before reconstructing the history

Open `tui` from the same project. Before expanding TRACE, use `r` and try to answer:

- What did I originally ask for, including the constraint?
- What did this attempt actually conclude or change?
- Which checks are only provider claims? What evidence or check output was not recorded?
- Which human decisions or notes already exist, and what does the next run receive?
- What should I do next, and what consequence does that action have?

Use `j/k` to read, `g/G` for either end, `[`/`]` for runs and `i` for the saved run input. Return with Esc. `d` is the **current** working-tree diff, which can include later edits; it is not a frozen patch of that run. Accept only when the available evidence satisfies your task. Otherwise `x` SEND BACK records a correction and starts another run; `c` saves only a note. Existing ANSWER & CONTINUE and SAVE ONLY retain their separate meanings.

If you use a physical phone later, try one bounded request and one request with insufficient displayed scope. A phone-only approval should be unavailable in the latter; review it on the computer. This implementation's browser captures are viewport tests, not a physical-device qualification.

## Record what actually happened

| Field | Your observation |
|---|---|
| Task ID, project, provider/model/version | |
| Day 1 setup/submission active time (exclude machine waiting) | |
| Actual delay before return | |
| Day 2 time to a correct five-fact explanation | |
| Times you needed CLI/Web/files to reconstruct a fact | |
| Check limitation or defect you noticed/missed | |
| Necessary versus avoidable interruptions | |
| Correction/recovery active work, including outside 0x2F | |
| Tool you would choose for the next similar task, and why | |

One founder trial can expose a problem; it cannot establish market demand, unfamiliar-user usability or a productivity percentage. Compare another matched task in your normal native harness, including its existing resume and review features. Stop and record uncertainty rather than filling an unknown metric from memory or an AI estimate.
