import json
from pathlib import Path
from sqlalchemy import select,func
from app.curated import import_curated
from app.models import Entity,Fact,Snapshot,Source
from app.solution_flow import empty_workflow,rank_knowledge

DATA=Path(__file__).parent.parent/'data'

def test_full_audited_corpus_import_preserves_provenance_and_is_idempotent(db):
    audit=json.loads((DATA/'audits/2026-11-07.json').read_text())
    for filename in audit['dataset_sha256']:
        data=json.loads((DATA/filename).read_text())
        assert import_curated(db,data)['pending']==0
        assert import_curated(db,data)=={'entities':0,'facts':0,'pending':0}
    assert db.scalar(select(func.count()).select_from(Entity).where(Entity.is_demo.is_(False)))==166
    assert db.scalar(select(func.count()).select_from(Fact))==453
    for fact,snapshot,source in db.execute(select(Fact,Snapshot,Source).join(Snapshot,Fact.snapshot_id==Snapshot.id).join(Source,Snapshot.source_id==Source.id)):
        assert fact.evidence in snapshot.content
        assert source.entity_id==fact.entity_id

def test_critical_status_and_license_are_in_retrieved_evidence():
    rows=[dict(entity_id='s',entity_name='Sora 2 Pro',entity_kind='model',key='核心能力',value='音画视频生成'),dict(entity_id='s',entity_name='Sora 2 Pro',entity_kind='model',key='接入状态',value='停止服务：已关闭'),dict(entity_id='f',entity_name='FLUX.1-dev',entity_kind='model',key='核心能力',value='图像生成'),dict(entity_id='f',entity_name='FLUX.1-dev',entity_kind='model',key='商业使用边界',value='权重非商用许可与输出商用条件需分别核对')]
    w=empty_workflow();w['fields']={'goal':{'value':'图像生成'},'delivery':{'value':'API'}}
    assert all(r['entity_id']!='s' for r in rank_knowledge(rows,[],[],[],w,'生成方案'))
    named=rank_knowledge(rows,[],[],[],w,'Sora 2 Pro 可以调用吗')
    assert any(r['entity_id']=='s' and r['key']=='接入状态' for r in named)
    named=rank_knowledge(rows,[],[],[],w,'FLUX.1-dev 商用')
    assert any(r['entity_id']=='f' and r['key']=='商业使用边界' for r in named)
