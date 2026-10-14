# The launchd group owns this blocked child before the adapter can execute.
import os
import resource
import sys

limit = int(sys.argv[1])
seconds = int(sys.argv[2])
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_FSIZE, (limit, limit))
resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
if sys.stdin.buffer.read(3) != b'GO\n':
    sys.exit(125)
os.execv(sys.argv[3], sys.argv[3:])
