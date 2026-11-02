# 05 — Human attention

The central opportunity is not making the machine's activity quieter. It is allowing a person to leave and return without losing the ability to judge what they now own. 0x2F persists much of the necessary record, but does not consistently present it at the point of judgment.

## Three separate questions

| Layer | Question | Actual 0x2F support | Remaining human responsibility |
|---|---|---|---|
| Machine execution | What ran, where, and did it stop? | Runs, provider metadata, events, failure/permission normalization | Set bounds and recognize execution limits |
| Human attention | What must I understand, decide or check now? | NEEDS YOU, results in CLI/Web, contextual actions, quiet Web policy | Distinguish required judgment from work that can wait |
| Human responsibility | Is this useful and acceptable in its consequences? | Original intent/notes, reported evidence, manual closure | Decide purpose, tradeoffs, sufficiency of evidence and authorization for consequential outcomes |

Responsibility can be delegated within explicit bounds. It is not identical to reading every tool event or personally rewriting every change. It also does not disappear because another model says “verified.” The durable unit should be the task's meaning and consequences, not the personification of an assistant.

## Attention debt

Define attention debt as **unresolved understanding, checking or integration work left to the human by an execution result**. This is a research construct, not a score the product currently measures. It includes an untested change, a partial investigation, an unexplained tradeoff, a result scattered across runs or a patch whose attribution has become unclear. Productive review is not automatically debt; the avoidable part is reconstructing facts the system already has or correcting misleading presentation.

Yes, a task can finish while creating more work than it saves. Local evidence is narrower: READY can contain failed or absent checks; the historical utility's first passing suite missed a bug; the TUI can withhold the written conclusion; a current diff can change after later edits. No net time loss was measured. An implementation that makes 100 lines in a minute but requires extensive review may still be valuable, depending on the task. We need total active time **and** accepted outcome quality.

## Completion is an evidence chain, not another status taxonomy

| Claim | Evidence required | What exists now |
|---|---|---|
| Provider finished | Terminal provider outcome, classified with provider-specific rules | Persisted run outcome; command providers use exit/text; native adapters use richer events |
| Work performed | Artifacts/change/investigation evidence attributable to attempt | Provider reports and best-effort Git observation; mutable workspace diff is qualified |
| Tests executed | Command, result/output, scope and environment | Sometimes observed tool events; often only provider-authored Verification prose |
| Independently verified | Separate checker plus named inputs/oracle and retained output | Historical external qualification and research checks, not a general runtime gate |
| Intent satisfied | Acceptance criteria mapped to relevant evidence; unresolved requirements acknowledged | Human assessment; no universal oracle |
| Human accepted | Explicit action with understood scope | READY offers ACCEPT in some surfaces; DONE also represents other forms of closure |

The existing five states can remain. READY may honestly mean “a result is available for review,” including useful partial work. Evidence facts belong under it. A sixth green state would not make an unexamined claim more reliable. Do not make all untested investigations FAILED, parse prose into invented pass counts, or require a second agent for every task.

In an isolated interaction specification, show the original intent, provider conclusion, reported check limits and link to complete evidence near the primary action. Where evidence is absent, say “not recorded” rather than infer “not run.” Where a tool was invoked without captured success, do not promote it to passed. If the original intent is ambiguous, expose the question rather than silently invent criteria.

## Intervention inventory

| Trigger | Who should resolve it? | How to reduce avoidable attention | Boundary |
|---|---|---|---|
| Bounded tool permission within explicit user policy | Harness policy where it can enforce the scope | Reuse trustworthy policy, avoid repeating equivalent requests | Do not invent approval from prior acceptance or bypass harness protections |
| New consequential/irreversible or ambiguous operation | Authorized human | State exact scope, consequence, options and what continues | Insufficient phone evidence means defer, not reassuring summary |
| Product/scope/value choice | Human owning the objective | Preserve a concrete question, relevant alternatives and consequence | A recommended default must not erase reasonable alternatives |
| Auth/config/environment error | Human or deterministic local remedy if explicitly safe | Name failing component, preserve task, give exact next step | Installed executable does not prove valid credentials; no speculative model probe |
| Worker loss/old process group | Runtime ownership checks plus informed local recovery | Distinguish retained work from still-running execution | No blind retry/hidden failover or duplicate side effects |
| READY result | Human on their schedule, or bounded explicit acceptance policy | Surface checks/limitations before acceptance; progress remains quiet | Finished work is not necessarily urgent interruption |
| Ordinary tool/progress event | Machine | Already silent; keep trace secondary | More activity is not more useful awareness |
| Detected failure with no active client | Delivery policy currently insufficient | First establish truthful alert reach and severity needs | More push channels are not justified until actual missed-work patterns are observed |

Today several stops are necessarily provider-authored or provider-detected. A wrapper cannot promise it finds every semantic question. Strict protocol avoids false NEEDS YOU but can miss malformed real questions. Measure both missed intervention and unnecessary interruption; optimizing just one creates false confidence or noisy supervision.

## Return-to-task account

A person should be able to retrieve five facts: original intent; what happened; what remains uncertain; human decisions already made; and the next action. Current state contains the original brief, notes, results and run records; each surface exposes a different subset. A long transcript is neither necessary nor sufficient.

Proposed research-only ordering:

```text
#014  Preserve the public retry contract                  READY
RESULT AVAILABLE · awaiting review

INTENT       Honor Retry-After; keep offline behavior.
RESULT       Provider reports retry handling implemented.
CHECKS       Provider reports unit checks; integration not run.
UNCERTAINTY  Offline behavior has no recorded acceptance check.
NEXT         Review changes and limits; accept or correct.

[written result] [changes now] [run evidence]
```

This is a text interaction spec, not implemented UI or a verified summary. “Changes now” must retain mutable-workspace scope; extracted prose retains provider attribution. In the first engineering mission, restore missing existing content before inventing these fields. Structured generation, new metadata and activity analytics are not prerequisites.

The return account hypothesis fails if current result/diff/native workflows already support equally accurate judgment at equal or lower total cost. Better agents might themselves produce excellent concise receipts; that would weaken the need for a separate layer. Human accountability enduring does not guarantee the product endures.
