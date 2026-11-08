"""User-endorsed scenario references; never becomes an approved product fact."""
import json
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .db import get_db, now
from .models import Conversation, SolutionCase
from .recommendations import positive

POLICY = json.loads((Path(__file__).resolve().parent.parent/'data/solution-case-policy.json').read_text())
router = APIRouter(prefix='/api', tags=['solution cases'])


class FeedbackInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rating: Literal['good', 'okay', 'bad']


def case_scene(fields):
    goal = positive(fields.get('goal', {}).get('value', ''))
    return next((s for s in POLICY['scenes'] if any(c in goal for c in s['cues'])), POLICY['fallback'])


def eligible_solution(turn):
    result = turn.get('result') or {}
    return turn.get('role') == 'assistant' and result.get('workflow', {}).get('phase') == 'generated' and result.get('finish_reason') == 'stop' and bool(turn.get('content', '').strip())


def solution_snapshot(conversation, message_id):
    index = next((i for i, m in enumerate(conversation.messages) if m['id'] == message_id), -1)
    if index < 0 or not eligible_solution(conversation.messages[index]):
        raise HTTPException(409, '只能评价已完成的方案；请先补完被截断的内容。')
    turn = conversation.messages[index]; turns = [turn]; result = turn['result']
    for i in range(index-2, -1, -2):
        previous = conversation.messages[i]; prev = previous.get('result') or {}
        if prev.get('finish_reason') != 'length' or not result.get('trace_id') or prev.get('trace_id') != result['trace_id']:
            break
        turns.insert(0, previous)
    fields = result['workflow'].get('fields', {}); scene = case_scene(fields); references = {}
    for item in turns:
        for source in [*item['result'].get('citations', []), *item['result'].get('web_citations', [])]:
            url = source.get('source_url') or source.get('url') or ''
            if not url.lower().startswith('https://'):
                continue
            references[(source['citation_id'], url)] = dict(citation_id=source['citation_id'], title=source.get('entity_name') or source.get('title'), url=url,
                excerpt=source.get('evidence') or source.get('excerpt') or source.get('value') or '', kind='web' if source['citation_id'].startswith('W') else 'knowledge',
                version=source.get('version') or None, snapshot_id=source.get('snapshot_id') or None, searched_at=source.get('searched_at') or None)
    return dict(conversation_id=conversation.id, message_id=message_id, title=conversation.title,
        scene_id=scene['id'], scene_name=scene['name'], answer='\n\n'.join(m['content'] for m in turns), brief=fields,
        references=list(references.values()), trace_id=result.get('trace_id', ''), model=result.get('model', ''),
        is_demo=result.get('model') == '本地交互演示', evidence_status='user_endorsed_unverified')


def feedback_view(row):
    return dict(rating=row.rating, case_id=row.id, saved=row.rating != 'bad', scene_id=row.scene_id, scene_name=row.scene_name)


def feedback_for(db, conversation_id):
    return {r.message_id: feedback_view(r) for r in db.scalars(select(SolutionCase).where(SolutionCase.conversation_id == conversation_id))}


@router.post('/conversations/{conversation_id}/messages/{message_id}/feedback')
def save_feedback(conversation_id: str, message_id: str, body: FeedbackInput, db=Depends(get_db)):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.deleted_at.is_(None)).execution_options(populate_existing=True))
    if not conversation or conversation.deleted_at:
        raise HTTPException(404, '对话不存在或已删除')
    snapshot = solution_snapshot(conversation, message_id)
    row = db.scalar(select(SolutionCase).where(SolutionCase.conversation_id == conversation_id, SolutionCase.message_id == message_id))
    if row is None:
        row = SolutionCase(**snapshot, rating=body.rating)
        db.add(row)
    else:
        row.rating = body.rating; row.updated_at = now()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '评价已在另一页面更新，请刷新后重试')
    return feedback_view(row)


@router.get('/solution-cases')
def list_cases(scene_id: str = '', db=Depends(get_db)):
    query = select(SolutionCase).where(SolutionCase.rating.in_(['good', 'okay']))
    if scene_id:
        query = query.where(SolutionCase.scene_id == scene_id)
    return [{c.name: getattr(row, c.name) for c in row.__table__.columns} for row in db.scalars(query.order_by(SolutionCase.updated_at.desc()).limit(200))]


def case_references(db, workflow, conversation_id=None):
    scene = case_scene(workflow.get('fields', {}))
    query = select(SolutionCase).where(SolutionCase.rating.in_(['good', 'okay']), SolutionCase.is_demo.is_(False), SolutionCase.scene_id == scene['id'])
    if conversation_id:
        query = query.where(SolutionCase.conversation_id != conversation_id)
    return [dict(id=r.id, title=r.title, scene=r.scene_name, brief=r.brief, answer=r.answer[:5000], references=r.references,
        saved_at=r.updated_at, status='用户认可的历史参考，未经实测；引用、价格和适用条件需重新核验')
        for r in db.scalars(query.order_by(SolutionCase.updated_at.desc()).limit(2))]
