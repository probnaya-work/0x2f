# Scope and remaining work

0.2.0 is the local task-runtime release. The same runtime can be operated
on Linux as one persistent execution host with Mac/phone control. It includes
runtime locking/recovery/retry/permission hardening, faithful result/input
inspection, documented harness handoff, persistent additional Web themes and
responsive activity traces. See the dated release verification for actual gates.

Not available in 0.2.0:

- Automatic task migration, remote execution-node transport, load balancing,
  fleet dashboard or automatic failover. One workspace/runtime on a Linux machine
  executes locally on that machine.
- A hosted relay service operated by this project, remote Internet access without
  operator infrastructure, background push notifications or offline command queue.
- Universal provider permissions/native resume. Cursor's live task handoff passed;
  its native resume and interactive permissions were not exercised in that chain.
- Independent automated acceptance of agent work. READY remains a review boundary.
- Linux-native 057 application distribution, a remote task-history collector for
  057, or exact agent attribution inferred from aggregate CPU. The existing Mac
  057 Core observes Linux through MACHINE PULSE. Its separate shared/mobile
  engineering candidates retain their own release and acceptance gates.
- General Windows execution support or a new cancellation UI/command.

ThinkCentre hosting and 057 observation were previously agreed next stages. The
current host work uses that existing architecture; it does not silently promote
057's visual refinement, smooth-motion, thermal/battery, sleep/wake or long-soak
acceptance to completed product capabilities. Physical-device results and
remaining limits must stay distinct from Core-only or simulated checks.
