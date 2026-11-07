# GitHub Pages 公开体验版

已经实现同一套 React 界面的静态体验模式，保留本地新增的对话、知识库、模型下载与管理入口。完整后端构建仍调用真实 FastAPI，Pages 构建通过独立适配器使用浏览器本地状态。

## 体验内容

- 116 个公开知识实体、211 条资料事实，均来自仓库内的两份官方资料数据集，核验日期沿用 2026-11-07；不是当前实时巡检结果。
- 20 个开放权重模型的官方模型卡、许可证与下载链接。
- 额外 1 个显式标注的虚构 Atlas 模型、2 条虚构事实和待审核变更，用来体验审核、版本恢复与检索生效。
- 无需 API Key 的对话体验：本地关键词检索 + 固定讲解模板，所有回答都明确标为“静态演示，未调用大模型”，并展示真实来自公开快照的引用。
- 本地对话新建、连续追问、重命名、删除撤销、刷新恢复和 Markdown 导出。
- 可见的检索记录、查询时版本、来源快照与证据。审核通过后当前事实改变，旧记录仍保留当时版本。
- 模拟操作仅保存到当前浏览器，不写入仓库或服务器，也不会影响其他访客；“重置演示”只清除此站演示状态。浏览器禁用存储时使用本页内存。

模型供应商连接、自动巡检、真实数据库持久化使用完整后端版。公开体验站不接收 API Key，不代替真实模型效果评测。

## 构建和本地预览

```bash
cd frontend
npm ci
npm run test:demo
npm run build:demo
npm exec vite -- preview --host 127.0.0.1 --port 4173
```

访问 http://127.0.0.1:4173/ArchMind/ 。项目子路径由构建命令明确设为 `/ArchMind/`。静态知识文件在构建时生成，只读取已提交的公开 JSON 数据集，不读取本机数据库、环境凭据或个人对话。

`npm run build` 仍是普通后端模式。`frontend/.env.demo` 只有公开构建开关；任何 VITE_ 环境变量都会进入公开资产，不能在里面填写凭据。

## GitHub 发布

工作流：`.github/workflows/pages.yml`。

PR 自动执行演示行为测试和构建，只生成预览 artifact。合并 main 后执行 Pages 发布；工作流也支持在 Actions 中手动运行。

仓库所有者需要在 [Settings → Pages](https://github.com/Liqingqing001/ArchMind/settings/pages) 的 Build and deployment 中，将 Source 选择为 **GitHub Actions**。当前连接使用的 GitHub integration 对启用 Pages 的 API 返回 403，因此不能保证它能替所有者完成这一步；configure-pages 也会尝试启用，如权限不足需所有者在设置页完成后重跑工作流。

预期默认项目地址：https://liqingqing001.github.io/ArchMind/ 。上线以 Pages 工作流部署成功及该地址实际返回页面为准。

## 验收路径

1. 首页选择“企业知识问答”，发送，无需连接模型。
2. 展开引用，打开原文快照；刷新确认对话恢复。
3. 知识库中打开 Qwen3-8B，查看模型卡与官方下载入口。
4. 知识管理 → 版本与审核，在虚构 Atlas 条目中审核上下文变更。
5. 检索调试 → Agent 模拟 → 包含演示数据 → 搜索“上下文窗口”，确认返回 v2 / 128K。
6. 回查旧 trace 核对版本；点击重置恢复最初状态。

## 后续完整在线版

GitHub Pages 只托管静态 HTML/CSS/JavaScript：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。如需面试官实际调用模型，需另外部署 FastAPI/PostgreSQL/worker，并提供正确的 HTTPS API 和访客权限，不能将管理口令或模型密钥内置进 Pages。
