"""Dedicated macOS Keychain boundary. Secret bytes travel only over a private pipe.

No security(1) password argv, environment persistence, credential hashes or errors
containing user data. This helper is called only by the foreground boundary.
"""
import ctypes as C
import os
import stat
import sys

SERVICE = b'space.0x2f.managed-openai.foreground'
ACCOUNT = b'openai-api-key'


def import_credential(source, store, retrieve):
    before = os.lstat(source)
    def approved(s):
        return stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and not s.st_mode & 0o077
    if not approved(before):
        raise RuntimeError()
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        if not approved(opened) or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise RuntimeError()
        value = stream.read(16385)
        if not value or len(value) > 16384:
            raise RuntimeError()
        store(value)
        if retrieve() != value:
            raise RuntimeError()
        current = os.lstat(source)
        if not approved(current) or any(getattr(current, k) != getattr(opened, k)
                for k in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')):
            raise RuntimeError()
        os.unlink(source)


def main():
    cf = C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
    sec = C.CDLL('/System/Library/Frameworks/Security.framework/Security')
    ptr = C.c_void_p
    cf.CFStringCreateWithCString.argtypes = [ptr, C.c_char_p, C.c_uint32]
    cf.CFStringCreateWithCString.restype = ptr
    cf.CFDictionaryCreateMutable.argtypes = [ptr, C.c_long, ptr, ptr]
    cf.CFDictionaryCreateMutable.restype = ptr
    cf.CFDictionarySetValue.argtypes = [ptr, ptr, ptr]
    cf.CFDataCreate.argtypes = [ptr, C.c_char_p, C.c_long]
    cf.CFDataCreate.restype = ptr
    cf.CFDataGetLength.argtypes = [ptr]
    cf.CFDataGetLength.restype = C.c_long
    cf.CFDataGetBytePtr.argtypes = [ptr]
    cf.CFDataGetBytePtr.restype = ptr
    cf.CFRelease.argtypes = [ptr]
    sec.SecItemCopyMatching.argtypes = [ptr, C.POINTER(ptr)]
    sec.SecItemCopyMatching.restype = C.c_int32
    sec.SecItemAdd.argtypes = [ptr, ptr]
    sec.SecItemAdd.restype = C.c_int32
    refs = []

    def constant(lib, name):
        return ptr.in_dll(lib, name).value

    def string(value):
        p = cf.CFStringCreateWithCString(None, value, 0x08000100)
        refs.append(p)
        return p

    def query(data=False):
        p = cf.CFDictionaryCreateMutable(None, 0,
            C.addressof(C.c_byte.in_dll(cf, 'kCFTypeDictionaryKeyCallBacks')),
            C.addressof(C.c_byte.in_dll(cf, 'kCFTypeDictionaryValueCallBacks')))
        refs.append(p)
        for k, v in [('kSecClass', constant(sec, 'kSecClassGenericPassword')),
                     ('kSecAttrService', string(SERVICE)), ('kSecAttrAccount', string(ACCOUNT)),
                     ('kSecUseAuthenticationUI', constant(sec, 'kSecUseAuthenticationUIFail'))]:
            cf.CFDictionarySetValue(p, constant(sec, k), v)
        if data:
            cf.CFDictionarySetValue(p, constant(sec, 'kSecReturnData'), constant(cf, 'kCFBooleanTrue'))
        return p

    def retrieve():
        result = ptr()
        status = sec.SecItemCopyMatching(query(True), C.byref(result))
        if status == -25300:
            return None
        if status != 0 or not result:
            raise RuntimeError()
        refs.append(result.value)
        size = cf.CFDataGetLength(result)
        if size < 1 or size > 16384:
            raise RuntimeError()
        return C.string_at(cf.CFDataGetBytePtr(result), size)

    try:
        operation = sys.argv[1]
        if operation == 'status':
            result = ptr()
            status = sec.SecItemCopyMatching(query(), C.byref(result))
            if status not in (0, -25300):
                raise RuntimeError()
            sys.stdout.write('configured' if status == 0 else 'missing')
        elif operation == 'retrieve':
            value = retrieve()
            if value is None:
                return 44
            sys.stdout.buffer.write(value)
        elif operation == 'import':
            # The source is fixed, never supplied as a value-bearing argument.
            def store(value):
                q = query()
                data = cf.CFDataCreate(None, value, len(value))
                refs.append(data)
                cf.CFDictionarySetValue(q, constant(sec, 'kSecValueData'), data)
                if sec.SecItemAdd(q, None) not in (0, -25299):
                    raise RuntimeError()
            import_credential(os.path.join(os.path.expanduser('~'), 'Downloads',
                              'openai-api-key.txt'), store, retrieve)
            sys.stdout.write('configured')
        else:
            raise RuntimeError()
        return 0
    finally:
        for ref in reversed(refs):
            if ref:
                cf.CFRelease(ref)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        # Never stringify an OS/Keychain exception (or its contextual values).
        sys.stderr.write('managed_keychain_unavailable\n')
        sys.exit(1)
