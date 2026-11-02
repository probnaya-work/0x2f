# Installed-package verification

From the checkout root on macOS or Linux, supply a populated public npm cache
explicitly with `--cache`, `--cache=`, or the sole positional argument (quote
paths containing spaces):

```sh
node docs/implementation/faithful-return-2026-11-01/verify-installed.mjs --cache "/path/to/public npm cache"
node docs/implementation/faithful-return-2026-11-01/verify-installed.mjs --cache="/path/to/public npm cache"
node docs/implementation/faithful-return-2026-11-01/verify-installed.mjs "/path/to/public npm cache"
node docs/implementation/faithful-return-2026-11-01/verify-installed.mjs --help
```

The cache argument is required. Historical `installation.json` receipts,
their cache roots, and environment cache settings are not used as defaults.
Unknown options, missing or empty `--cache` values, duplicate cache flags, and
mixtures of positional and `--cache` forms are rejected before verification
starts (no evidence or temp trees). These argument errors also take precedence
over `--help`. With well-formed arguments, `--help` exits 0 with usage on stdout
without checking cache paths or creating evidence or temp trees. Missing or
invalid paths and empty `_cacache` trees fail with usage guidance after verification begins. The
preflight checks for readable, non-empty cache content; npm checks dependency
availability and integrity during the offline install. Supply a cache already
populated with all public package dependencies if npm reports `ENOTCACHED`.

The checkout must already have its dependencies installed. Node.js with npm
must be available; `git` and `python3` must be on the isolated system PATH
(`/usr/bin:/bin:/usr/sbin:/sbin`). npm discovery supports symlinked installations,
including macOS `lib/node_modules/npm` and Linux `share/nodejs/npm` layouts.

The verifier copies only `_cacache` into a temporary cache, creates a fresh HOME,
and uses an explicit environment without inherited credentials or npm settings.
It runs syntax checks and regression tests, packs the checkout, installs the
tarball offline into a temporary prefix, checks that the installed version matches the checkout manifest and installed
source bytes, and runs the installed CLI's deterministic PTY tests. Each attempt
writes a separate `evidence/portable-verification-*` directory and removes its
temporary isolation tree. It does not modify an existing global installation.
