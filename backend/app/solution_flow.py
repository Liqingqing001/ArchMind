"""Enforced consultation workflow; shared public policy with the Pages build."""
import copy
import json
import re
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parent.parent/'data/solution-policy.json').read_text(encoding='utf-8'))


def empty_workflow():
    return dict(version=1, phase='collecting', fields={}, scene=None, missing=[s['id'] for s in POLICY['slots']])


def previous_workflow(messages):
    return copy.deepcopy(next((m['result']['workflow'] for m in reversed(messages) if m.get('result', {}).get('workflow', {}).get('version') == 1), empty_workflow()))


def scene_for(text):
    return next((s for s in POLICY['scenes'] if any(c in text.lower() for c in s['cues'])), None)


def extraction_messages(previous, prompt, last_question=''):
    return [{'role':'system','content':POLICY['extraction_prompt']}, {'role':'user','content':json.dumps(dict(BRIEF=previous['fields'],LAST_QUESTION=last_question,USER_INPUT=prompt),ensure_ascii=False)}]


def apply_extraction(previous, raw, prompt):
    try:
        parsed = json.loads(re.sub(r'\s*```$', '', re.sub(r'^```(?:json)?\s*', '', raw.strip())))
    except (ValueError, TypeError):
        raise ValueError('需求识别未返回有效 JSON，请重试；尚未生成方案。')
    if not isinstance(parsed, dict) or not isinstance(parsed.get('updates'), dict):
        raise ValueError('需求识别格式无效，请重试；尚未生成方案。')
    result = copy.deepcopy(previous)
    changed = False
    for slot in POLICY['slots']:
        key = slot['id']
        if key not in parsed['updates']:
            continue
        entry = parsed['updates'][key]
        if not isinstance(entry,dict) or not isinstance(entry.get('value'),str) or not isinstance(entry.get('evidence'),str) or not entry['value'].strip() or len(entry['value'])>500 or not entry['evidence'].strip() or entry['evidence'] not in prompt:
            raise ValueError('需求识别缺少对应用户原文，请重试；尚未生成方案。')
        changed = changed or result['fields'].get(key,{}).get('value') != entry['value'].strip()
        result['fields'][key] = dict(value=entry['value'].strip(), evidence=entry['evidence'])
    scene = scene_for(result['fields'].get('goal',{}).get('value',''))
    if previous['fields'].get('goal') and previous['scene'] != (scene['id'] if scene else None):
        for key in ['scale','requirements']:
            if key not in parsed['updates']:
                result['fields'].pop(key,None)
    result['scene'] = scene['id'] if scene else None
    result['missing'] = [s['id'] for s in POLICY['slots'] if s['id'] not in result['fields']]
    result['phase'] = 'collecting' if result['missing'] else 'generated' if previous['phase']=='generated' and not changed else 'ready'
    return result


def is_confirmation(previous,prompt,action=None):
    return previous['phase']=='ready' and (action=='generate' or re.sub('[。！!？?]+$','',prompt.strip()) in POLICY['confirmations'])


def clarification(workflow):
    scene = next((s for s in POLICY['scenes'] if s['id']==workflow['scene']),{})
    summary = '\n'.join(f"- {s['label']}：{workflow['fields'][s['id']]['value']}" for s in POLICY['slots'] if s['id'] in workflow['fields'])
    if workflow['phase']=='ready':
        return f'我理解的需求是：\n\n{summary}\n\n现在为你生成简版方案吗？你也可以直接修改上面的条件。'
    questions = [scene.get('questions',{}).get(key) or next(s['question'] for s in POLICY['slots'] if s['id']==key) for key in workflow['missing'][:2]]
    return ('已记下你的条件。我们再确认关键条件：' if summary else '我们先把需求聊清楚。')+'\n\n'+'\n'.join(f'{i+1}. {q}' for i,q in enumerate(questions))


def terms(text):
    lowered = text.lower()
    result = set(re.findall(r'[a-z0-9][a-z0-9._+-]{1,}',lowered))
    for b in re.findall(r'[\u4e00-\u9fff]+',text):
        result.update(b[i:i+2] for i in range(len(b)-1))
    for key,values in POLICY['expansions'].items():
        if key in lowered:
            result.update(values)
    return sorted(result-set(POLICY['stop_terms']))


