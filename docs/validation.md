# 第一期交付验证

验证日期：2026-11-07。测试在当前云开发环境执行；不表示外部生产环境已经部署。

## 已执行

- TypeScript 检查与 Vite 生产构建通过。
- SQLite：27 项通过，1 项 PostgreSQL 专用并发测试按设计跳过。
- PostgreSQL 16：28 项通过，包含两个候选并发审批：仅一个发布，另一个返回 409。
- SQLite / PostgreSQL 初始迁移、模型差异检查、迁移回退验证通过。
- 多阶段 Docker 镜像构建成功，前端生产资源与 API 同镜像，应用以 UID 10001 运行。
- 隔离 Compose 栈启动成功：PostgreSQL healthy、迁移服务完成、API healthy、独立 worker 调度器启动。
- 真实公开 HTTPS 抓取验证通过（example.com），获取并规范化了真实 HTML 正文。
- 真实 HTTP 冒烟验证：静态首页与 JS 资源、未授权 401、管理口令、实体创建、原文快照、审核发布、事实 v2、检索与 trace 回查。
- 测试覆盖：分类后代查询、多对多分类、证据与实体归属、重复候选、驳回不发布、审批重复/过期冲突、事实恢复为新版本、历史 trace 不随当前事实改变、正文未变/304、采集失败、并发采集限制、HTTPS 与内网 URL 验证、独立 JSON 正文、自动值必须在证据内、单一当前事实数据库约束、调度恢复中断与尊重下一次到期时间。

## 测试发现并修复

1. JSON 候选证据可能在候选自身 evidence 属性中被“找到”。修复为只在独立 documentation 原文内验证，防止自我证明；原始 JSON 另存 raw_content。
2. 静态前端需要先展示登录表单，不能被全局 API 鉴权阻断。鉴权限定 /api，health 例外；HTML/JS 静态资源可加载，数据接口始终受口令保护。
3. 为审核补充数据库条件更新，避免同一候选被并发重复处理。
4. 为移动端增加分类选择入口，调整快照弹层顺序及表单错误展示。

## 环境限制与未验证项

当前没有可调用的浏览器控制运行时及 cua_repl.js。按照 [Sites SKILL.md](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/SKILL.md) 的明确要求："If cua_repl.js is unavailable, skip browser QA: do not start a preview server, install a browser, or improvise another browser-control path." 本次未执行浏览器交互、截图、视觉和键盘无障碍验收；已完成生产资源构建及 HTTP 验证。上线前仍应按 README 的首次验收路径在浏览器走一遍。

API 集成测试在受限沙箱内的 TestClient 事件循环阻塞，使用获准的外层执行环境后正常通过。第三方 Starlette 目前对 httpx TestClient 发出弃用提示，测试结果不受影响；后续升级时跟进。

单管理员口令模式、公开 HTTPS 文档、数据库内快照是本期交付边界。LLM、向量检索、聊天顾问、多角色和外部生产发布未作为已完成能力。

容器重建后再次检查：13 个验收实体仍存在，已审批的事实保留，最终移动端分类入口所在的生产 JS 资源正常提供。QA 容器与测试数据在验证后清理，保留源码、锁文件和验证文档。


## ArchMind 仓库接入与共享 Agent 检索（2026-11-07）

- 后台 /api/search 与 Agent /api/knowledge/retrieve 通过同一 knowledge.retrieve 服务查询相同已发布事实。
- SQLite：35 项通过，1 项 PostgreSQL 专用并发测试跳过；PostgreSQL：36 项通过。
- 新增测试覆盖后台/Agent 结果一致、发布立即对 Agent 生效、旧 trace 固定版本、演示默认排除、只读 token 不能调用管理接口、实体/分类后代/类型筛选、输入限制、已驳回候选隔离，以及真实 HTTP Agent 适配函数的 URL 和口令传递。
- 新增 caller 与 request_context 迁移，SQLite / PostgreSQL 升级、模型差异检查与回退验证通过。
- 前端新增 Agent 检索记录列表、调用方筛选、查询时版本回查、Agent 模拟调用和演示数据开关。TypeScript 与生产构建通过。
- 当前工具适配器已实现，不表示聊天式大模型 Agent 已配置或运行。
- ArchMind Docker 联调通过：使用实际独立 Agent 口令发起工具请求，和后台查询得到相同事实；审批后 Agent 立即看到 v2；原先 trace 仍显示 v1；Agent 口令访问管理接口返回 401。容器内执行 examples.agent_tool 也成功返回实际检索结果。
