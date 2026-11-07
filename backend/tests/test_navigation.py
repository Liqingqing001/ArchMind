from sqlalchemy import select
from app.models import Category, Entity, EntityCategory, Relation


def add_model(db, name, vendor=None, category='大语言模型'):
    root=db.scalar(select(Category).where(Category.name=='AI 模型'))
    if not root:
        root=Category(name='AI 模型');db.add(root);db.flush()
    kind=db.scalar(select(Category).where(Category.name==category,Category.parent_id==root.id))
    if not kind:
        kind=Category(name=category,parent_id=root.id);db.add(kind);db.flush()
    model=Entity(name=name,kind='model');db.add(model);db.flush()
    db.add(EntityCategory(entity_id=model.id,category_id=kind.id))
    if vendor:
        db.add(Relation(from_id=vendor.id,to_id=model.id,relation='开发模型'))
    db.commit()
    return model


def node(data,path):
    return next(n for n in data['nodes'] if n['path']==path)


def test_navigation_groups_models_by_capability_type_and_vendor(client,db):
    vendor=Entity(name='OpenAI',kind='vendor');db.add(vendor);db.flush()
    first=add_model(db,'A',vendor);second=add_model(db,'B',vendor)
    data=client.get('/api/knowledge/navigation').json()
    assert [n['name'] for n in data['nodes'] if n['parent_id'] is None]==['生成类','理解类','检索与表征','工具与平台','其他知识']
    factory=node(data,['生成类','大语言模型','OpenAI'])
    assert set(factory['entity_ids'])=={first.id,second.id}
    assert set(factory['direct_entity_ids'])=={first.id,second.id}
    assert node(data,['理解类','理解文字','OpenAI'])['entity_ids']==factory['entity_ids']
    assert node(data,['理解类','理解视频'])['entity_ids']==[]
    assert client.get('/api/entities').json()[0]['vendor_name']=='OpenAI'


def test_unknown_vendor_is_explicit_and_vector_model_is_not_inferred_to_be_a_chat_model(client,db):
    unknown=add_model(db,'未标注厂商的模型')
    vector=add_model(db,'text-embedding-3-small',category='文本嵌入')
    data=client.get('/api/knowledge/navigation').json()
    assert unknown.id in node(data,['生成类','大语言模型','厂家待核验'])['entity_ids']
    assert vector.id in node(data,['检索与表征','文本嵌入','厂家待核验'])['entity_ids']
    assert vector.id not in node(data,['理解类','理解文字'])['entity_ids']


def test_multimodal_memberships_are_unique_and_other_entities_still_have_a_path(client,db):
    vendor=Entity(name='Mistral',kind='vendor');db.add(vendor);db.flush()
    model=add_model(db,'多能力模型',vendor)
    visual=Category(name='视觉理解');db.add(visual);db.flush()
    db.add(EntityCategory(entity_id=model.id,category_id=visual.id))
    framework=Entity(name='框架示例',kind='framework');db.add(framework);db.commit()
    data=client.get('/api/knowledge/navigation').json()
    assert node(data,['生成类','大语言模型','Mistral AI'])['entity_ids']==[model.id]
    assert node(data,['理解类'])['entity_ids'].count(model.id)==1
    all_members={id for n in data['nodes'] for id in n['direct_entity_ids']}
    assert {model.id,vendor.id,framework.id}<=all_members
