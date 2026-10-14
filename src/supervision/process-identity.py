# Read microsecond birth identity from libproc; never signal or print argv.
import ctypes
import json
import subprocess
import sys

class BSDInfo(ctypes.Structure):
    _fields_ = [(n, ctypes.c_uint32) for n in (
        'flags', 'status', 'xstatus', 'pid', 'ppid', 'uid', 'gid', 'ruid',
        'rgid', 'svuid', 'svgid', 'rfu')]
    _fields_ += [('comm', ctypes.c_char * 16), ('name', ctypes.c_char * 32)]
    _fields_ += [(n, ctypes.c_uint32) for n in (
        'nfiles', 'pgrp', 'pjobc', 'e_tdev', 'e_tpgid', 'nice')]
    _fields_ += [('start_sec', ctypes.c_uint64), ('start_usec', ctypes.c_uint64)]

pid = int(sys.argv[1])
lib = ctypes.CDLL('/usr/lib/libproc.dylib')
info = BSDInfo()
count = lib.proc_pidinfo(pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
if count != ctypes.sizeof(info) or info.pid != pid or not info.start_sec:
    sys.exit(1)
boot = subprocess.check_output(['/usr/sbin/sysctl', '-n', 'kern.boottime'], text=True).strip()
print(json.dumps({'schemaVersion': 1, 'pid': pid,
                 'birth': str(info.start_sec) + ':' + str(info.start_usec),
                 'boot': boot, 'pgid': info.pgrp, 'native': True}))
