"""Bounded POSIX file read through directory FDs, without symlink traversal.
The root identity is frozen in the workflow snapshot. No pathname re-open.
"""
import os
import sys
root, relative, device, inode, limit = sys.argv[1:]
fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
try:
    for part in root.strip('/').split('/'):
        if not part or part in ('.', '..'):
            raise ValueError('invalid root')
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = child
    stat = os.fstat(fd)
    if stat.st_dev != int(device) or stat.st_ino != int(inode):
        raise ValueError('source root identity changed')
    parts = relative.split('/')
    for part in parts:
        if not part or part in ('.', '..'):
            raise ValueError('invalid file path')
    for part in parts[:-1]:
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = child
    child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
    os.close(fd)
    fd = child
    import stat as mode
    stat = os.fstat(fd)
    if not mode.S_ISREG(stat.st_mode) or stat.st_size > int(limit):
        raise ValueError('source is not a bounded regular file')
    data = bytearray()
    while len(data) <= int(limit):
        chunk = os.read(fd, min(65536, int(limit) + 1 - len(data)))
        if not chunk:
            break
        data.extend(chunk)
    if len(data) > int(limit):
        raise ValueError('source grew beyond limit')
    sys.stdout.buffer.write(data)
finally:
    os.close(fd)
