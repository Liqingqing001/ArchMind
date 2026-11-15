"""Bounded BYOK web retrieval; never promotes search excerpts into published facts."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from typing import Literal
from urllib.parse import urlsplit,urlunsplit,unquote
import httpx
from pydantic import BaseModel,ConfigDict,Field,SecretStr,model_validator
from .db import now
from .collector import fetch as fetch_public_page, normalized

POLICY=json.loads((Path(__file__).resolve().parent.parent/'data/web-search-policy.json').read_text(encoding='utf-8'))


class SearchConnection(BaseModel):
    model_config=ConfigDict(extra='forbid')
    provider:Literal['tavily','bocha']='bocha'
    api_key:SecretStr=Field(default=SecretStr(''),max_length=4096)
    enabled:bool=False

    @model_validator(mode='after')
    def require_key(self):
        self.api_key=SecretStr(self.api_key.get_secret_value().strip())
        if self.enabled and not self.api_key.get_secret_value():
            raise ValueError('启用联网检索需要填写搜索服务 API Key')
        return self


def disabled_search():
    return dict(status='disabled',provider=None,searched_at=None,queries=[],results=[],errors=[])


def reusable_search(web, workflow):
    if workflow.get('response_mode') != 'explanation' or not web or web.get('status') not in ('ok','partial') or not web.get('results'):
        return False
    try:
        at = datetime.fromisoformat(web['searched_at'].replace('Z','+00:00'))
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - at
        return timedelta(0) <= age <= timedelta(minutes=POLICY['reuse_minutes'])
    except (ValueError, TypeError, KeyError):
        return False


def redact(text,secrets):
    for key in secrets:
        if len(key)>=4:
            text=text.replace(key,'[已移除密钥]')
    return text


def search_queries(workflow,prompt,secrets=()):
    def clean(value):
        text=redact(value,secrets)
        text=re.sub(r'https?://\S+|[\w.+-]+@[\w.-]+|(?:\+?86)?1[3-9]\d{9}',' ',text)
        return re.sub(r'\s+',' ',text).strip()
    goal=clean(workflow['fields'].get('goal',{}).get('value') or prompt)[:110]
    current=clean(prompt)
    hint=next((h for h in POLICY['query_hints'] if any(c in goal.lower() for c in h['cues'])),{})
    if hint.get('queries'):
        detail = clean(workflow['fields'].get('requirements',{}).get('value',''))[:35]
        follow = '' if current == goal or re.search(r'^(?:生成|确认|可以|好的|好|开始|现在生成|请续写)',current) else current[:35]
        subject = ' '.join(dict.fromkeys(s for s in [goal[:65], follow, detail] if s))
        return [q.replace('{goal}', subject)[:300] for q in hint['queries']][:POLICY['max_queries']]
    query=goal+' '+hint['discovery'] if hint.get('discovery') else goal+' 官方 文档 '+hint.get('topic','技术选型')
    follow='' if re.search(r'^(?:生成|确认|可以|好的|好|开始|现在生成|请续写)',current) else current[:70]
    return list(dict.fromkeys(q.strip()[:190] for q in [query,goal+' '+(follow or hint.get('details') or '部署 计费 使用限制 官方')]))[:POLICY['max_queries']]


def safe_web_url(value,secrets=()):
    if not isinstance(value,str) or len(value)>2000:
        return None
    try:
        u=urlsplit(value);host=u.hostname or ''
        if u.scheme!='https' or not host or u.username or u.password or host=='localhost' or host.endswith(('.local','.internal')) or re.fullmatch(r'[\d.]+',host) or ':' in host:
            return None
        if any(len(key)>=4 and (key in value or key in unquote(value)) for key in secrets):
            return None
        return urlunsplit((u.scheme,u.netloc,u.path or '/',u.query,''))
    except ValueError:
        return None


def request_parts(connection,query):
    payload=dict(query=query,search_depth='basic',max_results=4,include_answer=False,include_raw_content='text',auto_parameters=False) if connection.provider=='tavily' else dict(query=query,freshness='noLimit',summary=True,count=4)
    domains = re.findall(r'site:([a-z0-9.-]+)', query)
    if domains and connection.provider == 'tavily':
        payload['include_domains'] = domains
    return POLICY['providers'][connection.provider]['url'],{'Authorization':'Bearer '+connection.api_key.get_secret_value(),'Content-Type':'application/json'},payload


def parse_results(provider,data,at,secrets=()):
    if provider=='tavily':
        rows=data.get('results') if isinstance(data,dict) else None
    else:
        if not isinstance(data,dict) or str(data.get('code',200))!='200':
            raise ValueError('检索服务返回业务错误，请检查密钥或额度')
        root=data.get('data') or data
        pages=root.get('webPages') if isinstance(root,dict) else None
        rows=pages.get('value') if isinstance(pages,dict) else None
    if not isinstance(rows,list):
        raise ValueError('检索服务返回格式无效')
    results=[]
    for row in rows:
        if not isinstance(row,dict):
            continue
        url=safe_web_url(row.get('url'),secrets)
        if not url:
            continue
        raw=row.get('raw_content') if isinstance(row.get('raw_content'),str) and row['raw_content'].strip() else None
        summary=row.get('summary') or row.get('content') or row.get('snippet')
        text='搜索摘要：'+summary[:600]+'\n页面摘录：'+raw[:POLICY['excerpt_chars']-620] if raw and isinstance(summary,str) and summary.strip() else raw or summary
        if not isinstance(text,str) or not text.strip():
            continue
        host=urlsplit(url).hostname
        title=row.get('title') or row.get('name')
        published=row.get('published_date') or row.get('datePublished')
        results.append(dict(citation_id='',title=redact(title if isinstance(title,str) else host,secrets)[:180],url=url,excerpt=redact(text,secrets)[:POLICY['excerpt_chars']],searched_at=at,published_at=published[:60] if isinstance(published,str) and re.match(r'^\d{4}-\d{2}-\d{2}',published) else None,content_kind='page_excerpt' if raw else 'search_summary',source_type='official' if any(host==d or host.endswith('.'+d) for d in POLICY['official_domains']) else 'web'))
    return results


def read_official_page(row, secrets):
    """Read only allowlisted public HTTPS results, without provider credentials."""
    url = safe_web_url(row['url'], secrets)
    host = urlsplit(url).hostname if url else ''
    if not host or not any(host == d or host.endswith('.'+d) for d in POLICY['official_domains']):
        raise ValueError('非官网页面不自动读取')
    raw, _ = fetch_public_page(SimpleNamespace(url=url, etag=None, last_modified=None))
    content = normalized(raw) if raw else ''
    if len(content.strip()) < 120:
        raise ValueError('页面正文不足')
    return {**row, 'excerpt':redact(content,secrets)[:POLICY['excerpt_chars']], 'content_kind':'page_excerpt', 'read_at':now()}


def read_official_results(results, secrets):
    targets = [(i,row) for i,row in enumerate(results) if row['source_type']=='official' and row['content_kind']=='search_summary'][:3]
    failures = 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [(i,pool.submit(read_official_page,row,secrets)) for i,row in targets]
        for i,future in futures:
            try:
                results[i] = future.result()
            except (ValueError, OSError, httpx.HTTPError, TimeoutError):
                failures += 1
    return dict(attempted=len(targets), succeeded=len(targets)-failures, failed=failures)


def request_json(connection,query):
    url,headers,payload=request_parts(connection,query)
    try:
        with httpx.Client(timeout=httpx.Timeout(20,connect=8),follow_redirects=False) as client:
            with client.stream('POST',url,headers=headers,json=payload) as response:
                if not response.is_success:
                    raise ValueError('检索服务拒绝访问，请检查搜索 Key 和权限' if response.status_code in [401,403] else '检索额度不足或请求过多' if response.status_code==429 else f'检索服务返回 HTTP {response.status_code}')
                chunks=[];size=0
                for chunk in response.iter_bytes():
                    size+=len(chunk)
                    if size>2*1024*1024:
                        raise ValueError('检索响应过大')
                    chunks.append(chunk)
                try:
                    return json.loads(b''.join(chunks))
                except (ValueError,UnicodeError):
                    raise ValueError('检索服务未返回有效 JSON')
    except httpx.TimeoutException:
        raise ValueError('联网检索超时')
    except httpx.HTTPError:
        raise ValueError('无法连接检索服务，请检查网络')


def search_web(connection,workflow,prompt,secrets=()):
    if not connection or not connection.enabled:
        return disabled_search()
    secrets=[connection.api_key.get_secret_value(),*secrets]
    queries=search_queries(workflow,prompt,secrets);at=now();batches=[];errors=[]
    with ThreadPoolExecutor(max_workers=POLICY['max_queries']) as pool:
        futures=[pool.submit(request_json,connection,q) for q in queries]
        for future in futures:
            try:
                batches.append(parse_results(connection.provider,future.result(),at,secrets))
            except (ValueError,TypeError):
                errors.append('联网检索失败，请检查搜索服务密钥、额度或网络')
    unique={}
    ordered=[sorted(batch,key=lambda r:r['source_type']!='official') for batch in batches]
    for i in range(max([len(batch) for batch in ordered],default=0)):
        for batch in ordered:
            if i<len(batch):
                row=batch[i];unique.setdefault(row['url'],row)
    results=sorted(unique.values(),key=lambda r:r['source_type']!='official')[:POLICY['max_results']]
    for i,row in enumerate(results):
        row['citation_id']=f'W{i+1}'
    reading = read_official_results(results,secrets) if any('site:' in q for q in queries) else None
    return dict(status=('partial' if results else 'error') if errors else 'ok' if results else 'empty',provider=connection.provider,searched_at=at,queries=queries,results=results,errors=errors, **({'page_reading':reading} if reading else {}))


def search_warnings(web):
    warnings = ['尚未启用联网检索，本轮仅参考库内资料，未核验最新能力与价格；可在对话顶部连接搜索服务。'] if web['status']=='disabled' else ['联网检索失败，本轮仅使用库内资料；没有取得实时网页证据。',*web['errors']] if web['status']=='error' else ['部分联网检索失败，网页依据不完整。',*web['errors']] if web['status']=='partial' else ['本轮联网未找到可用网页，不代表相关产品不存在。'] if web['status']=='empty' else []
    if web['results'] and not any(r['source_type']=='official' for r in web['results']):
        warnings.append('本轮未取得官网依据，候选能力与价格仍待官方核验。')
    if web['results'] and all(r['content_kind']=='search_summary' for r in web['results']):
        warnings.append('当前取得的是搜索摘要，尚未读取官网正文；不能据此确认完整参数或价格。')
    if web.get('page_reading',{}).get('failed'):
        warnings.append('部分官网正文读取失败，已保留搜索摘要；这些条目的完整参数仍待核验。')
    return warnings
