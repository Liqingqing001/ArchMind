from .solution_cases import case_references, feedback_for
"""Conversational solutions grounded in the same published facts as the console."""
import json
import re
from typing import Literal
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from sqlalchemy import select, update, case
from .db import get_db, now
from .models import Entity, Fact, Snapshot, Source, Trace, Category, EntityCategory, Conversation, uid
from .collector import validate_url
from .provider_protocols import request_parts, response_text
from .conversations import get_conversation, summary
from .web_search import SearchConnection, search_web, disabled_search, search_warnings, POLICY as SEARCH_POLICY, request_json as search_request_json, parse_results as parse_search_results
from .solution_flow import POLICY, terms, rank_knowledge, previous_workflow, extraction_messages, apply_extraction, is_confirmation, clarification, editorial_guide, conversation_title
from .recommendations import selection_context

router = APIRouter(prefix="/api/agent", tags=["solution-agent"])


class ModelConnection(BaseModel):
    base_url: str = Field(min_length=8, max_length=2000)
    api_key: SecretStr = Field(min_length=1, max_length=4096)
    model: str = Field(min_length=1, max_length=200)
    token_parameter: Literal["max_tokens", "max_completion_tokens"] = "max_tokens"
    protocol: Literal["chat_completions", "responses", "anthropic"] = "chat_completions"
    max_output_tokens: int = Field(default=2400, ge=256, le=8192)

    @field_validator("base_url")
    @classmethod
    def endpoint(cls, value):
        value = value.strip().rstrip("/")
        validate_url(value)
        if "?" in value or "#" in value:
            raise ValueError("请填写公开 HTTPS 地址，不要包含查询参数或片段")
        return value

    @field_validator("api_key", mode="before")
    @classmethod
    def trim_key(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def normalize_endpoint(self):
        for suffix, protocol in [("/chat/completions", "chat_completions"), ("/responses", "responses"), ("/messages", "anthropic")]:
            if self.base_url.endswith(suffix):
                self.base_url = self.base_url[:-len(suffix)]
                self.protocol = protocol
                break
        if self.base_url in ("https://api.openai.com", "https://api.anthropic.com"):
            self.base_url += "/v1"
        return self

    @field_validator("model")
    @classmethod
    def model_name(cls, value):
        if not value.strip():
            raise ValueError("模型名称不能为空")
        return value.strip()


class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=12000)


class ChatRequest(BaseModel):
    connection: ModelConnection
    messages: list[Message] = Field(min_length=1, max_length=19)
    conversation_id: str | None = Field(default=None, max_length=36)
    revision: int | None = Field(default=None, ge=0)
    action: Literal["message", "generate", "continue"] = "message"
    web_search: SearchConnection | None = None

    @model_validator(mode="after")
    def conversation(self):
        if len(self.messages) % 2 != 1 or any(m.role != ("user" if i % 2 == 0 else "assistant") for i, m in enumerate(self.messages)):
            raise ValueError("对话应由用户消息开始、交替发送并以用户消息结束")
        if not self.messages[-1].content.strip() or sum(len(m.content) for m in self.messages) > 48000:
            raise ValueError("需求不能为空，或对话过长，请开始新对话")
        if self.conversation_id and (self.revision is None or len(self.messages) != 1):
            raise ValueError("持久对话需要当前版本号和一条新的用户消息")
        return self


