import os, signal, json
pid = 57640
expected_cwd = "/tmp/0x2f-matrix-v26.13.0-LBL7mK/checkout"
cwd = os.readlink(f"/proc/{pid}/cwd")
args = open(f"/proc/{pid}/cmdline", "rb").read().split(b"\0")
assert cwd == expected_cwd, (cwd, expected_cwd)
assert b"test/relay-config-race.test.mjs" in args, args
assert args[0] == b"/home/bogart/0x2f-qualification-20261101/runtimes/node-v26.13.0-linux-x64/bin/node", args[0]
print(json.dumps({"pid": pid, "cwd": cwd, "argv": [a.decode() for a in args if a], "signal": "SIGTERM",
"reason": "isolated pre-followup relay regression process hung for more than four minutes; direct current command and cwd checked, not saved task PID"}))
os.kill(pid, signal.SIGTERM)
