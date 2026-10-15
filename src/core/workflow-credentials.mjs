// Inspect values before serialization. Never include inspected data in errors.
export function credentialValues(definition) {
  const names = [definition?.adapters?.supervision?.credentialEnv, definition?.adapters?.image?.credentialEnv]
    .flatMap(value => Array.isArray(value) ? value : []);
  return names.map(name => process.env[name]).filter(value => typeof value === 'string' && value.length);
}

export function rejectCredentialValues(value, secrets = []) {
  const needles = [...new Set(secrets.filter(secret => typeof secret === 'string' && secret.length)
    .flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1)]))].map(secret => Buffer.from(secret));
  if (!needles.length) return value;
  const seen = new WeakSet();
  function bytes(buffer) {
    if (needles.some(secret => buffer.includes(secret))) throw new Error('Credential-bearing workflow data refused: credential values are not permitted.');
  }
  function visit(item) {
    if (typeof item === 'string') {
      bytes(Buffer.from(item));
      // Materials and input specs can already be JSON text. Inspect decoded
      // values too, including standard JSON Buffer representations.
      if (/^\s*[\[{"]/.test(item)) {
        let decoded;
        try { decoded = JSON.parse(item); } catch { return; }
        visit(decoded);
      }
    } else if (item && typeof item === 'object' && !seen.has(item)) {
      seen.add(item);
      if (Buffer.isBuffer(item) || ArrayBuffer.isView(item) || item instanceof ArrayBuffer) {
        const buffer = item instanceof ArrayBuffer ? Buffer.from(item) : Buffer.from(item.buffer, item.byteOffset, item.byteLength);
        bytes(buffer);
        if (/^\s*[\[{"]/.test(buffer.toString('utf8', 0, 32))) visit(buffer.toString('utf8'));
      } else if (item.type === 'Buffer' && Array.isArray(item.data)) {
        bytes(Buffer.from(item.data));
        for (const [key, child] of Object.entries(item)) { visit(key); visit(child); }
      } else {
        for (const [key, child] of Object.entries(item)) { visit(key); visit(child); }
      }
    }
  }
  visit(value);
  return value;
}

export function assertExplicitCommandPermission(definition) {
  if (definition?.permissions?.commandAdapters !== true || definition?.permissionDeclarations?.commandAdapters !== true)
    throw new Error('Explicit source commandAdapters permission is required; refresh legacy workflow settings.');
}
