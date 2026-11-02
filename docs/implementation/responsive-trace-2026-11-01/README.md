# Responsive activity trace and compact typography

Package version stays **0.1.4**. No release, publication or push. The running
local preview reads these sources; the globally installed executable is unchanged.

The previous repair prevented some literal clipping, but still rendered only
12 mini signals / 24 expanded signals regardless of available space. On phone,
a fixed trace width competed with an ellipsized activity caption. CHANGES could
repeat under several edit bursts, adding redundant labels.

The Web renderer now measures each trace lane, including its first mounted frame,
and observes its width. One pure `traceAtWidth` projection selects as much real
recent history as fits at fixed mark sizes, reserving space for the terminal
marker. Resizing redraws the trace alone, preserving inputs and reader position.
Earlier signals remain in task history; an ellipsis and the expanded trace count
identify a visible tail. Sparse traces keep a quiet axis, and a coarse provider
still gets one ambient shape, never fabricated activity marks or a completion
percentage. Bracket labels stay inside the lane; CHANGES appears at most once
per trace, while individual change brackets remain.

Phone traces use the full row width with the activity caption underneath. Task
headings are about 1px smaller on phone (15.5 → 14.5px; detail 21 → 20px) and
slightly smaller on desktop (collapsed 17.5 → 16.5px; large headings 31/34 →
29/31px). Result/body typography and Light/Dark palettes are preserved. The
existing TUI theme choice and rendering are unchanged.

## Verification

- `npm run check`: passed, [log](evidence/check.log).
- `npm test`: **765 / 765 passed**, including the existing real PTY TUI tests,
  [log](evidence/npm-test.log). The first sandboxed attempt could not bind local
  test servers and was stopped; the complete run with local socket access passed.
- Width-dependent projection tests cover dense 2,000-signal, sparse, empty and
  coarse traces; main, mini and provenance; live and halted markers. They assert
  fixed-size marks, recent-tail identity, containment and label bounds.
- Browser checks used the existing inert local fixture, not model executions.
  Actual CSS viewport widths were **291, 322, 594, 654, 909, 1190px** (the browser
  was zoomed, so requested viewport overrides differed from CSS widths). In both
  Light and Dark, sampled traces, markers and bracket labels stayed inside their
  lanes, with no horizontal page overflow and at most one CHANGES per trace.
  [Light geometry](evidence/geometry-light.json),
  [additional Light geometry](evidence/geometry-light-extra.json),
  [Dark geometry](evidence/geometry-dark.json).
- [Phone Dark](evidence/mobile-dark.png), [Phone Light](evidence/mobile-light.png).
  No physical phone or separate Linux GUI was used for this appearance pass.

The initial projected counts remain useful as a DOM-free fallback; mounted Web
lanes use their measured capacity instead of the old fixed tail budgets.
