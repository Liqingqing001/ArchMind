"""One retrieval service for the visible console and every Agent tool call."""
from sqlalchemy import select, or_
from .models import Category, EntityCategory, Entity, Fact, Snapshot, Source, Trace


def category_descendants(db, category_id):
    rows = list(db.scalars(select(Category)))
    ids = {category_id}
    while True:
        expanded = ids | {row.id for row in rows if row.parent_id in ids}
        if expanded == ids:
            return ids
        ids = expanded


def retrieve(db, query, *, caller="console", entity_ids=None, category_id=None,
             kind=None, include_demo=True, top_k=30, request_id=None):
    """Return only current published facts, then freeze the citations in a trace.

    No secondary Agent index or Agent-only knowledge store exists. Approval,
    version restoration and console edits affect the same rows queried here.
    """
    statement = (select(Fact, Entity, Snapshot, Source)
        .join(Entity, Fact.entity_id == Entity.id)
        .join(Snapshot, Fact.snapshot_id == Snapshot.id)
        .join(Source, Snapshot.source_id == Source.id)
        .where(Fact.valid_to.is_(None), or_(
            Entity.name.contains(query, autoescape=True),
            Fact.key.contains(query, autoescape=True),
            Fact.value.contains(query, autoescape=True))))
    if not include_demo:
        statement = statement.where(Entity.is_demo.is_(False), Source.is_demo.is_(False))
    if entity_ids:
        statement = statement.where(Entity.id.in_(entity_ids))
    if category_id:
        statement = statement.where(Entity.id.in_(select(EntityCategory.entity_id).where(
            EntityCategory.category_id.in_(category_descendants(db, category_id)))))
    if kind:
        statement = statement.where(Entity.kind == kind)
    rows = db.execute(statement.order_by(Entity.name, Entity.id, Fact.key, Fact.id).limit(top_k)).all()
    results = [{
        "fact_id": fact.id, "entity_id": entity.id, "entity_name": entity.name,
        "entity_kind": entity.kind, "key": fact.key, "value": fact.value,
        "version": fact.version, "evidence": fact.evidence,
        "snapshot_id": snapshot.id, "snapshot_hash": snapshot.content_hash,
        "source_id": source.id, "source_url": source.url, "source_name": source.name,
        "fetched_at": snapshot.fetched_at, "valid_from": fact.valid_from,
        "is_demo": entity.is_demo or source.is_demo,
    } for fact, entity, snapshot, source in rows]
    context = {"entity_ids": entity_ids or [], "category_id": category_id,
               "kind": kind, "include_demo": include_demo, "top_k": top_k,
               "request_id": request_id}
    trace = Trace(query=query, results=results, caller=caller, request_context=context)
    db.add(trace)
    db.commit()
    return {"trace_id": trace.id, "method": "keyword", "caller": caller,
            "request_context": context, "results": results}
