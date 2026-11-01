set -eu
qual_root="$HOME/0x2f-qualification-20261101"
cd "$qual_root/checkout"
test -z "$(git status --porcelain)"
git fetch "$qual_root/incoming/0x2f-platform-qualified.bundle" HEAD
test "$(git rev-parse FETCH_HEAD)" = 2941c028b00310f941ced0ed7d7ba5aa48f6d016
git switch --detach FETCH_HEAD
git status --short
mkdir -p "$qual_root/final-home" "$qual_root/evidence/qualified"
env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/final-home" LANG=C.UTF-8 "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" --test test/relay-config-race.test.mjs test/pairing-security.test.mjs test/relay.test.mjs > "$qual_root/evidence/qualified/relay-focused.txt" 2>&1
for version in v20.0.0 v20.20.2 v26.13.0; do
  "$qual_root/runtimes/node-$version-linux-x64/bin/node" "$qual_root/incoming/matrix.mjs" "$qual_root/checkout" "$qual_root/evidence/qualified/$version" "$qual_root/public-cache" || true
done
touch "$qual_root/final-home/user.npmrc" "$qual_root/final-home/global.npmrc"
env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/final-home" LANG=C.UTF-8 npm_config_cache="$qual_root/registry-smoke-cache" npm_config_userconfig="$qual_root/final-home/user.npmrc" npm_config_globalconfig="$qual_root/final-home/global.npmrc" npm_config_ignore_scripts=true npm_config_audit=false npm_config_fund=false "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" --test test/distribution.test.mjs > "$qual_root/evidence/qualified/online-registry-distribution.txt" 2>&1
printf 'QUALIFIED_LOOP_COMPLETED\n'
