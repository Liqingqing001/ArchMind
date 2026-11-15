import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from app import agent, web_search as search
from app.curated import import_curated
from app.models import Trace, Conversation
from app.solution_flow import empty_workflow, apply_extraction
from test_solution_agent import request, CONNECTION

DATA = Path(__file__).parent.parent/'data'
KEY = 'search-only-test-secret'
SEARCH = dict(provider='tavily',api_key=KEY,enabled=True)


def test_shared_progressive_routing_fixture():
    workflow=empty_workflow()
    for case in json.loads((Path(__file__).parent/'fixtures/consultation-routing.json').read_text(encoding='utf-8')):
        raw=json.dumps(dict(intent=case['intent'],updates={k:dict(value=v,evidence=v) for k,v in case['updates'].items()}))
        workflow=apply_extraction(workflow,raw,case['prompt'])
        assert workflow['phase']==case['phase']
        assert workflow['response_mode']==case['mode']
    assert workflow['fields']['budget']['value']=='每月200元'
    assert set(workflow['missing'])=={'delivery','experience','scale','requirements'}


def test_first_voice_turn_searches_and_answers_before_budget_then_reuses_and_refreshes(client,db,monkeypatch):
    import_curated(db,json.loads((DATA/'maas-official-2026-11-15.json').read_text(encoding='utf-8')));db.commit()
    queries=[];prompts=[]
    def web(c,q):
        queries.append(q)
        return {'results':[{'url':'https://help.aliyun.com/zh/model-studio/realtime','title':'实时语音官方文档','raw_content':'实时语音双向交互；接入条件以官方文档为准。'}]}
    monkeypatch.setattr(search,'request_json',web)
    def complete(c,messages,**kwargs):
        payload=json.loads(messages[-1]['content'])
        if 'EVIDENCE_JSON' in payload:
            prompts.append(payload)
            return '可比较库内语音候选 [K1] 和实时语音官方文档 [W1]。主要用于客服还是陪练？','stop'
        user=payload['USER_INPUT']
        updates={'goal':dict(value='实时语音交互',evidence='实时语音交互')} if not payload['BRIEF'] else {'budget':dict(value='每月200元',evidence='每月200元')} if '200元' in user else {}
        return json.dumps(dict(updates=updates,intent='explanation' if '解释' in user else 'discovery')),'stop'
    monkeypatch.setattr(agent,'complete',complete)
    row=client.post('/api/conversations',json={'title':'新对话'}).json()
    def send(text,**extra):
        nonlocal row
        response=request(client,text,conversation_id=row['id'],revision=row['revision'],web_search=SEARCH,**extra)
        assert response.status_code==200,response.text
        result=response.json();row=result['conversation'];return result
    first=send('找一个实时语音交互的模型')
    assert first['workflow']['phase']=='generated' and first['workflow']['missing']==['budget','delivery','experience','scale','requirements']
    assert len(queries)==3 and first['web_citations'] and first['citations']
    assert len({r['entity_id'] for r in first['retrieved']})>=2
    assert prompts[-1]['ANSWER_CONTEXT']['mode']=='discovery'
    assert prompts[-1]['ANSWER_CONTEXT']['constraints_are_partial']
    trace=db.get(Trace,first['trace_id']); original=json.dumps(trace.request_context,sort_keys=True)
    second=send('解释一下刚才的区别')
    assert len(queries)==3 and second['web_search']['reused']
    assert second['web_search']['searched_at']==first['web_search']['searched_at']
    assert second['retrieved']==first['retrieved'] and second['trace_id']==first['trace_id']
    assert json.dumps(trace.request_context,sort_keys=True)==original
    third=send('预算改成每月200元')
    assert len(queries)==6 and not third['web_search'].get('reused')
    fourth=send('现在的价格是多少')
    assert len(queries)==9 and fourth['workflow']['response_mode']=='discovery'
    plan=send('生成方案',action='generate')
    assert len(queries)==12 and plan['workflow']['response_mode']=='solution'
    assert plan['workflow']['missing'] and prompts[-1]['ANSWER_CONTEXT']['mode']=='solution'
    saved=json.dumps(db.get(Conversation,row['id']).messages)+json.dumps(trace.request_context)
    assert KEY not in saved and CONNECTION['api_key'] not in saved


