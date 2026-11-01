from pathlib import Path
import json, re, hashlib
root = Path(__file__).resolve().parents[5]
base = root / "docs/qualification/2026-11-01/platform-followup/evidence"
expected = "2941c028b00310f941ced0ed7d7ba5aa48f6d016"
rows = []
def count(text, field):
    values = re.findall(r"^(?:#|ℹ) " + field + r" (\d+)$", text, re.M)
    assert values, field
    return int(values[-1])
for osname, folder, prefix in [("macOS", base / "macos", "final-"), ("Ubuntu", base / "linux/qualified", "")]:
    for version in ["v20.0.0", "v20.20.2", "v26.13.0"]:
        directory = folder / (prefix + version)
        summary = json.loads((directory / "summary.json").read_text())
        assert summary["source_commit"] == expected, directory
        for file, digest in summary["source_sha256"].items():
            assert hashlib.sha256((root / file).read_bytes()).hexdigest() == digest, (directory, file)
        assert all(step["code"] == 0 for step in summary["steps"]), directory
        full = next(step for step in summary["steps"] if step["label"] == "actual-npm-test")
        raw = (directory / "actual-npm-test.txt").read_text()
        for field, value in [("tests", 715), ("pass", 705), ("fail", 0), ("skipped", 10), ("cancelled", 0)]:
            assert count(raw, field) == value == full["tap"][field], (directory, field)
        dist = next(step for step in summary["steps"] if step["label"] == "installed-distribution-journey")
        assert dist["tap"]["pass"] == 1 and dist["tap"]["fail"] == 0 and dist["tap"]["skipped"] == 0, directory
        rows.append({"os": osname, "node": summary["node"], "npm": summary["npm"],
            "source": expected, "tests": 715, "passed": 705, "failed": 0, "skipped": 10,
            "installed_journey": "1/1,0skip", "evidence": str(directory.relative_to(root))})
online = (base / "linux/qualified/online-registry-distribution.txt").read_text()
assert count(online, "pass") == 1 and count(online, "fail") == 0 and count(online, "skipped") == 0
result = {"source": expected, "checks": "raw counts + summaries + local source SHA256 + all step exits + no-skipping installed journeys",
    "matrix": rows, "online_registry_linux_lts": "1/1,0fail,0skip"}
(base / "verified-matrix.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
