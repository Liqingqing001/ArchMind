import json
from pathlib import Path
import httpx
import pytest
from sqlalchemy import select,func
from app import agent,web_search as search
from app.curated import import_curated
from app.models import Fact,Trace,Conversation
from app.solution_flow import empty_workflow
from test_solution_agent import CONNECTION,ready_conversation,request
from test_governance import setup_source,candidate,approve

KEY='test-search-only-secret'

def workflow():
    w=empty_workflow();w['fields']={'goal':{'value':'租 GPU 做视频'},'delivery':{'value':'云GPU自部署'}};return w


@pytest.mark.parametrize('provider',['tavily','bocha'])
def test_provider_transport_is_fixed_bounded_and_never_follows_redirects(monkeypatch,provider):
    original=httpx.Client;calls=[]
    payload={'results':[{'url':'https://www.autodl.com/docs/price/','title':'AutoDL','content':'计费规则'}]} if provider=='tavily' else {'code':200,'data':{'webPages':{'value':[{'url':'https://www.anygpu.cn/gpu.html','name':'AnyGPU','summary':'按小时计费'}]}}}
    def handle(req):
        calls.append(req);return httpx.Response(200,json=payload)
    monkeypatch.setattr(search.httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(handle),**kwargs))
    connection=search.SearchConnection(provider=provider,api_key=KEY,enabled=True)
    result=search.search_web(connection,workflow(),'生成方案',[CONNECTION['api_key']])
    assert result['status']=='ok' and len(calls)==2 and len(result['results'])==1
    assert result['results'][0]['citation_id']=='W1'
    for call in calls:
        assert str(call.url)==search.POLICY['providers'][provider]['url']
        assert call.headers['authorization']=='Bearer '+KEY
        assert KEY not in call.content.decode()
        body=json.loads(call.content)
        assert body.get('max_results',body.get('count'))==4
    assert KEY not in json.dumps(result)
    def redirect(req):return httpx.Response(302,headers={'Location':'https://127.0.0.1/private'})
    monkeypatch.setattr(search.httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(redirect),**kwargs))
    with pytest.raises(ValueError,match='302'):search.request_json(connection,'gpu')


def test_web_sanitization_preserves_provenance_without_secrets_or_local_urls():
    rows=search.parse_results('tavily',{'results':[{'url':'https://www.autodl.com/docs/price/#x','title':'AutoDL '+KEY,'raw_content':'页面 '+KEY,'content':'命中摘要：存储计费规则','published_date':'not-a-date'},{'url':'https://127.0.0.1/x','content':'local'},{'url':'javascript:alert(1)','content':'script'},{'url':'https://example.com/?key='+KEY,'content':'credential'}]},'2026-11-07T00:00:00Z',[KEY])
    assert len(rows)==1 and rows[0]['source_type']=='official' and rows[0]['content_kind']=='page_excerpt'
    assert rows[0]['published_at'] is None and '#' not in rows[0]['url']
    assert KEY not in json.dumps(rows)
    assert '命中摘要：存储计费规则' in rows[0]['excerpt']
    queries=search.search_queries(workflow(),'现在生成 '+KEY,[KEY])
    assert len(queries)<=2 and all(len(q)<=190 and KEY not in q for q in queries)


def test_failures_and_partial_search_are_explicit_and_keys_are_not_echoed(monkeypatch):
    connection=search.SearchConnection(provider='tavily',api_key=KEY,enabled=True)
    def answer(c,q):
        if '官方 文档' in q:return {'results':[{'url':'https://www.autodl.com/docs/price/','content':'规则'}]}
        raise ValueError('malicious upstream body '+KEY)
    monkeypatch.setattr(search,'request_json',answer)
    result=search.search_web(connection,workflow(),'生成方案')
    assert result['status']=='partial' and result['results'] and KEY not in json.dumps(result)
    monkeypatch.setattr(search,'request_json',lambda *a:(_ for _ in ()).throw(ValueError(KEY)))
    assert search.search_web(connection,workflow(),'生成方案')['status']=='error'
    monkeypatch.setattr(search,'request_json',lambda *a:{'results':[]})
    assert search.search_web(connection,workflow(),'生成方案')['status']=='empty'
    assert search.search_web(None,workflow(),'生成方案')==search.disabled_search()


