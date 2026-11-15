# Physical mobile release qualification

Use the final candidate tarball, not a source checkout or public 0.3.0. Record
its version and SHA256, execution host OS/Node, phone model, phone OS and
browser version. Responsive desktop captures and protocol tests are separate
evidence; do not mark these physical checks passed from either.

Use a disposable Git repository with synthetic data and an authenticated
supported harness. Keep the host awake. Pairing grants control of this one
workspace. Keep the printed URL/code, `.work/relay.json` and phone storage
private; redact them from screenshots and transcripts.

## Same-Wi-Fi path

1. Install the tarball into a separate prefix and invoke that prefix's `2f`.
   Run `2f init` in the disposable repository, then `2f pair`. Open the
   printed URL in Safari on the iPhone and enter the displayed code. Record
   pairing success and the empty state. Verify the same workspace in `2f ui`.
2. Create a small read-only task on the phone with an explicit supported
   provider. Check the phone, desktop Web and `2f status` show one task with the
   same ID/status. Open its result, scroll to the end and back, and compare
   it with `2f open <id>`. Check portrait layout, tap targets and long text.
3. Add a note using the on-screen keyboard. Keep focus/caret visible, submit,
   close the keyboard, then verify the note in desktop Web and saved task context. Test a
   decision response in a task that actually requests one. If synthetic
   providers are used for these states, label that evidence explicitly.
4. Inspect a permission request: target, requested action and available
   choices must stay readable. Submit one explicit decision and confirm its
   occurrence is recorded once. Never grant real filesystem access merely
   to produce a screenshot; use a disposable fixture.
5. Start a long synthetic run. Cancel it from the phone. Confirm the displayed
   attempt stopped and preserved its partial evidence; `2f open <id>` must
   agree. Retry only after the owned process group has drained.
6. Accept a READY result and check DONE in all three surfaces. Checks and
   acceptance must remain distinct; read-only verification does not apply a patch.
7. While viewing a long result, background Safari for 60 seconds, lock/unlock
   the phone, then return. Verify status refresh and usable scroll/input.
   Repeat while a synthetic task completes in the background.
8. Interrupt Wi-Fi while the host stays running. Confirm an offline banner
   is visible inside task detail, mutation controls are disabled, and drafts
   survive a refused submission. Restore Wi-Fi: reconnect without re-pairing,
   refresh authoritative state and verify no offline action was queued.
9. Stop/restart only the disposable workspace's runtime. Confirm the same
   offline/reconnect behavior and task state. Do not stop unrelated services.
10. Run `2f pair --off`. Confirm the existing phone can no longer read or
    mutate. Reconnect/reload must not restore authority. Re-pair separately
    and confirm the former phone session is still refused.

## Operator-managed HTTPS path

Repeat the path against the exact matching client bundle and relay on two
operator-owned HTTPS origins with valid public certificates. Verify the
`/pair` rewrite, JavaScript MIME types, cross-origin preflight, outbound WSS,
encrypted command acknowledgements and SSE before using a phone. Put the
phone on a different network from the host, then repeat outage/restart,
rotation and revocation. A local test CA or temporary tunnel does not establish
an operated service. See [deployment](../../deploy/README.md).

## Receipt

Record PASS / FAIL / NOT RUN for each step, with task IDs, observed persisted
state, cleaned screenshots, and any error text. Name synthetic execution
separately from real harness work. Record limitations for the tested device;
repeat on Android before claiming Android support, or publish an explicit
platform limit. A missing physical check remains a release gate for that claim.

Afterward revoke pairing, stop only the test runtime, and retain private state
outside the public evidence directory. Publish no tokens, codes, keys or device
identifiers with the receipt.