def rank_knowledge(rows,entities,categories,links,workflow,prompt):
    goal = workflow['fields'].get('goal',{}).get('value') or prompt
    scene = scene_for(goal)
    query = terms(goal+' '+prompt+' '+workflow['fields'].get('requirements',{}).get('value',''))
    platform = bool(re.search('现成|免部署|一站式',workflow['fields'].get('delivery',{}).get('value','')))
    by_id = {e['id']:e for e in entities}
    cats = {c['id']:c['name'] for c in categories}
    exact = [t for t in re.findall(r'[a-z0-9][a-z0-9._+-]{1,}',prompt.lower()) if t not in POLICY['stop_terms']]
    inactive = {r['entity_id'] for r in rows if re.search('legacy|不再向新客户|已下线|停止服务',r['value'],re.I) and r['entity_name'].lower() not in prompt.lower()}
    ranked = []
    for row in rows:
        if row.get('is_demo') or row['entity_kind']=='vendor' or row['entity_id'] in inactive:
            continue
        e = by_id.get(row['entity_id'],{})
        tags = ' '.join(cats.get(l['category_id'],'') for l in links if l['entity_id']==row['entity_id'])
        text = f"{row['entity_name']} {e.get('description','')} {row['key']} {row['value']} {tags}".lower()
        def matches_task(t):
            if 'categories' in t or 'entities' in t:
                labels=[cats.get(l['category_id'],'') for l in links if l['entity_id']==row['entity_id']]
                return (not t.get('kinds') or row['entity_kind'] in t['kinds']) and (any(c in labels for c in t.get('categories',[])) or row['entity_name'] in t.get('entities',[]))
            return any(term in text for term in t['terms'])
        task = (next((t['name'] for t in scene['tasks'] if row['entity_name'].lower() in t['terms']),None) or next((t['name'] for t in scene['tasks'] if matches_task(t)),'')) if scene else ''
        if task=='算力' and not re.search('gpu|自部署|本地',workflow['fields'].get('delivery',{}).get('value',''),re.I):
            continue
        if scene and not task:
            continue
        if platform and (task in ['算力','工作流'] or '开放权重' in e.get('description','') or re.search('官方下载入口|官方模型仓库',row['key'])):
            continue
        base = sum(2 for t in query if t in text)+sum(20 for t in exact if t in row['entity_name'].lower())
        score = base+int(bool(re.search('能力|用途|输入|部署|限制|兼容|价格',row['key'])))
        if base or task:
            ranked.append(dict(**row, task=task, score=score))
    ranked.sort(key=lambda r:(-r['score'],r['entity_name'],r['key']))
    chosen, counts = [], {}
    def add(r):
        if r in chosen or counts.get(r['entity_id'],0)>=2:
            return
        chosen.append(r)
        counts[r['entity_id']] = counts.get(r['entity_id'],0)+1
    if scene:
        for task in scene['tasks']:
            for r in [r for r in ranked if r['task']==task['name']][:2]:
                add(r)
    for r in ranked:
        if len(chosen)>=12:
            break
        add(r)
    return [dict(**{k:v for k,v in r.items() if k!='score'},citation_id=f'K{i+1}') for i,r in enumerate(chosen[:12])]


def editorial_guide(workflow):
    scene=next((s for s in POLICY['scenes'] if s['id']==workflow['scene']),None)
    if not scene:
        return None
    delivery=workflow['fields'].get('delivery',{}).get('value','')
    index=0 if re.search('现成|免部署|一站式',delivery) else 2 if re.search('gpu|自部署|本地',delivery,re.I) else 1 if re.search('api|工作流',delivery,re.I) else None
    routes=scene['routes'] if index is None else [scene['routes'][index] if index<len(scene['routes']) else scene['routes'][0]]
    return dict(name=scene['name'],description=scene['description'],routes=routes,gaps=scene['gaps'])
