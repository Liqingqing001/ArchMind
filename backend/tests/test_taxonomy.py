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
