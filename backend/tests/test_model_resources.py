from sqlalchemy import select
from app.models import Fact
from test_governance import setup_source, candidate, approve


def test_downloads_follow_published_knowledge_in_list_and_detail(client, db):
    download = "https://huggingface.co/example/model/tree/main"
    card = "https://huggingface.co/example/model"
    entity, _, snapshot = setup_source(db, f"{download}\n{card}\nApache-2.0\nMIT")
    change = candidate(client, entity, snapshot, download, download, "官方下载入口").json()
    assert client.get('/api/entities').json()[0]['model_resources'] is None
    assert approve(client, change['id']).status_code == 200
    for key, value in [("官方模型仓库", card), ("模型卡许可证", "Apache-2.0")]:
        assert approve(client, candidate(client, entity, snapshot, value, value, key).json()['id']).status_code == 200
    listing = client.get('/api/entities').json()[0]['model_resources']
    detail = client.get(f'/api/entities/{entity.id}').json()['model_resources']
    assert listing == detail
    assert listing['download_url'] == download
    assert listing['repository'] == 'example/model'
    assert listing['license'] == 'Apache-2.0'
    # An approved update appears without changing any front-end catalog.
    change = candidate(client, entity, snapshot, "MIT", "MIT", "模型卡许可证").json()
    assert approve(client, change['id']).status_code == 200
    assert client.get('/api/entities').json()[0]['model_resources']['license'] == 'MIT'
    db.expire_all()
    fact = db.scalar(select(Fact).where(Fact.entity_id == entity.id, Fact.key == '官方下载入口', Fact.valid_to.is_(None)))
    fact.valid_to = '2026-11-07T00:00:00Z'
    db.commit()
    assert client.get('/api/entities').json()[0]['model_resources'] is None


def test_demo_and_unsafe_downloads_are_not_exposed(client, db):
    download = 'https://example.com/model'
    entity, _, snapshot = setup_source(db, download)
    approve(client, candidate(client, entity, snapshot, download, download, '官方下载入口').json()['id'])
    entity.is_demo = True
    db.commit()
    assert client.get('/api/entities').json()[0]['model_resources'] is None
    entity.is_demo = False
    fact = db.scalar(select(Fact).where(Fact.entity_id == entity.id))
    fact.value = 'javascript:alert(1)'
    db.commit()
    assert client.get('/api/entities').json()[0]['model_resources'] is None
