# 03 — Competitive position

**As of 2026-11-01**, neither persistence, background execution, phone control nor cross-agent handoff is an uncontested differentiator. Competitors were researched through primary documentation and issues; their UX and reliability were not directly benchmarked. Undated live pages below were retrieved on this date. Documentation establishes a competitive promise, not equivalence of implementation or user value.

| Alternative | Already documented | Remaining human work / 0x2F implication |
|---|---|---|
| Codex | Persistent threads/turns, resume, approvals and domain integration APIs; [platform article](https://developers.openai.com/blog/codex-as-a-platform), 2026-08-19. Phone steering, review and approvals; [remote engineering guide](https://developers.openai.com/blog/mastering-codex-remote-for-engineering), 2026-06-23 | Purpose, evidence sufficiency and acceptance still matter. “Sessions forget everything” is an inaccurate foil |
| Claude Code | Local continue/resume and worktree workflows; [common workflows](https://code.claude.com/docs/en/common-workflows). Local-host mobile/browser interaction; [Remote Control](https://code.claude.com/docs/en/remote-control) | Scope/permission policy, review and host availability remain relevant. Adding another terminal/session manager is a weak answer |
| Conductor | Per-workspace worktrees, local execution with git-based integration; [intro](https://www.conductor.build/docs/introduction), [API](https://www.conductor.build/docs/api) | Isolation and landing changes are part of the product, not incidental UI. A local intent ledger must still help users integrate results |
| Paradev, formerly Superset | Tasks, status hooks, persistent terminals, native resume and cross-agent recent-context handoff; [official repository](https://github.com/ParadevAI/Paradev), [sessions](https://docs.paradev.com/agent-sessions), [tasks](https://docs.paradev.com/tasks), [status](https://docs.paradev.com/agent-status) | The strongest direct overlap. Original-intent/results projection differs from recent-context handoff; only a controlled constraint-retention task could show human superiority |
| GitHub coding-agent workflows | Issues/PRs as work records, asynchronous sessions and third-party agent options; [third-party agents](https://docs.github.com/en/copilot/concepts/agent-capabilities/about-agents/about-third-party-coding-agents), [session management](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents) | Existing team inbox and review artifact may already be sufficient. Mid-session steering support differs by agent; do not flatten provider limitations |
| Cursor Cloud Agents | Remote execution and review artifacts; [overview](https://cursor.com/docs/cloud-agent), [API](https://prod.cursor.com/docs/cloud-agent/api/endpoints) | Agent/run continuity is not unique ontology. Cloud execution has a different trust/availability tradeoff from 0x2F's local host |
| Warp | Third-party-agent attention handling and orchestration-aware notification suppression; [multiple agents](https://docs.warp.dev/guides/agent-workflows/how-to-run-multiple-ai-coding-agents/), [notifications](https://docs.warp.dev/agents/capabilities/agent-notifications/) | “An attention layer” alone describes a contested feature space; quality of the decision boundary must be demonstrated |
| Native harness + small task/result template | A credible low-cost alternative, assembled from features above | Must be included in a fair trial; a separate application may be unnecessary |

The naming matters: Paradev explicitly identifies itself as formerly Superset. Apache Superset is unrelated. Current names and feature availability can change; recheck these links before public positioning.

## Differentiation inventory

| Capability | Real today? | Human problem | Easy to absorb? | Role/value type | Effort/complexity judgment |
|---|---|---|---|---|---|
| Repository-local Task → Run → Session record | Yes, with observed multi-harness continuity | Ownership and preserving intent across attempts | Concept easy; reliable semantics require care | Foundation; technical + experiential potential | Keep; measure retrieval rather than celebrate ontology |
| Durable explicit notes/answers/corrections | Yes, future-run context | Restating constraints | Easy for native tools; cross-harness ownership less uniform | Core task-native foundation | Keep; fix timing claims and context growth |
| Multiple native/ACP/command providers | Yes, unequal capabilities | Escape an unavailable/unsuitable harness | Already contested | Enabling infrastructure | Preserve useful paths; more adapters are not a strategy |
| AUTO | Yes, executable/policy order | Repeated manual selection | Easy | Convenience | Keep inspectable; avoid “best agent” claims or semantic-router project |
| Detached local work | Yes | Stop keeping a foreground terminal open | Already standard | Execution foundation | Honest asleep/offline limits; not a product moat |
| Result/run artifacts + event log | Yes | Inspect what happened | Easy to add, harder to keep faithful | Ownership/evidence foundation | Useful only if reachable and understood |
| NEEDS YOU distinction | Yes, recognized protocol | Know which judgment/action is required | Common upstream | Experiential potential | Fidelity matters more than a badge |
| TUI/Web/phone | Yes, uneven presentation | Reach work from context of use | Broad native coverage | Access mechanisms | Four surfaces can cost more than they save; test actual repeated use |
| Independent correctness/intent verification | No general mechanism | Decide whether results deserve acceptance | Hard, task-dependent | Aspiration | Do not imply it from READY or add a universal score |
| Reliable attention summons anywhere | No | Avoid polling | Upstream push/remote paths compete | Aspiration with delivery conditions | Do not promise a closed browser will notify |

## Position to test

**A personal, task-native work instrument that makes returning to engineering judgment cheap.** Its proposed advantage is the combination of local ownership, persistent intent, and an accessible account of evidence across attempts. None of those facts proves users will choose it repeatedly.

The relevant comparison is not a fresh empty chat that forgot everything. It is the latest native resume/review/notification workflow, and for cross-harness work a documented handoff or a saved task/result template. Include onboarding, review, correction and landing the work in total cost. A nice ledger that leaves those activities elsewhere may increase reconstruction.

The most fragile advantages are wrapper execution, provider count and session persistence. The most plausible enduring value is faithful retrieval of consequential evidence, but it too can be supplied upstream. Do not turn “future resilient” into “uncopyable.”
