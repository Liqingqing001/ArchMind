import hmac
import os
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Request, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .db import get_db, now
from .models import Category, Entity, EntityCategory, Relation, Source, Snapshot, Run, Fact, Change, Trace
from .schemas import CategoryInput, EntityInput, SourceInput, SourcePatch, ChangeInput, ReviewInput, RelationInput, RetrievalInput
from .collector import collect, propose
from .knowledge import retrieve


def auth(request: Request):
    if not request.url.path.startswith("/api/") or request.url.path == "/api/health":
        return
    admin = os.getenv("ADMIN_TOKEN", "")
    knowledge = os.getenv("KNOWLEDGE_TOKEN", "")
    supplied = request.headers.get("Authorization", "").encode()
    tokens = [admin] if admin else []
    if request.url.path == "/api/knowledge/retrieve" and request.method == "POST":
        tokens += [knowledge] if knowledge else []
    requires_auth = bool(admin) or bool(knowledge and request.url.path == "/api/knowledge/retrieve")
    if requires_auth and not any(hmac.compare_digest(supplied, f"Bearer {token}".encode()) for token in tokens):
        raise HTTPException(401, "请输入有效的访问口令")


app = FastAPI(title="ArchMind · AI Knowledge API", version="0.1.0", dependencies=[Depends(auth)])


