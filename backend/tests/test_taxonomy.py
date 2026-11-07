from sqlalchemy import select
from app.models import Category
from app.taxonomy import refine_taxonomy


def test_refinement_preserves_existing_and_is_repeatable(db):
    root = Category(name="AI 模型")
    db.add(root)
    db.flush()
    child = Category(name="大语言模型", parent_id=root.id)
    db.add(child)
    db.flush()
    original_id = child.id
    assert refine_taxonomy(db) > 40
    db.commit()
    assert refine_taxonomy(db) == 0
    assert db.get(Category, original_id).parent_id == root.id
    reasoning = db.scalar(select(Category).where(Category.name == "推理与数学"))
    assert reasoning.parent_id == original_id


def test_open_weight_models_are_linked_once_without_moving_capability_categories(db):
    from app.taxonomy import link_open_models
    from app.models import EntityCategory, Fact
    from test_governance import setup_source
    entity, _, snapshot = setup_source(db)
    refine_taxonomy(db)
    capability = db.scalar(select(Category).where(Category.name == "通用对话"))
    db.add(EntityCategory(entity_id=entity.id, category_id=capability.id))
    db.add(Fact(entity_id=entity.id, key="官方下载入口", value="https://huggingface.co/example/model/tree/main", version=1, snapshot_id=snapshot.id, evidence="上下文"))
    db.flush()
    assert link_open_models(db) == 1
    assert link_open_models(db) == 0
    root = db.scalar(select(Category).where(Category.name == "AI 模型", Category.parent_id.is_(None)))
    category = db.scalar(select(Category).where(Category.name == "开源与开放权重模型"))
    assert category.parent_id == root.id
    links = list(db.scalars(select(EntityCategory.category_id).where(EntityCategory.entity_id == entity.id)))
    assert set(links) == {capability.id, category.id}


def test_publishing_download_fact_assigns_the_same_visible_category(client, db):
    from test_governance import setup_source, candidate, approve
    link = "https://huggingface.co/example/model/tree/main"
    entity, _, snapshot = setup_source(db, "官方下载入口：" + link)
    change = candidate(client, entity, snapshot, value=link, evidence=link, key="官方下载入口").json()
    assert approve(client, change["id"]).status_code == 200
    category = db.scalar(select(Category).where(Category.name == "开源与开放权重模型"))
    assert category.id in client.get(f"/api/entities/{entity.id}").json()["category_ids"]
    assert client.get(f"/api/entities?category_id={category.id}").json()[0]["id"] == entity.id
