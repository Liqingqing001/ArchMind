"""Explicit opt-in illustrative dataset; never claim current product specifications."""
import hashlib
from sqlalchemy import select
from .db import Session, now
from .models import Category, Entity, EntityCategory, Relation, Source, Snapshot, Fact, Change, Run
from .taxonomy import refine_taxonomy


def seed(db):
    if db.scalar(select(Entity).limit(1)):
        return False
    cats = {}
    for name, parent in [("AI 模型", None), ("大语言模型", "AI 模型"), ("图像生成模型", "AI 模型"), ("视频生成模型", "AI 模型"), ("语音与音频", "AI 模型"), ("多模态模型", "AI 模型"), ("AI 应用与产品", None), ("技术框架", None), ("云计算与基础设施", None), ("开源项目", None), ("厂商与组织", None), ("行业解决方案", None)]:
        cat = Category(name=name, parent_id=cats[parent].id if parent else None)
        db.add(cat)
        db.flush()
        cats[name] = cat
    specs = [
        ("OpenAI", "vendor", "厂商实体示例，与旗下产品、模型和 API 服务分开管理。", "厂商与组织", "https://openai.com"),
        ("Anthropic", "vendor", "厂商实体示例，等待接入官方资料。", "厂商与组织", "https://www.anthropic.com"),
        ("快手", "vendor", "可灵相关厂商实体示例。", "厂商与组织", "https://www.kuaishou.com"),
        ("可灵 Kling", "product", "视频生成产品品牌示例；具体模型版本需单独建模。", "AI 应用与产品", "https://klingai.com"),
        ("Seedance 系列", "model", "视频模型系列占位条目，具体版本、能力和价格待核验。", "视频生成模型", "https://seed.bytedance.com"),
        ("Veo 系列", "model", "视频模型系列占位条目，等待官方文档采集。", "视频生成模型", "https://deepmind.google"),
        ("Sora 系列", "model", "视频模型系列占位条目，具体开放范围待核验。", "视频生成模型", "https://openai.com"),
        ("Qwen 系列", "model", "语言与多模态模型示例，不代表任一版本的能力承诺。", "大语言模型", "https://qwenlm.github.io"),
        ("LangGraph", "framework", "Agent 工作流框架条目示例，版本与特性待核验。", "技术框架", "https://github.com/langchain-ai/langgraph"),
        ("vLLM", "project", "模型推理开源项目条目示例，部署参数待核验。", "开源项目", "https://github.com/vllm-project/vllm"),
        ("腾讯云", "cloud", "云平台条目示例，产品规格与服务区域待核验。", "云计算与基础设施", "https://cloud.tencent.com"),
        ("演示模型 · Atlas", "model", "用于体验巡检、证据审核和版本追溯的虚构模型。所有参数均为演示。", "大语言模型", "https://example.com/atlas"),
    ]
    entities = {}
    for name, kind, description, cat, website in specs:
        e = Entity(name=name, kind=kind, description=description, website=website, is_demo=True)
        db.add(e)
        db.flush()
        db.add(EntityCategory(entity_id=e.id, category_id=cats[cat].id))
        entities[name] = e
    db.add(EntityCategory(entity_id=entities["Qwen 系列"].id, category_id=cats["多模态模型"].id))
    db.add(Relation(from_id=entities["快手"].id, to_id=entities["可灵 Kling"].id, relation="旗下产品"))
    db.add(Relation(from_id=entities["OpenAI"].id, to_id=entities["Sora 系列"].id, relation="开发模型"))
    e = entities["演示模型 · Atlas"]
    source = Source(entity_id=e.id, name="Atlas 官方文档（虚构演示）", url="https://example.com/atlas", source_type="web", is_demo=True, enabled=False, status="changed", last_checked_at=now())
    db.add(source)
    db.flush()
    content = "[演示文档，非真实产品资料]\n模型：Atlas\n支持输入：文本、图像\n上下文窗口：64K tokens\nAPI 状态：演示可用\n新版上下文窗口：128K tokens\n示例价格：每百万输入 tokens 2 元（虚构）。"
    snapshot = Snapshot(source_id=source.id, content=content, raw_content=content, content_hash=hashlib.sha256(content.encode()).hexdigest())
    db.add(snapshot)
    db.flush()
    for key, value, evidence in [("支持输入", "文本、图像", "支持输入：文本、图像"), ("上下文窗口", "64K tokens", "上下文窗口：64K tokens"), ("API 状态", "演示可用", "API 状态：演示可用")]:
        db.add(Fact(entity_id=e.id, key=key, value=value, version=1, snapshot_id=snapshot.id, evidence=evidence))
    db.add(Change(entity_id=e.id, snapshot_id=snapshot.id, key="上下文窗口", old_value="64K tokens", new_value="128K tokens", base_version=1, evidence="新版上下文窗口：128K tokens"))
    db.add(Change(entity_id=e.id, snapshot_id=snapshot.id, key="示例价格", new_value="每百万输入 tokens 2 元（虚构）", base_version=0, risk="high", evidence="示例价格：每百万输入 tokens 2 元（虚构）。"))
    db.add(Run(source_id=source.id, status="changed", finished_at=now(), snapshot_id=snapshot.id, message="演示巡检记录：已保存快照，2 条变更等待人工审核。未执行网络请求。"))
    refine_taxonomy(db)
    db.commit()
    return True


if __name__ == "__main__":
    with Session() as db:
        print("Demo seeded" if seed(db) else "Existing data found; seed skipped")
