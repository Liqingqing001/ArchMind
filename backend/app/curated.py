"""Explicit reviewed public dataset import for SQLite or PostgreSQL; conflicts await review."""
import argparse
import hashlib
import json
from pathlib import Path
from sqlalchemy import select
from .db import Session, now
from .models import Category,Entity,EntityCategory,Source,Snapshot,Fact,Change


def import_curated(db,dataset):
    stats={'entities':0,'facts':0,'pending':0}
    for record in dataset['entities']:
        source=next(s for s in dataset['sources'] if s['id']==record['source'])
        matches=list(db.scalars(select(Entity).where(Entity.name==record['name'],Entity.kind==record['kind'])))
        if len(matches)>1:
            raise ValueError('存在同名实体，请先人工合并，避免覆盖错误记录')
        entity=matches[0] if matches else None
        if not entity:
            entity=Entity(name=record['name'],kind=record['kind'],description=record['description'],website=source['url'],is_demo=False)
            db.add(entity);db.flush();stats['entities']+=1
        elif entity.is_demo:
            raise ValueError('请先人工核验演示实体，不自动更改其身份')
        for path in record['categories']:
            parent=None
            for name in path:
                category=db.scalar(select(Category).where(Category.name==name,Category.parent_id==parent))
                if not category:
                    category=Category(name=name,parent_id=parent);db.add(category);db.flush()
                parent=category.id
            if not db.get(EntityCategory,(entity.id,parent)):
                db.add(EntityCategory(entity_id=entity.id,category_id=parent))
        registered=db.scalar(select(Source).where(Source.entity_id==entity.id,Source.url==source['url'],Source.is_demo.is_(False)))
        if not registered:
            registered=Source(entity_id=entity.id,name=source['title']+'（编辑核验摘录）',url=source['url'],enabled=False,is_demo=False)
            db.add(registered);db.flush()
        content='[官方短摘录，非完整网页]\n核验日期：'+dataset['checked_on']+'\n'+source['url']+'\n'+'\n'.join(source['excerpts'])
        digest=hashlib.sha256(content.encode()).hexdigest()
        snapshot=db.scalar(select(Snapshot).where(Snapshot.source_id==registered.id,Snapshot.content_hash==digest))
        if not snapshot:
            snapshot=Snapshot(source_id=registered.id,content=content,raw_content=json.dumps(source,ensure_ascii=False),content_hash=digest)
            db.add(snapshot);db.flush()
        for item in record['facts']:
            evidence=source['excerpts'][item['evidence']]
            current=db.scalar(select(Fact).where(Fact.entity_id==entity.id,Fact.key==item['key'],Fact.valid_to.is_(None)))
            if not current and db.scalar(select(Fact).where(Fact.entity_id==entity.id,Fact.key==item['key']).limit(1)):
                continue  # Keep intentionally retired fields retired.
            if current and current.value==item['value']:
                continue
            existing=db.scalar(select(Change).where(Change.entity_id==entity.id,Change.key==item['key'],Change.new_value==item['value'],Change.status=='pending'))
            if existing:
                continue
            change=Change(entity_id=entity.id,snapshot_id=snapshot.id,key=item['key'],old_value=current.value if current else None,new_value=item['value'],base_version=current.version if current else 0,evidence=evidence,origin='curated_web',status='pending' if current else 'approved',reviewer=None if current else '仓库编辑核验资料',review_note='核对官方短摘录；不推断价格或硬件配置。',reviewed_at=None if current else now())
            db.add(change);db.flush()
            if current:
                stats['pending']+=1
            else:
                db.add(Fact(entity_id=entity.id,key=item['key'],value=item['value'],version=1,snapshot_id=snapshot.id,evidence=evidence,change_id=change.id));stats['facts']+=1
    db.flush()
    return stats


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',help='Commit the reviewed public dataset; default is a rolled-back preview')
    args=parser.parse_args()
    dataset=json.loads((Path(__file__).resolve().parent.parent/'data/video-workflow-knowledge-2026-11-07.json').read_text(encoding='utf-8'))
    with Session() as db:
        stats=import_curated(db,dataset)
        if args.apply:
            db.commit()
        else:
            db.rollback()
        print(json.dumps({'applied':args.apply,**stats},ensure_ascii=False))


if __name__=='__main__':
    main()
