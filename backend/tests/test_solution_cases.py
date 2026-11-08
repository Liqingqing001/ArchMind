import json
from sqlalchemy import select, func
from app import agent
from app.models import Conversation, SolutionCase, Fact
from app.solution_cases import case_references, solution_snapshot
from app.web_search import search_queries


def conversation(db, finish='stop'):
    workflow = dict(version=1, phase='generated', scene=None, missing=[], fields={
        'goal':dict(value='AI小说写作', evidence='AI小说写作'), 'budget':dict(value='每月100元'),
        'delivery':dict(value='无偏好'), 'experience':dict(value='不会编程'),
        'scale':dict(value='每天一章'), 'requirements':dict(value='中文长篇')})
    result = dict(workflow=workflow, finish_reason=finish, model='contract-model', trace_id='trace', citations=[], retrieved=[],
        web_citations=[dict(citation_id='W1', title='创作平台', url='https://writer.example/plans', excerpt='按章创作，订阅另计', searched_at='2026-11-08')])
    row = Conversation(title='小说创作选型', messages=[dict(id='user', role='user', content='AI小说写作'), dict(id='reply', role='assistant', content='先用创作平台[W1]', result=result)], revision=2)
    db.add(row); db.commit()
    return row, workflow


def test_feedback_idempotence_evidence_freeze_and_rating_changes(client, db):
    row, workflow = conversation(db)
    path = f'/api/conversations/{row.id}/messages/reply/feedback'
    before = db.scalar(select(func.count()).select_from(Fact))
    first = client.post(path, json={'rating':'good'}); assert first.status_code == 200 and first.json()['saved']
    case_id = first.json()['case_id']
    again = client.post(path, json={'rating':'okay'}); assert again.json()['case_id'] == case_id
    assert db.scalar(select(func.count()).select_from(SolutionCase)) == 1
    cases = client.get('/api/solution-cases').json(); assert len(cases) == 1 and cases[0]['scene_id'] == 'novel'
    assert cases[0]['references'][0]['url'] == 'https://writer.example/plans'
    assert cases[0]['evidence_status'] == 'user_endorsed_unverified'
    assert client.get('/api/solution-cases?scene_id=video').json() == []
    read = client.get(f'/api/conversations/{row.id}').json(); assert read['revision'] == 2 and read['feedback']['reply']['rating'] == 'okay'
    assert case_references(db, workflow, row.id) == [] and len(case_references(db, workflow, 'another')) == 1
    assert case_references(db, dict(fields={'goal':{'value':'AI视频短剧'}})) == []
    client.post(path, json={'rating':'bad'}); assert client.get('/api/solution-cases').json() == [] and case_references(db,workflow) == []
    client.post(path, json={'rating':'good'}); assert db.scalar(select(func.count()).select_from(Fact)) == before
    client.delete(f'/api/conversations/{row.id}'); assert len(client.get('/api/solution-cases').json()) == 1
    assert client.post(path, json={'rating':'good'}).status_code == 404


def test_feedback_rejects_forged_or_incomplete_replies_and_preserves_continuations(client, db):
    row, workflow = conversation(db, finish='length'); path=f'/api/conversations/{row.id}/messages/reply/feedback'
    assert client.post(path, json={'rating':'good'}).status_code == 409
    assert client.post(path.replace('reply','user'), json={'rating':'good'}).status_code == 409
    assert client.post(path, json={'rating':'good','answer':'forged'}).status_code == 422
    assert client.post(path, json={'rating':'other'}).status_code == 422
    original=row.messages[-1]; continued={**original,'id':'continued','content':'第二部分','result':{**original['result'],'finish_reason':'stop'}}
    row.messages=[*row.messages,dict(id='continue',role='user',content='续写'),continued]; db.commit()
    snapshot=solution_snapshot(row,'continued'); assert '先用创作平台' in snapshot['answer'] and '第二部分' in snapshot['answer']
    assert len(snapshot['references']) == 1


def test_saved_cases_enter_agent_context_as_unverified_history(client, db, monkeypatch):
    row, workflow = conversation(db)
    client.post(f'/api/conversations/{row.id}/messages/reply/feedback',json={'rating':'good'})
    target=Conversation(title='新对话',messages=[{'id':'previous','role':'assistant','content':'确认需求？','result':{'workflow':{**workflow,'phase':'ready'}}}]); db.add(target); db.commit()
    calls=[]
    def complete(connection,messages,**kwargs):
        calls.append(messages);return '现有模型证据不足，平台资料需核验。','stop'
    monkeypatch.setattr(agent,'complete',complete)
    from test_solution_agent import CONNECTION
    response=client.post('/api/agent/chat',json={'connection':CONNECTION,'conversation_id':target.id,'revision':0,'messages':[{'role':'user','content':'生成方案'}],'action':'generate'})
    assert response.status_code == 200
    payload=json.loads(calls[0][-1]['content']); assert payload['SAVED_SOLUTION_CASES'][0]['title'] == '小说创作选型'
    assert '未经实测' in payload['SAVED_SOLUTION_CASES'][0]['status']
    assert len(response.json()['saved_solution_cases']) == 1
    assert response.json()['conversation']['feedback'] == {}
    assert '写作平台' in search_queries(workflow,'确认需求')[0]


def test_scenario_classifier_respects_negated_goals():
    from app.solution_cases import case_scene
    assert case_scene({"goal":{"value":"不要小说，只做视频"}})["id"] == "video"


def test_web_ignored_draft_gets_one_bounded_revision_and_explicit_fallback(monkeypatch):
    web={'results':[{'citation_id':'W1'}]};calls=[]
    def complete(*args,**kwargs):
        calls.append(args[1]);return ('只用了库内[K1]','stop') if len(calls)==1 else ('创作平台及使用方向[W1]','stop')
    monkeypatch.setattr(agent,'complete',complete)
    answer,repair,warnings=agent.complete_grounded(None,[],web)
    assert '[W1]' in answer[0] and repair=={'attempted':True,'adopted':True} and not warnings and len(calls)==2
    calls.clear();monkeypatch.setattr(agent,'complete',lambda *a,**k:('完整首稿','stop'))
    answer,repair,warnings=agent.complete_grounded(None,[],web)
    assert answer[0]=='完整首稿' and repair['attempted'] and not repair['adopted'] and warnings
    answer,repair,warnings=agent.complete_grounded(None,[],web,continuing=True)
    assert not repair['attempted']
