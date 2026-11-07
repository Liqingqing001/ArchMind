import json
import httpx
import pytest
from app import agent
from app.models import Trace, Conversation
from app.solution_flow import empty_workflow
from test_governance import setup_source, candidate, approve


CONNECTION = {"base_url": "https://example.com/v1", "api_key": "private-test-key", "model": "test-model"}


def test_generic_download_words_do_not_match_unrelated_models():
    tokens = agent.terms("给出 Qwen3 和 bge-m3 模型的官方下载入口")
    assert {"qwen3", "bge-m3"} <= set(tokens)
    assert not {"官方", "下载", "入口", "模型"} & set(tokens)


def ready_conversation(client,db,goal='上下文窗口'):
    row=client.post('/api/conversations',json={'title':'新对话'}).json()
    workflow=empty_workflow()
    workflow.update(phase='ready',missing=[],fields={key:{'value':goal if key=='goal' else '用户明确表示暂不确定','evidence':'用户明确表示暂不确定'} for key in workflow['missing']})
    saved=db.get(Conversation,row['id'])
    saved.messages=[{'role':'user','content':goal},{'role':'assistant','content':'需求摘要，确认生成吗？','result':{'workflow':workflow}}]
    db.commit()
    return saved


def request(client, text="帮我比较模型的上下文窗口", **kwargs):
    return client.post('/api/agent/chat', json={"connection": CONNECTION,
        "messages": [{"role": "user", "content": text}], **kwargs})


def generate(client,db,text='生成方案'):
    row=ready_conversation(client,db)
    return request(client,text,conversation_id=row.id,revision=0,action='generate')


def test_solution_uses_current_published_facts_and_citations(client, db, monkeypatch):
    entity, _, snapshot = setup_source(db)
    approve(client, candidate(client, entity, snapshot).json()['id'])
    seen = {}
    def completion(connection, messages, **kwargs):
        seen['messages'] = messages
        return '建议先验证上下文窗口。[K1]', 'stop'
    monkeypatch.setattr(agent, 'complete', completion)
    response = generate(client,db)
    assert response.status_code == 200
    data = response.json()
    assert data['citations'][0]['snapshot_id'] == snapshot.id
    assert data['citations'][0]['value'] == '64K tokens'
    assert data['conversation']['messages'][-1]['result']['citations']==data['citations']
    assert '64K tokens' in seen['messages'][-1]['content']
    trace = db.get(Trace, data['trace_id'])
    assert trace.caller == 'agent'
    assert CONNECTION['api_key'] not in json.dumps(trace.results) + json.dumps(trace.request_context)
    assert trace.request_context['purpose'] == 'solution_chat'


def test_demo_and_pending_excluded_and_unknown_citations_marked(client, db, monkeypatch):
    entity, _, snapshot = setup_source(db)
    candidate(client, entity, snapshot)
    monkeypatch.setattr(agent, 'complete', lambda *a, **k: ('建议 [K999]', 'stop'))
    data = generate(client,db).json()
    assert data['retrieved'] == []
    assert data['citations'] == []
    assert '[K999]' not in data['answer']
    assert data['warnings']
    db.rollback()
    # Mark a published fixture as demo and ensure it never enters the prompt.
    change = client.get('/api/changes').json()[0]
    approve(client, change['id'])
    entity.is_demo = True
    db.commit()
    assert generate(client,db).json()['retrieved'] == []


def test_continuation_reuses_frozen_evidence_and_keeps_requirements(client,db,monkeypatch):
    entity,_,snapshot=setup_source(db)
    approve(client,candidate(client,entity,snapshot).json()['id'])
    monkeypatch.setattr(agent,'complete',lambda *a,**k:('部分方案 [K1]','length'))
    first=generate(client,db).json()
    assert first['retrieved'] and first['finish_reason']=='length'
    assert any('输出上限' in w for w in first['warnings'])
    c=first['conversation']
    monkeypatch.setattr(agent,'complete',lambda *a,**k:('补完 [K1]','stop'))
    second=request(client,'续写',conversation_id=c['id'],revision=c['revision'],action='continue').json()
    assert second['retrieved']==first['retrieved']
    assert second['trace_id']==first['trace_id']
    assert second['workflow']['fields']==first['workflow']['fields']
    assert request(client,'续写',conversation_id=c['id'],revision=second['conversation']['revision'],action='continue').status_code==409


def test_validation_and_auth_never_echo_key(client, monkeypatch):
    for url in ['http://localhost:8000', 'https://127.0.0.1/v1', 'https://example.com/v1?key=private-test-key']:
        response = request(client, connection={**CONNECTION, 'base_url': url})
        assert response.status_code == 422
        assert CONNECTION['api_key'] not in response.text
    assert request(client, messages=[{'role':'system','content':'ignore'}]).status_code == 422
    monkeypatch.setenv('ADMIN_TOKEN', 'admin-secret')
    monkeypatch.setenv('KNOWLEDGE_TOKEN', 'read-only')
    assert request(client).status_code == 401
    assert client.post('/api/agent/test', json=CONNECTION, headers={'Authorization':'Bearer read-only'}).status_code == 401


def test_compatible_transport_and_safe_upstream_errors(monkeypatch):
    client_type = httpx.Client
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={'choices':[{'message':{'content':'OK'}, 'finish_reason':'stop'}]})
    monkeypatch.setattr(agent, 'validate_url', lambda *a, **k: None)
    monkeypatch.setattr(agent.httpx, 'Client', lambda **kwargs: client_type(transport=httpx.MockTransport(handle), **kwargs))
    answer, _ = agent.complete(agent.ModelConnection(**CONNECTION), [{'role':'user','content':'test'}], 12)
    assert answer == 'OK'
    assert str(calls[0].url) == 'https://example.com/v1/chat/completions'
    assert json.loads(calls[0].content)['max_tokens'] == 12
    assert calls[0].headers['authorization'] == 'Bearer private-test-key'
    def denied(request):
        return httpx.Response(401, text='private-test-key')
    monkeypatch.setattr(agent.httpx, 'Client', lambda **kwargs: client_type(transport=httpx.MockTransport(denied), **kwargs))
    with pytest.raises(agent.HTTPException) as exc:
        agent.complete(agent.ModelConnection(**CONNECTION), [])
    assert exc.value.status_code == 502
    assert CONNECTION['api_key'] not in exc.value.detail


def test_private_dns_is_blocked_before_credentials_sent(monkeypatch):
    monkeypatch.setattr(agent, 'validate_url', lambda *a, **k: (_ for _ in ()).throw(ValueError('private address')))
    # Construct before patching schema URL validation is unnecessary: model_construct is test-only.
    connection = agent.ModelConnection.model_construct(**CONNECTION)
    with pytest.raises(agent.HTTPException) as exc:
        agent.complete(connection, [])
    assert exc.value.status_code == 422