def test_no_search_before_confirmation_and_no_credential_echo(client,db,monkeypatch):
    monkeypatch.setattr(agent,'complete',lambda *a,**k:('{"updates":{}}','stop'))
    monkeypatch.setattr(agent,'search_web',lambda *a:pytest.fail('must not search during clarification'))
    assert request(client,'我想做AI视频短剧',web_search={'provider':'tavily','api_key':KEY,'enabled':True}).json()['workflow']['phase']=='collecting'
    bad=request(client,web_search={'provider':'custom','api_key':KEY,'enabled':True,'url':'http://localhost'})
    assert bad.status_code==422 and KEY not in bad.text
    assert client.post('/api/agent/search/test',json={'provider':'tavily','enabled':False}).status_code==422


def test_chat_combines_web_with_facts_freezes_citations_and_never_publishes_web(client,db,monkeypatch):
    entity,_,snapshot=setup_source(db);approve(client,candidate(client,entity,snapshot).json()['id'])
    before=db.scalar(select(func.count()).select_from(Fact))
    c=ready_conversation(client,db)
    monkeypatch.setattr(search,'request_json',lambda *a:{'results':[{'title':'GPU官网','url':'https://www.autodl.com/docs/price/','raw_content':'本轮页面摘录 '+KEY}]})
    prompts=[]
    def complete(connection,messages,**kwargs):
        prompts.append(messages);return '库内 [K1]，网页 [W1]，不存在的 [W999]','length'
    monkeypatch.setattr(agent,'complete',complete)
    first=request(client,'生成方案',conversation_id=c.id,revision=0,action='generate',web_search={'provider':'tavily','api_key':KEY,'enabled':True}).json()
    assert first['web_citations'][0]['citation_id']=='W1' and first['citations']
    assert '[W999]' not in first['answer']
    assert json.loads(prompts[-1][-1]['content'])['WEB_EVIDENCE_JSON']
    trace=db.get(Trace,first['trace_id']);assert trace.request_context['web_search']['results']==first['web_search']['results']
    assert db.scalar(select(func.count()).select_from(Fact))==before
    assert KEY not in json.dumps(first)+json.dumps(trace.request_context)
    monkeypatch.setattr(agent,'search_web',lambda *a:pytest.fail('continuation must keep original web evidence'))
    second=request(client,'续写',conversation_id=c.id,revision=1,action='continue').json()
    assert second['web_search']==first['web_search'] and second['trace_id']==first['trace_id']
    assert KEY not in json.dumps(db.get(Conversation,c.id).messages)


def test_researched_infrastructure_import_and_hierarchy(client,db):
    data=json.loads((Path(__file__).parent.parent/'data/infrastructure-knowledge-2026-11-07.json').read_text())
    stats=import_curated(db,data);db.commit()
    assert stats=={'entities':23,'facts':93,'pending':0}
    assert import_curated(db,data)=={'entities':0,'facts':0,'pending':0}
    tree=client.get('/api/knowledge/navigation').json()
    node=next(n for n in tree['nodes'] if n['path']==['工具与平台','云服务与 API','GPU租赁与算力'])
    names={e['name'] for e in client.get('/api/entities').json() if e['id'] in node['entity_ids']}
    assert {'OneThingAI','AnyGPU 算力云','火山引擎 GPU 云服务器','AutoDL','Vast.ai'}<=names
    assert next(n for n in tree['nodes'] if n['path']==['工具与平台','应用与产品','云端工作流'])['entity_ids']


def test_search_test_endpoint_requires_admin(client,monkeypatch):
    monkeypatch.setenv('ADMIN_TOKEN','admin-secret')
    monkeypatch.setenv('KNOWLEDGE_TOKEN','read-only')
    response=client.post('/api/agent/search/test',json={'provider':'bocha','api_key':KEY,'enabled':True},headers={'Authorization':'Bearer read-only'})
    assert response.status_code==401 and KEY not in response.text
