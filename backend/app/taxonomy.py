"""Additive, repeatable knowledge taxonomy. Never changes facts or existing links."""
from sqlalchemy import select
from .models import Category, Entity, EntityCategory, Fact
from .db import Session

TAXONOMY = {
    "AI 模型": {
        "大语言模型": ["通用对话", "推理与数学", "代码生成"],
        "图像生成模型": ["文生图", "图像编辑"],
        "视频生成模型": ["文生视频", "图生视频"],
        "语音与音频": ["语音识别", "语音合成"],
        "多模态模型": ["视觉理解", "文档理解"],
        "向量与排序模型": ["文本嵌入", "重排序"],
        "开源与开放权重模型": [],
    },
    "AI 应用与产品": {"智能助手": [], "创作工具": [], "开发工具": [], "知识管理": []},
    "技术框架": {"Agent 编排": [], "RAG 与检索": [], "模型训练与微调": [], "评测与可观测性": []},
    "云计算与基础设施": {"模型 API 服务": [], "推理与部署": [], "向量数据库": [], "算力与存储": []},
    "开源项目": {"推理引擎": [], "数据处理": [], "开发工具链": []},
    "厂商与组织": {"模型厂商": [], "云服务商": [], "开源社区": []},
    "行业解决方案": {"教育与科研": [], "企业知识问答": [], "内容创作": [], "数据分析": []},
}


def link_open_models(db):
    """Add a normal category link; keep capability categories and facts unchanged."""
    ids = set(db.scalars(select(Entity.id).join(Fact, Fact.entity_id == Entity.id).where(
        Entity.kind == "model", Entity.is_demo.is_(False), Fact.key == "官方下载入口",
        Fact.valid_to.is_(None), Fact.value.startswith("https://"))))
    if not ids:
        return 0
    root = db.scalar(select(Category).where(Category.name == "AI 模型", Category.parent_id.is_(None)))
    if not root:
        root = Category(name="AI 模型")
        db.add(root)
        db.flush()
    category = db.scalar(select(Category).where(Category.name == "开源与开放权重模型", Category.parent_id == root.id))
    if not category:
        category = Category(name="开源与开放权重模型", parent_id=root.id)
        db.add(category)
        db.flush()
    linked = set(db.scalars(select(EntityCategory.entity_id).where(EntityCategory.category_id == category.id)))
    for entity_id in ids - linked:
        db.add(EntityCategory(entity_id=entity_id, category_id=category.id))
    db.flush()
    return len(ids - linked)


def refine_taxonomy(db):
    existing = {(c.parent_id, c.name): c for c in db.scalars(select(Category))}
    added = 0

    def ensure(name, parent=None):
        nonlocal added
        key = (parent, name)
        if key not in existing:
            category = Category(name=name, parent_id=parent)
            db.add(category)
            db.flush()
            existing[key] = category
            added += 1
        return existing[key].id

    for root, children in TAXONOMY.items():
        root_id = ensure(root)
        for branch, leaves in children.items():
            branch_id = ensure(branch, root_id)
            for leaf in leaves:
                ensure(leaf, branch_id)
    link_open_models(db)
    return added


if __name__ == "__main__":
    with Session() as db:
        count = refine_taxonomy(db)
        db.commit()
        print(f"Added {count} categories; existing data preserved.")
