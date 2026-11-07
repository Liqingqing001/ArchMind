"""Run against the isolated Compose QA stack, never an existing production database."""
import json
import os
import re
import urllib.request
import urllib.error
from pathlib import Path

settings = dict(line.split("=", 1) for line in Path(os.environ["QA_ENV_FILE"]).read_text().splitlines() if "=" in line)
root = "http://127.0.0.1:" + settings["APP_PORT"]


def request(path, body=None, auth=True):
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + settings["ADMIN_TOKEN"]
    req = urllib.request.Request(root + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read()
        if "application/json" in response.headers.get("Content-Type", ""):
            return json.loads(raw)
        return raw.decode()


assert request('/api/health', auth=False)["status"] == "ok"
try:
    request('/api/entities', auth=False)
    raise AssertionError("API must require auth")
except urllib.error.HTTPError as error:
    assert error.code == 401
html = request('/', auth=False)
assert 'ArchMind' in html
asset = re.search(r'src="(/assets/[^\"]+\.js)"', html).group(1)
assert len(request(asset, auth=False)) > 1000
entities = request('/api/entities')
assert len(entities) >= 12
atlas = next(e for e in entities if e['name'] == '演示模型 · Atlas')
changes = request('/api/changes')
context = next(c for c in changes if c['key'] == '上下文窗口')
snapshot = request('/api/snapshots/' + context['snapshot_id'])
assert context['evidence'] in snapshot['content']
if context['status'] == 'pending':
    request('/api/changes/' + context['id'] + '/review', {'decision': 'approved', 'note': 'Docker smoke test'})
else:
    assert context['status'] == 'approved'
result = request('/api/search?q=%E4%B8%8A%E4%B8%8B%E6%96%87')
assert result['results'][0]['value'] == '128K tokens'
assert result['results'][0]['version'] == 2
trace = request('/api/traces/' + result['trace_id'])
assert trace['results'] == result['results']
new_entity = next((e for e in entities if e['name'] == 'Smoke Test Entity'), None) or request('/api/entities', {'name': 'Smoke Test Entity', 'kind': 'model'})
assert new_entity['id']
print('PASS: health, static SPA/assets, auth, PostgreSQL CRUD, snapshot, approve, version history, search and trace')