def test_recent_evidence_expiry_and_non_explanation_never_reuse():
    w={'response_mode':'explanation'}
    web=dict(status='ok',results=[{}],searched_at=datetime.now(timezone.utc).isoformat())
    assert search.reusable_search(web,w)
    assert not search.reusable_search(web,{'response_mode':'discovery'})
    for stamp in ['invalid',(datetime.now(timezone.utc)-timedelta(minutes=31)).isoformat(),(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()]:
        assert not search.reusable_search({**web,'searched_at':stamp},w)
    assert not search.reusable_search({**web,'results':[]},w)


def test_bare_preference_answers_the_actual_question_not_missing_slot_order():
    previous=empty_workflow();previous['fields']={'goal':dict(value='实时语音交互',evidence='实时语音交互')};previous['missing']=['budget','delivery','experience']
    result=apply_extraction(previous,'{"updates":{}}','没有偏好','你主要用于客服还是口语陪练？')
    assert 'delivery' not in result['fields']
    result=apply_extraction(previous,'{"updates":{}}','没有偏好','你倾向现成平台、API还是本地自部署？')
    assert result['fields']['delivery']['value']=='无偏好'


def test_explanation_does_not_pay_for_an_unnecessary_citation_repair(monkeypatch):
    calls=[]
    def complete(*args):
        calls.append(args);return '这就是两种接入方式的区别。','stop'
    monkeypatch.setattr(agent,'complete',complete)
    _,repair,warnings=agent.complete_grounded(None,[],{'results':[{'citation_id':'W1'}]},require_web=False)
    assert len(calls)==1 and not repair['attempted'] and not warnings


def test_official_queries_scopes_and_summary_reading_never_expose_keys(monkeypatch):
    w=empty_workflow();w['fields']={'goal':{'value':'实时语音交互'},'requirements':{'value':'中文 '+KEY}}
    queries=search.search_queries(w,'找一个实时语音交互模型',[KEY])
    assert len(queries)==3 and all('site:' in q and KEY not in q for q in queries)
    assert any('volcengine.com' in q for q in queries) and any('cloud.tencent.com' in q for q in queries)
    connection=search.SearchConnection(**SEARCH)
    assert search.request_parts(connection,queries[0])[2]['include_domains']==['volcengine.com','aliyun.com']
    called=[]
    def fetch(source):
        called.append(source)
        return '<html><nav>discard</nav><body>'+('实时语音支持交互，API参数需要核对。'*20)+KEY+'</body></html>',{}
    monkeypatch.setattr(search,'fetch_public_page',fetch)
    row=search.parse_results('bocha',{'webPages':{'value':[{'url':'https://cloud.tencent.com/document/product/647/108514','summary':'官方搜索摘要'}]}},'today')[0]
    out=search.read_official_page(row,[KEY])
    assert out['content_kind']=='page_excerpt' and out['read_at']
    assert KEY not in out['excerpt'] and 'discard' not in out['excerpt']
    assert not hasattr(called[0],'api_key')
    with pytest.raises(ValueError): search.read_official_page({**row,'url':'https://cloud.tencent.com.evil.example/doc'},[])
    monkeypatch.setattr(search,'fetch_public_page',lambda *a: (_ for _ in ()).throw(ValueError('blocked')))
    rows=[row.copy()];counts=search.read_official_results(rows,[])
    assert counts==dict(attempted=1,succeeded=0,failed=1)
    assert rows[0]['content_kind']=='search_summary'
    assert search.search_warnings({**search.disabled_search(),'status':'ok','results':rows,'page_reading':counts})