def retrieve_context(db, messages, workflow=None):
    workflow = workflow or previous_workflow([])
    if not workflow['fields'].get('goal'):
        workflow['fields']['goal'] = {'value':' '.join(m.content for m in messages if m.role=='user'),'evidence':''}
    joined = db.execute(select(Fact, Entity, Snapshot, Source)
        .join(Entity, Fact.entity_id == Entity.id).join(Snapshot, Fact.snapshot_id == Snapshot.id)
        .join(Source, Snapshot.source_id == Source.id)
        .where(Fact.valid_to.is_(None), Entity.is_demo.is_(False), Source.is_demo.is_(False))).all()
    rows = [dict(fact_id=f.id,entity_id=e.id,entity_name=e.name,entity_kind=e.kind,key=f.key,value=f.value[:3000],evidence=f.evidence[:1500],version=f.version,snapshot_id=sn.id,snapshot_hash=sn.content_hash,source_id=s.id,source_url=s.url,source_name=s.name,fetched_at=sn.fetched_at,valid_from=f.valid_from,is_demo=False) for f,e,sn,s in joined]
    results = rank_knowledge(rows,[dict(id=e.id,description=e.description) for e in db.scalars(select(Entity))],
        [dict(id=c.id,name=c.name,parent_id=c.parent_id) for c in db.scalars(select(Category))],
        [dict(entity_id=l.entity_id,category_id=l.category_id) for l in db.scalars(select(EntityCategory))],workflow,messages[-1].content)
    trace = Trace(query=messages[-1].content,caller='agent',request_context={'purpose':'solution_chat','method':'capability_routes_v1','selection':selection_context(workflow),'include_demo':False,'goal':workflow['fields']['goal']['value'],'scene':workflow['scene']},results=results)
    db.add(trace);db.commit()
    return results,trace.id


class Completion(tuple):
    def __new__(cls, answer, finish, diagnostics):
        item = super().__new__(cls,(answer,finish))
        item.diagnostics = diagnostics
        return item


def complete(connection, messages, max_tokens=None):
    # Do not forward credentials across redirects, or expose upstream response bodies.
    try:
        validate_url(connection.base_url, resolve=True)
    except (ValueError, OSError):
        raise HTTPException(422, "模型地址无法解析，或不是允许访问的公开 HTTPS 地址")
    try:
        path, headers, payload = request_parts(connection, messages, max_tokens or connection.max_output_tokens)
        with httpx.Client(timeout=httpx.Timeout(75, connect=12), follow_redirects=False) as client:
            response = client.post(connection.base_url + path, headers=headers, json=payload)
            if response.status_code in (401, 403):
                raise HTTPException(502, "模型服务拒绝访问，请检查 API Key 和模型权限")
            if response.status_code == 429:
                raise HTTPException(502, "模型服务额度不足或请求过多，请检查额度后重试")
            if response.status_code == 404:
                raise HTTPException(502, "模型服务找不到接口或模型，请检查接口协议、Base URL 和模型 ID")
            if not response.is_success:
                raise HTTPException(502, f"模型服务返回 HTTP {response.status_code}，请检查接口协议、Base URL 和模型名称")
            if len(response.content) > 2 * 1024 * 1024:
                raise HTTPException(502, "模型回复超过大小限制")
            data = response.json()
            answer, finish = response_text(connection.protocol, data)
            usage = data.get('usage') if isinstance(data.get('usage'),dict) else {}
            safe_usage = {key:value for key,value in usage.items() if key in ['input_tokens','output_tokens','prompt_tokens','completion_tokens','total_tokens'] and isinstance(value,int) and value>=0}
            return Completion(answer, finish, {'finish_reason':finish,'usage':safe_usage,'output_limit':max_tokens or connection.max_output_tokens})
    except httpx.TimeoutException:
        raise HTTPException(504, "模型回复超时，请稍后重试或缩短需求")
    except httpx.HTTPError:
        raise HTTPException(502, "无法连接模型服务，请检查网络与 Base URL")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise HTTPException(502, "模型未返回文本正文，请检查接口协议；推理模型可尝试增大输出上限")


def complete_grounded(connection, messages, web, continuing=False):
    first = complete(connection, messages)
    repair = dict(attempted=False, adopted=False)
    web_ids = {row['citation_id'] for row in web['results']}
    def uses_web(answer):
        return bool(set(re.findall(r'\[(W\d+)\]', answer)) & web_ids)
    if not continuing and first[1] == 'stop' and web_ids and not uses_web(first[0]):
        repair['attempted'] = True
        try:
            revised = complete(connection, [*messages,
                dict(role='assistant',content=first[0]),
                dict(role='user',content=json.dumps(dict(REVISION_REQUEST=POLICY['grounding_repair_prompt']),ensure_ascii=False))])
            if revised[1] == 'stop' and uses_web(revised[0]):
                repair['adopted'] = True
                return revised, repair, []
        except HTTPException:
            pass
        return first, repair, ['已尝试补充网页整合，但未取得带有效网页引用的完整修订，保留首版方案；请核对下方网页或继续追问。']
    return first, repair, []


