set -eu
qual_root="$HOME/0x2f-qualification-20261101"
mkdir -p "$qual_root/probe-home" "$qual_root/evidence/relay-focused-before"
cd "$qual_root/checkout"
getconf _NPROCESSORS_ONLN
for attempt in 1 2 3 4 5; do
  env -i PATH="$qual_root/runtimes/node-v26.13.0-linux-x64/bin:/usr/bin:/bin" HOME="$qual_root/probe-home" LANG=C.UTF-8 "$qual_root/runtimes/node-v26.13.0-linux-x64/bin/node" --test --test-name-pattern="writing the confirmed pairing" test/relay-config-race.test.mjs > "$qual_root/evidence/relay-focused-before/$attempt.txt" 2>&1 || true
done
