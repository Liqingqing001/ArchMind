"""Opt-in official MaaS source monitoring using the existing collector and review queue."""
import argparse
import json
from pathlib import Path
from sqlalchemy import select
from .curated import import_curated
from .db import Session, now
from .models import Entity, Source, Run
from .collector import collect, validate_url

CATALOG = Path(__file__).resolve().parent.parent / 'data/maas-official-2026-11-15.json'


def setup(db):
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    # Explicit action imports the reviewed, checked-in batch; conflicting facts still await review.
    stats = import_curated(db, catalog)
    added = 0
    for item in catalog['sources']:
        record = next(e for e in catalog['entities'] if e['source'] == item['id'])
        entity = db.scalar(select(Entity).where(Entity.name == record['name'], Entity.kind == record['kind']))
        validate_url(item['url'])
        # Keep live pages separate from curated excerpts: their hashes are incomparable.
        name = 'MaaS 官网巡检 · ' + record['name']
        source = db.scalar(select(Source).where(Source.entity_id == entity.id, Source.url == item['url'], Source.name == name))
        if source:
            continue  # Preserve user pauses, intervals and validators on repeated setup.
        db.add(Source(entity_id=entity.id, name=name, url=item['url'], source_type='web',
                      interval_hours=item['monitor_interval_hours'], enabled=True, is_demo=False,
                      status='never', next_check_at=now()))
        added += 1
    db.flush()
    return {**stats, 'monitors_added': added, 'message': '已配置定期巡检；需单实例 worker 持续运行。网页变化保存快照，由人工核验事实。'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Import and enable monitoring; otherwise preview and rollback')
    parser.add_argument('--check-once', action='store_true', help='Check due MaaS sources once (requires --apply)')
    args = parser.parse_args()
    if args.check_once and not args.apply:
        parser.error('--check-once requires --apply')
    with Session() as db:
        stats = setup(db)
        if not args.apply:
            db.rollback()
        else:
            db.commit()
            if args.check_once:
                ids = list(db.scalars(select(Source.id).where(Source.name.startswith('MaaS 官网巡检 · '), Source.enabled.is_(True), Source.next_check_at <= now())))
                stats['runs'] = []
                for source_id in ids:
                    run = collect(db, source_id)
                    stats['runs'].append({'source_id': source_id, 'status': run.status, 'message': run.message})
                    print(json.dumps(stats['runs'][-1], ensure_ascii=False), flush=True)
        print(json.dumps({'applied': args.apply, **stats}, ensure_ascii=False))


if __name__ == '__main__':
    main()
