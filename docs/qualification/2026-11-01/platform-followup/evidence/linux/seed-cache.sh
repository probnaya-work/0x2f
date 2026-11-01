set -eu
qual_root="$HOME/0x2f-qualification-20261101"
cd "$qual_root/checkout"
touch "$qual_root/public-home/user.npmrc" "$qual_root/public-home/global.npmrc"
env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/public-home" npm_config_cache="$qual_root/public-cache" npm_config_userconfig="$qual_root/public-home/user.npmrc" npm_config_globalconfig="$qual_root/public-home/global.npmrc" npm_config_ignore_scripts=true npm_config_audit=false npm_config_fund=false "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" "$qual_root/runtimes/node-v26.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js" ci --ignore-scripts --no-audit --no-fund
git diff --stat
git status --short
sha256sum src/cli.mjs src/web/app.js package.json scripts/test.mjs
