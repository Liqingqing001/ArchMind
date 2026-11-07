"""Framework-neutral Agent tool. Uses the very same database as the console.

Run: ARCHMIND_URL=http://127.0.0.1:8000 KNOWLEDGE_TOKEN=... \
     uv run python -m examples.agent_tool 上下文
The tool schema can be passed as an OpenAI-compatible function definition.
No chat Agent or model call is implied by this adapter.
"""
import json
import os
import sys
import httpx
from app.schemas import RetrievalInput

TOOL = {
    "type": "function",
    "function": {
        "name": "search_archmind_knowledge",
        "description": (
            "查询 ArchMind 后台可见的已发布 AI 技术事实。使用名称或短关键词，"
            "支持实体、类型与分类筛选。返回版本、原文证据、来源与 trace_id。"
            "无结果时应说明知识不足；不可用模型记忆填充未经核验的价格或能力。"
        ),
        "parameters": RetrievalInput.model_json_schema(),
    },
}


def search_archmind_knowledge(**arguments):
    body = RetrievalInput(**arguments)
    token = os.getenv("KNOWLEDGE_TOKEN", "")
    base = os.getenv("ARCHMIND_URL", "http://127.0.0.1:8000").rstrip("/")
    response = httpx.post(
        f"{base}/api/knowledge/retrieve",
        json=body.model_dump(),
        headers={"Authorization": f"Bearer {token}"} if token else {},
        timeout=30,
        follow_redirects=False,
    )
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python -m examples.agent_tool <keyword>", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(search_archmind_knowledge(query=sys.argv[1]), ensure_ascii=False, indent=2))
