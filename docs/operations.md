# 运维与恢复

## 配置

本地工具不自动读取仓库根目录 .env；在 shell 中 export `DATABASE_URL`、`ADMIN_TOKEN`。Compose 自动读取根目录 .env。生产必须给 API 与 worker 指向同一 PostgreSQL，`migrate` 服务完成后再启动其他服务。前端不接触数据库与第三方服务密钥。API/worker 都以非 root 用户运行。

## 升级

先备份，再拉取新代码，运行 `docker compose build`、`docker compose up -d`。Alembic 迁移在单独的 migrate 服务执行。不要同时启动多份迁移或多个 worker。自动任务首次启动即检查到期来源，此后每分钟扫描，单批最多 20 个来源。超过 10 分钟的中断任务会标记失败，允许后续重新执行。

## PostgreSQL 备份

```bash
docker compose exec -T db pg_dump -U knowledge -d knowledge --format=custom > knowledge.backup
```

备份包括实体、原始快照、事实版本、审核记录和 trace。备份文件应加密存储在独立位置，定期在隔离环境验证恢复。

恢复到新建的空数据库（先停止 API 和 worker，目标库内不能有重要数据）：

```bash
docker compose stop api worker
docker compose exec -T db pg_restore -U knowledge -d knowledge --no-owner < knowledge.backup
docker compose up -d api worker
```

有现有表时，不要直接覆盖；建立新空库恢复并调整连接。SQLite 本地备份使用 `sqlite3 knowledge.db '.backup knowledge.backup.db'`，避免运行期间直接复制 WAL 数据库文件。

## 采集边界

仅 HTTPS 默认 443；无凭据 URL，不跟随重定向，超时 20 秒，响应最大 2 MB。禁止已知内网、loopback、保留地址，抓取前再解析域名检查。DNS 检查不能完全防范重绑定；生产须设置域名允许列表与阻断私网的出站代理/防火墙。不要接入不可信或需要登录的来源。

不支持浏览器渲染、PDF、付费/登录页面。RSS/GitHub 当前只按公开文本或网页采集，不做专属发布事件解析。抓取异常写入任务日志，正文哈希忽略 script/style/nav/footer，但网页正文中的时间等噪声仍可能触发快照。

## 容量与后续工作

本期列表有限额：实体 500、任务 200、快照 200、审核 300、检索 30；超过范围需增加分页再扩容。原始内容保存在数据库，不做对象存储归档。worker 单实例适合第一阶段，规模扩大后迁移到队列和分布式租约。

管理口令是单一管理员身份，没有注册、找回、RBAC 与操作人独立账户。变更审批保留时间与备注；普通实体元数据不提供独立版本审计。真正多人使用前需要身份表、权限和操作审计。
