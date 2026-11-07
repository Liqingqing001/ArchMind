from uuid import uuid4
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, JSON, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base, now


def uid():
    return str(uuid4())


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), nullable=True)


class Entity(Base):
    __tablename__ = "entities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text, default="")
    website: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now)


class EntityCategory(Base):
    __tablename__ = "entity_categories"
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), primary_key=True)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id"), primary_key=True)


class Relation(Base):
    __tablename__ = "entity_relations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    from_id: Mapped[str] = mapped_column(ForeignKey("entities.id"))
    to_id: Mapped[str] = mapped_column(ForeignKey("entities.id"))
    relation: Mapped[str] = mapped_column(String(80))
    __table_args__ = (UniqueConstraint("from_id", "to_id", "relation"),)


class Source(Base):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"))
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(30), default="web")
    interval_hours: Mapped[int] = mapped_column(Integer, default=24)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    last_checked_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    next_check_at: Mapped[str] = mapped_column(String(40), default=now)
    status: Mapped[str] = mapped_column(String(30), default="never")
    etag: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_modified: Mapped[str | None] = mapped_column(Text, nullable=True)


class Snapshot(Base):
    __tablename__ = "source_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    raw_content: Mapped[str] = mapped_column(Text, default="")
    content_hash: Mapped[str] = mapped_column(String(64))
    fetched_at: Mapped[str] = mapped_column(String(40), default=now)


class Run(Base):
    __tablename__ = "collection_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="running")
    started_at: Mapped[str] = mapped_column(String(40), default=now)
    finished_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("source_snapshots.id"), nullable=True)
    __table_args__ = (Index("one_running_source", "source_id", unique=True, sqlite_where=(status == "running"), postgresql_where=(status == "running")),)


class Fact(Base):
    __tablename__ = "entity_facts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    key: Mapped[str] = mapped_column(String(120))
    value: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("source_snapshots.id"))
    evidence: Mapped[str] = mapped_column(Text)
    valid_from: Mapped[str] = mapped_column(String(40), default=now)
    valid_to: Mapped[str | None] = mapped_column(String(40), nullable=True)
    change_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    __table_args__ = (UniqueConstraint("entity_id", "key", "version"), Index("one_active_fact", "entity_id", "key", unique=True, sqlite_where=(valid_to == None), postgresql_where=(valid_to == None)))


class Change(Base):
    __tablename__ = "change_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("source_snapshots.id"))
    key: Mapped[str] = mapped_column(String(120))
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str] = mapped_column(Text)
    base_version: Mapped[int] = mapped_column(Integer, default=0)
    evidence: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    risk: Mapped[str] = mapped_column(String(30), default="normal")
    origin: Mapped[str] = mapped_column(String(30), default="manual")
    reviewer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    reviewed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(120), default="新对话")
    title_mode: Mapped[str] = mapped_column(String(12), default="manual", server_default="manual")
    messages: Mapped[list] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now, index=True)
    deleted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Trace(Base):
    __tablename__ = "retrieval_traces"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    query: Mapped[str] = mapped_column(Text)
    caller: Mapped[str] = mapped_column(String(30), default="console", index=True)
    request_context: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