@router.post("/test")
def test_connection(connection: ModelConnection):
    complete(connection, [{"role": "user", "content": "Reply with OK."}], max_tokens=512)
    return {"ok": True, "model": connection.model, "protocol": connection.protocol, "base_url": connection.base_url}


@router.post('/search/test')
def test_search(connection:SearchConnection):
    if not connection.api_key.get_secret_value():
        raise HTTPException(422,'测试检索需要搜索 API Key')
    try:
        rows=parse_search_results(connection.provider,search_request_json(connection,'GPU 云服务器 官方文档'),now(),[connection.api_key.get_secret_value()])
    except (ValueError,TypeError):
        raise HTTPException(502,'检索测试失败，请检查搜索 Key、额度和网络')
    return {'ok':True,'count':len(rows),'provider':connection.provider}


@router.post("/chat")
def chat(body: ChatRequest, db=Depends(get_db)):
    conversation = None
    original_title = None
    messages = body.messages
    previous_turns = []
    if body.conversation_id:
        conversation = get_conversation(db, body.conversation_id)
        original_title = conversation.title
        if conversation.revision != body.revision:
            raise HTTPException(409, "对话已在另一页面更新，请重新打开后发送")
        previous_turns = list(conversation.messages)
        # Use only this conversation's server-side history, keeping complete pairs.
        history = previous_turns[-18:]
        while history and sum(len(m["content"]) for m in history) > 34000:
            history = history[2:]
        messages = [Message(role=m["role"], content=(m["content"][-12000:] if body.action=="continue" else m["content"][:12000])) for m in history] + body.messages
    previous = previous_workflow(previous_turns)
    user = body.messages[-1].content
    latest = next((m.get('result',{}) for m in reversed(previous_turns) if m['role']=='assistant'),{})
    continuing = body.action == 'continue'
    if continuing and (previous['phase']!='generated' or latest.get('finish_reason')!='length'):
        raise HTTPException(409,'当前没有需要续写的已确认方案')
    if is_confirmation(previous,user,body.action) or continuing:
        workflow = {**previous,'phase':'generated'}
    else:
        extraction_input = user
        if not previous['fields']:
            prior_users = [m['content'] for m in previous_turns if m['role']=='user'] or [m.content for m in body.messages[:-1] if m.role=='user']
            if prior_users:
                legacy='\n'.join(prior_users)
                extraction_input=legacy[:16000]+'\n'+legacy[-16000:]+'\n本轮：'+user
        try:
            extraction = complete(body.connection,extraction_messages(previous,extraction_input,previous_turns[-1]['content'] if previous_turns else ''),max_tokens=body.connection.max_output_tokens)
            if extraction[1]=='length':
                raise ValueError('需求识别达到输出上限，请提高输出上限后重试；尚未生成方案。')
            workflow = apply_extraction(previous,extraction[0],extraction_input)
        except ValueError as exc:
            raise HTTPException(502,str(exc))
    if workflow['phase'] != 'generated':
        result = {'answer':clarification(workflow),'citations':[],'retrieved':[],'trace_id':'','warnings':[], 'model':body.connection.model,'workflow':workflow,'finish_reason':'stop','diagnostics':{'stage':'requirements'}}
    else:
        if continuing:
            evidence,trace_id = latest.get('retrieved',[]),latest.get('trace_id','')
        else:
            evidence,trace_id = retrieve_context(db,messages,workflow)
        web=latest.get('web_search') or disabled_search() if continuing else search_web(body.web_search,workflow,user,[body.connection.api_key.get_secret_value()])
        if not continuing:
            trace=db.get(Trace,trace_id);trace.request_context={**trace.request_context,'web_search':web};db.commit()
        saved_cases = latest.get('saved_solution_cases', []) if continuing else case_references(db, workflow, body.conversation_id)
        if not continuing:
            trace=db.get(Trace,trace_id);trace.request_context={**trace.request_context,'saved_solution_cases':saved_cases};db.commit()
        scene = editorial_guide(workflow)
        prompt = [{'role':'system','content':POLICY['answer_prompt']+'\n'+SEARCH_POLICY['prompt']+('\n'+POLICY['continue_prompt'] if continuing else '')}]
        prompt.extend(m.model_dump() for m in messages[:-1])
        prompt.append({'role':'user','content':json.dumps({'BRIEF':workflow['fields'],'SELECTION_CONTEXT':selection_context(workflow),'EDITORIAL_GUIDE':scene,'SAVED_SOLUTION_CASES':saved_cases,'EVIDENCE_JSON':evidence,'WEB_EVIDENCE_JSON':web['results'],'WEB_SEARCH':{k:v for k,v in web.items() if k!='results'},'USER_INPUT':user},ensure_ascii=False)})
        completion, grounding_repair, grounding_warnings = complete_grounded(body.connection,prompt,web,continuing)
        answer,finish = completion
        requested = set(re.findall(r'\[([KW]\d+)\]',answer));valid = {e['citation_id'] for e in evidence+web['results']};warnings = search_warnings(web)+grounding_warnings
        if requested-valid:
            answer = re.sub(r'\[([KW]\d+)\]',lambda m:m.group(0) if m.group(1) in valid else '[引用待核验]',answer)
            warnings.append('模型返回了未知引用编号，已标记为待核验。')
        citations = [e for e in evidence if e['citation_id'] in requested]
        web_citations=[e for e in web['results'] if e['citation_id'] in requested]
        if not evidence and not web['results']:
            warnings.append('本轮没有匹配的已发布知识，产品结论需要进一步核验。')
        elif not citations and not web_citations:
            warnings.append('已检索资料，但模型没有标注有效引用，请核对来源。')
        if web['results'] and not web_citations:
            warnings.append('本轮检索到了网页，但正文未引用网页依据，不能视为已经结合联网结果；可展开下方资料核对或要求补充比较。')
        if finish=='content_filter':
            warnings.append('模型服务限制了本轮输出，请调整请求；这不是长度截断。')
        if finish=='length':
            warnings.append('模型因输出上限停止，当前回复不完整。可点击“续写剩余内容”；若仍截断，请提高输出上限。')
        result = dict(grounding_repair=grounding_repair,saved_solution_cases=saved_cases,web_search=web,web_citations=web_citations,answer=answer,citations=citations,retrieved=evidence,trace_id=trace_id,warnings=warnings,model=body.connection.model,workflow=workflow,finish_reason=finish,diagnostics=getattr(completion,'diagnostics',{'finish_reason':finish,'output_limit':body.connection.max_output_tokens}))
    if conversation:
        stamp = now()
        turns = previous_turns + [
            {"id": uid(), "role": "user", "content": body.messages[-1].content, "created_at": stamp},
            {"id": uid(), "role": "assistant", "content": result["answer"], "result": result, "created_at": stamp}]
        saved = db.execute(update(Conversation).where(Conversation.id == conversation.id,
            Conversation.revision == body.revision, Conversation.deleted_at.is_(None))
            .values(messages=turns, revision=body.revision+1, updated_at=stamp,
                title=case(((Conversation.title_mode == 'auto') & (Conversation.title == original_title), conversation_title(workflow)), else_=Conversation.title)))
        db.commit()
        if saved.rowcount != 1:
            raise HTTPException(409, "对话已更新或被删除，本次回复未覆盖已有记录，请重新打开对话")
        db.expire_all()
        current = get_conversation(db, body.conversation_id)
        result = {**result, "conversation": {**summary(current), "messages": current.messages, "feedback": feedback_for(db, current.id)}}
    return result
