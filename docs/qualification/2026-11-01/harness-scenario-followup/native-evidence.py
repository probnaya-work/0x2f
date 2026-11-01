"""Read only this scratch task's native records; never read or copy credentials."""
import json
import pathlib
import sqlite3

evidence = pathlib.Path(__file__).parent / 'evidence'
installation = json.loads((evidence / 'installation.json').read_text())
workspace = pathlib.Path(installation['workspace'])
task = json.loads(next((workspace / '.work/tasks').glob('*/task.json')).read_text())
for run in task['runs']:
    sid = run.get('externalSessionId')
    if not sid:
        continue
    if run['provider'] == 'codex':
        paths = list(pathlib.Path('/Users/bogart/.codex/sessions/2026/11/01').glob('*' + sid + '.jsonl'))
        assert len(paths) == 1, (sid, paths)
        records = []
        for line in paths[0].read_text().splitlines():
            event = json.loads(line)
            payload = event.get('payload', {})
            fields = None
            if event['type'] == 'session_meta':
                fields = ['id', 'cwd', 'originator', 'cli_version', 'source', 'model_provider']
                assert pathlib.Path(payload['cwd']).resolve() == workspace.resolve()
            elif event['type'] == 'turn_context':
                fields = ['cwd', 'model', 'approval_policy', 'sandbox_policy', 'effort']
            elif event['type'] == 'response_item' and payload.get('type') in ['function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output']:
                fields = ['type', 'name', 'call_id', 'arguments', 'input', 'output']
            elif event['type'] == 'event_msg' and payload.get('type') == 'token_count':
                fields = ['type', 'info']
            if fields:
                records.append({'timestamp': event.get('timestamp'), 'type': event['type'], 'payload': {k: payload[k] for k in fields if k in payload}})
        (evidence / f'codex-run-{run["run"]}-native.json').write_text(json.dumps({'source': str(paths[0]), 'sessionId': sid, 'records': records}, indent=2) + '\n')
    elif run['provider'] == 'opencode':
        connection = sqlite3.connect('file:/Users/bogart/.local/share/opencode/opencode.db?mode=ro', uri=True)
        columns = ['id', 'directory', 'version', 'agent', 'model', 'cost', 'tokens_input', 'tokens_output', 'tokens_reasoning', 'tokens_cache_read', 'tokens_cache_write', 'time_created', 'time_updated', 'time_idle', 'idle_outcome']
        row = connection.execute('select ' + ','.join(columns) + ' from session_v2 where id=?', (sid,)).fetchone()
        session = dict(zip(columns, row))
        assert pathlib.Path(session['directory']).resolve() == workspace.resolve()
        messages = []
        for kind, data in connection.execute('select type,data from session_message where session_id=? order by seq', (sid,)):
            content = json.loads(data)
            if kind == 'assistant':
                messages.append({key: content[key] for key in ['time', 'agent', 'model', 'content', 'finish', 'rawFinish', 'cost', 'tokens'] if key in content})
        (evidence / 'opencode-native-session.json').write_text(json.dumps({'session': session, 'assistantMessages': messages}, indent=2) + '\n')
print(json.dumps({'taskId': task['id'], 'sessionsRecorded': len(task['runs'])}))
