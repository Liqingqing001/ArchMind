"""Task and route selection over the same published facts shown in the console."""
import json
import re
from pathlib import Path

POLICY=json.loads((Path(__file__).resolve().parent.parent/'data/recommendation-policy.json').read_text())
NEGATION=r'(?:不需要|不要|不想|不用|不做|不考虑|无需|禁止|不允许|不生成|不涉及|而不是)[^，。；;！!？?\n]*'


def positive(text):
    text=re.sub(r'(但|而是|只做|只想|只要|只用|只写|只生成|只理解|改成)',r'，\1',text.lower())
    return re.sub(NEGATION,' ',text)


def selection_context(workflow):
    fields=workflow.get('fields',{})
    goal=fields.get('goal',{}).get('value','')
    intent=positive(goal+'，'+fields.get('requirements',{}).get('value',''))
    capabilities=[c for c in POLICY['capabilities'] if any(t in intent for t in c['cues'])]
    priorities=['video_generation','image_generation','audio_generation','image_understanding','audio_understanding','video_understanding','text_understanding','text_generation','code_generation','retrieval']
    capabilities.sort(key=lambda c:priorities.index(c['id']))
    delivery=fields.get('delivery',{}).get('value','')
    cleaned=positive(delivery)
    negatives=re.findall(NEGATION,delivery.lower())
    denied={r['id'] for r in POLICY['routes'] if any(any(t in n for t in r['cues']) for n in negatives)}
    explicit=[r['id'] for r in POLICY['routes'] if any(t in cleaned for t in r['cues'])]
    allowed=[r['id'] for r in POLICY['routes'] if r['id'] not in denied and (not explicit or re.search('无偏好|不限|随意',cleaned) or r['id'] in explicit)]
    offline=bool(re.search('不出网|不上网|完全离线|数据不外传|禁止出网|不得出网',fields.get('requirements',{}).get('value','')))
    if offline:allowed=[r for r in allowed if r=='local']
    return dict(purpose='模型、项目与成本方向选型',capabilities=[dict(id=c['id'],label=c['label']) for c in capabilities],routes=[{**r,**(dict(name='本地离线部署',cost='本地硬件、电费与维护；数据不得出网，不使用云GPU、远程API或在线平台。') if offline else {})} for r in POLICY['routes'] if r['id'] in allowed],needs_website='code_generation' in [c['id'] for c in capabilities],offline=offline,candidate_note='下列是按能力与路线匹配的候选，不是效果、最低价、硬件兼容或账户可用性的保证。',output='先主推一句，再比较适用路线：模型/项目、费用结构、关键代价、官方链接。')


def rank_recommendations(rows,entities,categories,links,workflow,prompt):
    context=selection_context(workflow)
    if not categories or not context['capabilities'] or context['capabilities'][0]['id']=='retrieval':return None
    cap_ids=[c['id'] for c in context['capabilities']]
    primary=next(c for c in POLICY['capabilities'] if c['id']==cap_ids[0])
    routes=[r['id'] for r in context['routes']]
    if not routes:return []
    cats={c['id']:c for c in categories}
    grouped={}
    for r in rows:
        if not r.get('is_demo') and r['entity_kind']!='vendor':grouped.setdefault(r['entity_id'],[]).append(r)
    referenced=workflow.get('fields',{}).get('goal',{}).get('value','')+' '+prompt
    candidates=[]
    for eid,facts in grouped.items():
        name=facts[0]['entity_name'];kind=facts[0]['entity_kind']
        named=name.lower() in referenced.lower()
        labels=[]
        for link in links:
            if link['entity_id']!=eid:continue
            category=link['category_id'];visited=set()
            while category in cats and category not in visited:
                visited.add(category);labels.append(cats[category]['name']);category=cats[category].get('parent_id')
        inactive=any(f['key'] in ['接入状态','文档状态','开放状态'] and re.search('legacy|停止服务|已关闭|已下线|不再向新客户|停止支持新购',f['value'],re.I) for f in facts)
        if inactive and not named:continue
        tool=next((t for t in POLICY['platforms'] if t['name']==name),None)
        matches=[]
        if kind=='model':
            for cap in POLICY['capabilities']:
                if cap['id'] not in cap_ids:continue
                matching=any(c in labels for c in cap['categories']) or cap['id']=='code_generation' and name in POLICY['exact_code_models']
                if matching and not (cap['id']=='text_generation' and 'code_generation' not in cap_ids and name not in cap['preferred_models'] and any(c in labels for c in cap['exclude_categories'])):matches.append(cap['id'])
            if not matches and not named:continue
            local=any(f['key']=='官方下载入口' for f in facts)
            candidate_routes=['local' if local else 'api']
            role='model'
        elif tool:
            matches=[c for c in cap_ids if c in tool['capabilities']]
            if not matches:continue
            candidate_routes=tool['routes'];role=tool['role']
        else:continue
        candidate_routes=[r for r in candidate_routes if r in routes]
        if named and (inactive or not candidate_routes or not matches):
            candidate_routes=['reference'];matches=[primary['id']]
        if not candidate_routes:continue
        score=(40-POLICY['platforms'].index(tool) if tool else 0)+(1000 if name.lower() in referenced.lower() else 0)+(100-primary['preferred_models'].index(name)*10 if name in primary['preferred_models'] else 0)-(25 if '系列' in name else 0)
        candidates.append(dict(id=eid,name=name,facts=facts,capabilities=matches,routes=candidate_routes,role=role,score=score))
    candidates.sort(key=lambda e:(-e['score'],e['name']))
    groups=[]
    def group(route,role,cap=primary['id']):
        group=[e for e in candidates if route in e['routes'] and e['role']==role and cap in e['capabilities']]
        if group:groups.append((route,group))
    group('reference','model')
    for route in routes:group(route,'platform' if route=='platform' else 'model')
    if 'local' in routes:group('local','runtime')
    elif 'api' in routes:group('api','application')
    if context['needs_website'] and 'api' in routes:group('api','hosting','code_generation')
    if 'code_generation' in cap_ids and primary['id']!='code_generation' and 'platform' in routes:group('platform','platform','code_generation')
    if 'api' in routes:group('api','gateway')
    chosen=[];seen=set()
    for route,grouped_candidates in groups:
        entity=next((e for e in grouped_candidates if e['id'] not in seen),None)
        if not entity or len(chosen)>=12:continue
        seen.add(entity['id']);facts=entity['facts']
        constraint=next((f for key in POLICY['constraint_fields'] for f in facts if f['key']==key),None)
        feature=next((f for key in POLICY['feature_fields'] for f in facts if f['key']==key),facts[0])
        cost=next((f for key in POLICY['cost_fields'] for f in facts if f['key']==key),None)
        selected=[]
        for f in [constraint,feature,cost,*facts]:
            if f and f not in selected:selected.append(f)
            if len(selected)==2:break
        for f in selected:chosen.append(dict(**f,task=primary['label'],recommendation_route=route,recommendation_role=entity['role']))
    return [dict(**r,citation_id=f'K{i+1}') for i,r in enumerate(chosen[:12])]
