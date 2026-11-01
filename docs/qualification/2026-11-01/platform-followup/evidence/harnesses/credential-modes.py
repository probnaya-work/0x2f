"""Read-only existing credential metadata. Never emit values or initialize CLIs."""
import datetime
import json
import os
import pathlib
import re
import subprocess

home = pathlib.Path.home()
output = pathlib.Path(__file__).resolve().parent / 'credential-modes.json'
keys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']
result = {'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'approval': 'Human approved up to $5; existing credentials only; no new keys or credits.',
          'environmentPresence': {key: bool(os.environ.get(key)) for key in keys},
          'files': [], 'keychain': []}
for rel in ['.codex/auth.json', '.gemini/settings.json', '.gemini/oauth_creds.json',
            '.gemini/gemini-credentials.json', '.claude/.credentials.json', '.claude.json', '.claude/settings.json']:
    target = home / rel
    row = {'path': str(target), 'exists': target.is_file()}
    if target.is_file() and target.suffix == '.json' and 'gemini-credentials' not in rel:
        try:
            data = json.loads(target.read_text())
            if rel == '.codex/auth.json':
                row.update(authMode=data.get('auth_mode'), apiKeyPresent=bool(data.get('OPENAI_API_KEY')),
                           oauthTokensPresent=bool(data.get('tokens')))
            elif rel == '.gemini/settings.json':
                row['selectedAuthType'] = data.get('security', {}).get('auth', {}).get('selectedType')
            elif rel == '.gemini/oauth_creds.json':
                row.update(accessTokenPresent=bool(data.get('access_token')), refreshTokenPresent=bool(data.get('refresh_token')))
            else:
                row.update(apiKeyPresent=bool(data.get('apiKey') or data.get('primaryApiKey') or data.get('anthropicApiKey')),
                           oauthPresent=bool(data.get('oauthAccount') or data.get('claudeAiOauth')),
                           apiKeyHelperConfigured=bool(data.get('apiKeyHelper')))
                row['environmentPresence'] = {key: bool(data.get('env', {}).get(key)) for key in keys}
        except Exception as error:
            row['parseErrorType'] = type(error).__name__
    result['files'].append(row)
for service, account in [('gemini-cli-api-key', 'default-api-key'), ('gemini-cli-oauth', None),
                         ('Claude Code-credentials', None), ('Claude Code', None)]:
    command = ['/usr/bin/security', 'find-generic-password', '-s', service]
    if account:
        command += ['-a', account]
    try:
        child = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        result['keychain'].append({'service': service, 'account': account,
                                   'entryFound': child.returncode == 0, 'exitCode': child.returncode})
    except subprocess.TimeoutExpired:
        result['keychain'].append({'service': service, 'account': account, 'timedOut': True})
# Inspect only conventional files for assignment presence; never source them.
for target in [home / '.zshenv', home / '.zprofile', home / '.zshrc',
               pathlib.Path.cwd() / '.env', pathlib.Path.cwd() / '.env.local']:
    row = {'path': str(target), 'exists': target.is_file()}
    if target.is_file():
        content = target.read_text(errors='replace')
        row['assignmentPresence'] = {key: bool(re.search(r'^\s*(?:export\s+)?' + key + r'\s*=\s*\S+', content, re.M)) for key in keys}
    result['files'].append(row)
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
