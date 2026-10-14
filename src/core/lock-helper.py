"""Kernel advisory lock; no PID-based ownership or stale-lock unlinking.
Python stdlib only. Probe never creates/modifies files. Mutex inode stays stable.
"""
import fcntl
import json
import os
import sys
import time
root, mode = sys.argv[1:3]
file = os.path.join(root, '.mutex')
if mode == 'probe':
    try:
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        print(json.dumps({'locked': False, 'exists': False}), flush=True)
        sys.exit(0)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps({'locked': False, 'exists': True}), flush=True)
    except BlockingIOError:
        print(json.dumps({'locked': True, 'exists': True}), flush=True)
    os.close(fd)
    sys.exit(0)
fd = os.open(file, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
deadline = time.monotonic() + 10
while True:
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if time.monotonic() > deadline:
            print(json.dumps({'error': 'Lock is busy; retry or inspect workflow doctor.'}), flush=True)
            os.close(fd)
            sys.exit(2)
        time.sleep(0.025)
print(json.dumps({'acquired': True, 'helperPid': os.getpid()}), flush=True)
sys.stdin.buffer.read()
fcntl.flock(fd, fcntl.LOCK_UN)
os.close(fd)