def data(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


def get(db, model, id):
    row = db.get(model, id)
    if not row:
        raise HTTPException(404, "记录不存在")
    return row


def save(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "记录冲突，请刷新后重试")


@app.get("/api/health", dependencies=[])
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {"auth_enabled": bool(os.getenv("ADMIN_TOKEN")), "search": "keyword", "llm_configured": False, "version": "0.1.0", "agent_retrieval": True, "knowledge_token_configured": bool(os.getenv("KNOWLEDGE_TOKEN"))}


@app.get("/api/overview")
def overview(db: DBSession = Depends(get_db)):
    count = lambda model: db.scalar(select(func.count()).select_from(model))
    return {"entities": count(Entity), "sources": count(Source), "facts": db.scalar(select(func.count()).select_from(Fact).where(Fact.valid_to.is_(None))), "pending": db.scalar(select(func.count()).select_from(Change).where(Change.status == "pending")), "failed": db.scalar(select(func.count()).select_from(Source).where(Source.status == "failed")), "snapshots": count(Snapshot), "categories": count(Category), "demo_entities": db.scalar(select(func.count()).select_from(Entity).where(Entity.is_demo.is_(True))), "kinds": [{"kind": k, "count": c} for k, c in db.execute(select(Entity.kind, func.count()).group_by(Entity.kind))], "recent_runs": [data(r) for r in db.scalars(select(Run).order_by(Run.started_at.desc()).limit(5))]}


@app.get("/api/categories")
def categories(db: DBSession = Depends(get_db)):
    return [data(r) for r in db.scalars(select(Category).order_by(Category.name))]


@app.post("/api/categories", status_code=201)
def create_category(body: CategoryInput, db: DBSession = Depends(get_db)):
    if body.parent_id:
        get(db, Category, body.parent_id)
    row = Category(**body.model_dump())
    db.add(row)
    save(db)
    return data(row)


def validate_categories(db, ids):
    for id in ids:
        get(db, Category, id)


@app.get("/api/entities")
def entities(q: str = "", category_id: str = "", kind: str = "", db: DBSession = Depends(get_db)):
    query = select(Entity)
    if q:
        query = query.where(or_(Entity.name.contains(q, autoescape=True), Entity.description.contains(q, autoescape=True)))
    if kind:
        query = query.where(Entity.kind == kind)
    if category_id:
        cats = list(db.scalars(select(Category)))
        ids = {category_id}
        while True:
            expanded = ids | {c.id for c in cats if c.parent_id in ids}
            if expanded == ids:
                break
            ids = expanded
        query = query.where(Entity.id.in_(select(EntityCategory.entity_id).where(EntityCategory.category_id.in_(ids))))
    rows = list(db.scalars(query.order_by(Entity.name).limit(500)))
    links = list(db.scalars(select(EntityCategory)))
    facts = list(db.scalars(select(Fact).where(Fact.valid_to.is_(None))))
    return [{**data(r), "category_ids": [l.category_id for l in links if l.entity_id == r.id], "fact_count": sum(f.entity_id == r.id for f in facts)} for r in rows]


@app.post("/api/entities", status_code=201)
def create_entity(body: EntityInput, db: DBSession = Depends(get_db)):
    validate_categories(db, body.category_ids)
    row = Entity(**body.model_dump(exclude={"category_ids"}))
    db.add(row)
    db.flush()
    for id in set(body.category_ids):
        db.add(EntityCategory(entity_id=row.id, category_id=id))
    save(db)
    return data(row)


@app.put("/api/entities/{id}")
def update_entity(id: str, body: EntityInput, db: DBSession = Depends(get_db)):
    row = get(db, Entity, id)
    validate_categories(db, body.category_ids)
    for k, v in body.model_dump(exclude={"category_ids"}).items():
        setattr(row, k, v)
    for link in db.scalars(select(EntityCategory).where(EntityCategory.entity_id == id)):
        db.delete(link)
    db.flush()
    for cid in set(body.category_ids):
        db.add(EntityCategory(entity_id=id, category_id=cid))
    save(db)
    return data(row)


@app.get("/api/entities/{id}")
def entity_detail(id: str, db: DBSession = Depends(get_db)):
    row = get(db, Entity, id)
    return {**data(row), "category_ids": list(db.scalars(select(EntityCategory.category_id).where(EntityCategory.entity_id == id))), "facts": [data(f) for f in db.scalars(select(Fact).where(Fact.entity_id == id).order_by(Fact.key, Fact.version.desc()))], "sources": [data(s) for s in db.scalars(select(Source).where(Source.entity_id == id))], "changes": [data(c) for c in db.scalars(select(Change).where(Change.entity_id == id).order_by(Change.created_at.desc()))], "relations": [data(r) for r in db.scalars(select(Relation).where(or_(Relation.from_id == id, Relation.to_id == id)))]}


@app.post("/api/relations", status_code=201)
def relation(body: RelationInput, db: DBSession = Depends(get_db)):
    get(db, Entity, body.from_id)
    get(db, Entity, body.to_id)
    if body.from_id == body.to_id:
        raise HTTPException(422, "不能关联实体自身")
    row = Relation(**body.model_dump())
    db.add(row)
    save(db)
    return data(row)


@app.get("/api/sources")
def sources(db: DBSession = Depends(get_db)):
    return [data(s) for s in db.scalars(select(Source).order_by(Source.name))]


@app.post("/api/sources", status_code=201)
def create_source(body: SourceInput, db: DBSession = Depends(get_db)):
    get(db, Entity, body.entity_id)
    row = Source(**body.model_dump())
    db.add(row)
    save(db)
    return data(row)


@app.patch("/api/sources/{id}")
def patch_source(id: str, body: SourcePatch, db: DBSession = Depends(get_db)):
    row = get(db, Source, id)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    if body.enabled:
        row.next_check_at = now()
    save(db)
    return data(row)


@app.post("/api/sources/{id}/collect")
def collect_source(id: str, db: DBSession = Depends(get_db)):
    get(db, Source, id)
    try:
        return data(collect(db, id))
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.get("/api/runs")
def runs(db: DBSession = Depends(get_db)):
    return [data(r) for r in db.scalars(select(Run).order_by(Run.started_at.desc()).limit(200))]


@app.get("/api/snapshots")
def snapshots(source_id: str = "", db: DBSession = Depends(get_db)):
    q = select(Snapshot)
    if source_id:
        q = q.where(Snapshot.source_id == source_id)
    return [{k: v for k, v in data(r).items() if k not in ("content", "raw_content")} for r in db.scalars(q.order_by(Snapshot.fetched_at.desc()).limit(200))]


@app.get("/api/snapshots/{id}")
def snapshot(id: str, db: DBSession = Depends(get_db)):
    row = get(db, Snapshot, id)
    return {**data(row), "source": data(get(db, Source, row.source_id))}


@app.get("/api/changes")
def changes(status: str = "", db: DBSession = Depends(get_db)):
    q = select(Change)
    if status:
        q = q.where(Change.status == status)
    return [data(r) for r in db.scalars(q.order_by(Change.created_at.desc()).limit(300))]


@app.post("/api/changes", status_code=201)
def create_change(body: ChangeInput, db: DBSession = Depends(get_db)):
    get(db, Entity, body.entity_id)
    try:
        row = propose(db, **body.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))
    save(db)
    return data(row)


