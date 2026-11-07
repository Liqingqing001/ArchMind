"""Bounded public HTTPS collector. Collection never publishes facts."""
import hashlib
import ipaddress
import json
import socket
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .db import now
from .models import Source, Snapshot, Run, Fact, Change

MAX_BYTES = 2 * 1024 * 1024


def validate_url(url: str, resolve: bool = False):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("仅支持无凭据的公开 HTTPS 地址（443 端口）")
    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith((".local", ".internal")):
        raise ValueError("不允许内网地址")
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        addresses = []
    if resolve and not addresses:
        addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)]
    if any(not a.is_global for a in addresses):
        raise ValueError("不允许内网、保留地址或云元数据地址")


def fetch(source):
    validate_url(source.url, resolve=True)
    headers = {"User-Agent": "KnowledgeConsole/0.1 (+source-monitor)"}
    if source.etag:
        headers["If-None-Match"] = source.etag
    if source.last_modified:
        headers["If-Modified-Since"] = source.last_modified
    started = time.monotonic()
    with httpx.Client(timeout=httpx.Timeout(20), follow_redirects=False) as client:
        with client.stream("GET", source.url, headers=headers) as response:
            if response.status_code == 304:
                return None, dict(response.headers)
            if 300 <= response.status_code < 400:
                raise ValueError("来源发生重定向，请确认后注册最终 HTTPS 地址")
            response.raise_for_status()
            kind = response.headers.get("content-type", "").lower()
            if not any(t in kind for t in ("text/", "json", "xml")):
                raise ValueError("不支持的响应类型，请使用网页、文本或 JSON")
            body = bytearray()
            for part in response.iter_bytes():
                if time.monotonic() - started > 25:
                    raise TimeoutError("采集总时间超过 25 秒")
                body.extend(part)
                if len(body) > MAX_BYTES:
                    raise ValueError("响应超过 2 MB 限制")
            return body.decode(response.encoding or "utf-8", errors="replace"), dict(response.headers)


def normalized(raw):
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "facts" in data:
            # Candidates cannot cite their own evidence properties as source text.
            document = data.get("documentation")
            if not isinstance(document, str) or not document.strip():
                raise ValueError("facts JSON 需要独立的 documentation 原文")
            return document
        return json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2)
    except (json.JSONDecodeError, TypeError):
        soup = BeautifulSoup(raw, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "noscript"]):
            tag.decompose()
        return "\n".join(line.strip() for line in soup.get_text("\n").splitlines() if line.strip())


def propose(db, entity_id, snapshot_id, key, value, evidence, origin="manual", base_version=None):
    snapshot = db.get(Snapshot, snapshot_id)
    if not snapshot or db.get(Source, snapshot.source_id).entity_id != entity_id:
        raise ValueError("快照不属于该实体")
    if not evidence.strip() or evidence not in snapshot.content:
        raise ValueError("证据必须是所选快照的连续原文片段")
    current = db.scalar(select(Fact).where(Fact.entity_id == entity_id, Fact.key == key, Fact.valid_to.is_(None)))
    version = current.version if current else 0
    if base_version is not None and base_version != version:
        raise ValueError("当前事实版本已经变化，请刷新")
    if current and current.value == value:
        raise ValueError("新值与当前已发布值相同")
    duplicate = db.scalar(select(Change).where(Change.entity_id == entity_id, Change.key == key, Change.new_value == value, Change.base_version == version, Change.status == "pending"))
    if duplicate:
        return duplicate
    change = Change(entity_id=entity_id, snapshot_id=snapshot_id, key=key, new_value=value, old_value=current.value if current else None, base_version=version, evidence=evidence, origin=origin, risk="high" if any(x in key.lower() for x in ("price", "cost", "价格", "费用")) else "normal")
    db.add(change)
    db.flush()
    return change


def collect(db, source_id, fetcher=None):
    source = db.get(Source, source_id)
    if not source:
        raise ValueError("来源不存在")
    if not source.enabled:
        raise ValueError("请先启用来源")
    if source.is_demo:
        raise ValueError("演示来源不执行网络请求，请注册真实来源")
    run = Run(source_id=source.id)
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("该来源已有巡检正在进行")
    try:
        raw, headers = (fetcher or fetch)(source)
        previous = db.scalar(select(Snapshot).where(Snapshot.source_id == source.id).order_by(Snapshot.fetched_at.desc()))
        if raw is None and previous is None:
            raise ValueError("来源返回 304 但没有可用历史快照")
        content = normalized(raw) if raw is not None else None
        digest = hashlib.sha256(content.encode()).hexdigest() if content is not None else None
        if raw is None or previous and previous.content_hash == digest:
            run.status, run.message = "unchanged", "正文无变化，保留已有快照"
            run.snapshot_id = previous.id
        else:
            if not content:
                raise ValueError("未获取到有效正文，可能需要动态渲染")
            snapshot = Snapshot(source_id=source.id, content=content, raw_content=raw, content_hash=digest)
            db.add(snapshot)
            db.flush()
            run.snapshot_id = snapshot.id
            count, warnings = 0, 0
            if source.source_type == "json":
                data = json.loads(raw)
                facts = data.get("facts", []) if isinstance(data, dict) else []
                if not isinstance(facts, list) or len(facts) > 100:
                    raise ValueError("facts 必须是最多 100 条的列表")
                for item in facts:
                    if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item[k].strip() for k in ("key", "value", "evidence")) or len(item.get("key", "")) > 120 or len(item.get("value", "")) > 10000:
                        warnings += 1
                        continue
                    try:
                        if item["value"] not in item["evidence"]:
                            raise ValueError("JSON 候选值必须直接出现在证据中")
                        propose(db, source.entity_id, snapshot.id, item["key"], item["value"], item["evidence"], "json")
                        count += 1
                    except ValueError:
                        warnings += 1
            run.status = "changed"
            run.message = f"已保存新快照；生成 {count} 条待审核候选，跳过 {warnings} 条无效或未变字段。普通网页请人工提交证据。"
        source.status = run.status
        source.etag = headers.get("etag", source.etag)
        source.last_modified = headers.get("last-modified", source.last_modified)
        source.last_checked_at = now()
        source.next_check_at = (datetime.now(timezone.utc) + timedelta(hours=source.interval_hours)).isoformat()
        run.finished_at = now()
        db.commit()
    except Exception as exc:
        db.rollback()
        run = db.get(Run, run.id)
        source = db.get(Source, source_id)
        run.status, run.message, run.finished_at = "failed", f"{type(exc).__name__}: {str(exc)[:800]}", now()
        source.status, source.last_checked_at = "failed", now()
        source.next_check_at = (datetime.now(timezone.utc) + timedelta(hours=source.interval_hours)).isoformat()
        db.commit()
    return run
