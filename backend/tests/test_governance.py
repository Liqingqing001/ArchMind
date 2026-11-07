import hashlib
import json
import pytest
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.collector import collect, normalized, validate_url
from app.models import Entity, Source, Snapshot, Fact, Run, Change, EntityCategory
from app.seed import seed


def setup_source(db, content="上下文：64K tokens。新版：128K tokens。价格：2 元。"):
    entity = Entity(name="测试模型", kind="model")
    db.add(entity)
    db.flush()
    source = Source(name="官方测试源", entity_id=entity.id, url="https://example.com/spec")
    db.add(source)
    db.flush()
    snapshot = Snapshot(source_id=source.id, content=content, raw_content=content, content_hash=hashlib.sha256(content.encode()).hexdigest())
    db.add(snapshot)
    db.commit()
    return entity, source, snapshot


def candidate(client, entity, snapshot, value="64K tokens", evidence="上下文：64K tokens", key="上下文"):
    return client.post("/api/changes", json={"entity_id": entity.id, "snapshot_id": snapshot.id, "key": key, "value": value, "evidence": evidence})


def approve(client, id):
    return client.post(f"/api/changes/{id}/review", json={"decision": "approved", "note": "已核对证据"})


def test_publish_preserves_history_and_stale_conflict(client, db):
    entity, source, snapshot = setup_source(db)
    first = candidate(client, entity, snapshot).json()
    stale = candidate(client, entity, snapshot, "128K tokens", "新版：128K tokens").json()
    assert client.get("/api/search?q=上下文").json()["results"] == []
    assert approve(client, first["id"]).status_code == 200
    assert approve(client, first["id"]).status_code == 409
    assert approve(client, stale["id"]).status_code == 409
    second = candidate(client, entity, snapshot, "128K tokens", "新版：128K tokens").json()
    assert approve(client, second["id"]).status_code == 200
    facts = client.get(f"/api/entities/{entity.id}").json()["facts"]
    assert len(facts) == 2
    assert [f["version"] for f in facts] == [2, 1]
    assert facts[0]["valid_to"] is None and facts[1]["valid_to"]
    trace = client.get("/api/search?q=上下文").json()
    assert len(trace["results"]) == 1
    assert trace["results"][0]["version"] == 2
    assert trace["results"][0]["snapshot_id"] == snapshot.id
    assert client.get(f'/api/traces/{trace["trace_id"]}').json()["results"] == trace["results"]
    restore = client.post(f'/api/facts/{facts[1]["id"]}/restore').json()
    assert restore["origin"] == "restore" and restore["status"] == "pending"
    assert approve(client, restore["id"]).status_code == 200
    assert client.get("/api/search?q=上下文").json()["results"][0]["version"] == 3
    # The earlier trace retains v2 even after current facts move to v3.
    assert client.get(f'/api/traces/{trace["trace_id"]}').json()["results"][0]["version"] == 2


def test_reject_does_not_publish(client, db):
    entity, _, snapshot = setup_source(db)
    change = candidate(client, entity, snapshot).json()
    response = client.post(f'/api/changes/{change["id"]}/review', json={"decision": "rejected", "note": "证据不足"})
    assert response.json()["review_note"] == "证据不足"
    assert db.scalar(select(func.count()).select_from(Fact)) == 0
    assert approve(client, change["id"]).status_code == 409


def test_evidence_and_entity_consistency(client, db):
    entity, _, snapshot = setup_source(db)
    assert candidate(client, entity, snapshot, evidence="文档没有这段文字").status_code == 422
    other = Entity(name="其他模型", kind="model")
    db.add(other)
    db.commit()
    assert candidate(client, other, snapshot).status_code == 422
    assert candidate(client, entity, snapshot, evidence="   ").status_code == 422


def test_duplicate_pending_is_idempotent(client, db):
    entity, _, snapshot = setup_source(db)
    a = candidate(client, entity, snapshot).json()
    b = candidate(client, entity, snapshot).json()
    assert a["id"] == b["id"]


def test_high_risk_price(client, db):
    entity, _, snapshot = setup_source(db)
    assert candidate(client, entity, snapshot, "2 元", "价格：2 元", "input_price").json()["risk"] == "high"


