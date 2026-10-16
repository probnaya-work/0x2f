import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export const nativeLaunchdEnabled = () => process.platform === 'darwin' && process.env.OX2F_NATIVE_LAUNCHD === '1';
export async function assertNativeFixture(base) {
  if (!nativeLaunchdEnabled()) throw new Error('Native LaunchAgent fixtures require explicit node scripts/test-native-launchd.mjs.');
  if (base) {
    const real = await fs.realpath(base), tmp = await fs.realpath(os.tmpdir());
    if (path.dirname(real) !== tmp || !/^2f-workflow-[A-Za-z0-9]+$/.test(path.basename(real))) throw new Error('Native lifecycle requires a confirmed disposable fixture workspace.');
  }
}
