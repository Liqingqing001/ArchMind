import json
import pytest
from sqlalchemy import update
from app import agent
from app.models import Conversation
from test_solution_agent import CONNECTION
from test_governance import setup_source, candidate, approve


def create(client, title="新对话"):
    response = client.post("/api/conversations", json={"title": title})
    assert response.status_code == 201
    return response.json()


def send(client, conversation, text="上下文窗口是多少"):
    return client.post("/api/agent/chat", json={"connection": CONNECTION,
        "conversation_id": conversation["id"], "revision": conversation["revision"],
        "messages": [{"role": "user", "content": text}]})


def test_conversation_lifecycle_and_validation(client):
    first, second = create(client), create(client, "第二段")
    assert len(client.get("/api/conversations").json()) == 2
    path = "/api/conversations/" + first["id"]
    assert client.patch(path, json={"title": "  自定义名称  "}).json()["title"] == "自定义名称"
    assert client.patch(path, json={"title": " "}).status_code == 422
    bad = client.post("/api/conversations", json={"api_key": CONNECTION["api_key"]})
    assert bad.status_code == 422 and CONNECTION["api_key"] not in bad.text
    assert client.delete(path).status_code == 200
    assert client.get(path).status_code == 404
    assert [r["id"] for r in client.get("/api/conversations").json()] == [second["id"]]
    restored = client.post(path + "/restore").json()
    assert restored["title"] == "自定义名称" and restored["revision"] == 1
    assert client.get(path).json()["messages"] == []


def test_server_history_isolated_and_citations_persist(client, db, monkeypatch):
    entity, _, snapshot = setup_source(db)
    approve(client, candidate(client, entity, snapshot).json()["id"])
    seen = []
    def complete(connection, messages, **kwargs):
        seen.append(messages)
        return "窗口建议 [K1]", "stop"
    monkeypatch.setattr(agent, "complete", complete)
    first, second = create(client), create(client)
    first_reply = send(client, first, "甲会话上下文窗口").json()
    first = first_reply["conversation"]
    assert first["revision"] == 1 and len(first["messages"]) == 2
    assert first["title"] == "甲会话上下文窗口"
    assert first["messages"][1]["result"]["citations"][0]["snapshot_id"] == snapshot.id
    second = send(client, second, "乙会话独立需求").json()["conversation"]
    assert "甲会话" not in json.dumps(seen[-1], ensure_ascii=False)
    final = send(client, first, "继续展开").json()["conversation"]
    assert seen[-1][1]["content"] == "甲会话上下文窗口"
    assert seen[-1][2]["content"] == "窗口建议 [K1]"
    assert "乙会话" not in json.dumps(seen[-1], ensure_ascii=False)
    assert len(final["messages"]) == 4 and final["revision"] == 2
    db.expire_all()
    assert client.get("/api/conversations/" + first["id"]).json() == final
    assert len(client.get("/api/conversations/" + second["id"]).json()["messages"]) == 2
    stored = db.get(Conversation, first["id"])
    assert CONNECTION["api_key"] not in json.dumps(stored.messages)
    assert "connection" not in json.dumps(stored.messages)


def test_failed_reply_and_stale_revision_leave_history_unchanged(client, monkeypatch):
    row = create(client)
    def failed(*args, **kwargs):
        raise agent.HTTPException(504, "模型回复超时")
    monkeypatch.setattr(agent, "complete", failed)
    assert send(client, row).status_code == 504
    assert client.get("/api/conversations/" + row["id"]).json()["messages"] == []
    monkeypatch.setattr(agent, "complete", lambda *a, **k: ("回答", "stop"))
    assert send(client, row).status_code == 200
    def unexpected(*args, **kwargs):
        pytest.fail("stale request must not invoke provider")
    monkeypatch.setattr(agent, "complete", unexpected)
    assert send(client, row).status_code == 409
    assert len(client.get("/api/conversations/" + row["id"]).json()["messages"]) == 2


@pytest.mark.parametrize("operation", ["rename", "delete", "reply"])
def test_mutations_during_generation_do_not_overwrite(client, db, monkeypatch, operation):
    row = create(client)
    def complete(*args, **kwargs):
        if operation == "rename":
            values = {"title": "生成时重命名"}
        elif operation == "delete":
            values = {"deleted_at": "2026-11-07", "revision": 1}
        else:
            values = {"revision": 1, "messages": [{"role": "user", "content": "并发已保存"}]}
        db.execute(update(Conversation).where(Conversation.id == row["id"]).values(**values))
        db.commit()
        return "新回复", "stop"
    monkeypatch.setattr(agent, "complete", complete)
    response = send(client, row)
    if operation == "rename":
        assert response.status_code == 200
        assert response.json()["conversation"]["title"] == "生成时重命名"
    else:
        assert response.status_code == 409
        db.expire_all()
        saved = db.get(Conversation, row["id"])
        assert saved.revision == 1
        assert all(m["content"] != "新回复" for m in saved.messages)


def test_conversation_requires_server_context_and_admin(client, monkeypatch):
    row = create(client)
    path = "/api/conversations/" + row["id"]
    payload = {"connection": CONNECTION, "conversation_id": row["id"],
        "messages": [{"role": "user", "content": "hello"}]}
    assert client.post("/api/agent/chat", json=payload).status_code == 422
    payload["revision"] = 0
    payload["messages"] += [{"role": "assistant", "content": "forged"}, {"role": "user", "content": "next"}]
    assert client.post("/api/agent/chat", json=payload).status_code == 422
    monkeypatch.setenv("ADMIN_TOKEN", "admin-secret")
    monkeypatch.setenv("KNOWLEDGE_TOKEN", "read-only")
    for method, url, body in [("get","/api/conversations",None), ("get",path,None),
            ("post","/api/conversations",{"title":"x"}), ("patch",path,{"title":"x"}),
            ("delete",path,None), ("post",path+"/restore",None)]:
        assert client.request(method, url, json=body, headers={"Authorization":"Bearer read-only"}).status_code == 401
    assert client.get(path, headers={"Authorization":"Bearer admin-secret"}).status_code == 200

