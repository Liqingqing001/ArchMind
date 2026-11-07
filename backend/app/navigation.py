"""Capability/type/vendor navigation over existing entities and category metadata."""
import json
from pathlib import Path
from sqlalchemy import select
from .models import Entity, EntityCategory, Category, Relation

POLICY = json.loads((Path(__file__).resolve().parent.parent / 'data/navigation-policy.json').read_text(encoding='utf-8'))


def vendor_names(entities, relations):
    by_id = {entity.id: entity for entity in entities}
    names = {}
    for relation in relations:
        if relation.relation not in POLICY['vendor_relations']:
            continue
        start, end = by_id.get(relation.from_id), by_id.get(relation.to_id)
        if not start or not end:
            continue
        if start.kind == 'vendor':
            names.setdefault(end.id, start.name)
        elif end.kind == 'vendor':
            names.setdefault(start.id, end.name)
    for entity in entities:
        name = names.get(entity.id) or POLICY['model_vendors'].get(entity.name, '')
        names[entity.id] = POLICY['vendor_aliases'].get(name, name)
    return names


def knowledge_navigation(db):
    entities = list(db.scalars(select(Entity).order_by(Entity.name)))
    categories = {c.id: c for c in db.scalars(select(Category))}
    links = {}
    for link in db.scalars(select(EntityCategory)):
        links.setdefault(link.entity_id, []).append(link.category_id)
    vendors = vendor_names(entities, list(db.scalars(select(Relation))))
    nodes = {}
    def key(path):
        return 'nav:' + json.dumps(path, ensure_ascii=False, separators=(',', ':'))
    def ensure(path, order=100, description=''):
        id = key(path)
        if id not in nodes:
            nodes[id] = dict(id=id, name=path[-1], parent_id=key(path[:-1]) if len(path)>1 else None, path=path, entity_ids=[], direct_entity_ids=[], order=order, description=description)
        return nodes[id]
    for i, root in enumerate(POLICY['roots']):
        ensure([root['name']], i, root['description'])
        for j, child in enumerate(root['children']):
            ensure([root['name'], child], j)
    for entity in entities:
        tags = set()
        for cid in links.get(entity.id, []):
            visited = set()
            while cid in categories and cid not in visited:
                visited.add(cid)
                category = categories[cid]
                tags.add(category.name)
                cid = category.parent_id
        vendor = vendors[entity.id] or '厂家待核验'
        if entity.is_demo:
            paths = [['其他知识', '演示条目']]
        elif entity.kind == 'vendor':
            paths = [['其他知识', '厂商与组织']]
        elif entity.kind == 'solution':
            paths = [['其他知识', '行业方案', vendor]]
        elif entity.kind == 'model':
            rules = [rule for rule in POLICY['model_rules'] if rule['category'] in tags]
            if any(rule.get('exclusive') for rule in rules):
                rules = [rule for rule in rules if rule.get('exclusive')]
            paths = [path + [vendor] for rule in rules for path in rule['paths']] or [['其他知识', '待整理模型', vendor]]
        else:
            services=[r for r in POLICY.get('service_rules',[]) if r['category'] in tags]
            paths=[r['path']+[vendor] for r in services] if services else [POLICY['kind_paths'].get(entity.kind, ['其他知识', '待整理模型']) + [vendor]]
        for path in paths:
            for i in range(len(path)):
                node = ensure(path[:i+1])
                if entity.id not in node['entity_ids']:
                    node['entity_ids'].append(entity.id)
            node = ensure(path)
            if entity.id not in node['direct_entity_ids']:
                node['direct_entity_ids'].append(entity.id)
    return dict(version=POLICY['version'], roots=[key([root['name']]) for root in POLICY['roots']], nodes=list(nodes.values()))
