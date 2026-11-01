"""Offline assertions over the retained real-run evidence; no model or credentials."""
import collections
import datetime
import difflib
import hashlib
import json
import pathlib
import re

base = pathlib.Path(__file__).parent / 'evidence'
load = lambda name: json.loads((base / name).read_text())
lines = lambda name: [json.loads(s) for s in (base / name).read_text().splitlines()]
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
initial = load('02-codex-ready/task-state/task.json')
note = load('03-note-only/task-state/task.json')
opencode = load('05-opencode-ready/task-state/task.json')
final = load('11-done-after-runtime-restart/task-state/task.json')
assert initial['id'] == note['id'] == opencode['id'] == final['id'] == 1
assert len({c['slug'] for c in [initial, note, opencode, final]}) == 1
assert initial['status'] == note['status'] == 'ready'
assert initial['runs'] == note['runs']
assert final['status'] == 'done'
assert final == load('10-reopened-done/task-state/task.json') == load('09-closed/task-state/task.json')
assert opencode == load('06-runtime-reopened/task-state/task.json')
assert [r['provider'] for r in final['runs']] == ['codex', 'opencode', 'codex']
assert all(r['outcome'] == 'ready' and r['attempts'] == 1 for r in final['runs'])
assert len({r['externalSessionId'] for r in final['runs']}) == 3
date = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
for a, b in zip(final['runs'], final['runs'][1:]):
    assert date(a['completedAt']) < date(b['startedAt'])
commands = lines('commands.jsonl')
refusals = [c for c in commands if c['command'][1] == 'rerun' and c['status'] != 0]
assert len(refusals) == 3
assert all('current run is still executing' in c['stderr'] for c in refusals)
assert sum(c['command'][1] == 'new' for c in commands) == 1
samples = lines('processes.jsonl')
assert all(len({p['pgid'] for p in s['processes']}) <= 1 for s in samples)
assert len([s for s in samples if s['phase'] == 'quiescence' and not s['processes']]) >= 3
events = lines('11-done-after-runtime-restart/task-state/events.jsonl')
counts = collections.Counter(e['type'] for e in events)
assert counts['task.created'] == 1 and counts['task.note'] == 2 and counts['run.completed'] == 3
assert counts['task.closed'] == 1 and counts['run.failed'] == 0 and counts['permission.resolved'] == 0
assert not [e for e in events if e['type'] == 'needs_user']
constraint = (base / 'user-constraint.txt').read_text().strip()
for n in [2, 3]:
    prompt = (base / f'11-done-after-runtime-restart/task-state/runs/{n}/prompt.md').read_text()
    assert constraint in prompt
    for previous in range(1, n):
        result = (base / f'11-done-after-runtime-restart/task-state/runs/{previous}/result.md').read_text().strip()
        assert result in prompt
for phase, previous_runs in [('02-codex-ready', [1]), ('05-opencode-ready', [1, 2])]:
    for n in previous_runs:
        for filename in ['prompt.md', 'result.md']:
            assert digest(base / phase / f'task-state/runs/{n}/{filename}') == digest(base / f'11-done-after-runtime-restart/task-state/runs/{n}/{filename}')
assert digest(base / '02-codex-ready/task-state/prompt.md') == digest(base / '11-done-after-runtime-restart/task-state/prompt.md')
before = (base / '02-codex-ready/program/duration.test.mjs').read_text()
after = (base / '05-opencode-ready/program/duration.test.mjs').read_text()
removed = [s for s in difflib.ndiff(before.splitlines(), after.splitlines()) if s.startswith('- ')]
assert removed == ["- import { readFileSync, statSync } from 'node:fs';"], removed
api = lambda name: re.search(r'export function formatDuration\(seconds\) \{.*?\n\}', (base / name / 'program/duration.mjs').read_text(), re.S).group()
assert api('02-codex-ready') == api('05-opencode-ready')
for name in ['duration.mjs', 'duration.test.mjs']:
    assert digest(base / '05-opencode-ready/program' / name) == digest(base / '11-done-after-runtime-restart/program' / name)
first_check = load('initial-independent-verification.json')
assert first_check['suiteStatus'] == 0 and all(c.get('failure') for c in first_check['cliCases'])
for phase in ['opencode', 'final']:
    result = load(phase + '-independent-verification.json')
    assert result['suiteStatus'] == 0 and result['oracleCases'] == 2010
    assert len(result['cliCases']) == 18 and not any(c.get('failure') for c in result['cliCases'])
for n in [1, 3]:
    native = load(f'codex-run-{n}-native.json')
    assert native['sessionId'] == final['runs'][n - 1]['externalSessionId']
    context = next(r['payload'] for r in native['records'] if r['type'] == 'turn_context')
    assert context['model'] == 'gpt-6.1-sol' and context['approval_policy'] == 'never'
    assert context['sandbox_policy']['type'] == 'workspace-write'
oc = load('opencode-native-session.json')
assert oc['session']['id'] == final['runs'][1]['externalSessionId']
assert oc['session']['cost'] == 0 and oc['session']['idle_outcome'] == 'succeeded'
assert all(m['model'] == {'id': 'big-pickle', 'providerID': 'opencode'} for m in oc['assistantMessages'])
restarts = lines('runtime-restarts.jsonl')
assert len(restarts) == 5 and all(r.get('code', 0) == 0 for r in restarts)
install = load('installation.json')
assert digest(base / install['package']['filename']) == install['archiveSha256']
assert all(f['installedMatches'] for f in load('inventory.json')['packageSourceChecks'])
checks = load('repository-checks.json')
assert all(r['code'] == 0 for r in checks['results'])
test_log = (base / 'repository-test.log').read_text()
assert 'ℹ tests 715' in test_log and 'ℹ pass 705' in test_log and 'ℹ fail 0' in test_log and 'ℹ skipped 10' in test_log
receipt = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'taskId': final['id'], 'slug': final['slug'], 'status': final['status'],
           'runs': final['runs'], 'nativeResumeTested': False, 'continuity': 'new native sessions with 0x2F task context',
           'overlapRefusals': len(refusals), 'processSamples': len(samples),
           'runtimeStarts': 3, 'permissionRequests': 0, 'nativeOpenCodeCost': oc['session']['cost'],
           'originalRunArtifactsUnchanged': True, 'originalTestsPreserved': True,
           'finalCodexChangedProgram': False, 'installedSourceFilesMatch': len(load('inventory.json')['packageSourceChecks']),
           'programTests': 82, 'independentApiCases': 2010, 'independentCliCases': 18,
           'repositoryTests': {'total': 715, 'passed': 705, 'failed': 0, 'skipped': 10},
           'claudeCode': 'not tested; no account on this computer', 'result': 'passed'}
receipt_path = base / 'verified-receipt.json'
if receipt_path.exists():
    previous = json.loads(receipt_path.read_text())
    receipt['verifiedAt'] = previous['verifiedAt']
    assert previous == receipt, 'Retained receipt no longer matches the evidence'
else:
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
