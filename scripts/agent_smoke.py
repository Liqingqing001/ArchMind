"""QA only: prove console and Agent consume identical published records."""
import json
import os
from pathlib import Path
import urllib.request
import urllib.error

settings = dict(line.split("=", 1) for line in Path(os.environ["QA_ENV_FILE"]).read_text().splitlines() if "=" in line)
root = 'http://127.0.0.1:' + settings['APP_PORT']


def call(path, body=None, role='ADMIN_TOKEN'):
    req = urllib.request.Request(root + path, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings[role]})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


assert call('/api/knowledge/retrieve', {'query': '上下文'}, 'KNOWLEDGE_TOKEN')['results'] == []
agent = call('/api/knowledge/retrieve', {'query': '上下文', 'include_demo': True, 'request_id': 'docker-qa-agent:1'}, 'KNOWLEDGE_TOKEN')
console = call('/api/search?q=%E4%B8%8A%E4%B8%8B%E6%96%87')
assert agent['results'] == console['results']
assert agent['results'][0]['version'] == 1
change = next(c for c in call('/api/changes') if c['key'] == '上下文窗口')
call('/api/changes/' + change['id'] + '/review', {'decision': 'approved'})
after = call('/api/knowledge/retrieve', {'query': '上下文', 'include_demo': True, 'request_id': 'docker-qa-agent:2'}, 'KNOWLEDGE_TOKEN')
assert after['results'][0]['version'] == 2
assert after['results'][0]['value'] == '128K tokens'
assert call('/api/traces/' + agent['trace_id'])['results'][0]['version'] == 1
assert len(call('/api/traces?caller=agent')) == 3
assert call('/api/traces/' + after['trace_id'])['request_context']['request_id'] == 'docker-qa-agent:2'
try:
    call('/api/entities', role='KNOWLEDGE_TOKEN')
    raise AssertionError('Agent must not access admin APIs')
except urllib.error.HTTPError as error:
    assert error.code == 401
print('PASS: deployed console/Agent share facts; publication immediately visible; old evidence frozen; Agent has no admin access')