def test_collect_changed_unchanged_conditional_and_failure(db):
    _, source, _ = setup_source(db)
    for raw, status in [("<main>正文 新内容</main>", "changed"), ("<main>正文 新内容</main>", "unchanged"), (None, "unchanged")]:
        run = collect(db, source.id, lambda _: (raw, {"etag": "v2"}))
        assert run.status == status
    assert db.get(Source, source.id).etag == "v2"
    assert db.scalar(select(func.count()).select_from(Snapshot)) == 2
    def fail(_):
        raise TimeoutError("测试超时")
    run = collect(db, source.id, fail)
    assert run.status == "failed" and "测试超时" in run.message
    assert db.get(Source, source.id).status == "failed"
    assert db.scalar(select(func.count()).select_from(Fact)) == 0


def test_json_extraction_never_publishes(db):
    _, source, _ = setup_source(db)
    source.source_type = "json"
    db.commit()
    raw = json.dumps({"documentation": "上下文容量 128K", "facts": [{"key": "上下文", "value": "128K", "evidence": "上下文容量 128K"}, {"key": "虚构字段", "value": "假的", "evidence": "并不存在的证据"}]}, ensure_ascii=False)
    run = collect(db, source.id, lambda _: (raw, {}))
    assert run.status == "changed"
    assert db.scalar(select(func.count()).select_from(Change)) == 1
    assert db.scalar(select(func.count()).select_from(Fact)) == 0


def test_collection_overlap_and_disabled_sources(db):
    _, source, _ = setup_source(db)
    run = Run(source_id=source.id)
    db.add(run)
    db.commit()
    with pytest.raises(ValueError, match="已有巡检"):
        collect(db, source.id)
    run = db.get(Run, run.id)
    run.status = "failed"
    source = db.get(Source, source.id)
    source.enabled = False
    db.commit()
    with pytest.raises(ValueError, match="先启用"):
        collect(db, source.id)


