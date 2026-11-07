"""Add open-weight model category links without moving or duplicating entities."""
from alembic import op
import sqlalchemy as sa
from uuid import uuid4
revision = "d0837d99bb12"
down_revision = "c921db332001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    entities = sa.table("entities", sa.column("id"), sa.column("kind"), sa.column("is_demo"))
    facts = sa.table("entity_facts", sa.column("entity_id"), sa.column("key"), sa.column("value"), sa.column("valid_to"))
    categories = sa.table("categories", sa.column("id"), sa.column("name"), sa.column("parent_id"))
    links = sa.table("entity_categories", sa.column("entity_id"), sa.column("category_id"))
    ids = set(bind.scalars(sa.select(entities.c.id).join(facts, facts.c.entity_id == entities.c.id).where(
        entities.c.kind == "model", entities.c.is_demo == sa.false(), facts.c.key == "官方下载入口",
        facts.c.valid_to.is_(None), facts.c.value.like("https://%")).distinct()))
    if not ids:
        return
    parent = bind.scalar(sa.select(categories.c.id).where(categories.c.name == "AI 模型", categories.c.parent_id.is_(None)))
    if not parent:
        parent = str(uuid4())
        bind.execute(categories.insert().values(id=parent, name="AI 模型", parent_id=None))
    category = bind.scalar(sa.select(categories.c.id).where(categories.c.name == "开源与开放权重模型", categories.c.parent_id == parent))
    if not category:
        category = str(uuid4())
        bind.execute(categories.insert().values(id=category, name="开源与开放权重模型", parent_id=parent))
    current = set(bind.scalars(sa.select(links.c.entity_id).where(links.c.category_id == category)))
    for entity_id in ids - current:
        bind.execute(links.insert().values(entity_id=entity_id, category_id=category))


def downgrade():
    # Additive classification is retained: deleting it could remove later user links.
    pass
