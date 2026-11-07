import copy
import json
from pathlib import Path
from sqlalchemy import select
from app.curated import import_curated
from app.models import Entity,Fact,Change


def test_curated_import_is_idempotent_and_conflicts_require_review(db):
    data=json.loads((Path(__file__).parent.parent/'data/video-workflow-knowledge-2026-11-07.json').read_text())
    assert import_curated(db,data)=={'entities':1,'facts':5,'pending':0}
    db.commit()
    entity=db.scalar(select(Entity).where(Entity.name=='ComfyUI'))
    assert not entity.is_demo
    assert import_curated(db,data)=={'entities':0,'facts':0,'pending':0}
    changed=copy.deepcopy(data);changed['entities'][0]['facts'][0]['value']='经核验的不同描述'
    assert import_curated(db,changed)['pending']==1
    assert import_curated(db,changed)['pending']==0
    current=db.scalar(select(Fact).where(Fact.entity_id==entity.id,Fact.key=='工作流能力',Fact.valid_to.is_(None)))
    assert current.value==data['entities'][0]['facts'][0]['value']
    assert len(list(db.scalars(select(Change).where(Change.status=='pending'))))==1