@pytest.mark.parametrize("url", ["http://example.com", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://169.254.169.254/latest", "https://10.0.0.1", "https://user:pass@example.com", "https://example.com:8443", "https://test.internal"])
def test_private_or_insecure_sources_rejected(url):
    with pytest.raises(ValueError):
        validate_url(url)


def test_html_ignores_navigation_and_script_changes():
    assert normalized("<nav>菜单1</nav><main>规格 64K</main><script>abc</script>") == normalized("<nav>菜单2</nav><main>规格 64K</main><script>xyz</script>")


def test_multi_category_and_descendant_filters(client, db):
    parent = client.post('/api/categories', json={"name": "模型"}).json()
    a = client.post('/api/categories', json={"name": "文本", "parent_id": parent["id"]}).json()
    b = client.post('/api/categories', json={"name": "图像", "parent_id": parent["id"]}).json()
    entity = client.post('/api/entities', json={"name": "多模态模型", "kind": "model", "category_ids": [a["id"], b["id"]]}).json()
    assert client.get(f'/api/entities?category_id={parent["id"]}').json()[0]["id"] == entity["id"]
    assert db.scalar(select(func.count()).select_from(EntityCategory)) == 2
    assert client.put(f'/api/entities/{entity["id"]}', json={"name": "多模态模型 v2", "kind": "model", "category_ids": [b["id"]]}).status_code == 200
    assert db.scalar(select(func.count()).select_from(EntityCategory)) == 1
    assert client.post('/api/categories', json={"name": "坏分类", "parent_id": "missing"}).status_code == 404


def test_auth_protects_api_but_not_health(client, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "test-secret-token")
    assert client.get('/api/entities').status_code == 401
    assert client.get('/api/health').status_code == 200
    assert client.get('/api/entities', headers={"Authorization": "Bearer test-secret-token"}).status_code == 200
    assert client.post('/api/entities', json={"name": "test", "kind": "model"}).status_code == 401


def test_seed_explicit_demo_and_idempotent(db, client):
    assert seed(db)
    assert not seed(db)
    assert client.get('/api/overview').json()["demo_entities"] == 12
    for fact in client.get('/api/search?q=上下文').json()["results"]:
        assert fact["is_demo"]


def test_active_fact_unique_constraint(db):
    entity, _, snapshot = setup_source(db)
    db.add_all([Fact(entity_id=entity.id, key="k", value="v", version=v, snapshot_id=snapshot.id, evidence="上下文") for v in [1, 2]])
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_sql_wildcards_are_literal_search(client, db):
    assert client.get('/api/search?q=%25').json()["results"] == []
    assert client.get('/api/search?q=').status_code == 422


def test_api_source_run_and_snapshot_paths(client, db, monkeypatch):
    entity = client.post('/api/entities', json={"name": "API 集成模型", "kind": "model"}).json()
    source = client.post('/api/sources', json={"entity_id": entity["id"], "name": "公开文档", "url": "https://example.com/test"}).json()
    monkeypatch.setattr('app.collector.fetch', lambda _: ("<main>API 测试内容</main>", {}))
    run = client.post(f'/api/sources/{source["id"]}/collect').json()
    assert run["status"] == "changed"
    snapshot = client.get(f'/api/snapshots/{run["snapshot_id"]}').json()
    assert snapshot["content"] == "API 测试内容"
    assert snapshot["raw_content"] == "<main>API 测试内容</main>"
    assert client.patch(f'/api/sources/{source["id"]}', json={"enabled": False, "interval_hours": 168}).json()["enabled"] is False
    assert client.post(f'/api/sources/{source["id"]}/collect').status_code == 409
    assert client.get('/api/snapshots/missing').status_code == 404


def test_json_requires_independent_documentation(db):
    _, source, _ = setup_source(db)
    source.source_type = "json"
    db.commit()
    run = collect(db, source.id, lambda _: (json.dumps({"facts": [{"key": "a", "value": "b", "evidence": "b"}]}), {}))
    assert run.status == "failed"
    assert "documentation" in run.message
    assert db.scalar(select(func.count()).select_from(Change)) == 0


def test_invalid_json_value_not_in_evidence_is_not_proposed(db):
    _, source, _ = setup_source(db)
    source.source_type = "json"
    db.commit()
    raw = json.dumps({"documentation": "容量 64K", "facts": [{"key": "容量", "value": "1M", "evidence": "容量 64K"}]}, ensure_ascii=False)
    assert collect(db, source.id, lambda _: (raw, {})).status == "changed"
    assert db.scalar(select(func.count()).select_from(Change)) == 0


def test_concurrent_approvals_publish_only_one_version(client, db):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import Session
    from app.main import app
    from app.db import get_db
    if db.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock integration test")
    entity, _, snapshot = setup_source(db)
    a = candidate(client, entity, snapshot).json()["id"]
    b = candidate(client, entity, snapshot, "128K tokens", "新版：128K tokens").json()["id"]
    def dependency():
        with Session(db.bind, expire_on_commit=False) as local:
            yield local
    old = app.dependency_overrides[get_db]
    app.dependency_overrides[get_db] = dependency
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda id: approve(client, id).status_code, [a, b]))
        assert sorted(statuses) == [200, 409]
        db.expire_all()
        assert db.scalar(select(func.count()).select_from(Fact).where(Fact.valid_to.is_(None))) == 1
    finally:
        app.dependency_overrides[get_db] = old


def test_scheduler_recovers_interrupted_run_and_respects_due_time(db, monkeypatch):
    from contextlib import contextmanager
    from app import worker
    entity, source, _ = setup_source(db)
    interrupted = Run(source_id=source.id, started_at="2000-01-01T00:00:00+00:00")
    disabled = Source(entity_id=entity.id, name="暂停来源", url="https://example.com/disabled", enabled=False)
    future = Source(entity_id=entity.id, name="未来来源", url="https://example.com/future", next_check_at="2099-01-01T00:00:00+00:00")
    db.add_all([interrupted, disabled, future])
    db.commit()
    @contextmanager
    def session():
        yield db
    monkeypatch.setattr(worker, 'Session', session)
    monkeypatch.setattr('app.collector.fetch', lambda _: ("<main>自动巡检获取的正文</main>", {}))
    worker.tick()
    assert db.get(Run, interrupted.id).status == "failed"
    runs = list(db.scalars(select(Run)))
    assert len(runs) == 2
    assert any(r.status == "changed" for r in runs)
    worker.tick()
    assert db.scalar(select(func.count()).select_from(Run)) == 2