@app.post("/api/changes/{id}/review")
def review(id: str, body: ReviewInput, db: DBSession = Depends(get_db)):
    # Serialize approvals for one entity and reject candidates based on older facts.
    change = db.scalar(select(Change).where(Change.id == id).with_for_update())
    if not change:
        raise HTTPException(404, "变更不存在")
    if change.status != "pending":
        raise HTTPException(409, "该变更已经处理")
    claimed = db.execute(update(Change).where(Change.id == id, Change.status == "pending").values(status=body.decision), execution_options={"synchronize_session": False})
    if claimed.rowcount != 1:
        raise HTTPException(409, "该变更已被其他请求处理")
    db.scalar(select(Entity).where(Entity.id == change.entity_id).with_for_update())
    if body.decision == "approved":
        current = db.scalar(select(Fact).where(Fact.entity_id == change.entity_id, Fact.key == change.key, Fact.valid_to.is_(None)).with_for_update())
        if (current.version if current else 0) != change.base_version:
            raise HTTPException(409, "当前事实已更新，候选版本过期，请重新提交")
        stamp = now()
        if current:
            current.valid_to = stamp
            db.flush()
        db.add(Fact(entity_id=change.entity_id, key=change.key, value=change.new_value, version=change.base_version + 1, snapshot_id=change.snapshot_id, evidence=change.evidence, valid_from=stamp, change_id=change.id))
    change.status, change.reviewer, change.reviewed_at, change.review_note = body.decision, "管理员", now(), body.note
    save(db)
    return data(change)


@app.post("/api/facts/{id}/restore", status_code=201)
def restore(id: str, db: DBSession = Depends(get_db)):
    fact = get(db, Fact, id)
    try:
        row = propose(db, fact.entity_id, fact.snapshot_id, fact.key, fact.value, fact.evidence, "restore")
    except ValueError as e:
        raise HTTPException(422, str(e))
    save(db)
    return data(row)


@app.get("/api/search")
def search(q: str, db: DBSession = Depends(get_db)):
    if not q.strip() or len(q) > 200:
        raise HTTPException(422, "请输入 1 至 200 个字符")
    return retrieve(db, q.strip(), caller="console")


@app.post("/api/knowledge/retrieve")
def agent_retrieve(body: RetrievalInput, db: DBSession = Depends(get_db)):
    return retrieve(db, **body.model_dump(exclude={"query"}), query=body.query, caller="agent")


@app.get("/api/traces")
def list_traces(caller: str = "", limit: int = Query(default=30, ge=1, le=100), db: DBSession = Depends(get_db)):
    query = select(Trace)
    if caller:
        query = query.where(Trace.caller == caller)
    return [{"id": row.id, "query": row.query, "caller": row.caller,
             "created_at": row.created_at, "result_count": len(row.results),
             "request_context": row.request_context}
            for row in db.scalars(query.order_by(Trace.created_at.desc(), Trace.id).limit(limit))]


@app.get("/api/traces/{id}")
def trace(id: str, db: DBSession = Depends(get_db)):
    return data(get(db, Trace, id))


# Optional production SPA: API and UI share an origin, no cross-origin secrets.
static_dir = Path(os.getenv("STATIC_DIR", "../frontend/dist"))
if static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "API 不存在")
        return FileResponse(static_dir / "index.html")
