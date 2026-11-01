set -eu
qual_root="$HOME/0x2f-qualification-20261101"
git init "$qual_root/checkout"
git -C "$qual_root/checkout" fetch "$qual_root/incoming/candidate.bundle" HEAD
git -C "$qual_root/checkout" switch -c qualification/2026-11-01 FETCH_HEAD
git -C "$qual_root/checkout" rev-parse HEAD
git -C "$qual_root/checkout" merge-base --is-ancestor ac1e7af3bed1ad28fc655e5b58a346ebad400399 HEAD
for version in v20.0.0 v20.20.2 v26.13.0; do
  artifact="node-$version-linux-x64.tar.xz"
  cd "$qual_root/runtimes"
  curl -fSL --retry 2 --connect-timeout 15 "https://nodejs.org/dist/$version/$artifact" -o "$artifact"
  curl -fSL --retry 2 --connect-timeout 15 "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$version-SHASUMS256.txt"
  sha256sum --ignore-missing -c "$version-SHASUMS256.txt"
  tar -xf "$artifact"
  "./node-$version-linux-x64/bin/node" --version
done
