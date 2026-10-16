"""Source lifecycle qualification using only fake bytes and an isolated store."""
import importlib.util
import os
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('managed_keychain', Path(__file__).resolve().parents[2] / 'src/core/managed-keychain.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix='0x2f-keychain-test-') as root:
    p = Path(root) / 'fake-source'
    def source(mode=0o600):
        p.write_bytes(b'FAKE_KEY_NO_PROVIDER\n')
        p.chmod(mode)
    def refuses(store, retrieve):
        try:
            module.import_credential(str(p), store, retrieve)
            raise AssertionError('accepted unsafe import')
        except RuntimeError:
            assert p.exists() or p.is_symlink()
    stored = []
    for mode in (0o644, 0o640, 0o604):
        source(mode)
        refuses(stored.append, lambda: stored[-1])
    assert not stored
    p.unlink()
    target = Path(root) / 'fake-target'
    target.write_bytes(b'FAKE_KEY')
    p.symlink_to(target)
    refuses(stored.append, lambda: b'FAKE_KEY')
    p.unlink()
    p.mkdir()
    refuses(stored.append, lambda: b'FAKE_KEY')
    p.rmdir()
    source()
    real_uid = module.os.getuid
    module.os.getuid = lambda: real_uid() + 1
    refuses(stored.append, lambda: stored[-1])
    module.os.getuid = real_uid
    assert not stored
    refuses(stored.append, lambda: b'DIFFERENT_FAKE_VALUE')
    assert p.read_bytes() == stored[-1]
    def fails(_value):
        raise RuntimeError()
    refuses(fails, lambda: None)
    def swaps(value):
        p.unlink()
        p.write_bytes(value)
        p.chmod(0o600)
    refuses(swaps, lambda: b'FAKE_KEY_NO_PROVIDER\n')
    source()
    def read_back():
        assert p.exists(), 'source was removed before round-trip verification'
        return stored[-1]
    module.import_credential(str(p), stored.append, read_back)
    assert not p.exists()
print('passed')
