# Canonical Linux AI gate — closed 2026-11-02

**PASS. PR #5: GO for integration.** The full live path ran through the real
native Codex provider on the unchanged canonical package, not a process fixture.
Mobile interruption/runtime-error recovery is explicitly deferred by the owner
as a separate UNVERIFIED follow-up and does not hold 0x2F finalization.
This verdict does not authorize merge, version change, release or deployment.

## Artifact and execution

- Canonical0x2f-0.2.0.tgz SHA256:
  `4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626`.
- Offline installation into a new qualification prefix; all83 archived package
  files matched the installed files byte for byte. No registry0.2.0 substitution.
- Product source checkpoint `839e980dd20db3ea058ef4abc707ceeb322a0e93` unchanged.
  Dependencies unchanged: ws8.22.1, @noble/ciphers1.3.0, @noble/hashes1.8.0.
- Lenovo Ubuntu26.04.1 LTS/x86_64, Node26.13.0; Codex CLI0.166.0 installed through
  the official Linux standalone installer. Direct on-host ChatGPT device login;
  no Mac credentials copied, API keys or paid API provider used.
- Both exact Codex session metadata records identify provider `openai`, model
  `gpt-6.1-sol`, source `exec`, CLI0.166.0, workspace-write and network_access=false.
  Requested model was the CLI default; actual model is recorded from those sessions.
- Controller SHA256:
  `6f9a9db42afdd425d8209447ada455639a605e94e848dbee60cc7f834a4aae82`.
  [Controller](installed-live.mjs), [options and setup](LINUX-AI-CONTROLLER.md).

## Whole-loop result

Both runs belong to one Task. Run2 is fresh-session continuation, not native resume.

| Gate | Observed result |
| --- | --- |
| Real AI run1 | READY; utility files produced; independent configured check exit0,11base assertions |
| Note during working | Saved while run1 worker was working |
| SSH disconnect / runtime restart | Launcher exited; distinct runtime MainPID; live worker identity preserved |
| Real AI run2 | READY; independent configured check exit0,11base +7continuation assertions |
| Continuation context | Exact delivered input includes the saved NEXT fresh run note and current independent-review-v2 rules |
| Input and patch binding | Both input and patch hashes rechecked against private attempt artifacts; run1 patch unchanged after run2 |
| Quiescent backup | Qualification service stopped and worker exited before backup |
| Restore | New directory and new restored checkout; history retains2runs and successful check receipts; PID/execution authority absent |
| Restored assertions | Actual independent assertions ran successfully in the restored checkout |
| Original state | All57 original regular state files/symlinks compared unchanged, including task JSON |
| No automatic execution | Restored run.started count unchanged after observation; no PID/execution id restored |
| Cleanup | All3 units created by this follow-up inactive; production0x2f-host.service active |

Configured-check success did not create ACCEPT; disposition remains unset.
Delivered text is evidence of context delivery, not a claim of model understanding.
Native resume or provider-session database restoration is not claimed.

| Receipt | Run1 | Run2 |
| --- | --- | --- |
| Input SHA256 | `b1a41e0ec795d5beea01dad8a20a40c4c026a52b3522d795a29bfcccc7cc94d8` | `a164f97dbb4e2fd5614b541a018b83fb055642ea1bf736764f48eb548cfc6a3c` |
| Patch SHA256 | `588c4a3e7449c982f7961a556505f8e56d0301d779a22970ed5460713ad7631e` | `3973a7e8831182be71f25d46737dae156038980503a31cb6dd26f784fab4acc3` |

Current project revision:
`f0fd2104bb001922299176aacc0ccb533528f912056efba9c097d05d229549dc`.
Backup receipt SHA256:
`4c6cde220e038082350d0b7f300b1bbb22dad72e2976d9ebe2076079bb99b4a8`.
Original state inventory SHA256:
`7b2b1049df9adc413da53b61e5579aef913a758b333e02af844c5f281b2527ce`.

## Failed attempts retained with their actual outcomes

Before Codex installation, the owner-requested additional free-model attempt used
OpenCode2.2.5 command transport, provider `opencode`, model `glm-5.3-flash-free`
with stock unauthenticated free access. It failed on run1 with exactly
`Free usage limit reached`. Earlier default big-pickle and explicitly free
 deepseek-v4.1-flash-free failures remain historical. No further quota retries,
card, new paid provider or account were added.

The first Codex attempt authenticated and produced a result, but its command
sandbox failed with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.
No words.mjs was created; the independent check failed exit1. Provider READY
was not treated as qualification success. That attempt remains failed.

The stock bundled bwrap was blocked by host user-namespace restrictions. Following
[official Linux sandbox setup](https://learn.chatgpt.com/docs/sandboxing), the owner
installed the distribution bubblewrap package (runtime0.11.1); the existing
AppArmor bwrap profile then applied to /usr/bin/bwrap. A deterministic preflight
proved an inside write, outside-write refusal, unchanged sibling sentinel and a
separate network namespace. The host AppArmor restriction remains1. No global
sysctl/permission disable or full-access sandbox bypass was used. Diagnostic
per-invocation probes made no AI calls and persisted no configuration changes.
The full loop was then repeated once, in another new root/unit, and passed above.

Raw session/execution IDs, input/output, checks, patches, backup/restore tree,
failed attempts, model metadata and signing/auth-sensitive material remain outside
Git in private evidence. Login codes and auth cache are not included in public
reports or qualification archives. Full final HEAD/base SHAs and private evidence
hashes are saved in FINAL-STATE.json after the report push.
