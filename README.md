# ArchMind · AI 技术知识平台

ArchMind 是以知识库为产品的 AI 解决方案平台。你在后台看到和审核的知识库，就是 Agent 实际检索的同一套数据。当前版本交付第一阶段：个人知识库后台，以及“来源 → 巡检 → 快照 → 证据候选 → 审核 → 事实版本 → 检索追踪”的完整工作流。

技术栈：Python 3.12 / FastAPI / SQLAlchemy / Alembic，React 19 / TypeScript / Vite，PostgreSQL 16；SQLite 可用于轻量本地体验。

## 获取项目

```bash
git clone https://github.com/Liqingqing001/ArchMind.git
cd ArchMind
```

## 本地快速启动

需要 Python 3.12+、uv、Node.js 22+。打开三个终端：

```bash
# 终端一：迁移、可选演示数据、启动 API
cd backend
uv sync --frozen
uv run alembic upgrade head
uv run python -m app.seed  # 可选：只向空库写入明确标识的演示数据
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# 终端二：启动前端，访问 http://localhost:5173
cd frontend
npm ci
npm run dev
```

```bash
# 终端三：自动巡检（只启动一个实例）
cd backend
uv run python -m app.worker
```

默认使用 backend/knowledge.db。API 文档：http://127.0.0.1:8000/docs 。前端通过 Vite 代理访问 API。未配置口令时仅用于本机；生产使用 Docker 的管理口令模式。

本地切换 PostgreSQL：在 API、迁移、worker 的终端中设置同一个 `DATABASE_URL=postgresql+psycopg://用户名:密码@地址:5432/数据库`。本地 API 使用 `ADMIN_TOKEN` 环境变量启用口令；前端收到 401 后显示登录入口，不将口令写入磁盘或 localStorage。

## Docker 运行（PostgreSQL + API/前端 + 独立调度）

```bash
cp .env.example .env
# 编辑 .env：分别填写 POSTGRES_PASSWORD 与 ADMIN_TOKEN；接入 Agent 时另设 KNOWLEDGE_TOKEN
# 两个值使用不同的随机十六进制字符串：python -c "import secrets; print(secrets.token_hex(32))"
docker compose up --build -d
# 可选：导入演示数据。已有实体时跳过。
docker compose --profile demo run --rm seed
```

访问 http://localhost:8000 ，输入 `.env` 中的 `ADMIN_TOKEN`。生产前端与 API 同源；数据写入 PostgreSQL 持久卷。数据库不对宿主机暴露端口，Web 默认仅绑定 127.0.0.1。云服务器公开访问请加 HTTPS 反向代理，并在网络层禁止采集器访问内网/云元数据；不要直接公开无口令开发服务。

`docker compose logs -f worker` 查看调度日志；`docker compose logs -f api` 查看接口日志。普通 `docker compose down` 保留数据库卷；`down -v` 会删除数据，不要用于日常停止。

## 首次验收路径

1. 知识浏览 → 新建一个真实实体，可选择多个分类；厂商、品牌、具体模型、API 分别建立。
2. 数据来源 → 注册该实体的公开 HTTPS 文档 → 立即巡检。支持网页、文本、JSON、GitHub 公开页面和 RSS 正文；不自动跟随跳转。
3. 查看快照，确认规范化正文、原始响应、时间和 SHA-256。仅页面变化不发布事实。
4. 基于快照提交字段、新值、逐字原文证据，或使用下方 JSON 协议生成候选。
5. 版本与审核 → 核对原文 → 审核发布或驳回。相同候选不会重复生成，过期候选禁止覆盖新版本。
6. 实体详情 → 已发布事实 / 历史版本 → 提交恢复候选，审核后形成新版本。
7. 检索调试 → 输入字段或实体名 → 查看已发布事实及引用链路，保留 trace ID 可回查当时的版本。

演示数据包含 12 个条目，只有“演示模型 · Atlas”拥有虚构事实与审核候选。演示来源不会向网络发请求，所有参数均非真实规格。空库不自动注入示例。

## 结构化抽取协议

来源类型选择“结构化 JSON”，来源响应格式如下：

```json
{
  "documentation": "上下文窗口：128K tokens",
  "facts": [
    {
      "key": "上下文窗口",
      "value": "128K tokens",
      "evidence": "上下文窗口：128K tokens"
    }
  ]
}
```

facts 最多 100 条，必须另有独立 documentation 原文；自动候选的新值须直接出现在证据中。证据须存在于规范化正文，字段格式有效；抽取结果只进入待审核。普通网页由人录入候选。正文变化通过哈希判断，支持 ETag / Last-Modified 条件请求；失败会记录日志并在下次周期重试，也可手动重试。来源暂停、检查周期可在后台修改。

## 检查与测试

```bash
cd backend
uv run pytest -q
uv run alembic check
cd ../frontend
npm run build
```

PostgreSQL 集成测试必须用**独立的空测试库**，测试会清空其应用表：

```bash
cd backend
TEST_DATABASE_URL=postgresql+psycopg://.../knowledge_test uv run pytest -q
```

CI 同时运行 SQLite / PostgreSQL 后端测试及 TypeScript / 前端生产构建。

## 文档与后续范围

- [Agent 与可见知识库的连接](docs/agent-knowledge.md)
- [需求与验收](docs/requirements.md)
- [架构和技术决策](docs/architecture.md)
- [运维与恢复](docs/operations.md)
- [交付验证记录](docs/validation.md)

本期已经提供共享检索服务、Agent 只读工具接口与可见检索记录；没有接入 LLM、Embedding、pgvector、聊天顾问、成本计算或报告导出，后台会如实显示状态。下一期先确定模型供应商与预算，再实现文档切片、向量检索、Agent 工具与逐项引用。当前没有多租户和多级审核，不应当作面向外部客户的 SaaS 直接发布。
