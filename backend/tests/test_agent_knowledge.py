from app.models import EntityCategory, Category
from app.seed import seed
from test_governance import setup_source, candidate, approve


def retrieve(client, query="上下文", **filters):
    return client.post('/api/knowledge/retrieve', json={"query": query, **filters})


def test_console_and_agent_retrieve_same_published_facts(client, db):
    entity, _, snapshot = setup_source(db)
    pending = candidate(client, entity, snapshot).json()
    assert retrieve(client).json()["results"] == []
    assert approve(client, pending['id']).status_code == 200
    agent = retrieve(client, request_id="conversation-1:call-1").json()
    console = client.get('/api/search?q=上下文').json()
    assert agent['results'] == console['results']
    result = agent['results'][0]
    assert result['entity_id'] == entity.id
    assert result['fact_id'] in {f['id'] for f in client.get(f'/api/entities/{entity.id}').json()['facts']}
    assert result['snapshot_hash'] == snapshot.content_hash
    assert result['evidence'] in client.get(f'/api/snapshots/{result["snapshot_id"]}').json()['content']
    record = client.get('/api/traces/' + agent['trace_id']).json()
    assert record['caller'] == 'agent'
    assert record['request_context']['request_id'] == 'conversation-1:call-1'
    assert client.get('/api/traces?caller=agent').json()[0]['id'] == agent['trace_id']
    assert len(client.get('/api/traces?caller=console').json()) == 1


def test_agent_immediately_observes_approved_updates_and_keeps_old_trace(client, db):
    entity, _, snapshot = setup_source(db)
    assert approve(client, candidate(client, entity, snapshot).json()['id']).status_code == 200
    before = retrieve(client).json()
    change = candidate(client, entity, snapshot, "128K tokens", "新版：128K tokens").json()
    assert retrieve(client).json()['results'][0]['version'] == 1
    assert approve(client, change['id']).status_code == 200
    after = retrieve(client).json()
    assert after['results'][0]['value'] == '128K tokens'
    assert after['results'][0]['version'] == 2
    assert client.get('/api/traces/' + before['trace_id']).json()['results'][0]['version'] == 1


def test_agent_excludes_demo_by_default(client, db):
    seed(db)
    assert retrieve(client).json()['results'] == []
    results = retrieve(client, include_demo=True).json()['results']
    assert results and all(r['is_demo'] for r in results)


def test_knowledge_token_cannot_manage_or_inspect_private_console_records(client, db, monkeypatch):
    monkeypatch.setenv('ADMIN_TOKEN', 'admin-only')
    monkeypatch.setenv('KNOWLEDGE_TOKEN', 'agent-read-only')
    headers = {'Authorization': 'Bearer agent-read-only'}
    assert client.post('/api/knowledge/retrieve', headers=headers, json={'query': '模型'}).status_code == 200
    for path in ['/api/entities', '/api/traces', '/api/config', '/api/changes']:
        assert client.get(path, headers=headers).status_code == 401
    assert client.post('/api/entities', headers=headers, json={'name': 'bad', 'kind': 'model'}).status_code == 401
    assert client.post('/api/knowledge/retrieve', json={'query': '模型'}).status_code == 401
    assert client.post('/api/knowledge/retrieve', headers={'Authorization': 'Bearer admin-only'}, json={'query': '模型'}).status_code == 200


def test_agent_category_entity_and_kind_filters(client, db):
    entity, _, snapshot = setup_source(db)
    approve(client, candidate(client, entity, snapshot).json()['id'])
    parent = Category(name='AI 模型')
    db.add(parent)
    db.flush()
    child = Category(name='语言模型', parent_id=parent.id)
    db.add(child)
    db.flush()
    db.add(EntityCategory(entity_id=entity.id, category_id=child.id))
    db.commit()
    assert len(retrieve(client, category_id=parent.id, entity_ids=[entity.id], kind='model').json()['results']) == 1
    assert retrieve(client, entity_ids=['missing']).json()['results'] == []
    assert retrieve(client, kind='vendor').json()['results'] == []
    assert retrieve(client, category_id='missing').json()['results'] == []


def test_agent_top_k_input_limits_and_literal_wildcards(client, db):
    entity, _, snapshot = setup_source(db)
    approve(client, candidate(client, entity, snapshot).json()['id'])
    assert retrieve(client, top_k=0).status_code == 422
    assert retrieve(client, top_k=31).status_code == 422
    assert retrieve(client, query='  ').status_code == 422
    assert retrieve(client, query='%').json()['results'] == []
    assert len(retrieve(client, top_k=1).json()['results']) == 1
    assert client.get('/api/traces?limit=101').status_code == 422


def test_rejected_candidates_not_available_to_agent(client, db):
    entity, _, snapshot = setup_source(db)
    change = candidate(client, entity, snapshot).json()
    client.post(f'/api/changes/{change["id"]}/review', json={'decision': 'rejected'})
    assert retrieve(client).json()['results'] == []


def test_agent_schema_and_adapter_use_restricted_endpoint(monkeypatch):
    from examples.agent_tool import TOOL, search_archmind_knowledge
    import httpx
    seen = {}
    def fake_post(url, **kwargs):
        seen.update(url=url, **kwargs)
        return httpx.Response(200, json={'trace_id': 'test', 'results': []}, request=httpx.Request('POST', url))
    monkeypatch.setenv('ARCHMIND_URL', 'https://knowledge.example.com')
    monkeypatch.setenv('KNOWLEDGE_TOKEN', 'read-only-secret')
    monkeypatch.setattr('examples.agent_tool.httpx.post', fake_post)
    assert search_archmind_knowledge(query='模型')['trace_id'] == 'test'
    assert seen['url'] == 'https://knowledge.example.com/api/knowledge/retrieve'
    assert seen['headers']['Authorization'] == 'Bearer read-only-secret'
    assert seen['json']['include_demo'] is False
    assert 'query' in TOOL['function']['parameters']['properties']
