import json
from pathlib import Path
import pytest
from app import agent
from app.models import Conversation
from app.solution_flow import empty_workflow,apply_extraction,is_confirmation,clarification,rank_knowledge,previous_workflow,editorial_guide
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
    assert [r['name'] for r in editorial_guide(result['workflow'])['routes']]==['现成平台']
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


def test_gpu_task_classification_uses_service_category_instead_of_negated_gpu_word():
    w=empty_workflow();w['fields']={'goal':{'value':'GPU租赁'},'delivery':{'value':'云GPU自部署'}}
    entities=[{'id':'a','description':'调用API不等于租GPU'},{'id':'b','description':'GPU云主机'},{'id':'c','description':'通用工作流'}]
    rows=[dict(entity_id='a',entity_name='火山方舟',entity_kind='api',key='能力',value='在线推理',is_demo=False),dict(entity_id='b',entity_name='AnyGPU',entity_kind='cloud',key='能力',value='租GPU',is_demo=False),dict(entity_id='c',entity_name='Dify',entity_kind='framework',key='能力',value='通用工作流',is_demo=False)]
    categories=[{'id':'gpu','name':'GPU租赁与算力'},{'id':'api','name':'模型API与推理'}]
    links=[{'entity_id':'a','category_id':'api'},{'entity_id':'b','category_id':'gpu'}]
    found=rank_knowledge(rows,entities,categories,links,w,'生成方案')
    assert {r['entity_name']:r['task'] for r in found}=={'火山方舟':'模型 API 与托管推理','AnyGPU':'GPU算力'}


def test_exact_novel_conversation_advances_when_model_omits_delivery(client, db, monkeypatch):
    fixture=json.loads((Path(__file__).parent/'fixtures/clarification-no-preference.json').read_text())
    row=client.post('/api/conversations',json={'title':'新对话'}).json()
    for revision, turn in enumerate(fixture['turns']):
        raw=json.dumps({'updates':{key:dict(value=value,evidence=value) for key,value in turn['updates'].items()}},ensure_ascii=False)
        monkeypatch.setattr(agent,'complete',lambda *a,**k:(raw,'stop'))
        response=request(client,turn['prompt'],conversation_id=row['id'],revision=revision)
        assert response.status_code==200, response.text
        result=response.json()
        assert result['workflow']['missing']==turn['missing']
        assert result['retrieved']==[]
        if revision:
            assert result['workflow']['fields']['delivery']['value']=='无偏好'
            assert '你倾向现成平台' not in result['answer']
    assert result['workflow']['phase']=='ready'
    assert '现在为你生成简版方案吗' in result['answer']
    assert result['workflow']==previous_workflow(client.get('/api/conversations/'+row['id']).json()['messages'])


def test_no_preference_only_resolves_the_matching_question():
    fixture=json.loads((Path(__file__).parent/'fixtures/clarification-no-preference.json').read_text())
    w=apply_extraction(empty_workflow(),'{"updates":{"goal":{"value":"写小说","evidence":"写小说"}}}','写小说')
    for prompt in fixture['negative']:
        assert 'delivery' in apply_extraction(w,'{"updates":{}}',prompt)['missing'], prompt
    for prompt in ['没有偏好','无偏好','部署方式没有偏好','第二个问题是没有偏好']:
        assert apply_extraction(w,'{"updates":{}}',prompt)['fields']['delivery']['value']=='无偏好'
    raw=json.dumps({'updates':{'delivery':dict(value='本地',evidence='只用本地')}})
    assert apply_extraction(w,raw,'没有偏好，但这次只用本地')['fields']['delivery']['value']=='本地'
