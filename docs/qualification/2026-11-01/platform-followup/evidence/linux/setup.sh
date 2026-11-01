set -eu
qual_root="$HOME/0x2f-qualification-20261101"
if test -e "$qual_root"; then
  printf 'EXISTING_DIRECTORY %s\n' "$qual_root"
  exit 3
fi
mkdir -p "$qual_root/runtimes" "$qual_root/incoming" "$qual_root/evidence" "$qual_root/public-cache"
printf 'QUALIFICATION_ROOT=%s\n' "$qual_root"
cat /etc/os-release
uname -smr
python3 --version
git --version
for b in node npm codex gemini claude opencode dsh; do
  command -v "$b" || true
done
