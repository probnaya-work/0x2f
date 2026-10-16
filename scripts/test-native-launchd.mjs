// Explicit opt-in: ordinary npm test never needs native LaunchAgent registration.
import { spawn } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('Native launchd verification requires macOS.');
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(2), 'test/workflow.test.mjs', 'test/workflow-hardening.test.mjs', 'test/workflow-stabilization.test.mjs', 'test/workflow-supervision.test.mjs'], { stdio: 'inherit', env: { ...process.env, OX2F_NATIVE_LAUNCHD: '1' } });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code; });
