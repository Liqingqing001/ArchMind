import json
from pathlib import Path
from sqlalchemy import update
from app import agent
from app.curated import import_curated
from app.recommendations import selection_context
from app.solution_flow import empty_workflow
from app.models import Conversation
from test_conversations import create,send

DATA=Path(__file__).parent.parent/'data'


def test_server_uses_same_capability_and_route_cases(db):
    for file in json.loads((DATA/'public-datasets.json').read_text()):
        import_curated(db,json.loads((DATA/file).read_text()))
    cases=json.loads((Path(__file__).parent/'fixtures/advisor-cases.json').read_text())
    for c in cases:
        w=empty_workflow();w['fields']={k:{'value':c[k],'evidence':c[k]} for k in ['goal','delivery','requirements']}
        context=selection_context(w)
        assert [r['id'] for r in context['capabilities']]==c['caps'],c['id']
        assert [r['id'] for r in context['routes']]==c['routes'],c['id']
        rows,_=agent.retrieve_context(db,[agent.Message(role='user',content='生成简版方案')],w)
        names={r['entity_name'] for r in rows}
        assert set(c['include'])<=names,(c['id'],names)
        assert not set(c['exclude'])&names,c['id']
        for name in c.get('references',[]):
            assert all(r['recommendation_route']=='reference' for r in rows if r['entity_name']==name)
        assert len(rows)<=12
        assert all(r['recommendation_route'] in c['routes']+['reference'] for r in rows)


def test_ai_topic_summaries_continue_until_user_renames_even_to_default(client,monkeypatch):
    row=create(client)
    titles=iter(['低成本小说网站选型','小说网站模型成本比较','不应覆盖用户名称'])
    def extract(*a,**k):
        return json.dumps({'updates':{},'title':next(titles)},ensure_ascii=False),'stop'
    monkeypatch.setattr(agent,'complete',extract)
    row=send(client,row,'想写小说并做网站').json()['conversation']
    assert row['title']=='低成本小说网站选型' and row['title_mode']=='auto'
    row=send(client,row,'希望成本更低').json()['conversation']
    assert row['title']=='小说网站模型成本比较'
    changed=client.patch('/api/conversations/'+row['id'],json={'title':'新对话'}).json()
    assert changed['title_mode']=='manual'
    row=send(client,row,'继续讨论').json()['conversation']
    assert row['title']=='新对话' and row['title_mode']=='manual'


def test_concurrent_manual_title_always_wins_over_ai_summary(client,db,monkeypatch):
    row=create(client)
    def extract(*a,**k):
        db.execute(update(Conversation).where(Conversation.id==row['id']).values(title='我自己的题目',title_mode='manual'));db.commit()
        return '{"updates":{},"title":"自动摘要"}','stop'
    monkeypatch.setattr(agent,'complete',extract)
    result=send(client,row).json()['conversation']
    assert result['title']=='我自己的题目' and result['title_mode']=='manual'
