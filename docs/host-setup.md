# One persistent Linux execution host — 0.2.0

0x2F can run directly on an always-on Linux host. Its node is still `local`:
local to that host. The Mac and phone are control clients. This is one runtime
for one persistent workspace, not task migration, fleet scheduling or failover.

Use an ordinary existing SSH user and trusted host key. Install Node/npm and the
chosen harness from its official distribution into persistent user-owned paths.
Check the harness version, supported headless/ACP command and authorization on
Linux itself. Do not transplant Mac credentials or place secrets in a unit file.
A service does not inherit your interactive shell's PATH or environment.

1. Install the release into a dedicated immutable prefix with
   `npm install -g --prefix /absolute/release/prefix 0x2f@0.2.0`.
2. Initialize a persistent repository with `2f init`. Keep `.work/` private and
   excluded from Git. Its task files are the durable state, not the browser.
3. Copy [the user unit](../deploy/0x2f-user.service) to
   `~/.config/systemd/user/0x2f.service`. Replace its absolute Node/package,
   workspace and PATH placeholders. Preserve `0X2F_SUPERVISED=1`,
   `KillMode=process`, `UMask=0077` and `Restart=always`.
4. With the host owner's authorization, enable lingering for that user:
   `loginctl enable-linger "$USER"`. Then:

```sh
systemd-analyze --user verify ~/.config/systemd/user/0x2f.service
systemctl --user daemon-reload
systemctl --user enable --now 0x2f
systemctl --user status 0x2f
journalctl --user -u 0x2f -n 50 --no-pager
systemctl --user restart 0x2f
systemctl --user stop 0x2f
```

An explicit stop is respected. KillMode deliberately leaves detached workers
alive during a runtime restart/stop. It does not cancel an agent. On startup,
recovery reads persisted state: living workers continue; interrupted execution
is reported, not secretly replayed. Never delete `.work` to resolve overlap.
Update a release prefix only after its workers are quiescent; retain the previous
prefix for rollback. Back up private workspace state according to your own policy.

For Mac browser control keep the full API loopback-only and forward it over SSH:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:55912:127.0.0.1:4242 user@host
# open http://127.0.0.1:55912 on the Mac
```

For a phone on the same trusted LAN run `2f pair --port 4242` **on the host**.
It prints a one-time URL/code. The local API remains inaccessible to LAN callers;
the phone uses the existing encrypted, redacted control protocol. Pairing a
supervised loopback runtime now signals it and waits for the service manager to
bring it back LAN-enabled. It never starts a competing detached replacement.
Re-pairing rotates 0x2F credentials and revokes the previous phone session; normal
reconnect does not. Hosted control needs your own deployed TLS relay/client;
the marketing website is neither. See [remote control](remote-control.md).

## Observing the host with 057

Use the existing opt-in MACHINE PULSE SSH source on the Mac's 057 Core:
`O57_MACHINE_PULSE_SSH=user@host`. It reads Linux telemetry through the existing
collector, SQLite, Core and canonical Landscape. Machine IDs are stable and
separate from the Mac; reconnect must not add a second ThinkCentre mass.
Aggregate CPU is machine activity, not proof that a particular agent is working.
Task/run/session/process correlation requires actual identity evidence.

057 Display is a separate pairing relationship: its signed iOS app must trust
that exact Core, using Add Display / SCAN NEW QR and mutual TLS. A phone paired
with Xcode, or with another Core/store, is insufficient. No 057 renderer,
collector or protocol is duplicated in 0x2F. This integration does not publish a
new 057 application version or claim full visual/long-duration qualification.
