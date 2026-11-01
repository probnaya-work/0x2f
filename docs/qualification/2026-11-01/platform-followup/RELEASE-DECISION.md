# Release decision inputs — platform follow-up

Candidate version proposal: **0.1.5**, a patch release for qualification-driven
correctness/compatibility fixes. The manifest is deliberately still0.1.4:
this work does not publish, tag, create a release or push.

## Node policy proposal, not an implemented promise

The current published engine contract is `node >=20`; there is no narrower
explicit supported-version list. This follow-up exercises the exact20.0.0
minimum, the last observed20 patch20.20.2, and current Active LTS26.13.0.
Testing those versions does not qualify every release admitted by `>=20`.

The [official schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
marks20 EOL on2026-04-30,22 supported until2027-04-30,24 until2028-04-30,
and26 Active LTS from2026-10-28 until maintenance in2027, with EOL2029-04-30.
The [official distribution index](https://nodejs.org/dist/index.json) listed
26.13.0 as the current stable LTS on this run date.

Proposal: recommend Node26 for new installations. Keep20 compatibility evidence
for0.1.5, label20 an EOL compatibility target, and plan an announced support
floor of Node24 for a subsequent release after adding24 to CI and executing its
full matrix. Do not silently change engines to24 without that verification and
a compatibility notice. Node22 and24 remain untested in this follow-up.

## Release checklist

- Review the local fixes and the final source/evidence commit IDs in FINAL-REPORT.
- Require green syntax/full fixture/distribution results for each claimed cell;
  inspect test counts and native-harness skips, not just wrapper exit status.
- Keep fixture, native/mock, live model and physical-phone evidence separate.
  Complete the approved bounded live series before claiming provider/account
  qualification. Complete the manual phone flow before claiming device support.
- Keep the CLOSE limitation in release notes: closing does not cancel providers,
  and a late permission may remain waiting.
- Do not update an existing workspace while its pre-hardening workers are active;
  older workers do not participate in the new locks and occurrence IDs.
- In the release preparation step, set package/lock version to0.1.5, inspect
  `npm pack --dry-run` and the real tarball, then repeat the installed smoke
  journey against the versioned artifact. Recheck dependency resolution for the
  registry artifact; the offline matrix uses exact locked dependency manifests.
- Review git status and retained foreign changes, then obtain the release/publish
  decision. No such release action is included in this qualification.

## Still outside the claim

Windows; Linux arm64; Node22/24; arbitrary versions satisfying engines;
provider authentication/model availability beyond observed Gemini/DSH flows,
account invoices; Claude/OpenCode real model behavior; physical phone
browser/LAN/background behavior; public
relay deployment/active network attacker resistance; legacy or deliberately
detached process groups and filesystem crash durability. Original remaining
risks continue to apply unless explicitly superseded by fresh evidence.
