# 0x2F TUI — visual review

- frames captured: 37
- AI reviewer: none (skipped — configure claude or dsh, or --ai claude/--ai deepseek)
- local structural checks: 0 failures
- AI findings: 0
- captured 2026-11-15T00:22:00.983Z

## verdicts

| frame | state | size | verdict |
|---|---|---|---|
| composer-120x36 | composer | 120x36 | PASS |
| working-120x36 | working | 120x36 | PASS |
| needs-you-permission-120x36 | permission | 120x36 | PASS |
| ready-120x36 | ready | 120x36 | PASS |
| ready-80x24 | ready | 80x24 | PASS |
| ready-60x18 | ready | 60x18 | PASS |
| report-120x36 | report | 120x36 | PASS |
| diff-120x36 | ready-diff | 120x36 | PASS |
| decision-120x36 | decision | 120x36 | PASS |
| help-120x36 | help | 120x36 | PASS |
| failed-auth-120x36 | failed-auth | 120x36 | PASS |
| overview-many-120x36 | overview | 120x36 | PASS |
| decision-long-120x36 | decision-long | 120x36 | PASS |
| overview-many-80x24 | overview | 80x24 | PASS |
| decision-long-80x24 | decision-long | 80x24 | PASS |
| composer-long-80x24 | composer | 80x24 | PASS |
| composer-long-60x18 | composer | 60x18 | PASS |
| composer-start-80x24 | composer | 80x24 | PASS |
| help-80x24 | help | 80x24 | PASS |
| help-end-80x24 | help | 80x24 | PASS |
| composer-light-120x36 | composer | 120x36 | PASS |
| working-light-120x36 | working | 120x36 | PASS |
| needs-you-permission-light-120x36 | permission | 120x36 | PASS |
| ready-light-120x36 | ready | 120x36 | PASS |
| ready-light-80x24 | ready | 80x24 | PASS |
| ready-light-60x18 | ready | 60x18 | PASS |
| report-light-120x36 | report | 120x36 | PASS |
| diff-light-120x36 | ready-diff | 120x36 | PASS |
| decision-light-120x36 | decision | 120x36 | PASS |
| help-light-120x36 | help | 120x36 | PASS |
| failed-auth-light-120x36 | failed-auth | 120x36 | PASS |
| overview-many-light-120x36 | overview | 120x36 | PASS |
| decision-long-light-120x36 | decision-long | 120x36 | PASS |
| overview-many-light-80x24 | overview | 80x24 | PASS |
| decision-long-light-80x24 | decision-long | 80x24 | PASS |
| composer-long-light-80x24 | composer | 80x24 | PASS |
| composer-long-light-60x18 | composer | 60x18 | PASS |

## findings

_No findings._

## frames

- gallery: `.review/frames/index.html`
- normalized text: `.review/frames/<id>.txt` (scrubbed, fixed-width)
- colored SVG: `.review/frames/<id>.svg` (fixed cell metrics)

## re-run

```bash
npm run review:tui                # capture + local checks + AI if available
npm run review:tui -- --no-ai     # capture + local checks only
npm run review:tui -- --ai claude # force the Claude Code CLI reviewer
npm run review:tui -- --ai deepseek
```
