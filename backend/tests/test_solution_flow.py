import json
from pathlib import Path
import pytest
from app import agent
from app.models import Conversation
from app.solution_flow import empty_workflow,apply_extraction,is_confirmation,clarification,rank_knowledge,previous_workflow
from test_solution_agent import CONNECTION,ready_conversation,request


def test_consultation_requires_explicit_confirmation_and_resets_on_edit(client,db,monkeypatch):
    row=client.post('/api/conversations',json={'title':'新对话'}).json()
    fields={'goal':'AI视频短剧','budget':'每月1000元','delivery':'现成平台','experience':'不会部署','scale':'一分钟每周两条','requirements':'写实且人物一致'}
    text='，'.join(fields.values())
    calls=[]
    def extract(connection,messages,**kwargs):
        calls.append(messages)
        return json.dumps({'updates':{key:{'value':value,'evidence':value} for key,value in fields.items()}},ensure_ascii=False),'stop'
    monkeypatch.setattr(agent,'complete',extract)
    result=request(client,text,conversation_id=row['id'],revision=0).json()
    assert result['workflow']['phase']=='ready' and result['retrieved']==[]
    assert '现在为你生成简版方案吗' in result['answer']
    assert len(calls)==1
    monkeypatch.setattr(agent,'complete',lambda *a,**k:('先做小样，价格待核验。','stop'))
    confirmed=request(client,'生成简版方案',conversation_id=row['id'],revision=1,action='generate').json()
    assert confirmed['workflow']['phase']=='generated'
    assert confirmed['workflow']['fields']==result['workflow']['fields']
    monkeypatch.setattr(agent,'complete',lambda *a,**k:('{"updates":{"budget":{"value":"每月200元","evidence":"每月200元"}}}','stop'))
    edited=request(client,'预算改为每月200元',conversation_id=row['id'],revision=2).json()
    assert edited['workflow']['phase']=='ready'
    assert edited['citations']==[] and '每月200元' in edited['answer']


def test_incomplete_or_forged_requirement_extraction_does_not_commit_or_generate(client,db,monkeypatch):
    row=client.post('/api/conversations',json={'title':'新对话'}).json()
    for raw,finish in [('随便生成方案','stop'),('{"updates":{"budget":{"value":"100元","evidence":"没说过"}}}','stop'),('{"updates":{}}','length')]:
        monkeypatch.setattr(agent,'complete',lambda *a,**k:(raw,finish))
        assert request(client,'我想做视频',conversation_id=row['id'],revision=0,action='generate').status_code==502
        db.expire_all()
        assert db.get(Conversation,row['id']).messages==[]


def test_missing_fields_ask_at_most_two_and_unknown_is_valid():
    w=apply_extraction(empty_workflow(),'{"updates":{"goal":{"value":"AI视频短剧","evidence":"视频短剧"}}}','我想做AI视频短剧')
    assert w['phase']=='collecting' and not is_confirmation(w,'可以')
    assert len([line for line in clarification(w).splitlines() if line.startswith(('1.','2.','3.'))])==2
    raw=json.dumps({'updates':{key:{'value':'暂不确定','evidence':'不知道'} for key in w['missing']}})
    ready=apply_extraction(w,raw,'不知道')
    assert ready['phase']=='ready' and is_confirmation(ready,'可以')
    assert not is_confirmation(ready,'不可以，先修改预算')
    history=[{'role':'assistant','result':{'workflow':ready}}]+[{'role':'user','content':'细节'}]*40
    assert previous_workflow(history)==ready


def test_python_and_pages_share_ranking_fixtures():
    data=json.loads((Path(__file__).parent/'fixtures/solution-parity.json').read_text())
    for case in data['cases']:
        w=empty_workflow();w['scene']='video';w['fields']={'goal':{'value':'AI视频短剧'},'delivery':{'value':case['delivery']}}
        rows=rank_knowledge(data['rows'],data['entities'],data['categories'],data['links'],w,'生成简版方案')
        assert [r['entity_name'] for r in rows]==case['expected']


def test_goal_change_reopens_scene_specific_questions():
    w=empty_workflow();w['scene']='video';w['phase']='generated'
    w['fields']={key:{'value':'AI视频短剧' if key=='goal' else '用户明确条件','evidence':'条件'} for key in w['missing']}
    changed=apply_extraction(w,'{"updates":{"goal":{"value":"企业知识问答","evidence":"企业知识问答"}}}','改做企业知识问答')
    assert changed['phase']=='collecting'
    assert set(changed['missing'])=={'scale','requirements'}


def test_legacy_conversation_bootstraps_real_user_history(client,db,monkeypatch):
    row=client.post('/api/conversations',json={'title':'旧会话'}).json()
    saved=db.get(Conversation,row['id']);saved.messages=[{'role':'user','content':'我想做AI视频短剧，预算每月1000元'},{'role':'assistant','content':'旧版回复'}];db.commit()
    def extract(connection,messages,**kwargs):
        payload=json.loads(messages[-1]['content'])
        assert 'AI视频短剧' in payload['USER_INPUT'] and '每月1000元' in payload['USER_INPUT']
        return '{"updates":{"goal":{"value":"AI视频短剧","evidence":"AI视频短剧"},"budget":{"value":"每月1000元","evidence":"每月1000元"}}}','stop'
    monkeypatch.setattr(agent,'complete',extract)
    result=request(client,'接着聊',conversation_id=row['id'],revision=0).json()
    assert result['workflow']['fields']['budget']['value']=='每月1000元'
    assert len(result['conversation']['messages'])==4
