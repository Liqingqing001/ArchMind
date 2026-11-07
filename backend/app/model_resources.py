"""Model downloads are a view of published knowledge, not a second catalog."""
import re
from urllib.parse import urlsplit
from sqlalchemy import select
from .models import Entity, Fact


def public_link(value):
    try:
        url = urlsplit(value.strip())
        if url.scheme == "https" and url.hostname and not url.username and not url.password:
            return value.strip()
    except ValueError:
        pass
    return ""


def model_resources(db, entity_ids=None):
    query = select(Fact).join(Entity, Entity.id == Fact.entity_id).where(
        Entity.kind == "model", Entity.is_demo.is_(False), Fact.valid_to.is_(None))
    if entity_ids is not None:
        query = query.where(Fact.entity_id.in_(entity_ids))
    grouped = {}
    for fact in db.scalars(query):
        grouped.setdefault(fact.entity_id, {})[fact.key] = fact.value
    result = {}
    for entity_id, fields in grouped.items():
        download = public_link(fields.get("官方下载入口", ""))
        if not download:
            continue
        card = public_link(fields.get("官方模型仓库", ""))
        url = urlsplit(card)
        repository = url.path.strip("/") if url.hostname == "huggingface.co" else ""
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            repository = ""
        result[entity_id] = {
            "download_url": download, "card_url": card, "repository": repository,
            "license": fields.get("模型卡许可证", fields.get("许可证", "尚未录入许可证")),
            "code_url": public_link(fields.get("官方代码仓库", "")),
        }
    return result
