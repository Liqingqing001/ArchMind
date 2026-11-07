# 架构与关键决策

浏览器 → React 控制台 → /api FastAPI → SQLAlchemy → PostgreSQL。
独立 worker → 到期来源 → HTTPS 抓取 → 文本与哈希 → source_snapshots → 候选 change_events → 人工审核 → entity_facts 版本 → 检索与 trace。

## ADR 001：先治理知识，再消费知识

事实必须关联快照与证据。网页变化只意味着需要检查，不能直接推断能力、价格发生变化。第一期的抽取适配器只接受受控 JSON：`{"facts":[{"key":"...","value":"...","evidence":"原文片段"}]}`。普通 HTML 只保存变更快照，由管理员录入候选。尚未接入 LLM，也没有语义检索；后台会如实显示这些状态。

## ADR 002：不可变事实版本

entity_facts 以 `(entity_id,key,version)` 唯一，当前值 valid_to 为空，并用部分唯一索引保证同字段只有一个有效版本。候选保存 base_version。审批锁定候选与实体，验证 base_version，关闭旧值后新增版本，保持原子性。并发唯一约束作为最后防线。撤销是新的候选，不删除审计历史。当前候选与审核元数据在 change_events 一张表，未来多级审核再拆 review_tasks。

## ADR 003：双数据库

SQLite 用于无需额外服务的个人本地验收；生产使用 PostgreSQL 16。迁移基于 Alembic；不在 API 启动时隐式改表。测试覆盖两种数据库的相同服务路径，CI 加 PostgreSQL 集成任务。pgvector 在引入 Embedding 后单独迁移，本期不创建没有实际用处的向量列。

## ADR 004：调度与持久化

API 请求内完成手动巡检（上限 20 秒请求超时及 2 MB 内容），返回真实结果；定时任务由独立 worker 每分钟挑选到期来源，数据库唯一索引防止重复 running。worker 重启后将超过 10 分钟的 running 标成失败并恢复调度。一个 worker 实例，未引入消息队列。快照以数据库文本保存，本期限 2 MB，后续迁移到对象存储。

## ADR 005：边界与安全

仅公开 HTTPS 默认端口来源；注册和每次抓取前校验 DNS，不自动跟随跳转。默认关闭动态渲染，不支持私网、登录站点及反爬绕过。DNS 校验不等价于受控出网代理：公网生产需网络层阻断内网/元数据地址并设置域名白名单。部署时要求 ADMIN_TOKEN，不启用时仅用于本机。前端口令在会话内存中保存。单管理员，无多租户隔离，不提供公开注册。

## 数据关系

categories → categories；entities ↔ categories 经 entity_categories；entities → entity_relations → entities；entities → sources → source_snapshots / collection_runs；entities → entity_facts / change_events；change_events / entity_facts → source_snapshots；retrieval_traces 保存查询时的版本引用。


## ADR 006：后台与 Agent 共享一套知识真相

用户明确确认：后台可见的知识库就是 Agent 检索的知识库。`knowledge.retrieve` 是唯一检索实现，后台与 Agent HTTP 入口共用它；始终从当前已发布 entity_facts 连接 entities、snapshots 和 sources。Agent 默认排除演示数据。Trace 增加 caller 和 request_context，后台列出真实工具调用与调试调用，保留查询当时的版本。独立 KNOWLEDGE_TOKEN 只允许调用检索接口，管理口令不交给 Agent。详见 agent-knowledge.md。
