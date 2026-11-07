"""Personal workspace conversations; never accepts provider credentials."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import select, update
from .db import get_db, now
from .models import Conversation

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class TitleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(default="新对话", min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("标题不能为空")
        return value.strip()


def summary(row):
    last = row.messages[-1] if row.messages else {}
    return {"id": row.id, "title": row.title, "title_mode": row.title_mode, "revision": row.revision,
        "created_at": row.created_at, "updated_at": row.updated_at,
        "message_count": len(row.messages), "preview": last.get("content", "")[:100]}


def get_conversation(db, id):
    row = db.get(Conversation, id)
    if not row or row.deleted_at:
        raise HTTPException(404, "对话不存在或已删除")
    return row


@router.get("")
def list_conversations(db=Depends(get_db)):
    return [summary(row) for row in db.scalars(select(Conversation)
        .where(Conversation.deleted_at.is_(None)).order_by(Conversation.updated_at.desc()))]


@router.post("", status_code=201)
def create_conversation(body: TitleInput, db=Depends(get_db)):
    row = Conversation(title=body.title, title_mode='auto' if body.title=='新对话' else 'manual')
    db.add(row)
    db.commit()
    return {**summary(row), "messages": row.messages}


@router.get("/{id}")
def read_conversation(id: str, db=Depends(get_db)):
    row = get_conversation(db, id)
    return {**summary(row), "messages": row.messages}


@router.patch("/{id}")
def rename_conversation(id: str, body: TitleInput, db=Depends(get_db)):
    get_conversation(db, id)
    # Update only title, so a concurrent reply cannot be overwritten.
    db.execute(update(Conversation).where(Conversation.id == id, Conversation.deleted_at.is_(None))
        .values(title=body.title, title_mode='manual', updated_at=now()))
    db.commit()
    db.expire_all()
    return summary(get_conversation(db, id))


@router.delete("/{id}")
def delete_conversation(id: str, db=Depends(get_db)):
    get_conversation(db, id)
    db.execute(update(Conversation).where(Conversation.id == id).values(deleted_at=now(), revision=Conversation.revision+1))
    db.commit()
    return {"ok": True}


@router.post("/{id}/restore")
def restore_conversation(id: str, db=Depends(get_db)):
    row = db.get(Conversation, id)
    if not row:
        raise HTTPException(404, "对话不存在")
    db.execute(update(Conversation).where(Conversation.id == id).values(deleted_at=None, updated_at=now()))
    db.commit()
    db.expire_all()
    return {**summary(get_conversation(db, id)), "messages": get_conversation(db, id).messages}
