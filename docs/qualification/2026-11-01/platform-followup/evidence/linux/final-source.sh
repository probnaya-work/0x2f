set -eu
qual_root="$HOME/0x2f-qualification-20261101"
cd "$qual_root/checkout"
git status --short
git diff --binary > "$qual_root/incoming/pre-final-owned.patch"
git fetch "$qual_root/incoming/0x2f-platform-final-source.bundle" HEAD
test "$(git rev-parse FETCH_HEAD)" = 88829516c445cddebb7f5383d1b2a1fb03cf0828
git restore -- package.json src/cli.mjs src/web/app.js
cmp scripts/test.mjs "$qual_root/incoming/0x2f-test-runner.mjs"
rm scripts/test.mjs
git switch --detach FETCH_HEAD
git status --short
git rev-parse HEAD
cp "$qual_root/incoming/run-isolated-matrix.mjs" "$qual_root/incoming/matrix.mjs"
