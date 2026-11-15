import json
from sqlalchemy import select, func
from app.maas_monitor import setup, CATALOG
from app.models import Source, Fact, Snapshot, Change
from app.collector import collect
from app.monitor_report import check_sources
from app import agent
from app.solution_flow import empty_workflow


def test_setup_preserves_pause_and_does_not_label_curated_excerpts_as_live(db, client):
    result = client.post('/api/monitoring/maas/setup')
    assert result.status_code == 200
    assert result.json()['monitors_added'] == 17
    sources = list(db.scalars(select(Source).where(Source.name.startswith('MaaS 官网巡检 · '))))
    assert all(s.enabled and s.last_checked_at is None and s.status == 'never' for s in sources)
    source = sources[0]
    source.enabled = False
    source.interval_hours = 24
    db.commit()
    assert client.post('/api/monitoring/maas/setup').json()['monitors_added'] == 0
    db.refresh(source)
    assert not source.enabled and source.interval_hours == 24
    source.enabled = True
    db.commit()
    facts = list(db.scalars(select(Fact)))
    run = collect(db, source.id, fetcher=lambda s: ('<article>new official text</article>', {}))
    assert run.status == 'changed'
    assert db.scalar(select(func.count()).select_from(Fact)) == len(facts)
    assert not list(db.scalars(select(Change).where(Change.status == 'pending')))
    assert db.get(Snapshot, run.snapshot_id).raw_content.startswith('<article>')


def test_voice_solution_retrieval_excludes_plain_tts_and_asr(db):
    setup(db);db.commit()
    workflow = empty_workflow()
    workflow['fields'] = {'goal': {'value': '实时语音客服'}, 'delivery': {'value': 'API'}}
    rows, _ = agent.retrieve_context(db, [agent.Message(role='user', content='生成方案')], workflow)
    names = {r['entity_name'] for r in rows}
    assert len(names) == 3
    assert all('语音方案' in n or '实时语音' in n or '实时音视频' in n for n in names)
    assert not any('转写' in n or '图片' in n or '文档' in n for n in names)
    assert {'模型与能力','接入方式','选型边界','方案建议（编辑归纳）'} <= {r['key'] for r in rows}
    workflow['fields']['requirements'] = {'value': '完全离线，数据不外传'}
    rows, _ = agent.retrieve_context(db, [agent.Message(role='user', content='生成方案')], workflow)
    assert rows == []


def test_monitor_baseline_change_failure_and_duplicate_urls():
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    fetcher = lambda s: ('<article>' + 'official documentation ' * 30 + '</article>', {})
    first, baseline = check_sources(catalog, {}, fetcher)
    assert len(first['sources']) == len({s['url'] for s in catalog['sources']})
    assert all(r['status'] == 'baseline' for r in first['sources'])
    second, _ = check_sources(catalog, baseline, fetcher)
    assert all(r['status'] == 'unchanged' for r in second['sources'])
    changed, _ = check_sources(catalog, baseline, lambda s: ('changed documentation ' * 40, {}))
    assert all(r['status'] == 'changed' for r in changed['sources'])
    failed, retained = check_sources(catalog, baseline, lambda s: ('<div>Loading</div>', {}))
    assert all(r['status'] == 'failed' for r in failed['sources'])
    assert retained == baseline
