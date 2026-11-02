# Human attention and delegation investigation

**2026-11-01 · 0x2F 0.1.4 · audited commit `e08e105a10955283b810f8e0793286d7a6eadf3a`.**

Start with [10 — Executive verdict](10-EXECUTIVE-VERDICT.md). The numbered documents follow the requested investigation. [08](08-DELEGATION-BENCHMARK.md) explains reproducible evidence and limitations; [09](09-SKEPTICAL-REVIEW.md) preserves objections and corrections.

| Document | Purpose |
|---|---|
| [01 — Product reality](01-PRODUCT-REALITY.md) | Current contracts, evidence and limits |
| [02 — Industry problems](02-INDUSTRY-PROBLEMS.md) | Primary research and ten research questions |
| [03 — Competitive position](03-COMPETITIVE-POSITION.md) | Contemporary alternatives and fragile advantages |
| [04 — Experience audit](04-EXPERIENCE-AUDIT.md) | Seven journeys across four surfaces |
| [05 — Human attention](05-HUMAN-ATTENTION.md) | Execution, judgment, responsibility and evidence |
| [06 — Product identity](06-PRODUCT-IDENTITY.md) | Alternatives, resilience scenario and necessity test |
| [07 — Friction opportunities](07-FRICTION-OPPORTUNITIES.md) | Prioritized, falsifiable hypotheses |
| [08 — Delegation benchmark](08-DELEGATION-BENCHMARK.md) | Scripts, measurements and later human protocol |
| [09 — Skeptical review](09-SKEPTICAL-REVIEW.md) | Independent challenge, uncertainty and disagreements |
| [10 — Executive verdict](10-EXECUTIVE-VERDICT.md) | Ten direct answers and an unexecuted next mission |

## Evidence convention

**Observed:** local source inspection, captured UI, deterministic execution, or retained historical live evidence. **Reported:** an identified external study, vendor document or first-person issue. **Inference:** our interpretation. **Unknown:** a question requiring users or additional experiments. A vendor feature claim is not a measured competitor result. A fixture passing is not a human succeeding.

Three independent investigators covered six perspectives: human factors/interaction design; contemporary workflows/strategy; lifecycle/trust/skeptical challenge. Their initial notes were written before synthesis. A second independent skeptical pass is retained in [notes](notes/). This is independent model review, not independent human research.

The checkout started clean. All authored changes are under this directory. No production changes, push, deployment, release, outreach or new paid model qualification occurred. Research used disposable local repositories and mock providers. A narrow browser viewport exercised the actual responsive client; no physical phone, hosted relay deployment or unfamiliar-user study was available. Desktop Web was inspected in source, not exercised at desktop width. Existing live qualification was verified from saved evidence rather than repeated.

## Evidence entry points

- [Benchmark results](evidence/benchmark-results.json), [CLI transcript](evidence/benchmark-transcript.json), [same-executable calibration](evidence/calibration.json).
- [Real PTY READY capture](evidence/tui-ready.txt), [PTY action record](evidence/tui-actions.json), [mobile partial result](evidence/web-mobile-partial-collapsed.png), [expanded result](evidence/web-mobile-partial-expanded.png).
- [Human-factors probe](notes/human-factors-probe.json), [lifecycle/context/diff probe](evidence/lifecycle-trust-probe.json).
- [Historical live-evidence check](evidence/prior-evidence-verification.log).
- [Current full test run](evidence/runtime-tests-unrestricted-loopback.log): **713 passed, 2 failed, 715 total**. [Retry diagnosis](evidence/retry-diagnostics.log): Codex overlap protection refused retry while the previous process group remained; Gemini passed on the targeted retry. This is not a green qualification.

Recorded wall-clock output may use execution-host UTC. User-facing dates use the requested Europe/Lisbon date; this date has UTC offset zero. Machine latencies never stand in for human active time.
