set -eu
qual_root="$HOME/0x2f-qualification-20261101"
for package in @noble/ciphers@1.3.0 @noble/hashes@1.8.0 ws@8.21.3; do
  env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/public-home" npm_config_cache="$qual_root/public-cache" npm_config_userconfig="$qual_root/public-home/user.npmrc" npm_config_globalconfig="$qual_root/public-home/global.npmrc" "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" "$qual_root/runtimes/node-v26.13.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js" view "$package" version
done
for version in v20.0.0 v20.20.2 v26.13.0; do
  "$qual_root/runtimes/node-$version-linux-x64/bin/node" "$qual_root/incoming/matrix.mjs" "$qual_root/checkout" "$qual_root/evidence/$version-final" "$qual_root/public-cache" || true
done
