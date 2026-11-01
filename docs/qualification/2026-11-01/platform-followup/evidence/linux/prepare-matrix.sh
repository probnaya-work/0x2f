set -eu
qual_root="$HOME/0x2f-qualification-20261101"
cd "$qual_root/checkout"
git apply "$qual_root/incoming/0x2f-platform-source.patch"
cp "$qual_root/incoming/0x2f-test-runner.mjs" scripts/test.mjs
mkdir -p "$qual_root/public-home"
env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/public-home" npm_config_cache="$qual_root/public-cache" npm_config_userconfig=/dev/null npm_config_globalconfig=/dev/null npm_config_ignore_scripts=true npm_config_audit=false npm_config_fund=false "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" "$qual_root/runtimes/node-v26.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js" ci --ignore-scripts --no-audit --no-fund
git diff --stat
git status --short
sha256sum src/cli.mjs src/web/app.js package.json scripts/test.mjs
