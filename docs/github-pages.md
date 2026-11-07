# 面试演示与 GitHub Pages

结论：可以做成 GitHub Pages 的可交互演示站。当前完整项目不能原样部署到 Pages，因为它需要 FastAPI API、PostgreSQL 和独立定时任务。GitHub Pages 只托管静态 HTML/CSS/JavaScript：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。

## 推荐：公开演示站 + 完整工程源码

Pages 使用当前 React 界面，提供知识分类、实体详情、来源快照、事实版本、Agent 检索记录与模拟审核的交互体验。数据来自公开的固定演示集；每个访问者的模拟操作只保存在自己浏览器，提供“重置演示”。页面持续显示“演示模式”，不将静态数据宣称为实时采集，不显示未接入的聊天 Agent 为已完成能力。

展示路径建议：知识总览 → 分类浏览 → 实体与来源证据 → 审核发布模拟 → Agent 检索与版本引用。首页链接到完整源码、架构和真实部署说明，面试时可分别讲解知识治理和 Agent 工具接口。

## 发布前需要的适配

1. 新增构建期演示开关与本地 API 适配器，复用同一套前端界面与数据契约；默认后端模式继续调用真实 API。
2. 演示数据包含来源、快照、版本和检索记录；模拟操作应遵守与后端相同的发布边界，并明确其不操作真实数据库。
3. Vite 静态资源 base 设置为 `/ArchMind/`（项目 Pages 路径），避免当前根路径资源产生 404。当前页面使用内部状态导航，无需新增路由回退。
4. 添加 GitHub Actions：前端类型检查和构建 → 上传 Pages artifact → 部署 Pages，配置 Pages 来源为 GitHub Actions。
5. 检查所有页面不再请求不存在的 `/api`，并验证项目子路径下的资源、交互、刷新和移动端布局。

预计使用默认项目 URL `https://liqingqing001.github.io/ArchMind/`，这只是默认地址格式；当前尚未配置或发布，不是已上线链接。

## 完整在线版

另一种方案是将 React 前端放在 Pages，FastAPI、PostgreSQL 和 worker 部署到独立服务器，再配置 HTTPS API 地址、CORS 和访问身份。真实模型密钥和管理口令不能编译到静态 JavaScript 中。面试官需要一个只读访问入口，管理功能仅留给管理员。

对当前阶段而言，公开静态演示站更容易维护，也不依赖面试当天的采集来源和模型服务可用性；真实后端可以使用 Docker 现场展示。
